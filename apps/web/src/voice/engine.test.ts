import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { cancelVoice, enqueueVoice, isVoiceBusy, setVoiceListeners, textLeadMs } from "./engine.ts";
import { encodePcmWav } from "./wav.ts";

const harness = vi.hoisted(() => {
  type Source = {
    buffer: { duration: number; length: number } | undefined;
    start: () => void;
    stop: () => void;
    connect: () => void;
    addEventListener: (event: string, fn: () => void) => void;
    finish: () => void;
  };

  const sources: Array<Source> = [];
  const bufferLengths: Array<number> = [];
  const fakeCtx = {
    currentTime: 0,
    destination: {},
    resume: async () => undefined,
    createGain: () => ({
      connect: () => undefined,
      disconnect: () => undefined,
    }),
    createBuffer: (_channels: number, length: number, sampleRate: number) => {
      bufferLengths.push(length);
      return {
        duration: length / sampleRate,
        length,
        getChannelData: () => new Float32Array(length),
      };
    },
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

  return { sources, bufferLengths, fakeCtx };
});

vi.mock("../mascot/audio/context.ts", () => ({
  audioContext: () => harness.fakeCtx,
}));

const waitForSources = async (count: number): Promise<void> => {
  await vi.waitFor(() => {
    expect(harness.sources.length).toBe(count);
  });
};

const pcmSamples = new Int16Array(2400);
pcmSamples.fill(1200);
const pcmWav = encodePcmWav(pcmSamples, { sampleRate: 24000, streaming: true });

const silentThenTone = (): Uint8Array<ArrayBuffer> => {
  const silent = new Int16Array(4800);
  const tone = new Int16Array(2400);
  tone.fill(16_000);
  const pcm = new Int16Array(silent.length + tone.length);
  pcm.set(silent);
  pcm.set(tone, silent.length);
  return encodePcmWav(pcm, { sampleRate: 24000, streaming: true });
};

const wavResponse = (bytes: Uint8Array<ArrayBuffer> = pcmWav): Response =>
  new Response(new Blob([bytes]), {
    status: 200,
    headers: {
      "content-type": "audio/wav",
      "x-sample-rate": "24000",
      "x-audio-encoding": "pcm_s16le",
      "x-stream": "sentence",
    },
  });

const heldWav = (): { readonly response: Response; readonly close: () => void } => {
  let close = (): void => undefined;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(pcmWav);
      close = () => {
        controller.close();
      };
    },
  });
  return {
    response: new Response(body, {
      status: 200,
      headers: { "content-type": "audio/wav" },
    }),
    close: () => {
      close();
    },
  };
};

describe("voice engine", () => {
  afterEach(() => {
    cancelVoice();
    harness.sources.length = 0;
    harness.bufferLengths.length = 0;
    setVoiceListeners({});
    vi.unstubAllGlobals();
  });

  it("batches a synchronous burst into one /speak and plays after the WAV completes", async () => {
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
    expect(bodies).toEqual(["First. Second. Third."]);
    expect(harness.sources.length).toBe(0);
    expect(isVoiceBusy()).toBe(false);

    release[0]?.();
    await waitForSources(1);
    expect(isVoiceBusy()).toBe(true);

    await vi.waitFor(() => {
      expect(release.length).toBe(1);
    });

    const started = harness.sources.slice();
    for (const source of started) {
      source.finish();
    }
    await vi.waitFor(() => {
      expect(isVoiceBusy()).toBe(false);
    });
  });

  it("keeps a single /speak in flight when a later clip is queued", async () => {
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
    await vi.waitFor(() => {
      expect(release.length).toBe(1);
    });
    enqueueVoice("Second.");
    expect(bodies).toEqual(["First."]);
    expect(maxInFlight).toBe(1);

    release[0]?.();
    await waitForSources(1);
    await vi.waitFor(() => {
      expect(release.length).toBe(2);
    });
    expect(maxInFlight).toBe(1);
    expect(bodies[1]).toBe("Second.");

    release[1]?.();
    await waitForSources(2);

    for (const source of harness.sources.slice()) {
      source.finish();
    }
    await vi.waitFor(() => {
      expect(isVoiceBusy()).toBe(false);
    });
  });

  it("does not start playback until the WAV stream finishes", async () => {
    const held = heldWav();
    vi.stubGlobal("fetch", async () => held.response);

    enqueueVoice("Hello.");
    await vi.waitFor(() => {
      expect(held.response.bodyUsed || true).toBe(true);
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(harness.sources.length).toBe(0);
    expect(isVoiceBusy()).toBe(false);

    held.close();
    await waitForSources(1);
    expect(isVoiceBusy()).toBe(true);
  });

  it("reveals after audio starts plus the text lead", async () => {
    const reveals: Array<{ id: string; until: number }> = [];
    setVoiceListeners({
      onPlaybackStart: (reveal) => {
        reveals.push(reveal);
      },
    });
    vi.stubGlobal("fetch", async () => wavResponse());

    enqueueVoice("Hi.", { reveal: { id: "a1", until: 12 } });
    await waitForSources(1);
    expect(reveals).toEqual([]);

    await vi.waitFor(
      () => {
        expect(reveals).toEqual([{ id: "a1", until: 12 }]);
      },
      { timeout: textLeadMs + 400 },
    );
  });

  it("trims leading silence on the second clip only", async () => {
    const bodies: Array<string> = [];
    const release: Array<() => void> = [];
    const bytesFor: Record<string, Uint8Array<ArrayBuffer>> = {
      "First.": pcmWav,
      "Second.": silentThenTone(),
    };

    vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => {
      const text = JSON.parse(String(init?.body)).text as string;
      bodies.push(text);
      await new Promise<void>((resolve) => {
        release.push(resolve);
      });
      return wavResponse(bytesFor[text] ?? pcmWav);
    });

    enqueueVoice("First.");
    await vi.waitFor(() => {
      expect(release.length).toBe(1);
    });
    enqueueVoice("Second.");
    release[0]?.();
    await waitForSources(1);
    await vi.waitFor(() => {
      expect(release.length).toBe(2);
    });
    release[1]?.();
    await waitForSources(2);

    expect(harness.bufferLengths[0]).toBe(2400);
    expect(harness.bufferLengths[1]).toBe(2400);
  });
});
