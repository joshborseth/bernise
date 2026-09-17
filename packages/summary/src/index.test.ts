import { describe, expect, it } from "vitest";
import { classifyPrompt, parseThreadDetail, summarizeThread } from "./index.ts";

describe("classifyPrompt", () => {
  it("treats summary asks as summarize", () => {
    expect(classifyPrompt("what happened")).toBe("summarize");
    expect(classifyPrompt("hey catch me up")).toBe("summarize");
    expect(classifyPrompt("summarize that thread")).toBe("summarize");
  });

  it("ignores unrelated speech", () => {
    expect(classifyPrompt("approve that")).toBe("unknown");
    expect(classifyPrompt("start a new project")).toBe("unknown");
  });
});

describe("summarizeThread", () => {
  it("speaks title, pending flag, and a stripped last assistant turn", () => {
    const brief = summarizeThread({
      id: "t1",
      title: "Fix auth",
      hasPendingApprovals: true,
      messages: [
        { role: "user", text: "please fix login" },
        {
          role: "assistant",
          text: "I patched **login**. See https://example.com/diff and `secret()`. Done.",
        },
      ],
    });
    expect(brief).toMatch(/^Fix auth/);
    expect(brief).toMatch(/needs approval/i);
    expect(brief).toMatch(/I patched login/i);
    expect(brief).not.toMatch(/\*\*/);
    expect(brief).not.toMatch(/example\.com/);
    expect(brief).not.toMatch(/secret\(\)/);
  });

  it("skips streaming assistant text", () => {
    const brief = summarizeThread({
      id: "t1",
      title: "WIP",
      messages: [{ role: "assistant", text: "partial", streaming: true }],
    });
    expect(brief).toMatch(/No assistant reply yet/);
  });

  it("parses a nested thread payload", () => {
    const detail = parseThreadDetail({
      thread: {
        id: "t9",
        title: "Nested",
        messages: [{ role: "assistant", text: "Hello there." }],
      },
    });
    expect(detail?.id).toBe("t9");
    expect(detail === undefined ? "" : summarizeThread(detail)).toMatch(/Hello there/);
  });
});
