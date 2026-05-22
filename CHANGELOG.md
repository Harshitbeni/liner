# Changelog

All notable changes to Liner are documented here.

## [Unreleased]

### Changed

- **AI engine:** Bundled runtime is OpenCode (`opencode-engine` on port 4096), replacing Craft Agents (`craft-engine` / WebSocket 9100).
- **API:** Health uses `engineReachable` only; removed `craftReachable`, `/api/verify-craft`, `verify:craft`, and `CRAFT_SKIP`.
- **Docs:** README, DOGFOOD, and launch scripts aligned with OpenCode; design doc marked superseded for engine details.

### Removed

- Legacy Craft compatibility shims (`verify-craft.ts`, `scripts/verify-craft.ts`).
- Local `craft-engine-test` artifact path (gitignored).

## [0.3.0] — 2026-05-20

### Added

- **Bundled AI Engine (Craft 0.9.5)** packaged inside the desktop app (`Contents/Resources/craft-engine`)
- `bun run build:engine`, `prepare:runtime`, `build:desktop:bundled`, `smoke:packaged`, `verify:engine`
- [docs/ENGINE.md](docs/ENGINE.md) — resource layout, build steps, Craft bump workflow
- Engine health on `/api/health` (`engine.state`, version, errors)
- Adapter contract tests (`craft-adapter-contract.test.ts`); optional `CRAFT_E2E=1` live probe

### Changed

- Settings tab **AI Engine** (was “Craft”) with bundled version, engine status, **Verify Engine**
- Packaged Electron starts bundled `bin/craft-server`; no repo `vendor/` path in production
- Packaged mode prefers Craft RPC; surfaces `failed` / `mock-fallback` instead of silent demo
- Bun resolver: bundled `resources/runtime/bun` → system PATH

### Fixed

- Desktop `.app` no longer depends on developer checkout for Craft startup

## [0.2.0] — 2026-05-20

### Added

- In-app **Craft setup** panel (Settings → Craft): health fields, copy `bun run craft:server`, **Verify Craft** via `POST /api/verify-craft`
- **First-run wizard** when an area has no tasks
- **Dynamic skills** from Craft workspace `~/.craft-agent/workspaces/{id}/skills/*/SKILL.md` merged with static registry
- Point **git meta**: `meta.branch`, `meta.prUrl` in detail; branch chip + copy on outline rows
- `CHANGELOG.md`, optional GitHub **release** workflow for desktop artifacts
- Dogfood docs: clearer [docs/DOGFOOD.md](docs/DOGFOOD.md), [docs/FRICTION_TEMPLATE.md](docs/FRICTION_TEMPLATE.md)

### Changed

- Health polling every **10s** in the app
- Plan extraction robustness (`extractPlanFromContent`)
- Auto-agent debounce to avoid double-fire on the same transition
- Parent harness unblocks from **waiting** when all children are **cancelled**
- Permission prompts show a **5-minute stale** warning with dismiss

### Fixed

- Meta PATCH merges partial `meta` updates (branch/PR URL)
- `craft:smoke` shares verification logic with the API endpoint

## [1.3] — Polish & dogfood prep

- Empty states, selection persistence, RPC banner
- Harness activity log, area refine-with-agent
- Playwright E2E smoke, CI workflow
- Multi-workspace switch

## [1.2] — Workflow agents

- Auto agents on state transitions (plan / execute)
- SSE streaming, tool blocks, inline permissions
- @mentions for subagents and skills

## [1.1] — Parent harness

- Parent waiting / unblocked states
- Plan review and completion verification
- Child reorder in outline

## [1.0] — MVP

- Areas and nested points with uniform schema
- Craft session per point (mock + Craft RPC adapters)
- State machine, comments-first thread UI
- Electron desktop shell
