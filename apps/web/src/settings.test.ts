import {
  CodexSettings,
  HarnessSettings,
  WorkspaceInfo,
  defaultCodexSettings,
} from "@bernise/contracts";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { Atom, AtomRegistry, AsyncResult } from "effect/unstable/reactivity";
import { BerniseRpc } from "./rpc.ts";
import { bootSettingsAtom, settingsAtom, updateSettingsAtom } from "./settings.ts";

const customPersona = "You are a test cat.\n";

const storedSettings = new HarnessSettings({
  codex: new CodexSettings({
    enabled: true,
    binaryPath: "",
    homePath: "",
    model: "gpt-5.6-luna",
  }),
  persona: "You are Bernise from disk.\n",
});

const isSettled = (value: AsyncResult.AsyncResult<unknown, unknown>): boolean =>
  !AsyncResult.isWaiting(value) && value._tag !== "Initial";

const waitUntilSettled = async (
  registry: AtomRegistry.AtomRegistry,
  atom: Atom.Atom<AsyncResult.AsyncResult<unknown, unknown>>,
) => {
  if (isSettled(registry.get(atom))) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cancel();
      reject(new Error("atom did not settle"));
    }, 2000);
    const cancel = registry.subscribe(atom, (value) => {
      if (isSettled(value)) {
        clearTimeout(timeout);
        cancel();
        resolve();
      }
    });
    if (isSettled(registry.get(atom))) {
      clearTimeout(timeout);
      cancel();
      resolve();
    }
  });
};

describe("settings atoms", () => {
  it("keeps a saved persona when a late GetSettings would overwrite it", async () => {
    let releaseGet: (() => void) | undefined;
    const getGate = new Promise<void>((resolve) => {
      releaseGet = resolve;
    });
    const fakeClient = ((tag: string, payload: unknown) => {
      switch (tag) {
        case "GetSettings":
          return Effect.promise(() => getGate).pipe(Effect.as(storedSettings));
        case "GetWorkspace":
          return Effect.succeed(new WorkspaceInfo({ path: "/tmp/bernise", name: "bernise" }));
        case "UpdateSettings":
          return Effect.succeed(
            new HarnessSettings({
              codex: storedSettings.codex,
              persona:
                payload !== null &&
                typeof payload === "object" &&
                "persona" in payload &&
                typeof payload.persona === "string"
                  ? payload.persona
                  : storedSettings.persona,
            }),
          );
        default:
          return Effect.die(`unexpected ${tag}`);
      }
    }) as never;

    const registry = AtomRegistry.make({
      initialValues: [
        Atom.initialValue(BerniseRpc.runtime.layer, Layer.succeed(BerniseRpc, fakeClient)),
        Atom.initialValue(
          settingsAtom,
          new HarnessSettings({
            codex: defaultCodexSettings,
            persona: "",
          }),
        ),
      ],
    });
    registry.mount(bootSettingsAtom);
    registry.mount(updateSettingsAtom);
    registry.set(updateSettingsAtom, { persona: customPersona });
    await waitUntilSettled(registry, updateSettingsAtom);

    expect(registry.get(settingsAtom).persona).toBe(customPersona);

    releaseGet?.();
    await waitUntilSettled(registry, bootSettingsAtom);

    expect(registry.get(settingsAtom).persona).toBe(customPersona);
  });
});
