import { describe, expect, it } from "@effect/vitest";
import {
  emptySpeakable,
  flushSpeakable,
  patchAside,
  pushSpeakable,
  splitForTts,
  ttsChunkLimit,
  type SpeakableState,
} from "./speakable.ts";

const skip = { skipCode: true };
const keep = { skipCode: false };

const pushAll = (
  chunks: ReadonlyArray<string>,
  options = skip,
  start: SpeakableState = emptySpeakable,
) => {
  let state = start;
  const sentences: Array<string> = [];
  for (const chunk of chunks) {
    const next = pushSpeakable(state, chunk, options);
    state = next.state;
    sentences.push(...next.sentences);
  }
  const flushed = flushSpeakable(state, options);
  sentences.push(...flushed.sentences);
  return { state: flushed.state, sentences };
};

describe("speakable text", () => {
  it("holds an incomplete sentence until a stop or flush", () => {
    const first = pushSpeakable(emptySpeakable, "Hello there", skip);
    expect(first.sentences).toEqual([]);
    const second = pushSpeakable(first.state, ", friend.", skip);
    expect(second.sentences).toEqual(["Hello there, friend."]);
  });

  it("emits each finished sentence while more text is still arriving", () => {
    const first = pushSpeakable(emptySpeakable, "One. Two", skip);
    expect(first.sentences).toEqual(["One."]);
    const rest = flushSpeakable(first.state, skip);
    expect(rest.sentences).toEqual(["Two"]);
  });

  it("skips fenced code and murmurs once", () => {
    const { sentences } = pushAll(["Here is the patch.\n```ts\nconst x = 1;\n```\nThat is all."]);
    expect(sentences).toContain(patchAside);
    expect(sentences.join(" ")).not.toMatch(/const x/);
    expect(sentences.join(" ")).toMatch(/Here is the patch/i);
    expect(sentences.join(" ")).toMatch(/That is all/i);
  });

  it("does not speak fenced code while the fence is still open", () => {
    const open = pushSpeakable(emptySpeakable, "Intro.\n```ts\nsecret()\n", skip);
    expect(open.sentences.join(" ")).not.toMatch(/secret/);
    expect(open.state.inFence).toBe(true);
  });

  it("keeps fenced code when skipCode is off", () => {
    const { sentences } = pushAll(["```\nhello from the fence\n```\n"], keep);
    expect(sentences.join(" ")).toMatch(/hello from the fence/i);
    expect(sentences).not.toContain(patchAside);
  });

  it("skips indented code blocks", () => {
    const { sentences } = pushAll(["Prose.\n    const hidden = true;\nMore prose."]);
    expect(sentences.join(" ")).not.toMatch(/hidden/);
    expect(sentences.join(" ")).toMatch(/Prose/i);
  });

  it("rewrites grill markers into spoken questions", () => {
    const { sentences } = pushAll([
      "❓ **Q1** - **Auth store**: where does the session live?\n\n➡️ keep it in the server settings.\n",
    ]);
    const spoken = sentences.join(" ");
    expect(spoken).toMatch(/Question one/i);
    expect(spoken).toMatch(/Auth store/i);
    expect(spoken).toMatch(/I would go with/i);
    expect(spoken).not.toMatch(/❓/);
    expect(spoken).not.toMatch(/➡️/);
  });

  it("strips markdown and URLs so TTS does not read asterisks", () => {
    const { sentences } = pushAll(["See **this** and `that` at https://example.com/path *mrrp*."]);
    const spoken = sentences.join(" ");
    expect(spoken).toMatch(/See this and that/i);
    expect(spoken).toMatch(/mrrp/);
    expect(spoken).not.toMatch(/\*/);
    expect(spoken).not.toMatch(/https/);
    expect(spoken).not.toMatch(/example\.com/);
  });

  it("streams token-sized deltas into the same sentences", () => {
    const { sentences } = pushAll(["Soft, ", "fond, ", "a bit smug."]);
    expect(sentences).toEqual(["Soft, fond, a bit smug."]);
  });

  it("turns stage-direction groans and sighs into speakable asides", () => {
    const { sentences } = pushAll([
      "Oh No! It looks like I cant connect to my AI service right now. [groan]. Try Again Later? [sigh]",
    ]);
    const spoken = sentences.join(" ");
    expect(spoken).toMatch(/Oh No/i);
    expect(spoken).toMatch(/nngh/);
    expect(spoken).toMatch(/hhah/);
    expect(spoken).not.toMatch(/\[groan\]/i);
    expect(spoken).not.toMatch(/\[sigh\]/i);
    expect(sentences.length).toBeGreaterThan(1);
  });

  it("splits long utterances under the Chatterbox character cap", () => {
    const long = `${"word ".repeat(5000)}end.`;
    const parts = splitForTts(long);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((part) => part.length <= ttsChunkLimit)).toBe(true);
    expect(parts.join(" ").replace(/\s+/g, " ")).toContain("end.");
  });
});
