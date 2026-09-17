import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { schedulePlinks } from "./reactionSounds.ts";

const harness = vi.hoisted(() => {
  type Osc = {
    type: string;
    frequency: {
      setValueAtTime: (value: number, when: number) => void;
      exponentialRampToValueAtTime: (value: number, when: number) => void;
    };
    connect: () => void;
    disconnect: () => void;
    start: (when?: number) => void;
    stop: (when?: number) => void;
  };

  const starts: Array<number> = [];
  const disconnects: Array<string> = [];
  let buffers = 0;

  const param = () => ({
    setValueAtTime: () => undefined,
    exponentialRampToValueAtTime: () => undefined,
  });

  const fakeCtx = {
    currentTime: 10,
    sampleRate: 48_000,
    destination: {},
    resume: async () => undefined,
    createGain: () => ({
      gain: param(),
      connect: () => undefined,
      disconnect: () => {
        disconnects.push("gain");
      },
    }),
    createOscillator: (): Osc => ({
      type: "sine",
      frequency: param(),
      connect: () => undefined,
      disconnect: () => {
        disconnects.push("osc");
      },
      start: (when = 0) => {
        starts.push(when);
      },
      stop: () => undefined,
    }),
    createBuffer: (_channels: number, length: number) => {
      buffers += 1;
      return {
        getChannelData: () => new Float32Array(length),
      };
    },
    createBufferSource: () => ({
      buffer: undefined as unknown,
      connect: () => undefined,
      disconnect: () => {
        disconnects.push("grit");
      },
      start: () => undefined,
      stop: () => undefined,
    }),
    createBiquadFilter: () => ({
      type: "highpass",
      frequency: { value: 0 },
      connect: () => undefined,
      disconnect: () => {
        disconnects.push("filter");
      },
    }),
  };

  return { starts, disconnects, fakeCtx, bufferCount: () => buffers };
});

vi.mock("./context.ts", () => ({
  audioContext: () => harness.fakeCtx,
}));

afterEach(() => {
  harness.starts.length = 0;
  harness.disconnects.length = 0;
});

describe("schedulePlinks", () => {
  it("starts each tap at origin plus its delay", () => {
    const cancel = schedulePlinks([
      { delay: 1, index: 0, count: 2, radius: 0.06 },
      { delay: 2.5, index: 1, count: 2, radius: 0.07 },
    ]);
    expect(harness.starts).toEqual([11, 12.5]);
    cancel();
  });

  it("silences armed taps without starting new ones", () => {
    const cancel = schedulePlinks([{ delay: 4, index: 0, count: 1, radius: 0.06 }]);
    expect(harness.starts).toEqual([14]);
    cancel();
    expect(harness.disconnects.length).toBeGreaterThan(0);
    cancel();
    expect(harness.starts).toEqual([14]);
  });

  it("reuses one grit buffer across the sequence", () => {
    const before = harness.bufferCount();
    const cancel = schedulePlinks([
      { delay: 0.2, index: 0, count: 3, radius: 0.06 },
      { delay: 0.4, index: 1, count: 3, radius: 0.06 },
      { delay: 0.6, index: 2, count: 3, radius: 0.06 },
    ]);
    expect(harness.starts).toHaveLength(3);
    expect(harness.bufferCount() - before).toBeLessThanOrEqual(1);
    cancel();
  });
});
