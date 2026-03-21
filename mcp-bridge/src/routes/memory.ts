import type { MemoryDbClient } from "../db/memory-client.js";
import type { EmbeddingService } from "../ingestion/embedding.js";
import type { SecretFilter } from "../ingestion/secret-filter.js";
import { createMemoryController } from "../transport/controllers/memory-controller.js";
import { defineRoute, type ControllerDefinition, type RouteEntry } from "../transport/types.js";
import {
  SearchMemorySchema,
  GetNodeSchema,
  GetNodeEdgesSchema,
  TraverseSchema,
  GetContextSchema,
  GetTopicsSchema,
  GetStatsSchema,
  IngestSchema,
  CreateLinkSchema,
  CreateNodeSchema,
} from "../transport/schemas/memory-schemas.js";

export function createMemoryRoutes(
  mdb: MemoryDbClient,
  embedService: EmbeddingService,
  filter: SecretFilter,
): ControllerDefinition {
  const handlers = createMemoryController(mdb, embedService, filter);

  return {
    basePath: "/memory",
    routes: [
      defineRoute({
        method: "GET",
        path: "/search",
        summary: "Search memory nodes by query (keyword, semantic, or hybrid)",
        schema: SearchMemorySchema,
        handler: handlers.search,
      }),
      defineRoute({
        method: "GET",
        path: "/node/:id",
        summary: "Get a memory node by ID",
        schema: GetNodeSchema,
        handler: handlers.getNode,
      }),
      defineRoute({
        method: "GET",
        path: "/node/:id/edges",
        summary: "Get all edges for a memory node",
        schema: GetNodeEdgesSchema,
        handler: handlers.getNodeEdges,
      }),
      defineRoute({
        method: "GET",
        path: "/traverse/:id",
        summary: "Traverse the memory graph from a node",
        schema: TraverseSchema,
        handler: handlers.traverse,
      }),
      defineRoute({
        method: "GET",
        path: "/context",
        summary: "Assemble relevant context from memory for a query or node",
        schema: GetContextSchema,
        handler: handlers.getContext,
      }),
      defineRoute({
        method: "GET",
        path: "/topics",
        summary: "Get all topic nodes for a repo",
        schema: GetTopicsSchema,
        handler: handlers.getTopics,
      }),
      defineRoute({
        method: "GET",
        path: "/stats",
        summary: "Get memory graph statistics for a repo",
        schema: GetStatsSchema,
        handler: handlers.getStats,
      }),
      defineRoute({
        method: "POST",
        path: "/ingest",
        summary: "Ingest data into memory from a source",
        schema: IngestSchema,
        handler: handlers.ingest,
      }),
      defineRoute({
        method: "POST",
        path: "/link",
        summary: "Create a link (edge) between two memory nodes",
        schema: CreateLinkSchema,
        handler: handlers.createLink,
      }),
      defineRoute({
        method: "POST",
        path: "/node",
        summary: "Create a new memory node",
        schema: CreateNodeSchema,
        handler: handlers.createNode,
      }),
    // Each defineRoute() call returns RouteEntry<TSchema> with a distinct TSchema,
    // so the array literal has a union element type that TypeScript cannot
    // automatically widen to the base RouteEntry<RouteSchema> required by
    // ControllerDefinition.routes. The cast is safe because server.ts consumes
    // routes through the erased RouteEntry interface and re-validates inputs via
    // Zod at runtime before calling each handler.
    ] as RouteEntry[],
  };
}
