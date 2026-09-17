type WarmOut = { readonly type: "ready" };
type ResultOut = { readonly type: "result"; readonly id: number; readonly text: string };
type ErrorOut = {
  readonly type: "error";
  readonly id: number | undefined;
  readonly message: string;
};
type WorkerOut = WarmOut | ResultOut | ErrorOut;

let worker: Worker | undefined;
let nextId = 1;
let warm: Promise<void> | undefined;
const pending = new Map<
  number,
  (result: { ok: true; text: string } | { ok: false; error: Error }) => void
>();

const getWorker = (): Worker => {
  if (worker !== undefined) {
    return worker;
  }
  const next = new Worker(new URL("./transcribe.worker.ts", import.meta.url), { type: "module" });
  next.addEventListener("message", (event: MessageEvent<WorkerOut>) => {
    const message = event.data;
    if (message.type === "ready") {
      return;
    }
    if (message.type === "result") {
      pending.get(message.id)?.({ ok: true, text: message.text });
      pending.delete(message.id);
      return;
    }
    const error = new Error(message.message);
    if (message.id === undefined) {
      for (const [id, settle] of pending) {
        settle({ ok: false, error });
        pending.delete(id);
      }
      return;
    }
    pending.get(message.id)?.({ ok: false, error });
    pending.delete(message.id);
  });
  next.addEventListener("error", (event) => {
    const error = new Error(event.message || "Listen transcriber failed.");
    for (const [id, settle] of pending) {
      settle({ ok: false, error });
      pending.delete(id);
    }
  });
  worker = next;
  return next;
};

export const warmTranscriber = (): Promise<void> => {
  warm ??= new Promise<void>((resolve, reject) => {
    const instance = getWorker();
    const onReady = (event: MessageEvent<WorkerOut>) => {
      if (event.data.type !== "ready") {
        return;
      }
      instance.removeEventListener("message", onReady);
      resolve();
    };
    instance.addEventListener("message", onReady);
    instance.addEventListener(
      "error",
      () => {
        warm = undefined;
        reject(new Error("Listen transcriber failed to start."));
      },
      { once: true },
    );
    // Worker.postMessage has no targetOrigin.
    // oxlint-disable-next-line unicorn/require-post-message-target-origin
    instance.postMessage({ type: "warm" });
  });
  return warm;
};

export const transcribeUtterance = async (audio: Float32Array): Promise<string> => {
  await warmTranscriber();
  const id = nextId;
  nextId += 1;
  const instance = getWorker();
  return new Promise<string>((resolve, reject) => {
    pending.set(id, (result) => {
      if (result.ok) {
        resolve(result.text);
        return;
      }
      reject(result.error);
    });
    // Transferable list, not a Window targetOrigin.
    // oxlint-disable-next-line unicorn/require-post-message-target-origin
    instance.postMessage({ type: "transcribe", id, audio }, [audio.buffer]);
  });
};
