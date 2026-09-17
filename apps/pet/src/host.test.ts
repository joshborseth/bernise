import { describe, expect, it } from "vite-plus/test";
import { pushShellJson, requestAction, resetAttention, subscribePetAction } from "./host.ts";

describe("pushShellJson", () => {
  it("hydrates silently then emits needsYou", () => {
    resetAttention();
    expect(pushShellJson(JSON.stringify({ threads: [{ id: "t1" }] }))).toBe("[]");
    const events = JSON.parse(
      pushShellJson(
        JSON.stringify({
          threads: [{ id: "t1", title: "Fix auth", hasPendingApprovals: true }],
        }),
      ),
    ) as unknown;
    expect(events).toEqual([
      { kind: "needsYou", threadId: "t1", title: "Fix auth", reason: "approval" },
    ]);
  });
});

describe("requestAction", () => {
  it("forwards litter sleep and wake and ignores unknown names", () => {
    const seen: string[] = [];
    const stop = subscribePetAction((action) => {
      seen.push(action);
    });
    requestAction("litter");
    requestAction("sleep");
    requestAction("wake");
    requestAction("dance");
    stop();
    expect(seen).toEqual(["litter", "sleep", "wake"]);
  });
});
