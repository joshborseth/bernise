# Bernise companion

Bernise is a macOS overlay pet that watches a local [t3code](https://github.com/pingdotgg/t3code) environment. It does not spawn Codex, does not show diffs, and does not dispatch commands. Intelligence stays in t3code. Bernise speaks.

v1 is listen-only: unsolicited speech when a thread needs you or settles, and an extractive summary on “hey Bernise.”

The Three.js cat lives in `apps/pet`. The overlay, t3code HTTP, and Chatterbox playback live in `apps/macos`. Attention and summary are pure TypeScript in `packages/`.

Mintlify pages that still document `orchestration.getSnapshot`, `orchestration.domainEvent`, and `ws://host:3773?token=` are stale. The contract is HTTP orchestration plus pairing. Details: [docs/research/t3code-companion-integration.md](research/t3code-companion-integration.md).

## Discover t3code

1. Read `~/.t3/userdata/server-runtime.json` (or `$T3CODE_STATE_DIR/server-runtime.json`). Use `origin` / `port` when present.
2. Else `http://127.0.0.1:3773`.

Override with `BERNISE_T3CODE_ORIGIN`.

Inbox: `GET {origin}/api/orchestration/shell` about once a second.

Summary source: `GET {origin}/api/orchestration/threads/{threadId}`.

v1 does not call `POST /api/orchestration/dispatch` and does not open the Effect-RPC WebSocket.

## Auth (pairing spike)

Loopback t3code is not an open API. Current environments issue their own sessions:

1. Pair once (`t3 pair`, or Settings → Connections in the t3code desktop app). A loopback pairing link only works on the same machine.
2. Store the access token in `~/.bernise/t3code.json`:

```json
{
  "origin": "http://127.0.0.1:3773",
  "accessToken": "<bearer>"
}
```

3. Send `Authorization: Bearer <accessToken>` on every orchestration GET.
4. Optional: `BERNISE_T3CODE_TOKEN` wins over the file.

Web-mode t3code can seed `T3CODE_DEV_AUTH_TOKEN`; desktop and non-dev servers ignore it. Do not rely on the old `--auth-token` / `?token=` query string.

If the shell GET returns 401/403, or the origin is down, the pet stays idle and disconnected. It does not invent a token.

`POST /api/auth/websocket-ticket` is only needed for live WS. v1 polls HTTP, so a bearer is enough.

## Speak

Chatterbox is `POST {BERNISE_TTS_URL}/speak` with `X-API-Key` from `BERNISE_TTS_API_KEY` or `~/.bernise/tts.key`. Default origin `http://borseth.ddns.net:7040`, voice `benny2`. The WebView never sees the key. Clips do not overlap.

## Commands

- `vp i` — install workspace dependencies
- `vp run dev` / `vp run dev:pet` — Vite pet on port 5733 (browser iteration, no overlay)
- `vp test run` — attention, summary, listen gate, speakable
- `vp run typecheck` — pet + packages
- macOS overlay: `swift run` in `apps/macos` on a Mac (this Linux environment cannot link AppKit)
