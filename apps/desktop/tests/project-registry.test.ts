import { afterEach, describe, expect, it } from "@effect/vitest";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  canonicalProject,
  ProjectRegistry,
  ProjectRegistryError,
  sortRecentProjects,
  type RecentProject,
} from "../src/projectRegistry.ts";

const temporaryDirectories: Array<string> = [];

const temporaryDirectory = (): string => {
  const path = mkdtempSync(join(tmpdir(), "bernise-project-registry-"));
  temporaryDirectories.push(path);
  return path;
};

afterEach(() => {
  for (const path of temporaryDirectories.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});

describe("ProjectRegistry", () => {
  it("canonicalizes directories and rejects files that do not exist", async () => {
    const root = temporaryDirectory();
    const projectPath = join(root, "project");
    mkdirSync(projectPath);

    await expect(canonicalProject(projectPath)).resolves.toMatchObject({
      path: realpathSync(projectPath),
      name: "project",
    });
    await expect(canonicalProject(join(root, "missing"))).rejects.toBeInstanceOf(
      ProjectRegistryError,
    );
  });

  it("deduplicates, sorts, and limits recent projects", () => {
    const projects: Array<RecentProject> = Array.from({ length: 12 }, (_, index) => ({
      path: `/project/${String(index)}`,
      name: String(index),
      lastOpenedAt: new Date(index * 1_000).toISOString(),
    }));
    const sorted = sortRecentProjects(projects);
    expect(sorted).toHaveLength(10);
    expect(sorted[0]?.name).toBe("11");
    expect(sorted[9]?.name).toBe("2");
  });

  it("persists the most recently opened project first", async () => {
    const root = temporaryDirectory();
    const registry = new ProjectRegistry(join(root, "projects.json"));
    const older: RecentProject = {
      path: "/older",
      name: "older",
      lastOpenedAt: "2026-01-01T00:00:00.000Z",
    };
    const newer: RecentProject = {
      path: "/newer",
      name: "newer",
      lastOpenedAt: "2026-02-01T00:00:00.000Z",
    };

    await registry.remember(older);
    await registry.remember(newer);
    expect(await registry.list()).toEqual([newer, older]);
  });
});
