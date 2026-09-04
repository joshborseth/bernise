# Bernise agent harness

Bernise is a **control surface**, not an LLM client. Coding work must not call OpenAI, Anthropic, or Google APIs from the app. Intelligence lives in the Codex CLI; this repo owns sessions, UI, and the Effect runtime.

This is the same split as [t3code](https://github.com/pingdotgg/t3code): a server is the execution boundary, clients are dumb, and a **provider driver** spawns the CLI behind one interface.

## Layout

- `apps/web` is the renderer: a real browser via `vp run dev:web`, or Electron via `vp run dev`. Both talk to `apps/server` over HTTP (`GET /health`) and Effect RPC over WebSocket (`/rpc`).
- `apps/server` owns the provider process. `Provider` in `apps/server/src/Provider.ts` is implemented by `CodexProviderLive`, which spawns `codex app-server` (Codex App Server JSON-line RPC, no `jsonrpc: "2.0"` wrapper).
- Settings live in `~/.bernise/settings.json` (override directory with `BERNISE_STATE_DIR`). Persona markdown lives in `~/.bernise/persona.md` (factory default is `apps/server/src/persona.md`). Speak threads live in `~/.bernise/state.sqlite`: a Bernise `ThreadId` owns the transcript and list, and a separate Codex `threadId` is stored as a resume cursor so later turns call `thread/resume` instead of starting a blank provider conversation. Config edits persona markdown. `GET /health` is process liveness only.

## Codex CLI

Install [Codex CLI](https://developers.openai.com/codex/cli) and authenticate on the machine running the Bernise server:

```bash
codex login
```

Bernise does not call OpenAI HTTP APIs. It talks to the local `codex app-server` the same way t3code does: `initialize` → `initialized` → `thread/resume` when a resume cursor exists for that Bernise thread (falling back to `thread/start` if Codex no longer has it), then `turn/start` with `item/agentMessage/delta` streaming. `thread/start` still sends cwd, the selected model, and the current persona markdown as `developerInstructions`. A Config save applies the next time a thread starts.

The server merges the login-shell `PATH` at boot so Electron's stripped GUI path still finds Homebrew `codex`. With a blank `binaryPath` in settings, Bernise spawns the bare command `codex`. An explicit path in `~/.bernise/settings.json` or `BERNISE_CODEX_BIN` overrides that (env wins).

## Optional env

- `BERNISE_CODEX_BIN` — optional absolute (or other) Codex binary; wins over the settings binary path. Default is `codex` on PATH
- `BERNISE_WORKSPACE` — cwd for new sessions (default: server process cwd)
- `BERNISE_STATE_DIR` — settings and `state.sqlite` directory (default: `~/.bernise`)
- `BERNISE_TTS_URL` — Chatterbox TTS origin (default: `http://borseth.ddns.net:7040`)
- `BERNISE_TTS_VOICE` — speaker id (default: `benny2`)
- `BERNISE_TTS_API_KEY` — TTS secret. If unset, the server reads `~/.bernise/tts.key`

Assistant replies are spoken through `POST /voice/speak` on the Bernise server, which proxies streamed 16-bit PCM WAV from Chatterbox (`X-API-Key` only). The renderer never sees the TTS key. Grill markdown is stripped; the finished turn is sent as one `/speak` at a time (the GPU cannot overlap Turbo requests). The live bubble stays hidden until that clip is fully buffered and playback has started.

Tool permissions are auto-approved for this first shot so the agent can write files. There is no interrupt or approval UI yet.

## RPC

`StartSession`, `SendTurn`, and `SubscribeEvents` (stream) sit beside `Ping` on `/rpc` over a WebSocket (`protocol: "websocket"`, JSON frames). `StartSession` takes a Bernise `threadId`. The server binds that id to the live `SessionId`, loads any stored Codex resume cursor, and keeps one Codex app-server process at a time. `GetWorkspace` returns the resolved Codex cwd (`BERNISE_WORKSPACE` or the server process cwd) so the station can show which project is being grilled. `ListThreads` returns thread shells (title, timestamps). `GetThread { threadId }` returns that thread's projected Speak transcript. `RenameThread` / `DeleteThread` update the SQLite projections. `GetSettings` / `UpdateSettings` persist the optional Codex binary override, `CODEX_HOME`, last-selected model, and persona markdown (`persona: null` restores the shipped default). `ListModels` asks Codex App Server for `model/list` so the Speak composer can render a picker. `GetProviderSnapshots` / `RefreshProviders` run the Codex app-server health probe.

The Speak composer hydrates from `ListThreads` then `GetThread` on boot. A new thread stays local until the first Speak, which creates the SQLite row and starts (or resumes) Codex. Each `SendTurn` persists the user prompt and the final assistant text on the session's Bernise thread. `StartSession` and `SendTurn` pass the selected model through to Codex `thread/start` / `thread/resume` and `turn/start`. The composer picker shows that model’s display name, or a ListModels error if the catalog cannot load. Changing the model does not reset the thread; the next turn uses the new id.

## Later

- Permission / interrupt UI
- Tool-call rows and richer provider events
- Grill-me / design-tree interviews (above the harness)
- Editor (above the harness)
- Other providers (Claude / OpenCode)
