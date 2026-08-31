import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { followAssistantSpeech, resetVoiceFollow, speakVoiceCue } from "./follow.ts";

const engine = vi.hoisted(() => {
  const calls: Array<string> = [];
  return {
    calls,
    cancelVoice: () => {
      calls.push("cancel");
    },
    enqueueVoice: (text: string, options?: { readonly reveal?: { id: string; until: number } }) => {
      const reveal = options?.reveal;
      calls.push(
        reveal === undefined
          ? `enqueue:${text}`
          : `enqueue:${text}:${reveal.id}:${String(reveal.until)}`,
      );
    },
    revealVoiceNow: (reveal: { readonly id: string; readonly until: number }) => {
      calls.push(`reveal:${reveal.id}:${String(reveal.until)}`);
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

  it("does not enqueue while the turn is still pending", () => {
    followAssistantSpeech({ assistantId: "a1", text: "Hello there.", pending: true });
    expect(engine.calls.filter((call) => call !== "cancel")).toEqual([]);
    followAssistantSpeech({ assistantId: "a1", text: "Hello there. More now.", pending: true });
    expect(engine.calls.filter((call) => call !== "cancel")).toEqual([]);
  });

  it("speaks the finished turn as one utterance", () => {
    const text = "Hello there. More now.";
    followAssistantSpeech({ assistantId: "a1", text: "Hello there.", pending: true });
    followAssistantSpeech({ assistantId: "a1", text, pending: false });
    expect(engine.calls.filter((call) => call !== "cancel")).toEqual([
      `enqueue:${text}:a1:${String(text.length)}`,
    ]);
  });

  it("reveals immediately when there is nothing speakable", () => {
    const text = "```\n```\n";
    followAssistantSpeech({ assistantId: "a1", text, pending: false });
    expect(engine.calls.filter((call) => call !== "cancel")).toEqual([
      `reveal:a1:${String(text.length)}`,
    ]);
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

  it("speaks an offline cue as one utterance", () => {
    speakVoiceCue({ id: "cue-1", text: "Oh No! Try again later." });
    expect(engine.calls.filter((call) => call.startsWith("enqueue:"))).toEqual([
      "enqueue:Oh No! Try again later.",
    ]);
  });
});
