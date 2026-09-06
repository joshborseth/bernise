import { describe, expect, it } from "@effect/vitest";
import { deriveBerniseMood } from "./mood.ts";

describe("deriveBerniseMood", () => {
  it("listens when VAD speech is hot or the conversation lock is open", () => {
    expect(
      deriveBerniseMood({
        composerFocused: false,
        pending: false,
        voicing: false,
        speechActive: true,
      }),
    ).toBe("listening");
    expect(
      deriveBerniseMood({
        composerFocused: false,
        pending: false,
        voicing: false,
        addressed: true,
      }),
    ).toBe("listening");
  });

  it("keeps thinking and speaking ahead of listen cues", () => {
    expect(
      deriveBerniseMood({
        composerFocused: false,
        pending: true,
        voicing: false,
        speechActive: true,
        addressed: true,
      }),
    ).toBe("thinking");
    expect(
      deriveBerniseMood({
        composerFocused: false,
        pending: false,
        voicing: true,
        addressed: true,
      }),
    ).toBe("speaking");
  });
});
