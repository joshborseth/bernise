import { defaultHarnessSettings, HarnessSettings, ProviderSnapshots } from "@bernise/contracts";
import { ConfigProvider, Layer } from "effect";
import { CodexProviderLive } from "../src/CodexProviderLive.ts";
import { pendingSnapshot } from "../src/ProviderHealth.ts";
import { serverSettingsMemory } from "../src/ServerSettings.ts";

export const testConfig = (env: Record<string, string>) =>
  ConfigProvider.layer(ConfigProvider.fromUnknown(env));

export const codexDriverLayer = (
  bin: string,
  workspace: string,
  settings: HarnessSettings = defaultHarnessSettings,
) =>
  CodexProviderLive.pipe(
    Layer.provide(serverSettingsMemory(settings)),
    Layer.provide(testConfig({ BERNISE_CODEX_BIN: bin, BERNISE_WORKSPACE: workspace })),
  );

export const pendingSnapshots = () =>
  new ProviderSnapshots({
    codex: pendingSnapshot(true, "pending"),
  });
