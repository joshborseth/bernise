import { Schema } from "effect";
import * as Fs from "node:fs/promises";
import * as Path from "node:path";

export type RecentProject = {
  readonly path: string;
  readonly name: string;
  readonly lastOpenedAt: string;
};

export class ProjectRegistryError extends Schema.TaggedError<ProjectRegistryError>()(
  "ProjectRegistryError",
  {
    message: Schema.String,
    cause: Schema.Unknown,
  },
) {}

const maxRecentProjects = 10;

const isRecentProject = (value: unknown): value is RecentProject => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.path === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.lastOpenedAt === "string"
  );
};

export const sortRecentProjects = (
  projects: ReadonlyArray<RecentProject>,
): ReadonlyArray<RecentProject> =>
  projects
    .slice()
    .sort((left, right) => right.lastOpenedAt.localeCompare(left.lastOpenedAt))
    .slice(0, maxRecentProjects);

export const canonicalProject = async (path: string): Promise<RecentProject> => {
  try {
    const canonical = await Fs.realpath(path);
    const info = await Fs.stat(canonical);
    if (!info.isDirectory()) {
      throw new Error("The selected path is not a directory.");
    }
    return {
      path: canonical,
      name: Path.basename(canonical) || canonical,
      lastOpenedAt: new Date().toISOString(),
    };
  } catch (cause) {
    throw new ProjectRegistryError({
      message: `Could not open project directory: ${path}`,
      cause,
    });
  }
};

export class ProjectRegistry {
  readonly #filename: string;

  constructor(filename: string) {
    this.#filename = filename;
  }

  async list(): Promise<ReadonlyArray<RecentProject>> {
    try {
      const text = await Fs.readFile(this.#filename, "utf8");
      const decoded: unknown = JSON.parse(text);
      return Array.isArray(decoded) ? sortRecentProjects(decoded.filter(isRecentProject)) : [];
    } catch (cause) {
      if (
        typeof cause === "object" &&
        cause !== null &&
        "code" in cause &&
        cause.code === "ENOENT"
      ) {
        return [];
      }
      throw new ProjectRegistryError({
        message: "Could not read recent projects.",
        cause,
      });
    }
  }

  async remember(project: RecentProject): Promise<ReadonlyArray<RecentProject>> {
    const current = await this.list();
    const next = sortRecentProjects([
      project,
      ...current.filter((candidate) => candidate.path !== project.path),
    ]);
    try {
      await Fs.mkdir(Path.dirname(this.#filename), { recursive: true });
      const temporary = `${this.#filename}.tmp`;
      await Fs.writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, "utf8");
      await Fs.rename(temporary, this.#filename);
      return next;
    } catch (cause) {
      throw new ProjectRegistryError({
        message: "Could not save recent projects.",
        cause,
      });
    }
  }
}
