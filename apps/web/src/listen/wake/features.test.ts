import { describe, expect, it } from "@effect/vitest";
import {
  chunkWakePcm,
  floatToInt16,
  keywordWindow,
  melWindows,
  resampleToWakeRate,
  transformMel,
  wakeFrameSamples,
  wakeSampleRate,
} from "./features.ts";

describe("transformMel", () => {
  it("maps openWakeWord ONNX output toward the Google embedding scale", () => {
    expect(transformMel(0)).toBe(2);
    expect(transformMel(10)).toBe(3);
    expect(transformMel(-10)).toBe(1);
  });
});

describe("melWindows", () => {
  it("slides a 76-frame window with a step of 8", () => {
    const frames = Array.from({ length: 92 }, (_, index) => [index]);
    const windows = melWindows(frames);
    expect(windows).toHaveLength(3);
    expect(windows[0]?.[0]).toEqual([0]);
    expect(windows[0]?.[75]).toEqual([75]);
    expect(windows[1]?.[0]).toEqual([8]);
    expect(windows[2]?.[0]).toEqual([16]);
    expect(windows[2]?.[75]).toEqual([91]);
  });

  it("returns no windows until 76 frames exist", () => {
    expect(melWindows(Array.from({ length: 75 }, () => [0]))).toEqual([]);
  });
});

describe("keywordWindow", () => {
  it("takes the last N embeddings for a keyword input of shape (1, N, 96)", () => {
    const embeddings = Array.from({ length: 20 }, (_, index) =>
      Array.from({ length: 96 }, () => index),
    );
    const window = keywordWindow(embeddings, 16);
    expect(window.length).toBe(1 * 16 * 96);
    expect(window[0]).toBe(4);
    expect(window[15 * 96]).toBe(19);
  });
});

describe("chunkWakePcm", () => {
  it("emits 80 ms frames and keeps a remainder", () => {
    const incoming = Array.from({ length: wakeFrameSamples + 100 }, (_, index) => index);
    const { frames, remainder } = chunkWakePcm([], incoming);
    expect(frames).toHaveLength(1);
    expect(frames[0]).toHaveLength(wakeFrameSamples);
    expect(frames[0]?.[0]).toBe(0);
    expect(remainder).toEqual(incoming.slice(wakeFrameSamples));
  });

  it("carries remainder into the next chunk", () => {
    const first = chunkWakePcm(
      [],
      Array.from({ length: wakeFrameSamples - 10 }, () => 1),
    );
    expect(first.frames).toEqual([]);
    const second = chunkWakePcm(
      first.remainder,
      Array.from({ length: 20 }, () => 2),
    );
    expect(second.frames).toHaveLength(1);
    expect(second.frames[0]).toHaveLength(wakeFrameSamples);
    expect(second.remainder).toHaveLength(10);
  });
});

describe("resampleToWakeRate", () => {
  it("downsamples 48 kHz PCM to 16 kHz by length", () => {
    const input = new Float32Array(4800);
    const output = resampleToWakeRate(input, 48_000);
    expect(output.length).toBe(1600);
  });

  it("returns the same buffer when already at 16 kHz", () => {
    const input = new Float32Array(wakeSampleRate);
    expect(resampleToWakeRate(input, wakeSampleRate)).toBe(input);
  });
});

describe("floatToInt16", () => {
  it("scales unit float PCM into 16-bit samples", () => {
    expect(floatToInt16(new Float32Array([0, 1, -1, 0.5]))).toEqual(
      new Int16Array([0, 32767, -32767, 16384]),
    );
  });
});
