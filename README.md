# Liner

Personal agent outliner powered by [OpenCode](https://github.com/anomalyco/opencode) as the local coding-agent engine.

Nested points with uniform schema, comments-first threads (one Craft session per point), and a two-phase parent harness (plan review + completion verification).

## Structure

| Path | Purpose |
|------|---------|
| `packages/liner-core` | SQLite store, types, state machine, harness, mentions, RPC adapter |
| `apps/liner-server` | Bun HTTP API + SSE (used by UI + Electron) |
| `apps/liner` | React outline UI (Vite) |
| `apps/liner-electron` | Electron shell — bundled AI engine + API + UI |
| `vendor/craft-agents-oss` | Git submodule (agent runtime) |

## Prerequisites

- [Bun](https://bun.sh) 1.1+
- Git submodules initialized
- For desktop builds: Bun on PATH (or `bun run prepare:runtime` to bundle Bun into the `.app`)
- For bundled engine: Craft submodule deps installed (`cd vendor/craft-agents-oss && bun install`)

## Setup

```bash
git submodule update --init --recursive
bun install
```

### Craft agents (AI Engine)

The Liner API **starts the Craft engine automatically** on `ws://127.0.0.1:9100` (managed engine). No separate terminal for `craft:server` in normal use.

```bash
# One command — API spawns Craft, then UI
cd vendor/craft-agents-oss && bun install && cd ../..   # first time only
bun run dev

# Optional sanity check (API must be running)
bun run dev:check
```

`craft:smoke` / **Verify Engine** exit codes: **0** = Craft connected; **2** = mock-only; **1** = failure.

Advanced: `bun run craft:server` runs the engine alone (debug). Force demo mode: `LINER_RPC_MODE=mock LINER_MANAGED_ENGINE=0 bun run dev`.

## Run

```bash
# API + React UI (browser) — frees ports 9240/5180 first
bun run dev

# API only
bun run dev:api

# UI only (needs API)
bun run dev:ui

# Electron desktop (API starts Craft + Vite dev — one command)
bun run dev:electron

# Full stack: API + UI + Electron window
bun run dev:all
```

- UI: http://127.0.0.1:5180
- API: http://127.0.0.1:9240/api/health
- SQLite: `~/.liner/workspaces/default/liner.db`

### Dogfood checklist (v1.4)

See [docs/DOGFOOD.md](docs/DOGFOOD.md). Summary:

1. **AI Engine proof:** Any entry path → Settings → **AI Engine** → **Verify Engine** (exit 0). Dev: `bun run dev` then `bun run dev:check` or health shows `"rpc":"craft"`.
2. **Auto workflow:** Settings → **Auto-run agents on state changes** (default on). Promote backlog → **todo** with empty plan → agent writes plan. Approve → **in-progress** → agent executes. Confirm **◉** indicator on outline row while running.
3. **Thread UX:** Open a point → send a message → watch **streaming** text in the agent card; expand **Tools** blocks; approve/deny **permission** prompts inline.
4. **Ship path:** Child **done** → parent harness → **shipped** on parent when children terminal.
5. **Desktop:** `bun run build:desktop:bundled` → open `.app` from Finder — bundled Craft engine, no extra terminals.

### Dogfood UX

- **Drag-reorder** child tasks in the outline (⋮⋮ handle)
- **Selection persisted** in `localStorage` per area
- **Keyboard:** ⌘N new task, ⌥N child task (outline), Delete/⌫ delete selection (confirm), ⌘Delete/⌘⌫ delete without confirm, P promote backlog→todo, A approve plan, S ship, X cancel
- **Thread streaming** via SSE (`/api/points/:id/events`) — incremental `text_delta` on agent cards
- **@mentions** — 8 subagents + skills in composer autocomplete
- **Auto agents** on state transitions (toggle in Settings)
- **Harness activity** log in point detail
- **Refine with agent** on area description

### Workflow agents

State transitions can trigger agents automatically when `autoAgents` is enabled:

| Transition | Auto action |
|------------|-------------|
| → `todo` (empty plan) | `runAgent(plan)` |
| Human → `in-progress` (from `needs-review` / `todo`) | `runAgent(execute)` |
| Execute completion | → `done` when `LINER_DONE: yes` or parser says complete |

Manual overrides: **Write plan / Execute / Review** in point detail, or `POST /api/points/:id/run-agent`.

## Scripts

| Command | Description |
|---------|-------------|
| `bun run build` | Build core, UI, electron main |
| `bun run build:engine` | Download OpenCode CLI into `apps/liner-electron/build/opencode` |
| `bun run prepare:runtime` | Copy Bun into `apps/liner-electron/build/runtime` for packaged API |
| `bun run build:desktop` | Production Electron app (UI + API; placeholder engine unless built) |
| `bun run build:desktop:bundled` | Full desktop with bundled OpenCode engine + runtime |
| `bun run smoke:packaged` | Probe `/api/health` + `/api/verify-engine` on running app |
| `bun run dev:check` | Assert `/api/health` shows engine reachable + ready |
| `bun run verify:engine` | Probe OpenCode RPC + session smoke test |
| `bun run typecheck` | Typecheck all packages |
| `bun test` | Run liner-core tests (state machine, mentions, harness) |
| `bun run verify:craft` | Alias for `verify:engine` (legacy name) |
| `POST /api/verify-engine` | In-app engine verification (exit code + message) |
| `bun test` | liner-core unit tests |
| `bun run test:e2e` | Playwright smoke (starts API+UI with mock RPC) |

## CI and E2E

GitHub Actions (`.github/workflows/ci.yml`) runs on every push/PR:

- `bun test`, `bun run typecheck`, `bun run build` (no Craft required)
- Playwright smoke with `LINER_RPC_MODE=mock`

Locally:

```bash
bun run test:e2e
```

Playwright starts `dev:api` and `dev:ui` via `playwright.config.ts` webServer hooks unless servers are already running.

Dogfood notes: [docs/DOGFOOD.md](docs/DOGFOOD.md).

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `LINER_API_PORT` | `9240` | Liner HTTP API port |
| `LINER_RPC_MODE` | `craft` (managed) | `craft`, `mock` — mock disables managed engine |
| `LINER_MANAGED_ENGINE` | `1` | Set `0` to skip auto-starting Craft (CI / Playwright) |
| `CRAFT_RPC_PORT` | `9100` | Craft WebSocket RPC |
| `CRAFT_SERVER_TOKEN` | — | Bearer token if Craft requires auth |
| `VITE_LINER_API` | `http://127.0.0.1:9240/api` | UI API base URL |
| `LINER_UI_URL` | `http://127.0.0.1:5180` | Electron dev UI URL |
| `LINER_WORKSPACE_ID` | `default` | SQLite workspace under `~/.liner/workspaces/` |
| `CRAFT_SKIP` | — | Set to `1` to skip `verify:craft` |

## Desktop install (production build)

```bash
bun run build:desktop
```

Artifacts under `apps/liner-electron/release/`:

- **macOS:** `Liner.app`, `Liner-x.x.x.dmg`
- **Linux / Windows:** `dir` or installer targets per platform

The packaged app loads UI from `resources/liner-ui`, starts the **bundled AI engine** from `resources/craft-engine`, and runs the Liner API with `resources/runtime/bun` (or system Bun). See [docs/ENGINE.md](docs/ENGINE.md).

```bash
bun run build:desktop:bundled
open apps/liner-electron/release/mac-arm64/Liner.app
bun run smoke:packaged
```

**Provider keys:** Configure LLM credentials in Craft workspace config (`~/.craft-agent/...`) — Liner does not store API keys. **Verify Engine** in Settings confirms RPC; exit **2** usually means engine down or credentials missing.

**macOS without bundled Bun:** Run `bun run prepare:runtime` before packaging, or install Bun globally if the API fails to start.

### Code signing (optional)

Production `.dmg` / `.app` distribution on macOS requires an Apple Developer ID certificate. electron-builder reads:

| Variable | Description |
|----------|-------------|
| `CSC_LINK` | Path to `.p12` certificate **or** base64-encoded cert |
| `CSC_KEY_PASSWORD` | Password for the `.p12` |
| `CSC_NAME` | Certificate name in Keychain (alternative to `CSC_LINK`) |
| `APPLE_ID` | Apple ID for notarization |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password |
| `APPLE_TEAM_ID` | Team ID for notarization |

Example (local signed build):

```bash
export CSC_LINK="$HOME/certs/DeveloperID.p12"
export CSC_KEY_PASSWORD="…"
export APPLE_ID="you@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="…"
export APPLE_TEAM_ID="XXXXXXXXXX"
bun run build:desktop
```

CI builds without secrets use unsigned artifacts (see `.github/workflows/release.yml` — `CSC_IDENTITY_AUTO_DISCOVERY=false`).

Release notes: [CHANGELOG.md](CHANGELOG.md).

## Manual steps (AI Engine)

1. **First run:** `bun install` at repo root.
2. **Bundled build:** `cd vendor/craft-agents-oss && bun install` then `bun run build:engine` (can take several minutes).
3. **LLM credentials:** Configure Craft workspace model/API keys in craft-agents — Liner does not store provider keys.
4. **Verify:** `bun run verify:engine` or Settings → **AI Engine** → **Verify Engine**.

## Design

See [docs/plans/2026-05-20-liner-design.md](docs/plans/2026-05-20-liner-design.md).
