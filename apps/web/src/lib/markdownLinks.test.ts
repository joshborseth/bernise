import { describe, expect, it } from "@effect/vitest";
import { resolveWorkspaceFileLink } from "./markdownLinks.ts";

const cwd = "/Users/josh/project";

describe("resolveWorkspaceFileLink", () => {
  it("resolves workspace-relative paths and file URLs", () => {
    expect(resolveWorkspaceFileLink("src/index.ts", cwd)).toEqual({
      relativePath: "src/index.ts",
      basename: "index.ts",
    });
    expect(resolveWorkspaceFileLink("src/index.ts:12", cwd)).toEqual({
      relativePath: "src/index.ts",
      basename: "index.ts",
      line: 12,
    });
    expect(resolveWorkspaceFileLink("file:///Users/josh/project/src/App.tsx", cwd)).toEqual({
      relativePath: "src/App.tsx",
      basename: "App.tsx",
    });
    expect(resolveWorkspaceFileLink("/Users/josh/project/README.md", cwd)).toEqual({
      relativePath: "README.md",
      basename: "README.md",
    });
  });

  it("rejects escapes, urls, and labels that are not files", () => {
    expect(resolveWorkspaceFileLink("../secret.ts", cwd)).toBeNull();
    expect(resolveWorkspaceFileLink("https://example.com/docs.md", cwd)).toBeNull();
    expect(resolveWorkspaceFileLink("/tmp/other/file.ts", cwd)).toBeNull();
    expect(resolveWorkspaceFileLink("TODO:12", cwd)).toBeNull();
    expect(resolveWorkspaceFileLink("apps/web", cwd)).toBeNull();
  });
});
