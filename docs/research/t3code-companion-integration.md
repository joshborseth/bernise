# T3 Code companion integration research

How a companion app (e.g. a voice butler) would talk to a running [t3code](https://github.com/pingdotgg/t3code) environment. Researched against primary sources (contracts, server HTTP API, first-party docs) without cloning the repo. Snapshot of sources: commit `78f462c4` / `main` as of research date (2026-09-17).

**Bottom line:** Prefer HTTP for one-shot list/dispatch/message reads, and WebSocket Effect-RPC streams (`orchestration.subscribeShell` / `orchestration.subscribeThread`) for live updates. Mintlify API pages that still document `orchestration.getSnapshot` + push `orchestration.domainEvent` are **stale** relative to current contracts.

---

## 1. Local server, auth, WebSocket protocol

### Port and URLs

| Item | Value |
| --- | --- |
| Default port | `3773` (`DEFAULT_SERVER_PORT` in `apps/server/src/config.ts`) |
| Desktop host default | `127.0.0.1` |
| Web mode host default | all interfaces (`undefined`) |
| WebSocket endpoint | `ws://<host>:3773/ws` (ticket as query param) |
| HTTP origin | `http://<host>:3773` |

Sources: [server-options](https://mintlify.wiki/pingdotgg/t3code/configuration/server-options), [config.ts](https://github.com/pingdotgg/t3code/blob/78f462c4/apps/server/src/config.ts), client tests using `/ws?wsTicket=…`.

### Auth (current vs outdated docs)

**Current model** (first-party internals):

1. Pair / bootstrap once → environment session (cookie and/or bearer access token).
2. HTTP APIs: `Authorization: Bearer <access-token>` (optional DPoP).
3. WebSocket: `POST /api/auth/websocket-ticket` with that bearer → connect `…/ws?wsTicket=<ticket>` (≈5 min TTL). Long-lived tokens stay out of the socket URL.

Sources:

- [docs/internals/remote.md](https://github.com/pingdotgg/t3code/blob/main/docs/internals/remote.md)
- [docs/internals/environment-auth.md](https://github.com/pingdotgg/t3code/blob/main/docs/internals/environment-auth.md)
- [packages/contracts/src/environmentHttp.ts](https://github.com/pingdotgg/t3code/blob/78f462c4/packages/contracts/src/environmentHttp.ts) (`webSocketTicket` → `/api/auth/websocket-ticket`)

**Outdated Mintlify docs** still say `ws://localhost:3773?token=your-auth-token` and `--auth-token` / `T3CODE_AUTH_TOKEN`. That describes an older static-token path; pairing + session + `wsTicket` replaced it for real clients ([PR #1768](https://github.com/pingdotgg/t3code/pull/1768)).

**Uncertainty:** Whether loopback desktop still accepts a legacy static token for local companions without pairing. Treat pairing/`t3 pair`/`t3 serve` + bearer as the supported path.

### WebSocket orchestration methods (current contracts)

From `ORCHESTRATION_WS_METHODS` in [`packages/contracts/src/orchestration.ts`](https://github.com/pingdotgg/t3code/blob/78f462c4/packages/contracts/src/orchestration.ts):

| Method | Role |
| --- | --- |
| `orchestration.dispatchCommand` | Mutate (commands below) |
| `orchestration.subscribeShell` | Stream: initial shell snapshot + incremental shell events |
| `orchestration.subscribeThread` | Stream: thread detail snapshot + live domain events for one thread |
| `orchestration.getArchivedShellSnapshot` | Archived shell read |
| `orchestration.searchThreads` | Search |
| `orchestration.getTurnDiff` / `getFullThreadDiff` | Diffs |
| `orchestration.getWorkflowScript` | Workflow script |

**Removed from WS surface** (replaced by subscribe streams — [PR #1973](https://github.com/pingdotgg/t3code/pull/1973)):

- `orchestration.getSnapshot`
- `orchestration.replayEvents`
- broadcast push channel `orchestration.domainEvent`

Mintlify still documents the old trio: [WebSocket protocol](https://pingdotgg-t3code.mintlify.app/api/websocket-protocol), [Orchestration API](https://pingdotgg-t3code.mintlify.app/api/orchestration). Prefer contracts + `apps/server/src/ws.ts`.

### Stream shapes (replacement for getSnapshot / domainEvent)

**`orchestration.subscribeShell`** items (`OrchestrationShellStreamItem`):

- `{ kind: "snapshot", snapshot: OrchestrationShellSnapshot }`
- `{ kind: "project-upserted" | "project-removed" | "thread-upserted" | "thread-removed", … }`
- `{ kind: "synchronized" }` (optional completion marker)

Input: optional `afterSequence`, `requestCompletionMarker`.

**`orchestration.subscribeThread`** items (`OrchestrationThreadStreamItem`):

- `{ kind: "snapshot", snapshot: OrchestrationThreadDetailSnapshot }`
- `{ kind: "event", event: OrchestrationEvent }` ← domain events live here
- `{ kind: "synchronized" }`

Input: `threadId`, optional `afterSequence`, `requestCompletionMarker`, `turnLimit`.

### Wire format uncertainty

Older Mintlify examples use JSON `{ id, body: { _tag: "orchestration.*" } }`. Current clients use Effect RPC over `/ws`. Companion implementers should follow `@t3tools/contracts` / `packages/client-runtime` rather than Mintlify JSON examples alone.

---

## 2. Commands for a voice butler

Dispatch via:

- WS: `orchestration.dispatchCommand` with a `ClientOrchestrationCommand`
- HTTP: `POST /api/orchestration/dispatch` with the same command JSON body

### List threads

No `thread.list` command. Read the shell:

- `GET /api/orchestration/shell` → `OrchestrationShellSnapshot` (`projects`, `threads` as shells)
- or WS `orchestration.subscribeShell` (snapshot frame)

Shell thread fields useful for a butler: `id`, `projectId`, `title`, `session`, `latestTurn`, `hasPendingApprovals`, `hasPendingUserInput`, `settledOverride`, `settledAt`, `snoozedUntil`, `pinnedAt`, `latestUserMessageAt`, `backgroundLiveness`, `planProgress`.

Optional: `orchestration.searchThreads` for text search.

### Send a turn

Command type: **`thread.turn.start`**

Required (client form): `commandId`, `threadId`, `message: { messageId, role: "user", text, attachments }`, `runtimeMode`, `interactionMode`, `createdAt`. Optional: `modelSelection`, `titleSeed`, `bootstrap`, `sourceProposedPlan`.

Emits (among others): `thread.message-sent`, `thread.turn-start-requested`; may also `thread.unsettled` / `thread.unsnoozed` on re-engagement.

### Approve

Command type: **`thread.approval.respond`**

Fields: `commandId`, `threadId`, `requestId`, `decision`, `createdAt`.

`decision` literals: `accept` | `acceptForSession` | `decline` | `cancel`.

Related: **`thread.user-input.respond`** for provider questions (`answers` map).

Pending work surfaces on the shell as `hasPendingApprovals` / `hasPendingUserInput` (not only as activities).

### Interrupt

Command type: **`thread.turn.interrupt`**

Fields: `commandId`, `threadId`, optional `turnId`, `createdAt`.

Event: `thread.turn-interrupt-requested`.

Also useful: **`thread.session.stop`**.

### Get thread messages (for summary)

- `GET /api/orchestration/threads/:threadId` → `OrchestrationThreadDetailSnapshot` with full `thread.messages` (and activities, checkpoints, session). Optional query: `turnLimit`, `beforeCursor` for windowed history.
- or WS `orchestration.subscribeThread` snapshot frame (same detail type).

There is no separate `messages.list` command.

### Settle / park (often needed by a butler UX)

| Command | Type |
| --- | --- |
| Settle | `thread.settle` |
| Unsettle | `thread.unsettle` (`reason: "user"` only) |
| Snooze | `thread.snooze` (`snoozedUntil`) |
| Unsnooze / wake | `thread.unsnooze` (`reason: "user"`) |

---

## 3. “Needs attention” / turn settled in snapshots & events

There is **no** wire field named `needsAttention`. Clients derive inbox/attention from shell fields + local helpers in [`packages/client-runtime/src/state/threadSettled.ts`](https://github.com/pingdotgg/t3code/blob/78f462c4/packages/client-runtime/src/state/threadSettled.ts).

### Settled

Server-backed:

- `settledOverride`: `null` | `"settled"` | `"active"`
- `settledAt`: ISO time or null

Events: `thread.settled`, `thread.unsettled` (payload includes `reason`; activity resets are server-emitted, not client-commanded).

Effective settled (client `effectiveSettled`) is **false** (still needs attention / stays active) when:

- `hasPendingApprovals` or `hasPendingUserInput`
- `session.status` is `starting` or `running`
- queued turn start (user message newer than latest turn, within ~2 min grace)
- else honors `settledOverride`, PR merge/close heuristics, and auto-settle-after-days settings

User docs: [Working with threads](https://github.com/pingdotgg/t3code/blob/main/docs/user/thread-sidebar.md) (settle / snooze / pin behavior).

### Attention-like signals on `OrchestrationThreadShell`

| Field | Meaning |
| --- | --- |
| `hasPendingApprovals` | Blocked on approval |
| `hasPendingUserInput` | Blocked on user input |
| `session.status` | `idle` \| `starting` \| `running` \| `ready` \| `interrupted` \| `stopped` \| `error` |
| `latestTurn.state` | turn progress (`running` / `completed` / `interrupted` / `error`) |
| `backgroundLiveness` | `"working"` \| `"monitoring"` after turn settles |
| `planProgress` | in-turn plan step UI |
| snooze + raised hand | `threadRaisedHandWhileSnoozed`: pending approval/input, fresh session error, or turn completed after snooze |

Live updates: shell stream `thread-upserted` (attention flags change without parsing every domain event); thread stream `kind: "event"` for `thread.session-set`, `thread.activity-appended`, `thread.settled`, etc.

---

## 4. HTTP vs WebSocket; MCP is not orchestration

### Orchestration HTTP (yes — companions / CLI / MCP-adjacent clients use this)

From [`EnvironmentOrchestrationHttpApi`](https://github.com/pingdotgg/t3code/blob/78f462c4/packages/contracts/src/environmentHttp.ts):

| Method | Path | Success type |
| --- | --- | --- |
| GET | `/api/orchestration/snapshot` | `OrchestrationReadModel` (full threads w/ messages — heavy) |
| GET | `/api/orchestration/shell` | `OrchestrationShellSnapshot` (list/inbox) |
| GET | `/api/orchestration/threads/:threadId` | `OrchestrationThreadDetailSnapshot` |
| POST | `/api/orchestration/dispatch` | `DispatchResult` |

All require `EnvironmentAuthenticatedAuth` (bearer/session + scopes such as `orchestration:read` / operate).

Introduced for CLI live mode in [PR #1871](https://github.com/pingdotgg/t3code/pull/1871). Client-runtime loads thread detail over HTTP then resumes with `subscribeThread({ afterSequence })` ([threadSnapshotHttp.ts](https://github.com/pingdotgg/t3code/blob/78f462c4/packages/client-runtime/src/state/threadSnapshotHttp.ts)).

### MCP HTTP (`/mcp`) — different API

- Path: `http://<host>:<port>/mcp`
- Auth: **provider-scoped** MCP bearer from session registry, **not** the environment session token used for orchestration
- Purpose: preview/device automation tools (`preview_status`, `preview_navigate`, `preview_snapshot`, …) for the agent inside a turn
- **Not** a substitute for `dispatchCommand` / shell listing

Sources: [`McpHttpServer.ts`](https://github.com/pingdotgg/t3code/blob/78f462c4/apps/server/src/mcp/McpHttpServer.ts), [`McpSessionRegistry.ts`](https://github.com/pingdotgg/t3code/blob/78f462c4/apps/server/src/mcp/McpSessionRegistry.ts).

**Uncertainty:** Phrasing “t3code-mcp uses HTTP” often means this `/mcp` preview server, not `/api/orchestration/*`. Both are HTTP; only orchestration endpoints drive a voice butler’s thread control loop.

---

## 5. Default ports and config / state locations

| Setting | Default |
| --- | --- |
| Port | `3773` |
| Env | `T3CODE_PORT`, `T3CODE_HOST`, `T3CODE_MODE`, `T3CODE_STATE_DIR`, … |
| Base dir | typically `~/.t3` |
| State dir | `~/.t3/userdata` (or `~/.t3/dev` under `devUrl`) |

Under state dir ([`deriveServerPaths`](https://github.com/pingdotgg/t3code/blob/78f462c4/apps/server/src/config.ts)):

- `state.sqlite`
- `keybindings.json`
- `settings.json`
- `server-runtime.json` (live server pid/port/origin for CLI discovery)
- `logs/`, `attachments/`, `secrets/`, `environment-id`, …

Also: `~/.t3/runtime` for desktop-managed SSH remote server installs ([remote-access.md](https://github.com/pingdotgg/t3code/blob/main/docs/user/remote-access.md)).

Per-project config (scripts/previews): `t3.json` schema mentioned in third-party writeups; not required for orchestration RPC.

---

## 6. Official companion / MCP docs

### First-party docs worth reading

| Doc | URL |
| --- | --- |
| Docs index | https://github.com/pingdotgg/t3code/blob/main/docs/README.md |
| Remote access (pairing, T3 Connect, mobile) | https://github.com/pingdotgg/t3code/blob/main/docs/user/remote-access.md |
| Thread settle/snooze UX | https://github.com/pingdotgg/t3code/blob/main/docs/user/thread-sidebar.md |
| Environment auth | https://github.com/pingdotgg/t3code/blob/main/docs/internals/environment-auth.md |
| Remote architecture + `wsTicket` | https://github.com/pingdotgg/t3code/blob/main/docs/internals/remote.md |
| Connection runtime (HTTP vs WS roles) | https://github.com/pingdotgg/t3code/blob/main/docs/internals/connection-runtime.md |
| Mobile internals | https://github.com/pingdotgg/t3code/blob/main/docs/internals/mobile-navigation.md |

### Generated / third-party API sites (use cautiously)

- https://pingdotgg-t3code.mintlify.app/api/websocket-protocol
- https://pingdotgg-t3code.mintlify.app/api/orchestration
- https://pingdotgg-t3code.mintlify.app/api/commands
- https://pingdotgg-t3code.mintlify.app/api/events
- https://mintlify.com/pingdotgg/t3code/llms.txt

These are useful for command/event name catalogs but **lag** current WS method list and auth.

### Official MCP companion docs

**None found** in `docs/` for building an external MCP/orchestration companion. MCP in-tree is the in-product preview toolkit for providers. Official companion surface for phones is the **T3 Code Mobile** app + pairing / T3 Connect ([Play Store listing](https://play.google.com/store/apps/details?id=com.t3tools.t3code), [remote-access.md](https://github.com/pingdotgg/t3code/blob/main/docs/user/remote-access.md)) — product UX docs, not an SDK guide.

Contracts packages are the integration contract: `@t3tools/contracts` (`orchestration.ts`, `environmentHttp.ts`, `rpc.ts`).

---

## Suggested companion control loop

1. Discover origin: `~/.t3/userdata/server-runtime.json` or config port `3773`.
2. Authenticate: pair once → bearer; mint `wsTicket` for WS.
3. Inbox: `GET /api/orchestration/shell` (or `subscribeShell`).
4. Needs attention: `hasPendingApprovals` / `hasPendingUserInput` / `session.status ∈ {starting,running}` / `!effectiveSettled(...)`.
5. Act: `POST /api/orchestration/dispatch` with `thread.turn.start` | `thread.approval.respond` | `thread.turn.interrupt` | `thread.settle` / `snooze`.
6. Summarize: `GET /api/orchestration/threads/:threadId` (optionally `turnLimit`).
7. Stay live: `subscribeShell` + per-thread `subscribeThread` (do not rely on `orchestration.domainEvent` push).

---

## Concrete name cheat sheet

**WS RPC:** `orchestration.dispatchCommand`, `orchestration.subscribeShell`, `orchestration.subscribeThread`, `orchestration.getArchivedShellSnapshot`, `orchestration.searchThreads`, `orchestration.getTurnDiff`, `orchestration.getFullThreadDiff`, `orchestration.getWorkflowScript`

**HTTP:** `GET /api/orchestration/shell`, `GET /api/orchestration/snapshot`, `GET /api/orchestration/threads/:threadId`, `POST /api/orchestration/dispatch`, `POST /api/auth/websocket-ticket`, `GET /.well-known/t3/environment`, MCP `POST/GET /mcp`

**Commands:** `thread.turn.start`, `thread.turn.interrupt`, `thread.approval.respond`, `thread.user-input.respond`, `thread.settle`, `thread.unsettle`, `thread.snooze`, `thread.unsnooze`, `thread.session.stop`, …

**Events (thread stream):** `thread.message-sent`, `thread.turn-start-requested`, `thread.turn-interrupt-requested`, `thread.approval-response-requested`, `thread.session-set`, `thread.settled`, `thread.unsettled`, `thread.activity-appended`, `thread.turn-diff-completed`, …

**Shell stream kinds:** `snapshot`, `thread-upserted`, `thread-removed`, `project-upserted`, `project-removed`, `synchronized`

---

## Uncertainties / staleness risks

1. Mintlify `getSnapshot` / `domainEvent` / `?token=` docs are outdated vs contracts at `78f462c4`/`main`.
2. Exact Effect-RPC framing on `/ws` not fully re-derived here; use client-runtime.
3. Scope names required for each HTTP/WS method (`orchestration:read` vs operate) — see `RpcAuthorization.ts` / auth docs; not exhaustively listed above.
4. Whether a headless companion can use only HTTP without any WS ticket for a pure poll/dispatch butler (likely yes for read+dispatch; no live events).
5. MCP bearer lifetime/issuance is provider-session internal; irrelevant for companion orchestration unless automating previews.
