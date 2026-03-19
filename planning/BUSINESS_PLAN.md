# Business Plan

This is a developer productivity tool, not a revenue product. This plan frames value in terms of time savings, workflow quality, and ecosystem positioning for the open-source community.

## Value Proposition

Agentic Workflow provides a portable, self-contained toolkit that turns Claude Code into a multi-agent development platform. It solves three problems that developers face when adopting AI-assisted coding:

1. **Workflow replication is manual.** Custom skills, prompts, and configurations live in `~/.claude/` and are lost when switching machines. Agentic Workflow archives these as a Git-versioned skill library with a one-command setup script.

2. **Single-agent bottlenecks.** Claude Code and Codex operate as isolated agents. There is no built-in mechanism for one agent to delegate work to another, wait for results, or maintain conversation history. The MCP bridge provides store-and-forward messaging and task assignment between any number of agents via a shared SQLite database.

3. **Code review requires context switching.** Reviewing a PR means reading diffs, mentally categorizing concerns (security, performance, style), and writing comments. The `/review` skill automates this by spawning domain-specific reviewer subagents in parallel, saving structured findings to a local cache, and optionally publishing them to GitHub.

## Target Users

| User Profile | Use Case |
|-------------|----------|
| Individual developers using Claude Code | Portable skill library, bootstrapping new repos with documentation, enhanced prompts |
| Teams running Claude Code + Codex | Multi-agent communication via MCP bridge — delegate frontend work to one agent, backend to another, coordinate results |
| Open-source maintainers | Automated PR review pipeline — triage, parallel domain review, batch comment posting |
| Developers setting up new projects | `/bootstrap` generates up to 17 Pivot-pattern documentation files adapted to the detected tech stack |

## Cost Analysis

| Component | Cost | Notes |
|-----------|------|-------|
| Infrastructure | $0 | Runs entirely on the developer's local machine. SQLite file-based storage, no external services. |
| Runtime dependencies | $0 | All npm packages are open-source (MIT/ISC/Apache-2.0). |
| Claude Code API usage | Variable | Costs are borne by the developer's existing Claude Code subscription or API quota. This tool does not add API calls beyond what the workflows themselves require. |
| GitHub API | $0 | Uses the `gh` CLI with the developer's existing authentication. No separate API keys needed. |
| Maintenance | Volunteer time | Open-source project — maintenance is contributor-driven. |

Total recurring cost to the end user: **$0 beyond their existing Claude Code subscription.**

## Time Savings Estimate

These estimates are based on the workflows the toolkit automates. Actual savings depend on PR size, repo complexity, and team size.

### PR Code Review (`/review` + `/postReview`)

| Activity | Manual Time | Automated Time | Savings |
|----------|-------------|----------------|---------|
| Read diff, categorize concerns | 20-45 min | 0 min (automated triage) | 20-45 min |
| Write inline review comments | 15-30 min | 2-3 min (review + approve/edit findings) | 13-27 min |
| Post comments to GitHub | 5-10 min | 1 min (`/postReview`) | 4-9 min |
| **Total per PR** | **40-85 min** | **3-4 min** | **37-81 min** |

For a team reviewing 5 PRs/week, this saves approximately 3-7 hours per week.

### Repo Documentation (`/bootstrap`)

| Activity | Manual Time | Automated Time | Savings |
|----------|-------------|----------------|---------|
| Write ARCHITECTURE.md, ERD, API docs | 4-8 hours | 10-15 min | 3.75-7.75 hours |
| Create CLAUDE.md for AI context | 30-60 min | Included in bootstrap | 30-60 min |
| **Total per new repo** | **4.5-9 hours** | **10-15 min** | **4.25-8.75 hours** |

### Multi-Agent Task Delegation (MCP Bridge)

| Activity | Manual Time | Automated Time | Savings |
|----------|-------------|----------------|---------|
| Context switching between agent sessions | 5-10 min per handoff | 0 min (automated via send_context) | 5-10 min |
| Re-explaining context to a second agent | 5-15 min | 0 min (meta-prompts carry context) | 5-15 min |
| Tracking which agent is working on what | Ongoing mental overhead | Queryable via get_messages/tasks | Reduced cognitive load |
| **Per multi-agent workflow** | **10-25 min overhead** | **< 1 min** | **~10-25 min** |

### Review Fix Implementation (`/addressReview`)

| Activity | Manual Time | Automated Time | Savings |
|----------|-------------|----------------|---------|
| Parse review comments, create TODO list | 10-20 min | 0 min (reads from .review-cache) | 10-20 min |
| Implement fixes sequentially | Variable | Parallel agent execution | Time reduction scales with issue count |

## Strategic Positioning

This is **not** a product competing for market share. It is an open-source reference implementation that demonstrates:

- How to build portable, version-controlled Claude Code skill libraries
- How to use the MCP protocol for inter-agent communication
- How to structure multi-agent workflows with store-and-forward messaging
- How to automate code review with domain-specific subagents

The project's value grows as the Claude Code and MCP ecosystems mature. Skills and bridge configurations developed here can be shared, forked, and adapted by the community.

## Success Metrics

Since this is not a revenue product, success is measured by utility:

| Metric | Target | Measurement |
|--------|--------|-------------|
| Setup friction | < 2 minutes from clone to working skills | Time `./setup.sh` from a clean machine |
| Skill portability | Works on macOS and Linux without modification | CI testing on both platforms |
| Bridge reliability | Zero message loss under normal operation | SQLite WAL mode + transaction guarantees |
| Community adoption | Forks and skill contributions | GitHub metrics |
| Documentation coverage | Bootstrap generates accurate docs for diverse tech stacks | Manual testing against varied repos |
