// mcp-bridge/src/application/services/infer-topics.ts
import type { MemoryDbClient } from "../../db/memory-client.js";
import type { EmbeddingService } from "../../ingestion/embedding.js";
import type { AppResult } from "../result.js";
import { ok } from "../result.js";

// ── Types ────────────────────────────────────────────────────

export interface InferTopicsInput {
  repo: string;
  /** Number of topic clusters to create. Default: 10. */
  k?: number;
  /** Minimum cosine similarity to assign a node to a cluster. Default: 0.7. */
  threshold?: number;
  /** Maximum number of conversations to load into memory. Default: 1000. */
  maxConversations?: number;
}

export interface InferTopicsResult {
  topics_created: number;
  edges_created: number;
}

// ── Cosine Similarity ────────────────────────────────────────

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  /* v8 ignore next */
  return denom === 0 ? 0 : dot / denom;
}

// ── Centroid Computation ─────────────────────────────────────

function computeCentroid(embeddings: Float32Array[]): Float32Array {
  const dims = embeddings[0].length;
  const centroid = new Float32Array(dims);
  for (const emb of embeddings) {
    for (let i = 0; i < dims; i++) {
      centroid[i] += emb[i];
    }
  }
  const n = embeddings.length;
  for (let i = 0; i < dims; i++) {
    centroid[i] /= n;
  }
  return centroid;
}

// ── K-Means ──────────────────────────────────────────────────

const MAX_ITERATIONS = 10;

interface ClusterEntry {
  nodeId: string;
  embedding: Float32Array;
  title: string;
}

function runKMeans(
  entries: ClusterEntry[],
  k: number,
  threshold: number,
): Map<number, ClusterEntry[]> {
  const n = entries.length;
  const actualK = Math.min(k, n);

  // K-means++ initialization: spread initial centroids to improve convergence.
  // Pick first centroid randomly, then each subsequent centroid is chosen
  // with probability proportional to the squared distance from the nearest
  // already-chosen centroid.
  const usedIndices = new Set<number>();
  const firstIdx = Math.floor(Math.random() * n);
  usedIndices.add(firstIdx);
  const centroids: Float32Array[] = [entries[firstIdx].embedding];

  // Running minimum-distance array: minDist[i] = (1 - maxSim)^2 to nearest centroid so far.
  // After adding each new centroid we only update against that one centroid — O(n·d) per step
  // instead of O(i·n·d), reducing total initialization from O(k²·n·d) to O(k·n·d).
  const minDist = new Float64Array(n).fill(Infinity);
  // Seed with distances to the first centroid
  for (let i = 0; i < n; i++) {
    if (usedIndices.has(i)) { minDist[i] = 0; continue; }
    const d = 1 - cosineSimilarity(entries[i].embedding, centroids[0]);
    minDist[i] = d * d;
  }

  while (centroids.length < actualK) {
    // weights are already maintained as minDist
    /* v8 ignore next */
    const totalWeight = minDist.reduce((s, w) => s + w, 0);
    /* v8 ignore next 4 */
    if (totalWeight === 0) {
      // All remaining entries are identical to existing centroids — stop early
      break;
    }
    let r = Math.random() * totalWeight;
    let chosen = -1;
    for (let i = 0; i < n; i++) {
      r -= minDist[i];
      if (r <= 0) { chosen = i; break; }
    }
    /* v8 ignore next 7 */
    if (chosen === -1) {
      // Fallback: pick the entry with the largest minDist
      chosen = 0;
      for (let i = 1; i < n; i++) {
        if (minDist[i] > minDist[chosen]) chosen = i;
      }
    }
    usedIndices.add(chosen);
    const newCentroid = entries[chosen].embedding;
    centroids.push(newCentroid);

    // Update minDist against the newly added centroid only
    for (let i = 0; i < n; i++) {
      if (usedIndices.has(i)) { minDist[i] = 0; continue; }
      const d = 1 - cosineSimilarity(entries[i].embedding, newCentroid);
      const dSq = d * d;
      if (dSq < minDist[i]) minDist[i] = dSq;
    }
  }

  let assignments = new Array<number>(n).fill(-1);

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    // Assignment step
    const newAssignments = new Array<number>(n).fill(-1);
    for (let i = 0; i < n; i++) {
      let bestCluster = -1;
      let bestSim = -Infinity;
      for (let c = 0; c < centroids.length; c++) {
        const sim = cosineSimilarity(entries[i].embedding, centroids[c]);
        if (sim > bestSim) {
          bestSim = sim;
          bestCluster = c;
        }
      }
      // Apply threshold: only assign if similarity meets the bar
      if (bestSim >= threshold) {
        newAssignments[i] = bestCluster;
      }
    }

    // Check convergence
    const converged = newAssignments.every((a, i) => a === assignments[i]);
    assignments = newAssignments;
    if (converged) break;

    // Update step: recompute centroids from assigned members
    for (let c = 0; c < centroids.length; c++) {
      const members = entries.filter((_, i) => assignments[i] === c);
      if (members.length > 0) {
        centroids[c] = computeCentroid(members.map((m) => m.embedding));
      }
      // If no members, keep old centroid to avoid NaN
    }
  }

  // Build cluster map (only include assigned entries)
  const clusters = new Map<number, ClusterEntry[]>();
  for (let i = 0; i < n; i++) {
    /* v8 ignore next 2 */
    const c = assignments[i];
    if (c === -1) continue;
    if (!clusters.has(c)) clusters.set(c, []);
    clusters.get(c)!.push(entries[i]);
  }

  return clusters;
}

// ── Most-Central Member ──────────────────────────────────────

/** Return the index of the entry whose embedding is closest to the cluster centroid. */
function mostCentralIndex(members: ClusterEntry[]): number {
  const centroid = computeCentroid(members.map((m) => m.embedding));
  let bestIdx = 0;
  let bestSim = -Infinity;
  for (let i = 0; i < members.length; i++) {
    const sim = cosineSimilarity(members[i].embedding, centroid);
    if (sim > bestSim) {
      bestSim = sim;
      bestIdx = i;
    }
  }
  return bestIdx;
}

// ── Service ──────────────────────────────────────────────────

/** Cluster conversation node embeddings and create topic nodes. */
export async function inferTopics(
  mdb: MemoryDbClient,
  _embedService: EmbeddingService,
  input: InferTopicsInput,
): Promise<AppResult<InferTopicsResult>> {
  const { repo, k = 10, threshold = 0.7, maxConversations = 1000 } = input;

  // 1. Fetch conversation-kind nodes for the repo, bounded to avoid unbounded memory growth
  const allConversations = mdb.getNodesByRepoAndKind(repo, "conversation");
  const conversations = allConversations.slice(0, maxConversations);

  // 2. Collect entries that have embeddings
  const entries: ClusterEntry[] = [];
  for (const node of conversations) {
    const embedding = mdb.getEmbedding(node.id);
    if (embedding) {
      entries.push({ nodeId: node.id, embedding, title: node.title });
    }
  }

  // Need at least 2 nodes to form any cluster of size ≥ 2
  if (entries.length < 2) {
    return ok({ topics_created: 0, edges_created: 0 });
  }

  // 3. Run k-means clustering.
  // K-means uses Math.random for centroid initialization (k-means++ selection),
  // making topic results non-deterministic across runs. This is intentional:
  // topics are ephemeral and replaced on each run, so stable ordering is not required.
  const clusters = runKMeans(entries, k, threshold);

  // 4. Create topic nodes and edges (only for clusters with 2+ members).
  //    Idempotent-by-replacement: delete all previously auto-inferred topics for
  //    this repo before inserting new ones so re-running never creates duplicates.
  let topics_created = 0;
  let edges_created = 0;

  mdb.transaction(() => {
    // Purge existing auto-inferred topics so this operation is idempotent.
    // Edge CASCADE on the nodes table means associated `discussed_in` edges are
    // also removed automatically.
    mdb.deleteNodesBySourceType("infer-topics", repo);

    /* v8 ignore next 2 */
    for (const [, members] of clusters) {
      if (members.length < 2) continue;

      // Determine topic title from most-central member
      const centralIdx = mostCentralIndex(members);
      const topicTitle = members[centralIdx].title;

      // Create topic node
      const topicNode = mdb.insertNode({
        repo,
        kind: "topic",
        title: topicTitle,
        body: `Auto-inferred topic from ${members.length} conversations.`,
        meta: JSON.stringify({ auto: true, member_count: members.length }),
        source_id: `topic-cluster-${topics_created}`,
        source_type: "infer-topics",
      });
      topics_created++;

      // Create discussed_in edges: topic → conversation
      for (const member of members) {
        mdb.insertEdge({
          repo,
          from_node: topicNode.id,
          to_node: member.nodeId,
          kind: "discussed_in",
          weight: 1.0,
          meta: "{}",
          auto: true,
        });
        edges_created++;
      }
    }
  });

  return ok({ topics_created, edges_created });
}
