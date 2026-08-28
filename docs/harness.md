# Bernise agent harness

Bernise is a **control surface**, not an LLM client. Coding work must not call OpenAI, Anthropic, or Google APIs from the app. Intelligence lives in provider CLIs; this repo owns sessions, UI, and the Effect runtime.

This is the same split as [t3code](https://github.com/pingdotgg/t3code): a server is the execution boundary, clients are dumb, and a **provider driver** spawns the CLI behind one interface.

## Layout

- `apps/web` is the renderer: a real browser via `vp run dev:web`, or Electron via `vp run dev`. Both talk to `apps/server` over HTTP (`GET /health`) and Effect RPC over WebSocket (`/rpc`).
- `apps/server` owns provider processes. `Provider` in `apps/server/src/Provider.ts` is implemented by `ProviderRouterLive`, which routes to:
  - `CursorProviderLive` — spawns `cursor-agent acp` (ACP JSON-RPC over stdio)
  - `CodexProviderLive` — spawns `codex app-server` (Codex App Server JSON-line RPC, no `jsonrpc: "2.0"` wrapper)
- Settings live in `~/.bernise/settings.json` (override directory with `BERNISE_STATE_DIR`). The config page probes both CLIs for install/auth health. `GET /health` is process liveness only.

## Cursor CLI

Install [Cursor CLI](https://cursor.com/cli) and authenticate on the machine running the Bernise server:

```bash
agent login
```

Spawn uses `cursor-agent` (not `agent`) so Grok's `agent` binary cannot win `PATH`.

## Codex CLI

Install [Codex CLI](https://developers.openai.com/codex/cli) and authenticate on the machine running the Bernise server:

```bash
codex login
```

Bernise does not call OpenAI HTTP APIs. It talks to the local `codex app-server` the same way t3code does: `initialize` → `initialized` → `thread/start`, then `turn/start` with `item/agentMessage/delta` streaming.

## Optional env

- `BERNISE_CURSOR_BIN` — default `cursor-agent` (wins over the settings binary path)
- `BERNISE_CODEX_BIN` — default `codex` (wins over the settings binary path)
- `BERNISE_WORKSPACE` — cwd for new sessions (default: server process cwd)
- `BERNISE_STATE_DIR` — settings directory (default: `~/.bernise`)

Tool permissions are auto-approved for this first shot so the agent can write files. There is no interrupt or approval UI yet.

## RPC

`StartSession`, `SendTurn`, and `SubscribeEvents` (stream) sit beside `Ping` on `/rpc` over a WebSocket (`protocol: "websocket"`, JSON frames). `GetSettings` / `UpdateSettings` persist the active provider and binary paths. `GetProviderSnapshots` / `RefreshProviders` run the Cursor ACP and Codex app-server health probes.

The Speak composer starts one session, subscribes, and appends assistant text from `SubscribeEvents` as it streams. Switching Cursor/Codex starts a new Bernise session. `SendTurn` waits until the provider turn finishes so the composer can stay pending.

## Later

- Permission / interrupt UI
- Tool-call rows and richer provider events
- Grill-me / design-tree interviews (above the harness)
- Editor (above the harness)
- Other providers (Claude / OpenCode)
