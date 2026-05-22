# Liner dogfood log (v1.4 + bundled engine)

Use this after running the workflow on a real project with the **bundled OpenCode engine** (or mock for UI-only checks).

## Pre-flight (about 10 minutes)

### Browser / dev

```bash
bun install

# Managed engine + UI (two terminals) or mock-only dev:
LINER_RPC_MODE=opencode LINER_MANAGED_ENGINE=1 bun run dev:api
bun run dev:ui

bun run dev:check            # optional: assert engine ready (managed mode)
# Settings → AI Engine → Verify Engine (record exit code below)
```

Default `bun run dev` uses mock RPC (no engine spawn) — fine for UI; use managed mode above for engine proof.

### Packaged desktop (single app)

```bash
bun run build:engine
bun run build:desktop:bundled
open apps/liner-electron/release/mac-arm64/Liner.app
# wait ~30s for engine + API
bun run smoke:packaged
```

Open the app → **Settings (⌘,)** → **AI Engine** → **Verify Engine**.

Health should show `engine.state: ready`, `engineReachable: true`, and `"rpc":"opencode"` when the engine and provider keys are configured.

### Verify Engine result

| Date | Exit code | Notes |
|------|-----------|-------|
| 2026-05-20 | 2 | Mock-only — OpenCode not running |

Record from terminal:

```bash
bun run verify:engine; echo "exit: $?"
# or packaged API:
bun run smoke:packaged; echo "exit: $?"
```

Or from the app: Settings → **AI Engine** → **Verify Engine** (shows exit code and message).

`ENGINE_SKIP=1 bun run verify:engine` skips engine verification in CI or when OpenCode is unavailable.

---

## Dogfood checklist

One area (e.g. “Liner v1.4”), three nested points.

| Step | Action | Done |
|------|--------|------|
| 1 | **Engine proof:** `bun run dev` (managed) or packaged `.app` → Settings → AI Engine → **Verify Engine** exit **0** (or `dev:check` / `smoke:packaged`). Health: `"rpc":"opencode"`, `engineReachable: true`, `engine.state: ready` | [ ] |
| 2 | **Auto workflow:** Settings → auto agents on. backlog → todo (plan) → approve → in-progress → execute → done → ship | [ ] |
| 3 | **Parent harness:** Parent waits while children active; unblocks when children terminal or all cancelled | [ ] |
| 4 | **Thread:** Send message, streaming on agent card, tools, permission approve/deny (stale prompts warn after 5 min) | [ ] |
| 5 | **Multi-workspace:** Settings → switch or create workspace; outline reloads | [ ] |
| 6 | **Polish:** Empty states clear; reopen from shipped; state-change toast visible | [ ] |
| 7 | **Git meta (optional):** Point detail → branch / PR URL; branch chip on outline row | [ ] |
| 8 | **Bundled desktop:** `bun run build:desktop:bundled` → open `.app` from Finder (no Terminal for engine/API) | [ ] |

### Bundled engine friction checks

| Check | Expected |
|-------|----------|
| Clean Mac without Bun | App runs if `prepare:runtime` was used at build time; else clear “Bun not found” in AI Engine panel |
| No provider keys | Verify exit **1** or **2** with message about credentials — not “app broken” |
| Engine missing in `.app` | `engine.state: failed`, message to rebuild with `build:desktop:bundled` |
| Quit app | OpenCode child process stops (no orphan on port 4096) |

---

## Friction log (top issues)

Fill after testing — keep to the three highest-impact items. Template: [FRICTION_TEMPLATE.md](./FRICTION_TEMPLATE.md).

### 1.

- **What happened:**
- **Expected:**
- **Severity:** low / medium / high

### 2.

- **What happened:**
- **Expected:**
- **Severity:** low / medium / high

### 3.

- **What happened:**
- **Expected:**
- **Severity:** low / medium / high

---

## Follow-ups

Link GitHub issues or Linear tickets here.

| Item | Issue |
|------|-------|
| | |
