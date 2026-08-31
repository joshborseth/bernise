import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { followAssistantSpeech, resetVoiceFollow, speakVoiceCue } from "./follow.ts";

const engine = vi.hoisted(() => {
  const calls: Array<string> = [];
  return {
    calls,
    cancelVoice: () => {
      calls.push("cancel");
    },
    enqueueVoice: (text: string) => {
      calls.push(`enqueue:${text}`);
    },
    isVoiceBusy: () => false,
  };
});

vi.mock("./engine.ts", () => engine);

describe("followAssistantSpeech", () => {
  beforeEach(() => {
    engine.calls.length = 0;
    resetVoiceFollow();
  });

  it("does not speak until a live assistant id exists", () => {
    followAssistantSpeech({ assistantId: undefined, text: "hello from history", pending: false });
    expect(engine.calls).toEqual([]);
  });

  it("does not cancel an offline cue when the failed turn later settles", () => {
    speakVoiceCue({ id: "cue-1", text: "Oh No! Try again later." });
    expect(engine.calls.some((call) => call.startsWith("enqueue:"))).toBe(true);

    engine.calls.length = 0;
    followAssistantSpeech({ assistantId: undefined, text: undefined, pending: false });
    expect(engine.calls).toEqual([]);
  });

  it("does not cancel an offline cue while the failed turn is still pending", () => {
    speakVoiceCue({ id: "cue-1", text: "Oh No!" });
    engine.calls.length = 0;
    followAssistantSpeech({ assistantId: undefined, text: undefined, pending: true });
    expect(engine.calls).toEqual([]);
  });

  it("cancels an offline cue when a new turn starts", () => {
    speakVoiceCue({ id: "cue-1", text: "Oh No!" });
    followAssistantSpeech({ assistantId: undefined, text: undefined, pending: false });
    engine.calls.length = 0;
    followAssistantSpeech({ assistantId: undefined, text: undefined, pending: true });
    expect(engine.calls[0]).toBe("cancel");
  });
});
