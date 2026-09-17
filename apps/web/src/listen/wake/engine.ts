import { createWakeCapture, type WakeCapture } from "./capture.ts";

export const wakeThreshold = 0.5;
export const wakeCooldownMs = 2_000;

export type WakeListener = {
  readonly available: boolean;
  readonly start: () => Promise<void>;
  readonly destroy: () => void;
};

type WorkerOut =
  | { readonly type: "ready" }
  | { readonly type: "unavailable"; readonly reason: string }
  | { readonly type: "wake"; readonly score: number }
  | { readonly type: "error"; readonly message: string };

const modelUrl = (file: string): string => new URL(`/wake/${file}`, globalThis.location.href).href;

const unavailableListener = (): WakeListener => ({
  available: false,
  start: async () => {},
  destroy: () => {},
});

export const createWakeListener = async (
  stream: MediaStream,
  onWake: () => void,
): Promise<WakeListener> => {
  const keyword = modelUrl("hey_bernise.onnx");
  try {
    const probe = await fetch(keyword, { method: "HEAD" });
    if (probe.status === 404) {
      console.warn(
        "Bernise wake is idle until a keyword model is present. Drop hey_bernise.onnx into apps/web/public/wake.",
      );
      return unavailableListener();
    }
  } catch {
    // Worker fetch is the source of truth if HEAD is blocked.
  }

  const worker = new Worker(new URL("./engine.worker.ts", import.meta.url), { type: "module" });
  let capture: WakeCapture | undefined;
  let available = false;

  const send = (data: unknown, transfer?: Transferable[]): void => {
    // Worker.postMessage has no targetOrigin.
    // oxlint-disable-next-line unicorn/require-post-message-target-origin
    worker.postMessage(data, transfer ?? []);
  };

  const ready = new Promise<{ readonly available: boolean }>((resolve, reject) => {
    const onMessage = (event: MessageEvent<WorkerOut>) => {
      const message = event.data;
      if (message.type === "ready") {
        available = true;
        resolve({ available: true });
        return;
      }
      if (message.type === "unavailable") {
        console.warn("Bernise wake is idle until a keyword model is present.", message.reason);
        resolve({ available: false });
        return;
      }
      if (message.type === "error") {
        reject(new Error(message.message));
        return;
      }
      onWake();
    };
    worker.addEventListener("message", onMessage);
    worker.addEventListener(
      "error",
      (event) => {
        reject(new Error(event.message || "Wake worker failed to start."));
      },
      { once: true },
    );
    send({
      type: "warm",
      models: {
        mel: modelUrl("melspectrogram.onnx"),
        embed: modelUrl("embedding_model.onnx"),
        keyword,
      },
      threshold: wakeThreshold,
      cooldownMs: wakeCooldownMs,
    });
  });

  try {
    const warmed = await ready;
    available = warmed.available;
    if (available) {
      capture = await createWakeCapture(stream, (pcm) => {
        send({ type: "frame", pcm }, [pcm.buffer]);
      });
    } else {
      worker.terminate();
    }
  } catch (cause) {
    worker.terminate();
    throw cause;
  }

  return {
    available,
    start: async () => {
      await capture?.start();
    },
    destroy: () => {
      capture?.destroy();
      worker.terminate();
    },
  };
};
