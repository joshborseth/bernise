import { WorkspaceInfo } from "@bernise/contracts";
import { describe, expect, it } from "@effect/vitest";
import { Option } from "effect";
import { resolveWorkspacePath, workspaceInfoFromPath } from "../src/workspace.ts";

describe("resolveWorkspacePath", () => {
  it("trims configured workspace", () => {
    expect(resolveWorkspacePath(Option.some(" /tmp/bernise-station "))).toBe(
      "/tmp/bernise-station",
    );
  });

  it("falls back to process.cwd when nothing is set", () => {
    expect(resolveWorkspacePath(Option.none())).toBe(process.cwd());
  });
});

describe("workspaceInfoFromPath", () => {
  it("uses the last path segment as the station name", () => {
    expect(workspaceInfoFromPath("/tmp/bernise-station")).toEqual(
      new WorkspaceInfo({ path: "/tmp/bernise-station", name: "bernise-station" }),
    );
  });
});
