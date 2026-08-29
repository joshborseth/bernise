import {
  defaultHarnessSettings,
  HarnessSettingsPatch,
  mergeHarnessSettings,
} from "@bernise/contracts";
import { describe, expect, it } from "@effect/vitest";
import { ConfigProvider, Effect } from "effect";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ServerSettings, ServerSettingsLive } from "../src/ServerSettings.ts";

describe("mergeHarnessSettings", () => {
  it("trims Codex paths", () => {
    const next = mergeHarnessSettings(
      defaultHarnessSettings,
      new HarnessSettingsPatch({
        codex: { binaryPath: " /opt/bin/codex ", homePath: " ~/.codex " },
      }),
    );
    expect(next.codex.binaryPath).toBe("/opt/bin/codex");
    expect(next.codex.homePath).toBe("~/.codex");
    expect(next.codex.model).toBe("");
  });

  it("trims and keeps a selected Codex model", () => {
    const next = mergeHarnessSettings(
      defaultHarnessSettings,
      new HarnessSettingsPatch({
        codex: { model: " gpt-5.4-mini " },
      }),
    );
    expect(next.codex.model).toBe("gpt-5.4-mini");
  });
});

describe("ServerSettingsLive", () => {
  it.effect("persists trimmed settings to disk", () => {
    const stateDir = mkdtempSync(join(tmpdir(), "bernise-settings-"));
    return Effect.gen(function* () {
      const settings = yield* ServerSettings;
      expect(yield* settings.get).toEqual(defaultHarnessSettings);
      const next = yield* settings.update(
        new HarnessSettingsPatch({
          codex: { binaryPath: " /usr/local/bin/codex ", homePath: " ~/.codex " },
        }),
      );
      expect(next.codex.binaryPath).toBe("/usr/local/bin/codex");
      expect(next.codex.homePath).toBe("~/.codex");
      const written = JSON.parse(readFileSync(join(stateDir, "settings.json"), "utf8")) as {
        readonly codex: { readonly binaryPath: string };
      };
      expect(written.codex.binaryPath).toBe("/usr/local/bin/codex");
    }).pipe(
      Effect.provide(ServerSettingsLive),
      Effect.provide(
        ConfigProvider.layer(ConfigProvider.fromUnknown({ BERNISE_STATE_DIR: stateDir })),
      ),
    );
  });

  it.effect("decodes settings files that predate the model field", () => {
    const stateDir = mkdtempSync(join(tmpdir(), "bernise-settings-legacy-"));
    writeFileSync(
      join(stateDir, "settings.json"),
      `${JSON.stringify({
        codex: { enabled: true, binaryPath: "/opt/codex", homePath: "~/.codex" },
      })}\n`,
    );
    return Effect.gen(function* () {
      const settings = yield* ServerSettings;
      const loaded = yield* settings.get;
      expect(loaded.codex.binaryPath).toBe("/opt/codex");
      expect(loaded.codex.homePath).toBe("~/.codex");
      expect(loaded.codex.model).toBe("");
    }).pipe(
      Effect.provide(ServerSettingsLive),
      Effect.provide(
        ConfigProvider.layer(ConfigProvider.fromUnknown({ BERNISE_STATE_DIR: stateDir })),
      ),
    );
  });
});
