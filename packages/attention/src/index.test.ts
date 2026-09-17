import { describe, expect, it } from "vitest";
import {
  attentionSignature,
  diffShell,
  emptyAttention,
  parseShell,
  type ShellSnapshot,
  type ThreadShell,
} from "./index.ts";

const thread = (input: Partial<ThreadShell> & Pick<ThreadShell, "id">): ThreadShell => ({
  title: input.title ?? input.id,
  hasPendingApprovals: input.hasPendingApprovals ?? false,
  hasPendingUserInput: input.hasPendingUserInput ?? false,
  settledOverride: input.settledOverride ?? null,
  settledAt: input.settledAt ?? null,
  sessionStatus: input.sessionStatus ?? null,
  id: input.id,
});

const shell = (...threads: Array<ThreadShell>): ShellSnapshot => ({ threads });

describe("parseShell", () => {
  it("reads threads from a t3code shell snapshot", () => {
    expect(
      parseShell({
        threads: [
          {
            id: "t1",
            title: "Fix auth",
            hasPendingApprovals: true,
            session: { status: "idle" },
          },
        ],
      }),
    ).toEqual(
      shell(
        thread({
          id: "t1",
          title: "Fix auth",
          hasPendingApprovals: true,
          sessionStatus: "idle",
        }),
      ),
    );
  });
});

describe("diffShell", () => {
  it("stays silent on the first snapshot", () => {
    const first = diffShell(
      emptyAttention(),
      shell(thread({ id: "t1", hasPendingApprovals: true, sessionStatus: "idle" })),
    );
    expect(first.events).toEqual([]);
    expect(first.state.hydrated).toBe(true);
  });

  it("speaks when a hydrated thread starts needing you", () => {
    const hydrated = diffShell(emptyAttention(), shell(thread({ id: "t1" }))).state;
    const next = diffShell(
      hydrated,
      shell(thread({ id: "t1", title: "Fix auth", hasPendingApprovals: true })),
    );
    expect(next.events).toEqual([
      { kind: "needsYou", threadId: "t1", title: "Fix auth", reason: "approval" },
    ]);
  });

  it("speaks input waits separately from approvals", () => {
    const hydrated = diffShell(emptyAttention(), shell(thread({ id: "t1" }))).state;
    const next = diffShell(
      hydrated,
      shell(thread({ id: "t1", title: "Ask", hasPendingUserInput: true })),
    );
    expect(next.events).toEqual([
      { kind: "needsYou", threadId: "t1", title: "Ask", reason: "input" },
    ]);
  });

  it("speaks when a running session leaves the busy states", () => {
    const hydrated = diffShell(
      emptyAttention(),
      shell(thread({ id: "t1", title: "Ship", sessionStatus: "running" })),
    ).state;
    const next = diffShell(
      hydrated,
      shell(thread({ id: "t1", title: "Ship", sessionStatus: "ready" })),
    );
    expect(next.events).toEqual([{ kind: "settled", threadId: "t1", title: "Ship" }]);
  });

  it("coalesces several settle events from one poll", () => {
    const hydrated = diffShell(
      emptyAttention(),
      shell(
        thread({ id: "a", sessionStatus: "running" }),
        thread({ id: "b", sessionStatus: "running" }),
      ),
    ).state;
    const next = diffShell(
      hydrated,
      shell(thread({ id: "a", sessionStatus: "idle" }), thread({ id: "b", sessionStatus: "idle" })),
    );
    expect(next.events).toEqual([{ kind: "settledMany", count: 2 }]);
  });

  it("does not speak again for the same attention signature", () => {
    const hydrated = diffShell(emptyAttention(), shell(thread({ id: "t1" }))).state;
    const pending = thread({ id: "t1", title: "Fix auth", hasPendingApprovals: true });
    const once = diffShell(hydrated, shell(pending));
    const twice = diffShell(once.state, shell(pending));
    expect(once.events).toHaveLength(1);
    expect(twice.events).toEqual([]);
    expect(attentionSignature(pending)).toBe(attentionSignature(pending));
  });

  it("does not treat a brand-new idle thread as settled", () => {
    const hydrated = diffShell(emptyAttention(), shell()).state;
    const next = diffShell(hydrated, shell(thread({ id: "new", sessionStatus: "idle" })));
    expect(next.events).toEqual([]);
  });

  it("speaks needsYou for a thread that appears already blocked", () => {
    const hydrated = diffShell(emptyAttention(), shell()).state;
    const next = diffShell(
      hydrated,
      shell(thread({ id: "new", title: "Blocked", hasPendingUserInput: true })),
    );
    expect(next.events).toEqual([
      { kind: "needsYou", threadId: "new", title: "Blocked", reason: "input" },
    ]);
  });
});
