# Bernise agent harness

Bernise is a **control surface**, not an LLM client. Coding work must not call OpenAI, Anthropic, or Google APIs from the app. Intelligence lives in Cursor CLI (`cursor-agent`); this repo owns sessions, UI, and the Effect runtime.

This is the same split as [t3code](https://github.com/pingdotgg/t3code): a server is the execution boundary, clients are dumb, and a **provider driver** spawns the CLI behind one interface.

## Layout

- `apps/web` is the renderer: a real browser via `vp run dev:web`, or Electron via `vp run dev`. Both talk to `apps/server` over HTTP (`GET /health`) and Effect RPC over WebSocket (`/rpc`).
- `apps/server` owns the Cursor ACP process. It spawns `cursor-agent acp` (override with `BERNISE_CURSOR_BIN`), talks JSON-RPC over stdio, and streams `ProviderTurnDelta` events to the client.
- `Provider` in `apps/server/src/Provider.ts` is implemented by `CursorProviderLive`.

## Cursor CLI

Install [Cursor CLI](https://cursor.com/cli) and authenticate on the machine running the Bernise server:

```bash
agent login
```

Spawn uses `cursor-agent` (not `agent`) so Grok's `agent` binary cannot win `PATH`. Optional env:

- `BERNISE_CURSOR_BIN` — default `cursor-agent`
- `BERNISE_WORKSPACE` — cwd for `session/new` (default: server process cwd)

Tool permissions are auto-approved for this first shot so the agent can write files. There is no interrupt or approval UI yet.

## RPC

`StartSession`, `SendTurn`, and `SubscribeEvents` (stream) sit beside `Ping` on `/rpc` over a WebSocket (`protocol: "websocket"`, JSON frames). The Speak composer starts one session, subscribes, and appends assistant text from `SubscribeEvents` as it streams. `SendTurn` waits until the ACP prompt finishes so the composer can stay pending.

## Later

- Permission / interrupt UI
- Tool-call rows and richer ACP events
- Grill-me / design-tree interviews (above the harness)
- Editor (above the harness)
- Other providers (Claude / Codex / OpenCode)
