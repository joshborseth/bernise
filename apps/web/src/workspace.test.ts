import { describe, expect, it } from "@effect/vitest";
import { displayWorkspacePath, formatWorkspacePath, homePrefixFromPath } from "./workspace.ts";

describe("formatWorkspacePath", () => {
  it("replaces a home prefix with a tilde", () => {
    expect(formatWorkspacePath("/Users/josh/Documents/bernise", "/Users/josh")).toBe(
      "~/Documents/bernise",
    );
  });

  it("collapses the home directory itself to a tilde", () => {
    expect(formatWorkspacePath("/Users/josh", "/Users/josh")).toBe("~");
  });

  it("leaves paths outside home unchanged", () => {
    expect(formatWorkspacePath("/tmp/workspace", "/Users/josh")).toBe("/tmp/workspace");
  });
});

describe("displayWorkspacePath", () => {
  it("infers a macOS home prefix", () => {
    expect(homePrefixFromPath("/Users/josh/Documents/bernise")).toBe("/Users/josh");
    expect(displayWorkspacePath("/Users/josh/Documents/bernise")).toBe("~/Documents/bernise");
  });

  it("infers a Linux home prefix", () => {
    expect(displayWorkspacePath("/home/josh/src/bernise")).toBe("~/src/bernise");
  });

  it("leaves tmp paths absolute", () => {
    expect(displayWorkspacePath("/tmp/bernise-station")).toBe("/tmp/bernise-station");
  });
});
