import { describe, expect, it } from "@effect/vitest";
import { defaultBernisePersona, resolvePersona } from "../src/persona.ts";
import { codexThreadStartParams } from "../src/CodexProviderLive.ts";

describe("defaultBernisePersona", () => {
  it("is Bernise the cream cat", () => {
    expect(defaultBernisePersona).toMatch(/You are Bernise/i);
    expect(defaultBernisePersona).toMatch(/cream cat/i);
    expect(defaultBernisePersona).toMatch(/baby-talk/i);
    expect(defaultBernisePersona).toMatch(/irritable/i);
  });

  it("falls back to the shipped default when blank", () => {
    expect(resolvePersona("")).toBe(defaultBernisePersona);
    expect(resolvePersona("   ")).toBe(defaultBernisePersona);
    expect(resolvePersona("Keep me.")).toBe("Keep me.");
  });

  it("encodes discussion rounds, not one clarifying question", () => {
    expect(defaultBernisePersona).toMatch(/Discussing with Bernise/i);
    expect(defaultBernisePersona).toMatch(/design tree/i);
    expect(defaultBernisePersona).toMatch(/frontier/i);
    expect(defaultBernisePersona).toMatch(/round/i);
    expect(defaultBernisePersona).toContain("❓");
    expect(defaultBernisePersona).toContain("➡️");
    expect(defaultBernisePersona).not.toMatch(/ask the one question/i);
  });

  it("keeps facts vs decisions and a confirmation gate", () => {
    expect(defaultBernisePersona).toMatch(/Finding facts is your job/i);
    expect(defaultBernisePersona).toMatch(/Decisions are the user's/i);
    expect(defaultBernisePersona).toMatch(/shared understanding/i);
    expect(defaultBernisePersona).toMatch(/Do not implement before that confirmation/i);
  });

  it("stays stateless and keeps round markers readable", () => {
    expect(defaultBernisePersona).toMatch(/Write no CONTEXT\.md, ADRs/i);
    expect(defaultBernisePersona).toMatch(/don't perform it in every sentence/i);
    expect(defaultBernisePersona).toMatch(
      /Keep the markers and numbering exact so the user can answer by number/i,
    );
  });
});

describe("codexThreadStartParams", () => {
  it("sends cwd with Bernise developerInstructions", () => {
    expect(codexThreadStartParams("/tmp/workspace")).toEqual({
      cwd: "/tmp/workspace",
      developerInstructions: defaultBernisePersona,
    });
  });

  it("uses a custom persona when provided", () => {
    expect(codexThreadStartParams("/tmp/workspace", "You are a test cat.")).toEqual({
      cwd: "/tmp/workspace",
      developerInstructions: "You are a test cat.",
    });
  });
});
