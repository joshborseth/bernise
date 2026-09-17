import { env, pipeline, type AutomaticSpeechRecognitionPipeline } from "@huggingface/transformers";

env.allowLocalModels = false;
env.useBrowserCache = true;

type WarmMessage = { readonly type: "warm" };
type TranscribeMessage = {
  readonly type: "transcribe";
  readonly id: number;
  readonly audio: Float32Array;
};
type WorkerIn = WarmMessage | TranscribeMessage;

let transcriber: Promise<AutomaticSpeechRecognitionPipeline> | undefined;

const loadTranscriber = (): Promise<AutomaticSpeechRecognitionPipeline> => {
  transcriber ??= (
    pipeline as (
      task: "automatic-speech-recognition",
      model: string,
      options: { readonly dtype: "q8"; readonly device: "wasm" },
    ) => Promise<AutomaticSpeechRecognitionPipeline>
  )("automatic-speech-recognition", "Xenova/whisper-tiny.en", {
    dtype: "q8",
    device: "wasm",
  });
  return transcriber;
};

const transcriptText = (result: unknown): string => {
  if (Array.isArray(result)) {
    return result
      .map((item) => (isRecord(item) && typeof item.text === "string" ? item.text : ""))
      .join(" ")
      .trim();
  }
  if (isRecord(result) && typeof result.text === "string") {
    return result.text.trim();
  }
  return "";
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const post = (data: unknown): void => {
  // Worker.postMessage has no targetOrigin; oxlint's Window signature does not apply.
  // oxlint-disable-next-line unicorn/require-post-message-target-origin
  (self as unknown as { readonly postMessage: (value: unknown) => void }).postMessage(data);
};

addEventListener("message", (event: MessageEvent<WorkerIn>) => {
  void (async () => {
    const message = event.data;
    try {
      const asr = await loadTranscriber();
      if (message.type === "warm") {
        post({ type: "ready" });
        return;
      }
      const result = await asr(message.audio);
      post({ type: "result", id: message.id, text: transcriptText(result) });
    } catch (cause) {
      post({
        type: "error",
        id: message.type === "transcribe" ? message.id : undefined,
        message: cause instanceof Error ? cause.message : String(cause),
      });
    }
  })();
});
