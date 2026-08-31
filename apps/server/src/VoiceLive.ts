import { Effect, Schema } from "effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";
import { Tts, TtsError, ttsMaxChars } from "./Tts.ts";

export class VoiceSpeakRequest extends Schema.Class<VoiceSpeakRequest>("VoiceSpeakRequest")({
  text: Schema.String,
}) {}

const jsonError = (status: number, message: string) =>
  HttpServerResponse.jsonUnsafe({ error: message }, { status });

export const VoiceLive = HttpRouter.add(
  "POST",
  "/voice/speak",
  Effect.gen(function* () {
    const tts = yield* Tts;
    const payload = yield* HttpServerRequest.schemaBodyJson(VoiceSpeakRequest).pipe(
      Effect.mapError(() => new TtsError({ message: "Send JSON { text } to speak.", status: 400 })),
    );
    const text = payload.text.trim();
    if (text.length === 0) {
      return jsonError(400, "Nothing to speak.");
    }
    if (text.length > ttsMaxChars) {
      return jsonError(400, `Text exceeds ${String(ttsMaxChars)} characters.`);
    }
    const speech = yield* tts.speak(text);
    return HttpServerResponse.stream(speech.stream, { contentType: "audio/wav" });
  }).pipe(
    Effect.catchTag("TtsError", (error) => Effect.succeed(jsonError(error.status, error.message))),
  ),
);
