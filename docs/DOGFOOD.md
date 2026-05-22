# Liner dogfood log (v1.4 + bundled engine)

Use this after running the workflow on a real project with the **bundled AI Engine** (or mock for UI-only checks).

## Pre-flight (about 10 minutes)

### Browser / dev

```bash
git submodule update --init --recursive
bun install
cd vendor/craft-agents-oss && bun install && cd ../..

# One terminal — API starts Craft automatically
bun run dev
bun run dev:check            # optional: assert engine ready
# Settings → AI Engine → Verify Engine (record exit code below)
```

### Packaged desktop (single app)

```bash
cd vendor/craft-agents-oss && bun install && cd ../..
bun run build:desktop:bundled
open apps/liner-electron/release/mac-arm64/Liner.app
# wait ~30s for engine + API
bun run smoke:packaged
```

Open the app → **Settings (⌘,)** → **AI Engine** → **Verify Engine**.

Health should show `engine.state: ready`, `craftReachable: true`, and `"rpc":"craft"` when the engine and provider keys are configured.

### `craft:smoke` / Verify Engine result

| Date | Exit code | Notes |
|------|-----------|-------|
| 2026-05-20 | 2 | Mock-only — Craft server not running (`bun run craft:server` for exit 0) |

Record from terminal:

```bash
bun run craft:smoke; echo "exit: $?"
# or packaged API:
bun run smoke:packaged; echo "exit: $?"
```

Or from the app: Settings → **AI Engine** → **Verify Engine** (shows exit code and message).

`CRAFT_SKIP=1 bun run verify:craft` skips Craft verification in CI or when Craft is unavailable.

---

## Dogfood checklist

One area (e.g. “Liner v1.4”), three nested points.

| Step | Action | Done |
|------|--------|------|
| 1 | **Engine proof:** `bun run dev` or packaged `.app` → Settings → AI Engine → **Verify Engine** exit **0** (or `dev:check` / `smoke:packaged`). Health: `"rpc":"craft"`, `craftReachable: true`, `engine.state: ready` | [ ] |
| 2 | **Auto workflow:** Settings → auto agents on. backlog → todo (plan) → approve → in-progress → execute → done → ship | [ ] |
| 3 | **Parent harness:** Parent waits while children active; unblocks when children terminal or all cancelled | [ ] |
| 4 | **Thread:** Send message, streaming on agent card, tools, permission approve/deny (stale prompts warn after 5 min) | [ ] |
| 5 | **Multi-workspace:** Settings → switch or create workspace; outline reloads | [ ] |
| 6 | **Polish:** Empty states clear; reopen from shipped; state-change toast visible | [ ] |
| 7 | **Git meta (optional):** Point detail → branch / PR URL; branch chip on outline row | [ ] |
| 8 | **Bundled desktop:** `bun run build:desktop:bundled` → open `.app` from Finder (no Terminal for Craft/API) | [ ] |

### Bundled engine friction checks

| Check | Expected |
|-------|----------|
| Clean Mac without Bun | App runs if `prepare:runtime` was used at build time; else clear “Bun not found” in AI Engine panel |
| No provider keys | Verify exit **1** or **2** with message about credentials — not “app broken” |
| Engine missing in `.app` | `engine.state: failed`, message to rebuild with `build:desktop:bundled` |
| Quit app | Craft child process stops (no orphan on port 9100) |

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
