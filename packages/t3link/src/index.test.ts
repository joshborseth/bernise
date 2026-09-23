import { describe, expect, it } from "vite-plus/test";
import {
  ackFrame,
  applyShellStreamItems,
  decodeRpcPayload,
  pingFrame,
  pongFrame,
  shellSocketURL,
  subscribeShellFrame,
} from "./index.ts";

const thread = (id: string, pending = false) => ({
  id,
  title: id,
  hasPendingApprovals: pending,
});

describe("subscribeShell frames", () => {
  it("requests the shell stream and resumes from a sequence", () => {
    expect(JSON.parse(subscribeShellFrame("1"))).toEqual({
      _tag: "Request",
      id: "1",
      tag: "orchestration.subscribeShell",
      payload: {},
      headers: [],
    });
    expect(JSON.parse(subscribeShellFrame("1", 4))).toMatchObject({
      payload: { afterSequence: 4 },
    });
    expect(JSON.parse(ackFrame("1"))).toEqual({ _tag: "Ack", requestId: "1" });
    expect(JSON.parse(pingFrame())).toEqual({ _tag: "Ping" });
    expect(JSON.parse(pongFrame())).toEqual({ _tag: "Pong" });
  });

  it("decodes chunk, exit, and keepalive frames", () => {
    const raw = JSON.stringify({
      _tag: "Chunk",
      requestId: 7,
      values: [{ kind: "synchronized" }],
    });
    expect(decodeRpcPayload(raw)).toEqual([
      { kind: "chunk", requestId: "7", values: [{ kind: "synchronized" }] },
    ]);
    expect(decodeRpcPayload(JSON.stringify({ _tag: "Pong" }))).toEqual([{ kind: "pong" }]);
    expect(
      decodeRpcPayload(JSON.stringify({ _tag: "Exit", requestId: "1", exit: { _tag: "Success" } })),
    ).toEqual([{ kind: "exit", requestId: "1" }]);
    expect(decodeRpcPayload("not-json")).toEqual([]);
  });

  it("builds a ticket websocket url", () => {
    expect(shellSocketURL("http://127.0.0.1:3773", "a+b/c")).toBe(
      "ws://127.0.0.1:3773/ws?wsTicket=a%2Bb%2Fc",
    );
    expect(shellSocketURL("https://example.test/ignored", "t")).toBe(
      "wss://example.test/ws?wsTicket=t",
    );
  });
});

describe("applyShellStreamItems", () => {
  it("replaces the shell from a snapshot and applies newer thread events", () => {
    const hydrated = applyShellStreamItems(null, [
      { kind: "snapshot", snapshot: { snapshotSequence: 2, threads: [thread("a")] } },
      { kind: "synchronized" },
      { kind: "thread-upserted", sequence: 2, thread: thread("a", true) },
      { kind: "thread-upserted", sequence: 3, thread: thread("b") },
    ]);
    expect(hydrated.threadsChanged).toBe(true);
    expect(hydrated.cursor).toEqual({
      snapshotSequence: 3,
      threads: [thread("a"), thread("b")],
    });
  });

  it("drops events until a snapshot and ignores stale sequences", () => {
    const early = applyShellStreamItems(null, [
      { kind: "thread-upserted", sequence: 1, thread: thread("a") },
    ]);
    expect(early.cursor).toBeNull();

    const cursor = { snapshotSequence: 4, threads: [thread("a", true)] };
    const stale = applyShellStreamItems(cursor, [
      { kind: "snapshot", snapshot: { snapshotSequence: 3, threads: [] } },
      { kind: "thread-removed", sequence: 4, threadId: "a" },
      { kind: "project-upserted", sequence: 5, project: { id: "p" } },
    ]);
    expect(stale.threadsChanged).toBe(false);
    expect(stale.cursor).toEqual({ snapshotSequence: 5, threads: [thread("a", true)] });
  });

  it("removes a thread and advances past project events", () => {
    const removed = applyShellStreamItems(
      { snapshotSequence: 1, threads: [thread("a"), thread("b")] },
      [{ kind: "thread-removed", sequence: 2, threadId: "a" }],
    );
    expect(removed.threadsChanged).toBe(true);
    expect(removed.cursor?.threads).toEqual([thread("b")]);
    expect(removed.cursor?.snapshotSequence).toBe(2);
  });
});
