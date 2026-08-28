import { defaultHarnessSettings, HarnessSettingsPatch } from "@bernise/contracts";
import { describe, expect, it } from "@effect/vitest";
import { ConfigProvider, Effect } from "effect";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ServerSettings, ServerSettingsLive } from "../src/ServerSettings.ts";

describe("ServerSettingsLive", () => {
  it.effect("persists trimmed settings to disk", () => {
    const stateDir = mkdtempSync(join(tmpdir(), "bernise-settings-"));
    return Effect.gen(function* () {
      const settings = yield* ServerSettings;
      expect(yield* settings.get).toEqual(defaultHarnessSettings);
      const next = yield* settings.update(
        new HarnessSettingsPatch({
          activeProvider: "codex",
          codex: { binaryPath: " /usr/local/bin/codex ", homePath: " ~/.codex " },
        }),
      );
      expect(next.activeProvider).toBe("codex");
      expect(next.codex.binaryPath).toBe("/usr/local/bin/codex");
      expect(next.codex.homePath).toBe("~/.codex");
      const written = JSON.parse(readFileSync(join(stateDir, "settings.json"), "utf8")) as {
        readonly activeProvider: string;
        readonly codex: { readonly binaryPath: string };
      };
      expect(written.activeProvider).toBe("codex");
      expect(written.codex.binaryPath).toBe("/usr/local/bin/codex");
    }).pipe(
      Effect.provide(ServerSettingsLive),
      Effect.provide(
        ConfigProvider.layer(ConfigProvider.fromUnknown({ BERNISE_STATE_DIR: stateDir })),
      ),
    );
  });
});
