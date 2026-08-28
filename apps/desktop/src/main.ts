import { NodeRuntime } from "@effect/platform-node";
import { Config, Duration, Effect, Schedule, Schema } from "effect";
import { app, BrowserWindow } from "electron";
import { spawn, type ChildProcess } from "node:child_process";
import * as Path from "node:path";
import { fileURLToPath } from "node:url";

// Must run before app.whenReady(). Chromium's overlay compositor races with
// WebGL buffer recycling and logs SharedImageManager::ProduceOverlay /
// Invalid mailbox. This keeps GPU/WebGL; it only skips overlay promotion.
app.commandLine.appendSwitch("disable-gpu-memory-buffer-compositor-resources");

const portConfig = Config.port("BERNISE_PORT").pipe(Config.withDefault(13773));
const webUrlConfig = Config.string("BERNISE_WEB_URL").pipe(
  Config.withDefault("http://127.0.0.1:5733"),
);
const repoRootConfig = Config.string("BERNISE_ROOT").pipe(
  Config.withDefault(fileURLToPath(new URL("../../../", import.meta.url))),
);

class ProbeError extends Schema.TaggedError<ProbeError>()("ProbeError", {
  url: Schema.String,
  cause: Schema.Unknown,
}) {}

const probeUrl = Effect.fn("probeUrl")(function* (url: string) {
  yield* Effect.tryPromise({
    try: async () => {
      const response = await fetch(url);
      if (response.status >= 500) {
        throw new Error(`status ${response.status}`);
      }
    },
    catch: (cause) => new ProbeError({ url, cause }),
  });
});

const waitForUrl = Effect.fn("waitForUrl")(function* (url: string) {
  yield* probeUrl(url).pipe(
    Effect.retry(Schedule.spaced(Duration.millis(200)).pipe(Schedule.upTo({ times: 75 }))),
  );
});

const startServer = Effect.fn("startServer")(function* (port: number, repoRoot: string) {
  const healthUrl = `http://127.0.0.1:${port}/health`;
  const alreadyUp = yield* probeUrl(healthUrl).pipe(
    Effect.as(true),
    Effect.orElseSucceed(() => false),
  );
  if (alreadyUp) {
    yield* Effect.logInfo("bernise server already running");
    return;
  }

  const child = yield* Effect.acquireRelease(
    Effect.sync((): ChildProcess =>
      spawn("bun", ["run", "start"], {
        cwd: Path.join(repoRoot, "apps/server"),
        stdio: "inherit",
        env: {
          ...process.env,
          BERNISE_PORT: String(port),
        },
      }),
    ),
    (process) =>
      Effect.sync(() => {
        process.kill();
      }),
  );

  if (child.pid === undefined) {
    return yield* Effect.die("failed to spawn bernise server");
  }

  yield* waitForUrl(healthUrl);
});

const createWindow = Effect.fn("createWindow")(function* (webUrl: string) {
  yield* Effect.acquireRelease(
    Effect.sync(() => {
      const window = new BrowserWindow({
        width: 1100,
        height: 760,
        backgroundColor: "#f6efe4",
        title: "Bernise",
        show: false,
        webPreferences: {
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
        },
      });
      window.once("ready-to-show", () => {
        if (!window.isDestroyed()) {
          window.show();
        }
      });
      void window.loadURL(webUrl);
      return window;
    }),
    (window) =>
      Effect.sync(() => {
        if (!window.isDestroyed()) {
          window.destroy();
        }
      }),
  );
});

const program = Effect.gen(function* () {
  const port = yield* portConfig;
  const webUrl = yield* webUrlConfig;
  const repoRoot = yield* repoRootConfig;

  yield* Effect.promise(() => app.whenReady());
  yield* startServer(port, repoRoot);
  yield* waitForUrl(webUrl);
  yield* createWindow(webUrl);

  yield* Effect.callback<void>((resume) => {
    app.on("window-all-closed", () => {
      if (process.platform !== "darwin") {
        resume(Effect.void);
      }
    });
    app.on("before-quit", () => {
      resume(Effect.void);
    });
  });
}).pipe(Effect.scoped);

NodeRuntime.runMain(program);
