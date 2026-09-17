import { describe, expect, it } from "vite-plus/test";
import {
  applyMascotAction,
  isMascotActionEnabled,
  parseMascotAction,
  playMascotAction,
  subscribeMascotAction,
  type MascotPlayState,
} from "./actions.ts";

const idle: MascotPlayState = {
  sleeping: false,
  usingLitter: false,
  purring: false,
  biting: false,
  hissing: false,
};

describe("parseMascotAction", () => {
  it("accepts the manual menu ids", () => {
    expect(parseMascotAction("litter")).toBe("litter");
    expect(parseMascotAction("sleep")).toBe("sleep");
    expect(parseMascotAction("nope")).toBeUndefined();
  });
});

describe("playMascotAction", () => {
  it("notifies subscribers for valid ids only", () => {
    const seen: string[] = [];
    const stop = subscribeMascotAction((id) => {
      seen.push(id);
    });
    playMascotAction("litter");
    playMascotAction("nope");
    stop();
    playMascotAction("sleep");
    expect(seen).toEqual(["litter"]);
  });
});

describe("applyMascotAction", () => {
  it("starts litter from sleep without leaving other tricks on", () => {
    expect(applyMascotAction({ ...idle, sleeping: true }, "litter")).toEqual({
      ...idle,
      usingLitter: true,
    });
  });

  it("wakes back to a quiet idle", () => {
    expect(applyMascotAction({ ...idle, usingLitter: true, purring: true }, "wake")).toEqual(idle);
  });
});

describe("isMascotActionEnabled", () => {
  it("lets litter start while sleeping and blocks a second run", () => {
    expect(isMascotActionEnabled({ ...idle, sleeping: true }, "litter")).toBe(true);
    expect(isMascotActionEnabled({ ...idle, usingLitter: true }, "litter")).toBe(false);
    expect(isMascotActionEnabled(idle, "wake")).toBe(false);
  });
});
