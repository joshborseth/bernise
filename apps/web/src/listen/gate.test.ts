import { describe, expect, it } from "@effect/vitest";
import { applyListenGate, idleListenGate, listenLockMs } from "./gate.ts";

describe("applyListenGate", () => {
  it("drops idle speech that is not a wake", () => {
    const result = applyListenGate(idleListenGate, {
      now: 0,
      busy: false,
      transcript: "what's for dinner",
    });
    expect(result).toEqual({ state: idleListenGate, prompt: undefined });
  });

  it("stays idle on a hey bernise transcript without a keyword hit", () => {
    const result = applyListenGate(idleListenGate, {
      now: 1_000,
      busy: false,
      transcript: "hey bernise look at package.json",
    });
    expect(result).toEqual({ state: idleListenGate, prompt: undefined });
  });

  it("opens the lock on a keyword hit with no transcript", () => {
    const result = applyListenGate(idleListenGate, {
      now: 500,
      busy: false,
      wake: true,
    });
    expect(result).toEqual({
      state: { phase: "addressed", lockUntil: 500 + listenLockMs },
      prompt: undefined,
    });
  });

  it("strips a wake phrase from the remainder after a keyword hit", () => {
    const result = applyListenGate(idleListenGate, {
      now: 1_000,
      busy: false,
      wake: true,
      transcript: "hey bernise look at package.json",
    });
    expect(result).toEqual({
      state: { phase: "addressed", lockUntil: 1_000 + listenLockMs },
      prompt: "look at package.json",
    });
  });

  it("sends the full transcript after a keyword hit when Whisper missed the phrase", () => {
    const result = applyListenGate(idleListenGate, {
      now: 0,
      busy: false,
      wake: true,
      transcript: "look at package.json",
    });
    expect(result).toEqual({
      state: { phase: "addressed", lockUntil: listenLockMs },
      prompt: "look at package.json",
    });
  });

  it("strips hey bernice and hey bernie remainders after a keyword hit", () => {
    expect(
      applyListenGate(idleListenGate, {
        now: 0,
        busy: false,
        wake: true,
        transcript: "hey bernice",
      }),
    ).toEqual({
      state: { phase: "addressed", lockUntil: listenLockMs },
      prompt: undefined,
    });
    expect(
      applyListenGate(idleListenGate, {
        now: 0,
        busy: false,
        wake: true,
        transcript: "hey Bernie check src",
      }),
    ).toEqual({
      state: { phase: "addressed", lockUntil: listenLockMs },
      prompt: "check src",
    });
  });

  it("sends follow-ups while addressed and refreshes the lock", () => {
    const woke = applyListenGate(idleListenGate, {
      now: 0,
      busy: false,
      wake: true,
    });
    const follow = applyListenGate(woke.state, {
      now: 2_000,
      busy: false,
      transcript: "what's in src",
    });
    expect(follow).toEqual({
      state: { phase: "addressed", lockUntil: 2_000 + listenLockMs },
      prompt: "what's in src",
    });
  });

  it("returns to idle after 8s of silence", () => {
    const woke = applyListenGate(idleListenGate, {
      now: 0,
      busy: false,
      wake: true,
    });
    expect(applyListenGate(woke.state, { now: listenLockMs - 1, busy: false }).state.phase).toBe(
      "addressed",
    );
    expect(applyListenGate(woke.state, { now: listenLockMs, busy: false })).toEqual({
      state: idleListenGate,
      prompt: undefined,
    });
  });

  it("ignores transcripts while busy and holds the lock", () => {
    const woke = applyListenGate(idleListenGate, {
      now: 0,
      busy: false,
      wake: true,
      transcript: "hey bernise look at this",
    });
    const ignored = applyListenGate(woke.state, {
      now: 9_000,
      busy: true,
      transcript: "what's for dinner",
    });
    expect(ignored.prompt).toBeUndefined();
    expect(ignored.state.phase).toBe("addressed");
    expect(
      applyListenGate(ignored.state, { now: 9_000 + listenLockMs, busy: false }).state.phase,
    ).toBe("idle");
  });
});
