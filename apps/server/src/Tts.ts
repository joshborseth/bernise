import { NodeHttpClient, NodeServices } from "@effect/platform-node";
import { Config, Effect, FileSystem, Layer, Option, Path, Redacted, Schema, Stream } from "effect";
import * as Context from "effect/Context";
import { homedir } from "node:os";
import { join } from "node:path";
import { HttpBody, HttpClient } from "effect/unstable/http";

export const ttsMaxChars = 20_000;
export const defaultTtsUrl = "http://borseth.ddns.net:7040";
export const defaultTtsVoice = "benny2";

const stateDirConfig = Config.string("BERNISE_STATE_DIR").pipe(
  Config.withDefault(join(homedir(), ".bernise")),
);
const urlConfig = Config.string("BERNISE_TTS_URL").pipe(Config.withDefault(defaultTtsUrl));
const voiceConfig = Config.string("BERNISE_TTS_VOICE").pipe(Config.withDefault(defaultTtsVoice));
const apiKeyEnvConfig = Config.redacted("BERNISE_TTS_API_KEY").pipe(Config.option);

export class TtsError extends Schema.TaggedError<TtsError>()("TtsError", {
  message: Schema.String,
  status: Schema.Finite,
}) {}

export type TtsSpeech = {
  readonly stream: Stream.Stream<Uint8Array, TtsError>;
};

export class Tts extends Context.Service<
  Tts,
  {
    readonly speak: (text: string) => Effect.Effect<TtsSpeech, TtsError>;
  }
>()("@bernise/Tts") {}

export const ttsSpeakUrl = (base: string): string => `${base.replace(/\/+$/, "")}/speak`;

export const ttsSpeakBody = (
  text: string,
  voice: string,
): { readonly text: string; readonly voice: string } => ({
  text,
  voice,
});

export const clipSpeakText = (text: string): string => {
  const trimmed = text.trim();
  if (trimmed.length <= ttsMaxChars) {
    return trimmed;
  }
  const window = trimmed.slice(0, ttsMaxChars);
  const breakAt = Math.max(
    window.lastIndexOf(". "),
    window.lastIndexOf("? "),
    window.lastIndexOf("! "),
    window.lastIndexOf("\n"),
    window.lastIndexOf(" "),
  );
  if (breakAt >= 200) {
    return window.slice(0, breakAt + 1).trim();
  }
  return window;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const extractErrorMessage = (error: unknown): string => {
  if (isRecord(error) && typeof error.message === "string" && error.message.length > 0) {
    return error.message;
  }
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }
  return String(error);
};

const toTtsError = (error: unknown): TtsError =>
  error instanceof TtsError
    ? error
    : new TtsError({
        message: extractErrorMessage(error),
        status: 502,
      });

const makeSpeak = (options: {
  readonly http: {
    readonly post: HttpClient.HttpClient["post"];
  };
  readonly apiKey: Option.Option<Redacted.Redacted<string>>;
  readonly baseUrl: string;
  readonly voice: string;
}) =>
  Effect.fn("ttsSpeak")(function* (text: string) {
    const clipped = clipSpeakText(text);
    if (clipped.length === 0) {
      return yield* new TtsError({ message: "Nothing to speak.", status: 400 });
    }
    if (Option.isNone(options.apiKey)) {
      return yield* new TtsError({
        message: "TTS is not configured. Set BERNISE_TTS_API_KEY or ~/.bernise/tts.key.",
        status: 503,
      });
    }

    const secret = Redacted.value(options.apiKey.value);
    const response = yield* options.http
      .post(ttsSpeakUrl(options.baseUrl), {
        accept: "audio/wav",
        headers: { "X-API-Key": secret },
        body: HttpBody.jsonUnsafe(ttsSpeakBody(clipped, options.voice)),
      })
      .pipe(Effect.timeout("60 seconds"), Effect.mapError(toTtsError));

    if (response.status < 200 || response.status >= 300) {
      const detail = yield* response.text.pipe(Effect.orElseSucceed(() => ""));
      const trimmed = detail.trim();
      return yield* new TtsError({
        message: trimmed.length > 0 ? trimmed : `TTS HTTP ${String(response.status)}`,
        status: response.status >= 400 && response.status < 600 ? response.status : 502,
      });
    }

    return {
      stream: Stream.mapError(response.stream, toTtsError),
    };
  });

export const TtsLive = Layer.effect(
  Tts,
  Effect.gen(function* () {
    const http = yield* HttpClient.HttpClient;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const stateDir = yield* stateDirConfig;
    const fromEnv = yield* apiKeyEnvConfig;
    const fromFile = yield* fs.readFileString(path.join(stateDir, "tts.key")).pipe(
      Effect.map((raw) => {
        const trimmed = raw.trim();
        return trimmed.length > 0 ? Option.some(Redacted.make(trimmed)) : Option.none();
      }),
      Effect.orElseSucceed(() => Option.none()),
    );

    return Tts.of({
      speak: makeSpeak({
        http,
        apiKey: Option.orElse(fromEnv, () => fromFile),
        baseUrl: yield* urlConfig,
        voice: yield* voiceConfig,
      }),
    });
  }),
).pipe(Layer.provide(NodeHttpClient.layerFetch), Layer.provide(NodeServices.layer));

export const ttsStub = (
  speak: (text: string) => Effect.Effect<TtsSpeech, TtsError>,
): Layer.Layer<Tts> =>
  Layer.succeed(
    Tts,
    Tts.of({
      speak,
    }),
  );
