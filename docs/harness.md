# Bernise agent harness

Bernise is a **control surface**, not an LLM client. Coding work must not call OpenAI, Anthropic, or Google APIs from the app. Intelligence lives in an external agent CLI; this repo owns sessions, UI, and the Effect runtime.

This is the same split as [t3code](https://github.com/pingdotgg/t3code): a server is the execution boundary, clients are dumb, and **provider drivers** spawn CLIs behind one interface.

## Layout

- `apps/web` and `apps/desktop` talk to `apps/server` over HTTP (`GET /health`) and Effect RPC (`/rpc`).
- `apps/server` will own provider processes later. It does not yet spawn anything.
- `Provider` in `apps/server/src/Provider.ts` is a `Context.Service` contract with **no Layer**. First live driver: **Cursor CLI** (`agent` after `agent login`).

## Later (not implemented)

1. Implement `Provider` as Layers, one per driver. Cursor first, then Claude / Codex / OpenCode if needed.
2. Grill-me / design-tree interviews sit **above** the harness.
3. The editor sits **above** the harness. Decisions are the source of truth; code is an afterthought.

Until a driver exists: no subprocess spawn for agents, no API keys, no mock interviewer.
