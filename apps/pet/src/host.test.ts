import { describe, expect, it } from "vitest";
import { pushShellJson, resetAttention } from "./host.ts";

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
