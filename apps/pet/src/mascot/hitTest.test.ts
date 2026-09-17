import { describe, expect, it } from "vite-plus/test";
import { clientToNdc, hitTestBody } from "./hitTest.ts";

describe("clientToNdc", () => {
  const rect = { left: 10, top: 20, right: 110, bottom: 120, width: 100, height: 100 };

  it("maps the canvas center to the origin", () => {
    expect(clientToNdc(60, 70, rect)).toEqual({ x: 0, y: 0 });
  });

  it("maps the top-left corner to -1, 1", () => {
    expect(clientToNdc(10, 20, rect)).toEqual({ x: -1, y: 1 });
  });

  it("rejects points outside the canvas", () => {
    expect(clientToNdc(9, 70, rect)).toBeUndefined();
    expect(clientToNdc(60, 121, rect)).toBeUndefined();
  });

  it("rejects an empty canvas", () => {
    expect(
      clientToNdc(0, 0, { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }),
    ).toBeUndefined();
  });
});

describe("hitTestBody", () => {
  it("misses when no figure is bound", () => {
    expect(hitTestBody(0, 0)).toBe(false);
  });
});
