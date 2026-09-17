import { describe, expect, it } from "@effect/vitest";
import { createWakeStream } from "./stream.ts";
import { embeddingDim, melWindowFrames, wakeFrameSamples } from "./features.ts";

const zeros = (count: number, value = 0): number[] => Array.from({ length: count }, () => value);

describe("createWakeStream", () => {
  it("computes an embedding from the last 76 mel frames after one 80 ms chunk", async () => {
    const seen: number[] = [];
    const stream = createWakeStream({
      melspectrogram: () => Array.from({ length: 8 }, (_, index) => [100 + index]),
      embedding: (window) => {
        seen.push(window.length);
        const first = window[0]?.[0] ?? -1;
        const last = window[window.length - 1]?.[0] ?? -1;
        return [first, last, ...zeros(embeddingDim - 2)];
      },
    });
    const processed = await stream.push(new Int16Array(wakeFrameSamples));
    expect(processed).toBe(wakeFrameSamples);
    expect(seen).toEqual([melWindowFrames]);
    const features = stream.features(1);
    expect(features[0]).toBe(1);
    expect(features[1]).toBe(107);
  });

  it("returns zeros until embeddings exist", () => {
    const stream = createWakeStream({
      melspectrogram: () => [],
      embedding: () => zeros(embeddingDim),
    });
    expect(stream.embeddingCount()).toBe(0);
    expect(stream.features(16)[0]).toBe(0);
  });
});
