# Cursor SDK local runtime

Liner uses the [Cursor SDK](https://cursor.com/docs/sdk/typescript) (`@cursor/sdk`) as its **AI runtime**. Liner remains the product layer (outline, workflow, harness); Composer 2.5 runs locally inside each workspace sandbox.

**One owner:** the **Liner API** (`liner-server`) connects to Cursor via `CursorSdkSessionRpcAdapter`. Electron is a launcher (window + API + optional Vite dev). Browser dev uses the same API path.

**Local-only API:** `liner-server` binds to `127.0.0.1` and has no auth middleware. Do not expose port `9240` (or `LINER_API_PORT`) beyond localhost.

## Workspace sandboxes

Each Liner workspace maps to a directory:

```
~/.liner/workspaces/<workspaceId>/
  liner.db          # outline + thread_messages
  .liner/skills/    # optional per-workspace skills
```

Agents always run with `local.cwd` set to that path. There is no model switcher — the model is fixed to `composer-2.5`.

## Credentials

Store your Cursor API key in **`~/.liner/auth.json`**:

```json
{
  "cursor": { "type": "api", "key": "cursor_..." }
}
```

Configure in **Settings → Cursor SDK**. Keys can also be read from `CURSOR_API_KEY` when the SDK loads.

**Verify SDK** (`POST /api/verify-engine`): exit **0** = SDK connected + reply; **2** = mock-only; **1** = failure (often missing API key).

## Skills

Anthropic-style `SKILL.md` directories:

- Global: `~/.liner/skills/<slug>/SKILL.md`
- Per workspace: `~/.liner/workspaces/<id>/.liner/skills/<slug>/SKILL.md`

## Environment

| Variable | Default | Role |
|----------|---------|------|
| `LINER_RPC_MODE` | `cursor-sdk` | `mock` = demo RPC without API key |
| `LINER_ALLOW_MOCK_FALLBACK` | off | `1` = allow demo fallback when SDK connect fails |
| `CURSOR_API_KEY` | — | Optional; overrides file when set in environment |
| `ENGINE_SKIP` | — | `1` = skip verify script |
| `CURSOR_SDK_E2E` | — | `1` = run live SDK contract test |

## Development

```bash
# Demo mode (no API key)
bun run dev:api   # LINER_RPC_MODE=mock

# Live SDK (set key first)
export CURSOR_API_KEY=cursor_...
LINER_RPC_MODE=cursor-sdk bun run dev:api
```

## Smoke / verify

```bash
bun run verify:engine
cd packages/liner-core && CURSOR_SDK_E2E=1 bun test src/__tests__/cursor-sdk-adapter-contract.test.ts
```
