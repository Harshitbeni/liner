# Liner dogfood log (Cursor SDK)

Use this after running the workflow on a real project with the **Cursor SDK** (or mock for UI-only checks).

## Pre-flight (about 10 minutes)

### Browser / dev

```bash
bun install

# Mock UI dev (default):
bun run dev

# Live Composer 2.5:
export CURSOR_API_KEY=cursor_...
LINER_RPC_MODE=cursor-sdk bun run dev:api
bun run dev:ui

bun run dev:check            # optional: assert health (with API key)
# Settings → Cursor SDK → Verify SDK (record exit code below)
```

### Packaged desktop (single app)

```bash
bun run build:desktop:bundled
open apps/liner-electron/release/mac-arm64/Liner.app
bun run smoke:packaged
```

Open the app → **Settings (⌘,)** → **Cursor SDK** → **Verify SDK**.

Health should show `engineReachable: true` and `"rpc":"cursor-sdk"` when the API key is configured.

### Verify SDK result

| Date | Exit code | Notes |
|------|-----------|-------|
| 2026-05-23 | — | |

Record from terminal:

```bash
bun run verify:engine; echo "exit: $?"
```

Or from the app: Settings → **Cursor SDK** → **Verify SDK**.

`ENGINE_SKIP=1 bun run verify:engine` skips verification in CI.

---

## Dogfood checklist

| Step | Action | Done |
|------|--------|------|
| 1 | **SDK proof:** Settings → Cursor SDK → **Verify SDK** exit **0**. Health: `"rpc":"cursor-sdk"`, `engineReachable: true` | [ ] |
| 2 | **Auto workflow:** backlog → todo (plan) → approve → in-progress → execute → done → ship | [ ] |
| 3 | **Parent harness:** Parent waits while children active | [ ] |
| 4 | **Thread:** Streaming, tools, permission prompts | [ ] |
| 5 | **Multi-workspace:** Settings → switch workspace | [ ] |
| 6 | **Desktop:** `build:desktop:bundled` → open `.app` from Finder | [ ] |

### Friction checks

| Check | Expected |
|-------|----------|
| No API key | Verify exit **1** or **2** with clear message |
| Mock dev | `LINER_RPC_MODE=mock` — UI works without key |
| Quit app | No orphan processes |

---

## Friction log (top issues)

Fill after testing — keep to the three highest-impact items.

### 1.

- **What happened:**
- **Expected:**
- **Severity:** low / medium / high
