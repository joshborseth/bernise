# Bernise agent harness

Bernise is a **control surface**, not an LLM client. Coding work must not call OpenAI, Anthropic, or Google APIs from the app. Intelligence lives in the Codex CLI; this repo owns sessions, UI, and the Effect runtime.

This is the same split as [t3code](https://github.com/pingdotgg/t3code): a server is the execution boundary, clients are dumb, and a **provider driver** spawns the CLI behind one interface.

## Layout

- `apps/web` is the renderer: a real browser via `vp run dev:web`, or Electron via `vp run dev`. Both talk to `apps/server` over HTTP (`GET /health`) and Effect RPC over WebSocket (`/rpc`).
- `apps/server` owns the provider process. `Provider` in `apps/server/src/Provider.ts` is implemented by `CodexProviderLive`, which spawns `codex app-server` (Codex App Server JSON-line RPC, no `jsonrpc: "2.0"` wrapper).
- Settings live in `~/.bernise/settings.json` (override directory with `BERNISE_STATE_DIR`). The Speak transcript is stored in `~/.bernise/state.sqlite` so a reload restores the current conversation. Codex still starts a fresh provider thread on each server session (resume is not this slice). The config page probes the Codex CLI for install/auth health. `GET /health` is process liveness only.

## Codex CLI

Install [Codex CLI](https://developers.openai.com/codex/cli) and authenticate on the machine running the Bernise server:

```bash
codex login
```

Bernise does not call OpenAI HTTP APIs. It talks to the local `codex app-server` the same way t3code does: `initialize` → `initialized` → `thread/start` (cwd, selected model, and Bernise `developerInstructions` for grilling + cat voice), then `turn/start` with `item/agentMessage/delta` streaming.

The server merges the login-shell `PATH` at boot so Electron's stripped GUI path still finds Homebrew `codex`. Leave Binary path blank to spawn the bare command `codex`. An explicit settings path or `BERNISE_CODEX_BIN` overrides that (env wins).

## Optional env

- `BERNISE_CODEX_BIN` — optional absolute (or other) Codex binary; wins over the settings binary path. Default is `codex` on PATH
- `BERNISE_WORKSPACE` — cwd for new sessions (default: server process cwd)
- `BERNISE_STATE_DIR` — settings and `state.sqlite` directory (default: `~/.bernise`)

Tool permissions are auto-approved for this first shot so the agent can write files. There is no interrupt or approval UI yet.

## RPC

`StartSession`, `SendTurn`, and `SubscribeEvents` (stream) sit beside `Ping` on `/rpc` over a WebSocket (`protocol: "websocket"`, JSON frames). `GetThread` returns the projected Speak transcript from `state.sqlite`. `GetSettings` / `UpdateSettings` persist the optional Codex binary override, `CODEX_HOME`, and last-selected model. `ListModels` asks Codex App Server for `model/list` so the Speak composer can render a picker. `GetProviderSnapshots` / `RefreshProviders` run the Codex app-server health probe.

The Speak composer hydrates bubbles from `GetThread` on boot, then starts one session, subscribes, and appends assistant text from `SubscribeEvents` as it streams. Each `SendTurn` also persists the user prompt and the final assistant text on the server. `StartSession` and `SendTurn` pass the selected model through to Codex `thread/start` and `turn/start`. The composer picker shows that model’s display name, or a ListModels error if the catalog cannot load. Changing the model does not reset the thread; the next turn uses the new id.

## Later

- Permission / interrupt UI
- Tool-call rows and richer provider events
- Grill-me / design-tree interviews (above the harness)
- Editor (above the harness)
- Other providers (Claude / OpenCode)
