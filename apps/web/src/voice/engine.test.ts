import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { cancelVoice, enqueueVoice, isVoiceBusy } from "./engine.ts";
import { encodePcmWav } from "./wav.ts";

const harness = vi.hoisted(() => {
  type Source = {
    buffer: { duration: number } | undefined;
    start: () => void;
    stop: () => void;
    connect: () => void;
    addEventListener: (event: string, fn: () => void) => void;
    finish: () => void;
  };

  const sources: Array<Source> = [];
  const fakeCtx = {
    currentTime: 0,
    destination: {},
    resume: async () => undefined,
    createGain: () => ({
      connect: () => undefined,
      disconnect: () => undefined,
    }),
    createBuffer: (_channels: number, length: number, sampleRate: number) => ({
      duration: length / sampleRate,
      getChannelData: () => new Float32Array(length),
    }),
    createBufferSource: (): Source => {
      let ended: (() => void) | undefined;
      const source: Source = {
        buffer: undefined,
        connect: () => undefined,
        start: () => {
          sources.push(source);
        },
        stop: () => {
          ended?.();
        },
        addEventListener: (event, fn) => {
          if (event === "ended") {
            ended = fn;
          }
        },
        finish: () => {
          ended?.();
        },
      };
      return source;
    },
  };

  return { sources, fakeCtx };
});

vi.mock("../mascot/audio/context.ts", () => ({
  audioContext: () => harness.fakeCtx,
}));

const waitForSources = async (count: number): Promise<void> => {
  await vi.waitFor(() => {
    expect(harness.sources.length).toBe(count);
  });
};

const pcmWav = encodePcmWav(new Int16Array(2400), { sampleRate: 24000, streaming: true });

const wavResponse = (): Response =>
  new Response(new Blob([pcmWav]), {
    status: 200,
    headers: {
      "content-type": "audio/wav",
      "x-sample-rate": "24000",
      "x-audio-encoding": "pcm_s16le",
      "x-stream": "sentence",
    },
  });

describe("voice engine", () => {
  afterEach(() => {
    cancelVoice();
    harness.sources.length = 0;
    vi.unstubAllGlobals();
  });

  it("keeps a single /speak in flight and plays streamed PCM", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const bodies: Array<string> = [];
    const release: Array<() => void> = [];

    vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      bodies.push(JSON.parse(String(init?.body)).text as string);
      await new Promise<void>((resolve) => {
        release.push(() => {
          inFlight -= 1;
          resolve();
        });
      });
      return wavResponse();
    });

    enqueueVoice("First.");
    enqueueVoice("Second.");
    enqueueVoice("Third.");

    await vi.waitFor(() => {
      expect(release.length).toBe(1);
    });
    expect(maxInFlight).toBe(1);
    expect(bodies).toEqual(["First."]);

    release[0]?.();
    await waitForSources(1);
    expect(isVoiceBusy()).toBe(true);

    await vi.waitFor(() => {
      expect(release.length).toBe(2);
    });
    expect(maxInFlight).toBe(1);
    expect(bodies[1]).toBe("Second. Third.");

    release[1]?.();
    await vi.waitFor(() => {
      expect(harness.sources.length).toBeGreaterThanOrEqual(2);
    });

    const started = harness.sources.slice();
    for (const source of started) {
      source.finish();
    }
    await vi.waitFor(() => {
      expect(isVoiceBusy()).toBe(false);
    });
  });
});
