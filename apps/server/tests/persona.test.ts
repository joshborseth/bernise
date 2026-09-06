import { describe, expect, it } from "@effect/vitest";
import { defaultBernisePersona, resolvePersona } from "../src/persona.ts";
import { codexThreadStartParams } from "../src/CodexProviderLive.ts";

describe("defaultBernisePersona", () => {
  it("is Bernise the sweet cat for TTS", () => {
    expect(defaultBernisePersona).toMatch(/You are Bernise/i);
    expect(defaultBernisePersona).toMatch(/sweet cat/i);
    expect(defaultBernisePersona).toMatch(/don't mention who you are unless explicitly asked/i);
    expect(defaultBernisePersona).toMatch(/NEVER use emojis/i);
    expect(defaultBernisePersona).toMatch(/spoken aloud via TTS/i);
  });

  it("falls back to the shipped default when blank", () => {
    expect(resolvePersona("")).toBe(defaultBernisePersona);
    expect(resolvePersona("   ")).toBe(defaultBernisePersona);
    expect(resolvePersona("Keep me.")).toBe("Keep me.");
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
