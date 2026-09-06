import { describe, expect, it } from "@effect/vitest";
import { applicationMenuTemplate, menuClosesWindowOnModW } from "../src/applicationMenu.ts";

describe("applicationMenuTemplate", () => {
  it("treats Close and Mod+W accelerators as window-close bindings", () => {
    expect(menuClosesWindowOnModW([{ role: "close" }])).toBe(true);
    expect(menuClosesWindowOnModW([{ accelerator: "CommandOrControl+W", label: "Close" }])).toBe(
      true,
    );
  });

  it("does not bind Mod+W to close on macOS", () => {
    const template = applicationMenuTemplate("darwin");
    expect(menuClosesWindowOnModW(template)).toBe(false);
  });

  it("does not bind Mod+W to close on Windows", () => {
    const template = applicationMenuTemplate("win32");
    expect(menuClosesWindowOnModW(template)).toBe(false);
  });

  it("does not bind Mod+W to close on Linux", () => {
    const template = applicationMenuTemplate("linux");
    expect(menuClosesWindowOnModW(template)).toBe(false);
  });
});
