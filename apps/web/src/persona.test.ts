import { describe, expect, it } from "@effect/vitest";
import { defaultBernisePersona, resolvePersona } from "./persona.ts";

describe("resolvePersona", () => {
  it("shows the shipped Bernise voice when starting from a blank persona", () => {
    expect(resolvePersona("")).toBe(defaultBernisePersona);
    expect(resolvePersona("   ")).toBe(defaultBernisePersona);
    expect(defaultBernisePersona).toMatch(/You are Bernise/i);
    expect(defaultBernisePersona).toMatch(/cream cat/i);
  });

  it("keeps a custom persona", () => {
    expect(resolvePersona("You are a test cat.")).toBe("You are a test cat.");
  });
});
