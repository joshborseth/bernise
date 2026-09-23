/**
 * Effect RPC JSON frames for t3code `orchestration.subscribeShell`, and the
 * shell fold from the desktop client (`applyShellStreamEvent`).
 * `apps/macos/Sources/Bernise/T3Rpc.swift` encodes the same frames.
 */

export type ShellCursor = {
  readonly snapshotSequence: number;
  readonly threads: ReadonlyArray<unknown>;
};

export type ShellApplyResult = {
  readonly cursor: ShellCursor | null;
  readonly threadsChanged: boolean;
};

export type RpcInbound =
  | {
      readonly kind: "chunk";
      readonly requestId: string;
      readonly values: ReadonlyArray<unknown>;
    }
  | { readonly kind: "exit"; readonly requestId: string }
  | { readonly kind: "pong" }
  | { readonly kind: "ping" }
  | { readonly kind: "defect" }
  | { readonly kind: "ignore" };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const threadId = (value: unknown): string | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const id = value.id ?? value.threadId;
  return typeof id === "string" && id.length > 0 ? id : undefined;
};

const sequenceOf = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;

const requestIdOf = (value: unknown): string | undefined => {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
};

const unchanged = (cursor: ShellCursor | null): ShellApplyResult => ({
  cursor,
  threadsChanged: false,
});

const applyItem = (cursor: ShellCursor | null, item: unknown): ShellApplyResult => {
  if (!isRecord(item) || typeof item.kind !== "string") {
    return unchanged(cursor);
  }
  if (item.kind === "synchronized") {
    return unchanged(cursor);
  }
  if (item.kind === "snapshot") {
    if (!isRecord(item.snapshot) || !Array.isArray(item.snapshot.threads)) {
      return unchanged(cursor);
    }
    const snapshotSequence = sequenceOf(item.snapshot.snapshotSequence);
    if (snapshotSequence === undefined) {
      return unchanged(cursor);
    }
    if (cursor !== null && snapshotSequence < cursor.snapshotSequence) {
      return unchanged(cursor);
    }
    return {
      cursor: { snapshotSequence, threads: item.snapshot.threads },
      threadsChanged: true,
    };
  }

  const sequence = sequenceOf(item.sequence);
  if (cursor === null || sequence === undefined || sequence <= cursor.snapshotSequence) {
    return unchanged(cursor);
  }

  switch (item.kind) {
    case "thread-upserted": {
      const id = threadId(item.thread);
      if (id === undefined) {
        return unchanged(cursor);
      }
      const threads = cursor.threads.slice();
      const index = threads.findIndex((entry) => threadId(entry) === id);
      if (index === -1) {
        threads.push(item.thread);
      } else {
        threads[index] = item.thread;
      }
      return { cursor: { snapshotSequence: sequence, threads }, threadsChanged: true };
    }
    case "thread-removed": {
      if (typeof item.threadId !== "string" || item.threadId.length === 0) {
        return unchanged(cursor);
      }
      return {
        cursor: {
          snapshotSequence: sequence,
          threads: cursor.threads.filter((entry) => threadId(entry) !== item.threadId),
        },
        threadsChanged: true,
      };
    }
    case "project-upserted":
    case "project-removed":
      return {
        cursor: { snapshotSequence: sequence, threads: cursor.threads },
        threadsChanged: false,
      };
    default:
      return unchanged(cursor);
  }
};

export const applyShellStreamItems = (
  cursor: ShellCursor | null,
  items: ReadonlyArray<unknown>,
): ShellApplyResult => {
  let current = cursor;
  let threadsChanged = false;
  for (const item of items) {
    const applied = applyItem(current, item);
    current = applied.cursor;
    threadsChanged = threadsChanged || applied.threadsChanged;
  }
  return { cursor: current, threadsChanged };
};

const rpcFrame = (body: Record<string, unknown>): string => JSON.stringify(body);

export const subscribeShellFrame = (requestId: string, afterSequence?: number): string =>
  rpcFrame({
    _tag: "Request",
    id: requestId,
    tag: "orchestration.subscribeShell",
    payload: afterSequence === undefined ? {} : { afterSequence },
    headers: [],
  });

export const ackFrame = (requestId: string): string =>
  rpcFrame({
    _tag: "Ack",
    requestId,
  });

export const pingFrame = (): string => rpcFrame({ _tag: "Ping" });

export const pongFrame = (): string => rpcFrame({ _tag: "Pong" });

const decodeFrame = (value: unknown): RpcInbound => {
  if (!isRecord(value) || typeof value._tag !== "string") {
    return { kind: "ignore" };
  }
  switch (value._tag) {
    case "Chunk": {
      const requestId = requestIdOf(value.requestId);
      if (requestId === undefined || !Array.isArray(value.values)) {
        return { kind: "ignore" };
      }
      return { kind: "chunk", requestId, values: value.values };
    }
    case "Exit": {
      const requestId = requestIdOf(value.requestId);
      if (requestId === undefined) {
        return { kind: "ignore" };
      }
      return { kind: "exit", requestId };
    }
    case "Pong":
      return { kind: "pong" };
    case "Ping":
      return { kind: "ping" };
    case "Defect":
    case "ClientProtocolError":
      return { kind: "defect" };
    default:
      return { kind: "ignore" };
  }
};

export const decodeRpcPayload = (payload: string): ReadonlyArray<RpcInbound> => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload) as unknown;
  } catch {
    return [];
  }
  const frames = Array.isArray(parsed) ? parsed : [parsed];
  return frames.map((frame) => decodeFrame(frame));
};

export const shellSocketURL = (origin: string, ticket: string): string => {
  const match = /^(https?):\/\/([^/?#]+)/i.exec(origin);
  const secure = match?.[1]?.toLowerCase() === "https";
  const host = match?.[2] ?? "127.0.0.1:3773";
  return `${secure ? "wss" : "ws"}://${host}/ws?wsTicket=${encodeURIComponent(ticket)}`;
};
