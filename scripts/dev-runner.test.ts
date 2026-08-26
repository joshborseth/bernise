import { NodeServices } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import { ConfigProvider, Effect, Layer, PlatformError, Sink, Stream } from "effect";
import { ChildProcessSpawner } from "effect/unstable/process";
import {
  BASE_SERVER_PORT,
  BASE_WEB_PORT,
  checkPortAvailabilityOnHosts,
  createDevRunnerEnv,
  devPortProbeHosts,
  findFirstAvailableOffset,
  getDevRunnerModeArgs,
  isBrowserAllowedPort,
  NetService,
  resolveModePortOffsets,
  resolveOffset,
  runDevRunnerWithInput,
} from "./dev-runner.ts";

const emptyConfigLayer = ConfigProvider.layer(ConfigProvider.fromEnv({ env: {} }));
const netServiceLayer = Layer.succeed(NetService, {
  canListenOnHost: () => Effect.succeed(true),
});

function mockProcess(exit: number | PlatformError.PlatformError) {
  return ChildProcessSpawner.makeHandle({
    pid: ChildProcessSpawner.ProcessId(1),
    exitCode:
      typeof exit === "number"
        ? Effect.succeed(ChildProcessSpawner.ExitCode(exit))
        : Effect.fail(exit),
    isRunning: Effect.succeed(false),
    kill: () => Effect.void,
    unref: Effect.succeed(Effect.void),
    stdin: Sink.drain,
    stdout: Stream.empty,
    stderr: Stream.empty,
    all: Stream.empty,
    getInputFd: () => Sink.drain,
    getOutputFd: () => Stream.empty,
  });
}

const DESKTOP_MODE_ARGS = [
  "run",
  "--filter=@bernise/desktop",
  "--filter=@bernise/web",
  "dev",
] as const;

const devServerInput = {
  mode: "dev:server",
  host: undefined,
  port: BASE_SERVER_PORT,
  devUrl: undefined,
  dryRun: false,
  runArgs: ["--inspect", "secret-token-value"],
} as const;

it.layer(NodeServices.layer)("dev-runner", (it) => {
  describe("getDevRunnerModeArgs", () => {
    it.effect("lets Vite+ honor the desktop dev task graph", () =>
      Effect.sync(() => {
        assert.deepStrictEqual(getDevRunnerModeArgs("dev:desktop"), [...DESKTOP_MODE_ARGS]);
      }),
    );

    it.effect("treats root dev as the desktop stack", () =>
      Effect.sync(() => {
        assert.deepStrictEqual(getDevRunnerModeArgs("dev"), [...DESKTOP_MODE_ARGS]);
      }),
    );
  });

  describe("resolveOffset", () => {
    it.effect("uses explicit BERNISE_PORT_OFFSET when provided", () =>
      Effect.gen(function* () {
        const result = yield* resolveOffset({ portOffset: 12, devInstance: undefined });
        assert.deepStrictEqual(result, {
          offset: 12,
          source: "BERNISE_PORT_OFFSET=12",
        });
      }),
    );

    it.effect("hashes non-numeric instance values", () =>
      Effect.gen(function* () {
        const result = yield* resolveOffset({
          portOffset: undefined,
          devInstance: "feature-branch",
        });
        assert.ok(result.offset >= 1);
        assert.ok(result.offset <= 3000);
      }),
    );

    it.effect("returns structured context for a negative port offset", () =>
      Effect.gen(function* () {
        const error = yield* resolveOffset({ portOffset: -1, devInstance: undefined }).pipe(
          Effect.flip,
        );

        assert.equal(error._tag, "DevRunnerInvalidPortOffsetError");
        assert.equal(error.configKey, "BERNISE_PORT_OFFSET");
        assert.equal(error.portOffset, -1);
        assert.equal(error.minimum, 0);
      }),
    );
  });

  describe("createDevRunnerEnv", () => {
    it.effect("wires loopback URLs for root dev mode", () =>
      Effect.gen(function* () {
        const env = yield* createDevRunnerEnv({
          mode: "dev",
          baseEnv: {},
          serverOffset: 0,
          webOffset: 0,
          host: undefined,
          port: undefined,
          devUrl: undefined,
        });

        assert.equal(env.BERNISE_PORT, String(BASE_SERVER_PORT));
        assert.equal(env.PORT, String(BASE_WEB_PORT));
        assert.equal(env.HOST, "127.0.0.1");
        assert.equal(env.BERNISE_WEB_URL, `http://127.0.0.1:${BASE_WEB_PORT}`);
        assert.equal(env.VITE_HTTP_URL, `http://127.0.0.1:${BASE_SERVER_PORT}`);
        assert.equal(env.VITE_WS_URL, `ws://127.0.0.1:${BASE_SERVER_PORT}`);
        assert.equal(env.BERNISE_NO_BROWSER, undefined);
        assert.equal(env.BERNISE_SINGLE_ORIGIN_DEV, undefined);
      }),
    );

    it.effect("supports explicit typed overrides for server-only mode", () =>
      Effect.gen(function* () {
        const env = yield* createDevRunnerEnv({
          mode: "dev:server",
          baseEnv: {},
          serverOffset: 0,
          webOffset: 0,
          host: "0.0.0.0",
          port: 4222,
          devUrl: new URL("http://localhost:7331"),
        });

        assert.equal(env.BERNISE_PORT, "4222");
        assert.equal(env.VITE_HTTP_URL, "http://localhost:4222");
        assert.equal(env.VITE_WS_URL, "ws://localhost:4222");
        assert.equal(env.BERNISE_HOST, "0.0.0.0");
        assert.equal(env.VITE_DEV_SERVER_URL, "http://localhost:7331/");
        assert.equal(env.HOST, undefined);
      }),
    );

    it.effect("matches desktop env wiring for dev:desktop", () =>
      Effect.gen(function* () {
        const env = yield* createDevRunnerEnv({
          mode: "dev:desktop",
          baseEnv: {},
          serverOffset: 0,
          webOffset: 0,
          host: undefined,
          port: undefined,
          devUrl: undefined,
        });

        assert.equal(env.HOST, "127.0.0.1");
        assert.equal(env.VITE_HTTP_URL, `http://127.0.0.1:${BASE_SERVER_PORT}`);
        assert.equal(env.VITE_WS_URL, `ws://127.0.0.1:${BASE_SERVER_PORT}`);
        assert.equal(env.BERNISE_HOST, undefined);
      }),
    );

    it.effect("forces loopback HOST in desktop modes even when inherited", () =>
      Effect.gen(function* () {
        const env = yield* createDevRunnerEnv({
          mode: "dev",
          baseEnv: { HOST: "0.0.0.0" },
          serverOffset: 0,
          webOffset: 0,
          host: undefined,
          port: undefined,
          devUrl: undefined,
        });

        assert.equal(env.HOST, "127.0.0.1");
      }),
    );
  });

  describe("findFirstAvailableOffset", () => {
    it.effect("returns the starting offset when required ports are available", () =>
      Effect.gen(function* () {
        const offset = yield* findFirstAvailableOffset({
          startOffset: 0,
          requireServerPort: true,
          requireWebPort: true,
          checkPortAvailability: () => Effect.succeed(true),
        });

        assert.equal(offset, 0);
      }),
    );

    it.effect("advances until all required ports are available", () =>
      Effect.gen(function* () {
        const taken = new Set([
          BASE_SERVER_PORT,
          BASE_WEB_PORT,
          BASE_SERVER_PORT + 1,
          BASE_WEB_PORT + 1,
        ]);
        const offset = yield* findFirstAvailableOffset({
          startOffset: 0,
          requireServerPort: true,
          requireWebPort: true,
          checkPortAvailability: (port) => Effect.succeed(!taken.has(port)),
        });

        assert.equal(offset, 2);
      }),
    );

    it.effect("skips browser-blocked web ports before probing availability", () =>
      Effect.gen(function* () {
        const probed: Array<{ port: number; role: string | undefined }> = [];
        const offset = yield* findFirstAvailableOffset({
          // 5733 + 833 = 6566, which browsers block as sane-port.
          startOffset: 833,
          requireServerPort: true,
          requireWebPort: true,
          checkPortAvailability: (port, role) => {
            probed.push({ port, role });
            return Effect.succeed(true);
          },
        });

        assert.equal(offset, 834);
        assert.deepStrictEqual(probed, [
          { port: 14_607, role: "server" },
          { port: 6567, role: "web" },
        ]);
      }),
    );

    it.effect("does not reject a server-only offset because its unused web port is blocked", () =>
      Effect.gen(function* () {
        const offset = yield* findFirstAvailableOffset({
          startOffset: 833,
          requireServerPort: true,
          requireWebPort: false,
          checkPortAvailability: () => Effect.succeed(true),
        });

        assert.equal(offset, 833);
      }),
    );

    it.effect("reports the exhausted range and required port set", () =>
      Effect.gen(function* () {
        const error = yield* findFirstAvailableOffset({
          startOffset: 60_000,
          requireServerPort: true,
          requireWebPort: true,
          checkPortAvailability: () => Effect.succeed(false),
        }).pipe(Effect.flip);

        assert.equal(error._tag, "DevRunnerPortExhaustedError");
        assert.equal(error.startOffset, 60_000);
        assert.equal(error.requireServerPort, true);
        assert.equal(error.requireWebPort, true);
        assert.equal(error.baseServerPort, BASE_SERVER_PORT);
        assert.equal(error.baseWebPort, BASE_WEB_PORT);
      }),
    );
  });

  describe("isBrowserAllowedPort", () => {
    it.effect("rejects fetch-blocked ports", () =>
      Effect.sync(() => {
        assert.equal(isBrowserAllowedPort(6566), false);
        assert.equal(isBrowserAllowedPort(5733), true);
      }),
    );
  });

  describe("checkPortAvailabilityOnHosts", () => {
    it.effect("checks overlapping hosts sequentially to avoid self-interference", () =>
      Effect.gen(function* () {
        const seen: Array<string> = [];
        const available = yield* checkPortAvailabilityOnHosts(
          9,
          ["127.0.0.1", "::1"],
          (_port, host) => {
            seen.push(host);
            return Effect.succeed(true);
          },
        );

        assert.equal(available, true);
        assert.deepStrictEqual(seen, ["127.0.0.1", "::1"]);
      }),
    );
  });

  describe("devPortProbeHosts", () => {
    it.effect("probes loopback only when no bind host is configured", () =>
      Effect.sync(() => {
        assert.deepStrictEqual(devPortProbeHosts(undefined), ["127.0.0.1", "::1"]);
      }),
    );

    it.effect("adds a non-loopback bind host to the probe list", () =>
      Effect.sync(() => {
        assert.deepStrictEqual(devPortProbeHosts("192.168.1.10"), [
          "127.0.0.1",
          "::1",
          "192.168.1.10",
        ]);
      }),
    );

    it.effect("does not probe loopback twice when it is the configured host", () =>
      Effect.sync(() => {
        assert.deepStrictEqual(devPortProbeHosts("127.0.0.1"), ["127.0.0.1", "::1"]);
      }),
    );
  });

  describe("resolveModePortOffsets", () => {
    it.effect("uses a shared fallback offset for desktop modes", () =>
      Effect.gen(function* () {
        const taken = new Set([BASE_SERVER_PORT, BASE_WEB_PORT]);
        const offsets = yield* resolveModePortOffsets({
          mode: "dev",
          startOffset: 0,
          hasExplicitServerPort: false,
          hasExplicitDevUrl: false,
          checkPortAvailability: (port) => Effect.succeed(!taken.has(port)),
        });

        assert.deepStrictEqual(offsets, { serverOffset: 1, webOffset: 1 });
      }),
    );

    it.effect("shifts only server offset for dev:server", () =>
      Effect.gen(function* () {
        const taken = new Set([BASE_SERVER_PORT]);
        const offsets = yield* resolveModePortOffsets({
          mode: "dev:server",
          startOffset: 0,
          hasExplicitServerPort: false,
          hasExplicitDevUrl: false,
          checkPortAvailability: (port) => Effect.succeed(!taken.has(port)),
        });

        assert.deepStrictEqual(offsets, { serverOffset: 1, webOffset: 1 });
      }),
    );

    it.effect("respects explicit server port override for dev:server", () =>
      Effect.gen(function* () {
        const offsets = yield* resolveModePortOffsets({
          mode: "dev:server",
          startOffset: 0,
          hasExplicitServerPort: true,
          hasExplicitDevUrl: false,
          checkPortAvailability: () => Effect.succeed(false),
        });

        assert.deepStrictEqual(offsets, { serverOffset: 0, webOffset: 0 });
      }),
    );
  });

  describe("runDevRunnerWithInput", () => {
    it.effect("preserves invalid configuration as the exact cause", () =>
      Effect.gen(function* () {
        const error = yield* runDevRunnerWithInput({ ...devServerInput, dryRun: true }).pipe(
          Effect.provide(
            Layer.merge(
              netServiceLayer,
              ConfigProvider.layer(
                ConfigProvider.fromEnv({ env: { BERNISE_PORT_OFFSET: "not-an-integer" } }),
              ),
            ),
          ),
          Effect.flip,
        );

        if (error._tag !== "DevRunnerConfigurationError") {
          assert.fail(`Unexpected error: ${error._tag}`);
        }
        assert.deepStrictEqual(error.configKeys, ["BERNISE_PORT_OFFSET", "BERNISE_DEV_INSTANCE"]);
        assert.ok(error.cause !== undefined);
      }),
    );

    it.effect("preserves process spawn context and the exact platform cause", () => {
      const cause = PlatformError.systemError({
        _tag: "NotFound",
        module: "ChildProcess",
        method: "spawn",
        description: "vp was not found",
      });
      const spawnerLayer = Layer.succeed(
        ChildProcessSpawner.ChildProcessSpawner,
        ChildProcessSpawner.make(() => Effect.fail(cause)),
      );

      return Effect.gen(function* () {
        const error = yield* runDevRunnerWithInput(devServerInput).pipe(
          Effect.provide(Layer.mergeAll(emptyConfigLayer, netServiceLayer, spawnerLayer)),
          Effect.flip,
        );

        if (error._tag !== "DevRunnerProcessError") {
          assert.fail(`Unexpected error: ${error._tag}`);
        }
        assert.equal(error.operation, "spawn");
        assert.equal(error.mode, "dev:server");
        assert.equal(error.executable, "vp");
        assert.equal(error.argumentCount, getDevRunnerModeArgs("dev:server").length + 2);
        assert.equal(error.shell, false);
        assert.equal(error.cause, cause);
        assert.notInclude(error.message, "secret-token-value");
      });
    });

    it.effect("spawns the desktop stack even with --host", () => {
      let spawnCount = 0;
      const spawnerLayer = Layer.succeed(
        ChildProcessSpawner.ChildProcessSpawner,
        ChildProcessSpawner.make(() => {
          spawnCount += 1;
          return Effect.succeed(mockProcess(0));
        }),
      );

      return Effect.gen(function* () {
        yield* runDevRunnerWithInput({
          ...devServerInput,
          mode: "dev",
          host: "0.0.0.0",
          port: undefined,
        }).pipe(Effect.provide(Layer.mergeAll(emptyConfigLayer, netServiceLayer, spawnerLayer)));

        assert.equal(spawnCount, 1);
      });
    });

    it.effect("spawns nothing when --dry-run", () => {
      let spawnCount = 0;
      const spawnerLayer = Layer.succeed(
        ChildProcessSpawner.ChildProcessSpawner,
        ChildProcessSpawner.make(() => {
          spawnCount += 1;
          return Effect.succeed(mockProcess(0));
        }),
      );

      return Effect.gen(function* () {
        yield* runDevRunnerWithInput({
          ...devServerInput,
          dryRun: true,
        }).pipe(Effect.provide(Layer.mergeAll(emptyConfigLayer, netServiceLayer, spawnerLayer)));

        assert.equal(spawnCount, 0);
      });
    });

    it.effect("reports non-zero exits without manufacturing a cause", () => {
      const spawnerLayer = Layer.succeed(
        ChildProcessSpawner.ChildProcessSpawner,
        ChildProcessSpawner.make(() => Effect.succeed(mockProcess(1))),
      );

      return Effect.gen(function* () {
        const error = yield* runDevRunnerWithInput(devServerInput).pipe(
          Effect.provide(Layer.mergeAll(emptyConfigLayer, netServiceLayer, spawnerLayer)),
          Effect.flip,
        );

        if (error._tag !== "DevRunnerProcessExitError") {
          assert.fail(`Unexpected error: ${error._tag}`);
        }
        assert.equal(error.exitCode, 1);
        assert.equal(error.mode, "dev:server");
      });
    });
  });
});
