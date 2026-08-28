import {
  CodexSettingsPatch,
  CursorSettingsPatch,
  defaultHarnessSettings,
  type HarnessSettings,
  type ProviderKind,
  ProviderSnapshot,
  ProviderSnapshots,
} from "@bernise/contracts";
import { Effect } from "effect";
import { Atom } from "effect/unstable/reactivity";
import { chatAtom, resetSession, sessionEpochAtom } from "./chat.ts";
import { BerniseRpc } from "./rpc.ts";

const emptySnapshots = new ProviderSnapshots({
  cursor: new ProviderSnapshot({
    kind: "cursor",
    enabled: true,
    installed: false,
    version: null,
    status: "warning",
    auth: "unknown",
    message: "Cursor provider status has not been checked in this session yet.",
    checkedAt: "",
  }),
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

const applySettings = (get: Atom.FnContext, next: HarnessSettings) => {
  const previous = get.registry.get(settingsAtom);
  get.set(settingsAtom, next);
  if (next.activeProvider !== previous.activeProvider) {
    get.set(sessionEpochAtom, get.registry.get(sessionEpochAtom) + 1);
    get.set(chatAtom, resetSession(get.registry.get(chatAtom), next.activeProvider));
  }
};

export const bootSettingsAtom = BerniseRpc.runtime
  .atom((get) =>
    Effect.gen(function* () {
      const client = yield* BerniseRpc;
      const settings = yield* client("GetSettings", undefined);
      get.set(settingsAtom, settings);
      get.set(chatAtom, { ...get.once(chatAtom), activeProvider: settings.activeProvider });
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
  readonly activeProvider?: ProviderKind;
  readonly cursor?: CursorSettingsPatch;
  readonly codex?: CodexSettingsPatch;
};

export const updateSettingsAtom = BerniseRpc.runtime.fn((patch: SettingsPatch, get) =>
  Effect.gen(function* () {
    const client = yield* BerniseRpc;
    const next = yield* client("UpdateSettings", patch);
    applySettings(get, next);
    return next;
  }),
);

export const selectProviderAtom = BerniseRpc.runtime.fn((kind: ProviderKind, get) =>
  Effect.gen(function* () {
    if (get.registry.get(settingsAtom).activeProvider === kind) {
      return;
    }
    const client = yield* BerniseRpc;
    const next = yield* client("UpdateSettings", { activeProvider: kind });
    applySettings(get, next);
  }),
);
