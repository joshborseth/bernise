import { describe, expect, it } from "@effect/vitest";
import { clipSpeakText, ttsMaxChars, ttsSpeakBody, ttsSpeakUrl } from "../src/Tts.ts";

describe("tts helpers", () => {
  it("joins /speak onto a trailing-slash origin", () => {
    expect(ttsSpeakUrl("http://borseth.ddns.net:7040/")).toBe("http://borseth.ddns.net:7040/speak");
    expect(ttsSpeakUrl("http://borseth.ddns.net:7040")).toBe("http://borseth.ddns.net:7040/speak");
  });

  it("sends text and voice in the JSON body without an API key", () => {
    expect(ttsSpeakBody("Hello.", "benny2")).toEqual({ text: "Hello.", voice: "benny2" });
  });

  it("clips speak text to the Chatterbox cap", () => {
    expect(clipSpeakText("  hi  ")).toBe("hi");
    expect(clipSpeakText("").length).toBe(0);
    const long = "a".repeat(ttsMaxChars + 40);
    expect(clipSpeakText(long).length).toBe(ttsMaxChars);
    const sentences = `${"Hello. ".repeat(3000)}tail`;
    const clipped = clipSpeakText(sentences);
    expect(clipped.length).toBeLessThanOrEqual(ttsMaxChars);
    expect(clipped.endsWith(".")).toBe(true);
  });
});
