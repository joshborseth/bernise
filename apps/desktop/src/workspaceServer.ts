import { Duration, Effect, Schedule, Schema } from "effect";
import { spawn, type ChildProcess } from "node:child_process";
import * as Path from "node:path";

export class WorkspaceServerError extends Schema.TaggedError<WorkspaceServerError>()(
  "WorkspaceServerError",
  {
    message: Schema.String,
    cause: Schema.Unknown,
  },
) {}

const probeUrl = Effect.fn("WorkspaceServer.probeUrl")(function* (url: string) {
  yield* Effect.tryPromise({
    try: async () => {
      const response = await fetch(url);
      if (response.status >= 500) {
        throw new Error(`status ${String(response.status)}`);
      }
    },
    catch: (cause) =>
      new WorkspaceServerError({
        message: `Could not reach ${url}.`,
        cause,
      }),
  });
});

export const waitForUrl = Effect.fn("WorkspaceServer.waitForUrl")(function* (url: string) {
  yield* probeUrl(url).pipe(
    Effect.retry(Schedule.spaced(Duration.millis(200)).pipe(Schedule.upTo({ times: 75 }))),
  );
});

const stopChild = async (child: ChildProcess): Promise<void> => {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  await new Promise<void>((resolve) => {
    child.once("exit", () => {
      resolve();
    });
    child.kill();
  });
};

export class WorkspaceServerSupervisor {
  readonly #port: number;
  readonly #repoRoot: string;
  #child: ChildProcess | undefined;
  #workspace: string | undefined;

  constructor(port: number, repoRoot: string) {
    this.#port = port;
    this.#repoRoot = repoRoot;
  }

  get workspace(): string | undefined {
    return this.#workspace;
  }

  async start(workspace: string): Promise<void> {
    if (
      this.#workspace === workspace &&
      this.#child !== undefined &&
      this.#child.exitCode === null
    ) {
      return;
    }
    await this.stop();

    const child = spawn("bun", ["run", "start"], {
      cwd: Path.join(this.#repoRoot, "apps/server"),
      stdio: "inherit",
      env: {
        ...process.env,
        BERNISE_PORT: String(this.#port),
        BERNISE_WORKSPACE: workspace,
      },
    });
    if (child.pid === undefined) {
      throw new WorkspaceServerError({
        message: "Failed to spawn the Bernise server.",
        cause: new Error("Child process has no pid."),
      });
    }
    this.#child = child;
    this.#workspace = workspace;

    try {
      await Effect.runPromise(waitForUrl(`http://127.0.0.1:${String(this.#port)}/health`));
    } catch (cause) {
      await this.stop();
      throw new WorkspaceServerError({
        message: `Bernise could not start in ${workspace}.`,
        cause,
      });
    }
  }

  async stop(): Promise<void> {
    const child = this.#child;
    this.#child = undefined;
    this.#workspace = undefined;
    if (child !== undefined) {
      await stopChild(child);
    }
  }
}
