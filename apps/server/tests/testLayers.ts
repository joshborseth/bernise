import { defaultHarnessSettings, HarnessSettings, ProviderSnapshots } from "@bernise/contracts";
import { ConfigProvider, Layer } from "effect";
import { CodexProviderLive } from "../src/CodexProviderLive.ts";
import { CursorProviderLive } from "../src/CursorProviderLive.ts";
import { pendingSnapshot, ProviderHealthLive } from "../src/ProviderHealth.ts";
import { ProviderRouterLive } from "../src/ProviderRouterLive.ts";
import { serverSettingsMemory } from "../src/ServerSettings.ts";

export const testConfig = (env: Record<string, string>) =>
  ConfigProvider.layer(ConfigProvider.fromUnknown(env));

export const cursorDriverLayer = (
  bin: string,
  workspace: string,
  settings: HarnessSettings = defaultHarnessSettings,
) =>
  CursorProviderLive.pipe(
    Layer.provide(serverSettingsMemory(settings)),
    Layer.provide(testConfig({ BERNISE_CURSOR_BIN: bin, BERNISE_WORKSPACE: workspace })),
  );

export const codexDriverLayer = (
  bin: string,
  workspace: string,
  settings: HarnessSettings = defaultHarnessSettings,
) =>
  CodexProviderLive.pipe(
    Layer.provide(serverSettingsMemory(settings)),
    Layer.provide(testConfig({ BERNISE_CODEX_BIN: bin, BERNISE_WORKSPACE: workspace })),
  );

export const harnessMemoryLayer = (input: {
  readonly cursorBin: string;
  readonly codexBin: string;
  readonly workspace: string;
  readonly settings?: HarnessSettings;
  readonly stateDir: string;
}) =>
  ProviderRouterLive.pipe(
    Layer.provideMerge(CursorProviderLive),
    Layer.provideMerge(CodexProviderLive),
    Layer.provideMerge(ProviderHealthLive),
    Layer.provideMerge(serverSettingsMemory(input.settings ?? defaultHarnessSettings)),
    Layer.provide(
      testConfig({
        BERNISE_CURSOR_BIN: input.cursorBin,
        BERNISE_CODEX_BIN: input.codexBin,
        BERNISE_WORKSPACE: input.workspace,
        BERNISE_STATE_DIR: input.stateDir,
      }),
    ),
  );

export const pendingSnapshots = () =>
  new ProviderSnapshots({
    cursor: pendingSnapshot("cursor", true, "pending"),
    codex: pendingSnapshot("codex", true, "pending"),
  });
