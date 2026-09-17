import { describe, expect, it } from "vite-plus/test";
import { subscribeMascotAction } from "./mascot/actions.ts";
import {
  pushShellJson,
  requestAction,
  resetAttention,
  setPointer,
  subscribePetAction,
  subscribePointer,
} from "./host.ts";

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

describe("setPointer", () => {
  it("notifies subscribers without going through host state", () => {
    const seen: Array<{ clientX: number; clientY: number; viewWidth: number; viewHeight: number }> =
      [];
    const stop = subscribePointer((pointer) => {
      seen.push(pointer);
    });
    setPointer({ clientX: 120, clientY: 40, viewWidth: 1512, viewHeight: 982 });
    stop();
    expect(seen.at(-1)).toEqual({ clientX: 120, clientY: 40, viewWidth: 1512, viewHeight: 982 });
  });
});

describe("requestAction", () => {
  it("forwards litter sleep and wake and ignores unknown names", () => {
    const seen: string[] = [];
    const mascot: string[] = [];
    const stop = subscribePetAction((action) => {
      seen.push(action);
    });
    const stopMascot = subscribeMascotAction((id) => {
      mascot.push(id);
    });
    requestAction("litter");
    requestAction("sleep");
    requestAction("wake");
    requestAction("dance");
    stop();
    stopMascot();
    expect(seen).toEqual(["litter", "sleep", "wake"]);
    expect(mascot).toEqual(["litter", "sleep", "wake"]);
  });
});
