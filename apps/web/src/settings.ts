import {
  CodexSettingsPatch,
  defaultHarnessSettings,
  ProviderSnapshot,
  ProviderSnapshots,
} from "@bernise/contracts";
import { Effect } from "effect";
import { Atom } from "effect/unstable/reactivity";
import { BerniseRpc } from "./rpc.ts";

const emptySnapshots = new ProviderSnapshots({
  codex: new ProviderSnapshot({
    kind: "codex",
    enabled: true,
    installed: false,
    version: null,
    status: "warning",
    auth: "unknown",
    message: "Codex provider status has not been checked in this session yet.",
    checkedAt: "",
  }),
});

export const settingsAtom = Atom.make(defaultHarnessSettings).pipe(Atom.keepAlive);
export const snapshotsAtom = Atom.make(emptySnapshots).pipe(Atom.keepAlive);
export const settingsBusyAtom = Atom.make(false);

export const bootSettingsAtom = BerniseRpc.runtime
  .atom((get) =>
    Effect.gen(function* () {
      const client = yield* BerniseRpc;
      const settings = yield* client("GetSettings", undefined);
      get.set(settingsAtom, settings);
      const snapshots = yield* client("GetProviderSnapshots", undefined);
      get.set(snapshotsAtom, snapshots);
    }),
  )
  .pipe(Atom.keepAlive);

export const refreshProvidersAtom = BerniseRpc.runtime.fn((_: void, get) =>
  Effect.gen(function* () {
    get.set(settingsBusyAtom, true);
    const client = yield* BerniseRpc;
    const snapshots = yield* client("RefreshProviders", undefined);
    get.set(snapshotsAtom, snapshots);
  }).pipe(Effect.ensuring(Effect.sync(() => get.set(settingsBusyAtom, false)))),
);

export type SettingsPatch = {
  readonly codex?: CodexSettingsPatch;
};

export const updateSettingsAtom = BerniseRpc.runtime.fn((patch: SettingsPatch, get) =>
  Effect.gen(function* () {
    const client = yield* BerniseRpc;
    const next = yield* client("UpdateSettings", patch);
    get.set(settingsAtom, next);
    return next;
  }),
);
