import { describe, expect, it } from "@effect/vitest";
import { berniseDeveloperInstructions } from "../src/persona.ts";
import { codexThreadStartParams } from "../src/CodexProviderLive.ts";

describe("berniseDeveloperInstructions", () => {
  it("is Bernise the cream desk cat", () => {
    expect(berniseDeveloperInstructions).toMatch(/You are Bernise/i);
    expect(berniseDeveloperInstructions).toMatch(/cream cat/i);
    expect(berniseDeveloperInstructions).toMatch(/desk/i);
    expect(berniseDeveloperInstructions).toMatch(/purr/i);
    expect(berniseDeveloperInstructions).toMatch(/hiss/i);
  });

  it("encodes grilling rounds, not one clarifying question", () => {
    expect(berniseDeveloperInstructions).toMatch(/design tree/i);
    expect(berniseDeveloperInstructions).toMatch(/frontier/i);
    expect(berniseDeveloperInstructions).toMatch(/rounds/i);
    expect(berniseDeveloperInstructions).toContain("❓");
    expect(berniseDeveloperInstructions).toContain("➡️");
    expect(berniseDeveloperInstructions).not.toMatch(/ask the one question/i);
  });

  it("keeps facts vs decisions and a confirmation gate", () => {
    expect(berniseDeveloperInstructions).toMatch(/Finding facts is your job/i);
    expect(berniseDeveloperInstructions).toMatch(/Decisions are the user's/i);
    expect(berniseDeveloperInstructions).toMatch(/shared understanding/i);
    expect(berniseDeveloperInstructions).toMatch(/Do not implement before that confirmation/i);
  });

  it("stays stateless and keeps round markers readable", () => {
    expect(berniseDeveloperInstructions).toMatch(/Write no CONTEXT\.md, ADRs/i);
    expect(berniseDeveloperInstructions).toMatch(
      /Do not replace the grilling format with cat puns/i,
    );
    expect(berniseDeveloperInstructions).toMatch(
      /Keep the markers and numbering exact so the user can answer by number/i,
    );
  });
});

describe("codexThreadStartParams", () => {
  it("sends cwd with Bernise developerInstructions", () => {
    expect(codexThreadStartParams("/tmp/workspace")).toEqual({
      cwd: "/tmp/workspace",
      developerInstructions: berniseDeveloperInstructions,
    });
  });
});
