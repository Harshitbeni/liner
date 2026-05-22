# Bundled AI Engine (OpenCode)

Liner ships a pinned [OpenCode](https://github.com/anomalyco/opencode) CLI as the **AI Engine**. Liner remains the product layer (outline, workflow, harness); OpenCode is the local agent runtime.

**One owner:** the **Liner API** (`liner-server`) starts and stops the engine child process. Electron is a launcher (window + API + optional Vite dev). Browser dev uses the same API path.

## Resource layout

| Path (dev) | Path (packaged `.app`) | Purpose |
|------------|------------------------|---------|
| `apps/liner-electron/build/opencode/` | `Contents/Resources/opencode-engine/` | OpenCode CLI + manifest |
| `apps/liner-electron/build/runtime/bun` | `Contents/Resources/runtime/bun` | Bun for Liner API (optional bundle) |
| `apps/liner/dist` | `Contents/Resources/liner-ui/` | Built React UI |
| `apps/liner-server/src` | `Contents/Resources/liner-server/` | Liner HTTP API entry |

### OpenCode engine directory (`opencode-engine/`)

Produced by `bun run build:engine` into `apps/liner-electron/build/opencode/`:

```
opencode/
  manifest.json
  bin/opencode          # CLI binary (serve subcommand)
```

## Startup

1. API boots (`apps/liner-server/src/index.ts`).
2. If `LINER_MANAGED_ENGINE` is not `0` and `LINER_RPC_MODE` is not `mock`, call `startManagedEngine()`.
3. If OpenCode is already listening on the configured port, skip spawn.
4. Else spawn bundled `bin/opencode serve` (packaged) or system `opencode` / SDK bootstrap (dev).
5. Connect HTTP RPC via `@opencode-ai/sdk` in `opencode` mode.

**Electron** sets `LINER_RPC_MODE=opencode`, `OPENCODE_PORT`, `LINER_ENGINE_ROOT`. It does not spawn OpenCode directly.

## Provider credentials

Keys live in **`~/.liner/auth.json`** (OpenCode-compatible). Configure in **Settings → AI Provider**.

Supported providers include Anthropic, OpenAI, OpenRouter, Google AI, and Ollama (local, no key).

**Verify Engine** (`POST /api/verify-engine`): exit **0** = RPC OK + reply; **2** = mock-only; **1** = failure (often missing API key).

## Skills

Anthropic-style `SKILL.md` directories:

- Global: `~/.liner/skills/<slug>/SKILL.md`
- Per workspace: `~/.liner/workspaces/<id>/.liner/skills/<slug>/SKILL.md`

## Environment

| Variable | Default | Role |
|----------|---------|------|
| `LINER_MANAGED_ENGINE` | on | `0` = do not spawn engine (CI, Playwright) |
| `LINER_RPC_MODE` | `opencode` | `mock` = demo RPC, no spawn |
| `OPENCODE_PORT` | `4096` | Engine listen port |
| `OPENCODE_BASE_URL` | `http://127.0.0.1:4096` | HTTP API base |
| `LINER_ALLOW_MOCK_FALLBACK` | off | `1` = allow demo fallback when OpenCode fails |
| `ENGINE_SKIP` | — | `1` = skip verify script |

## Build commands

```bash
bun run build:engine          # download opencode CLI into build/opencode/
bun run prepare:runtime       # optional Bun for packaged API
bun run build:desktop:bundled # ship .app with engine
```

## Verification

```bash
bun run dev
bun run dev:check
bun run verify:engine
bun run build:desktop:bundled
bun run smoke:packaged
```
