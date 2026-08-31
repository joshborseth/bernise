import { describe, expect, it } from "@effect/vitest";
import { encodePcmWav, pcmS16leToF32, tryParseWavHeader } from "./wav.ts";

describe("streaming wav", () => {
  it("parses a 24kHz streamed PCM header whose chunk sizes are unknown", () => {
    const pcm = Int16Array.from([0, 16384, -16384]);
    const bytes = encodePcmWav(pcm, { sampleRate: 24000, streaming: true });
    const format = tryParseWavHeader(bytes);
    expect(format).toEqual({
      sampleRate: 24000,
      channels: 1,
      bitsPerSample: 16,
      dataOffset: 44,
    });
    expect(pcmS16leToF32(bytes.subarray(44)).length).toBe(3);
  });

  it("parses a header before any PCM arrives", () => {
    const bytes = encodePcmWav(new Int16Array(0), { streaming: true });
    expect(tryParseWavHeader(bytes.subarray(0, 44))?.dataOffset).toBe(44);
  });
});
