import { describe, expect, it } from "@effect/vitest";
import { encodePcmWav, pcmS16leToF32, trimLeadingSilence, tryParseWavHeader } from "./wav.ts";

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

  it("trims a short leading silence and caps the window", () => {
    const sampleRate = 24000;
    const silent = Math.round(0.2 * sampleRate);
    const pcm = new Float32Array(silent + 8);
    pcm.fill(0.5, silent);
    const trimmed = trimLeadingSilence(pcm, sampleRate);
    expect(trimmed.length).toBe(8);
    expect(trimmed[0]).toBeCloseTo(0.5);

    const longSilent = Math.round(0.5 * sampleRate);
    const capped = new Float32Array(longSilent + 4);
    capped.fill(0.4, longSilent);
    const limited = trimLeadingSilence(capped, sampleRate);
    expect(limited.length).toBe(capped.length - Math.floor(0.35 * sampleRate));
  });
});
