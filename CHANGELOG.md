# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-03-19

### Added

- Next.js 15 UI dashboard with conversation list and detail pages
- Conversation list page with filtering and real-time updates
- Conversation detail page with timeline and diagrams
- DiagramRenderer (Mermaid), Timeline, and CopyButton UI components
- API client, SSE hook, and diagram builders for the UI layer
- GET /events SSE endpoint for real-time streaming
- GET /conversations REST endpoint with query and service layer
- EventBus pub/sub system for SSE streaming
- Bootstrap-generated planning docs and CLAUDE.md

### Fixed

- Increased delay in ordering test to prevent flaky failures
- setup.sh now builds MCP bridge, registers with Claude/Codex, and installs plugins
- Addressed review findings for atomicity, security, and DX
