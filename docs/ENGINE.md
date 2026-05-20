# Bundled AI Engine (Craft)

Liner ships a pinned [craft-agents-oss](https://github.com/craft-ai-agents/craft-agents-oss) build as the **AI Engine** inside the desktop app. Liner remains the product layer (outline, workflow, harness); Craft is the local agent runtime started by Electron.

## Resource layout

| Path (dev) | Path (packaged `.app`) | Purpose |
|------------|------------------------|---------|
| `vendor/craft-agents-oss` | `Contents/Resources/craft-engine/` | Craft server distribution |
| `apps/liner-electron/build/runtime/bun` | `Contents/Resources/runtime/bun` | Bun for Liner API (optional bundle) |
| `apps/liner/dist` | `Contents/Resources/liner-ui/` | Built React UI |
| `apps/liner-server/src` | `Contents/Resources/liner-server/` | Liner HTTP API entry |

### Craft engine directory (`craft-engine/`)

Produced by `bun run build:engine` into `apps/liner-electron/build/craft-engine/`:

```
craft-engine/
  manifest.json          # Liner-generated pin metadata
  bin/craft-server       # Entry script (uses bundled Bun inside engine)
  start.sh
  vendor/bun/bun         # Craft's bundled Bun
  packages/server/...
  resources/...
```

### Manifest schema (`manifest.json`)

```json
{
  "engine": "craft-agents-oss",
  "version": "0.9.5",
  "platform": "darwin",
  "arch": "arm64",
  "builtAt": "2026-05-20T12:00:00.000Z",
  "craftBuildScript": "server:build:darwin-arm64"
}
```

## Build commands

```bash
# Build Craft server artifact for current Mac arch (requires vendor submodule + deps)
bun run build:engine

# Copy Bun for packaged Liner API (uses system `bun` if present)
bun run prepare:runtime

# Full bundled desktop: UI + API + Electron + engine + package
bun run build:desktop:bundled
```

`build:engine` runs Craft's `server:build:darwin-arm64` or `server:build:darwin-x64` and copies `vendor/craft-agents-oss/dist/server` into `apps/liner-electron/build/craft-engine/`.

**Prerequisites for `build:engine`:**

```bash
git submodule update --init vendor/craft-agents-oss
cd vendor/craft-agents-oss && bun install
```

The Craft server build downloads Bun/uv binaries and can take several minutes. If the submodule or deps are missing, the script exits with a clear message (CI may skip the engine and ship UI-only until deps are installed).

## Packaged startup

Electron `main.ts`:

1. Resolves `craft-engine` under `process.resourcesPath` (packaged) or `vendor/craft-agents-oss` (dev).
2. Spawns `bin/craft-server` with `CRAFT_RPC_HOST=127.0.0.1` and `CRAFT_RPC_PORT`.
3. Resolves Bun for the Liner API: `resources/runtime/bun` → system `bun` on PATH.
4. Sets `LINER_PACKAGED=1` and engine state env vars for `/api/health`.

Packaged mode does **not** read `../../vendor/craft-agents-oss`. If the engine fails to start, health reports `engine.state: failed` or `mock-fallback` with `lastError` — not silent demo mode.

## Provider credentials

Liner does not ship LLM API keys. Configure model/provider keys in Craft workspace config (same as Craft desktop), typically under `~/.craft-agent/workspaces/{id}/`.

Verify in the app: **Settings → AI Engine → Verify Engine**. Exit **0** = engine connected; **2** = mock-only (engine down); **1** = failure (often missing credentials).

## Updating Craft (bump workflow)

1. Choose a Craft release or commit; update the submodule pointer.
2. `cd vendor/craft-agents-oss && bun install`
3. `bun run build:engine`
4. `bun test` and `bun run verify:engine` (or `CRAFT_E2E=1 bun test` for live RPC)
5. `bun run build:desktop:bundled` and dogfood from Finder ([DOGFOOD.md](./DOGFOOD.md))
6. Note in [CHANGELOG.md](../CHANGELOG.md): `Bundled Craft: 0.9.5 → 0.9.6`

## CI note

The default GitHub `build:desktop` job does not require a Craft build. Use `build:desktop:bundled` locally or in release workflows when the submodule is initialized and Craft deps are installed. `build:engine` fails fast with instructions when the vendor tree is incomplete.

## Verification

```bash
bun run build:engine
bun run build:desktop:bundled
bun run smoke:packaged    # against running Liner API (packaged or dev)
bun run verify:engine     # alias for craft smoke / engine RPC probe
```
