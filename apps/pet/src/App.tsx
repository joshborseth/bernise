import { useEffect, useMemo, useState } from "react";
import {
  getHostState,
  installHost,
  nativeAvailable,
  onAddressedPrompt,
  pushShellJson,
  requestAction,
  resetAttention,
  setHostState,
  subscribeHost,
  type HostState,
} from "./host.ts";
import { useListen } from "./listen/useListen.ts";
import { BerniseMascot, deriveBerniseMood } from "./mascot/index.ts";

const fixtureRunning = JSON.stringify({
  threads: [{ id: "demo", title: "Demo thread", session: { status: "running" } }],
});
const fixtureNeedsYou = JSON.stringify({
  threads: [
    {
      id: "demo",
      title: "Demo thread",
      hasPendingApprovals: true,
      session: { status: "idle" },
    },
  ],
});
const fixtureSettled = JSON.stringify({
  threads: [{ id: "demo", title: "Demo thread", session: { status: "ready" } }],
});
const fixtureTwoBusy = JSON.stringify({
  threads: [
    { id: "a", title: "One", session: { status: "running" } },
    { id: "b", title: "Two", session: { status: "running" } },
  ],
});
const fixtureTwoSettled = JSON.stringify({
  threads: [
    { id: "a", title: "One", session: { status: "idle" } },
    { id: "b", title: "Two", session: { status: "idle" } },
  ],
});

export function App() {
  const [host, setHost] = useState<HostState>(getHostState);
  const [events, setEvents] = useState<string>("");
  const native = nativeAvailable();

  useEffect(() => {
    installHost();
    return subscribeHost(setHost);
  }, []);

  const listen = useListen({
    busy: host.mood === "speaking" || host.mood === "thinking",
    speak: onAddressedPrompt,
    muted: host.muted,
  });

  const mood = useMemo(
    () =>
      host.connected
        ? deriveBerniseMood({
            composerFocused: false,
            pending: host.mood === "thinking",
            voicing: host.mood === "speaking",
            speechActive: listen.speechActive,
            addressed: listen.addressed,
          })
        : "idle",
    [host.connected, host.mood, listen.addressed, listen.speechActive],
  );

  return (
    <div
      className={[
        "pet",
        host.connected ? "" : "pet-disconnected",
        host.perch === "none" ? "" : `pet-perch pet-perch-${host.perch}`,
      ]
        .filter((value) => value.length > 0)
        .join(" ")}
    >
      <BerniseMascot mood={mood} speakKey={host.speakKey} perch={host.perch} />
      {host.connected || host.perch !== "none" ? null : (
        <p className="pet-status">t3code is away</p>
      )}
      {native ? null : (
        <aside className="pet-fixture" aria-label="Pet fixtures">
          <p>Browser pet. Overlay uses the same cat.</p>
          <button type="button" onClick={() => setHostState({ connected: true, mood: "idle" })}>
            Connect
          </button>
          <button type="button" onClick={() => setHostState({ connected: false, mood: "idle" })}>
            Disconnect
          </button>
          <button
            type="button"
            onClick={() => {
              resetAttention();
              pushShellJson(fixtureRunning);
              setEvents(pushShellJson(fixtureNeedsYou));
              setHostState({ connected: true, mood: "listening" });
            }}
          >
            Needs you
          </button>
          <button
            type="button"
            onClick={() => {
              resetAttention();
              pushShellJson(fixtureRunning);
              setEvents(pushShellJson(fixtureSettled));
              setHostState({ connected: true, mood: "speaking", speakKey: "settled" });
            }}
          >
            Settled
          </button>
          <button
            type="button"
            onClick={() => {
              resetAttention();
              pushShellJson(fixtureTwoBusy);
              setEvents(pushShellJson(fixtureTwoSettled));
            }}
          >
            Two settled
          </button>
          <button type="button" onClick={() => setHostState({ muted: !host.muted })}>
            {host.muted ? "Unmute mic" : "Mute mic"}
          </button>
          <button type="button" onClick={() => requestAction("litter")}>
            Litter box
          </button>
          <button type="button" onClick={() => requestAction("sleep")}>
            Sleep
          </button>
          <button type="button" onClick={() => requestAction("wake")}>
            Wake
          </button>
          <button type="button" onClick={() => setHostState({ perch: "left" })}>
            Peek left
          </button>
          <button type="button" onClick={() => setHostState({ perch: "right" })}>
            Peek right
          </button>
          <button type="button" onClick={() => setHostState({ perch: "top" })}>
            Peek top
          </button>
          <button type="button" onClick={() => setHostState({ perch: "bottom" })}>
            Peek bottom
          </button>
          <button type="button" onClick={() => setHostState({ perch: "none" })}>
            Unperch
          </button>
          {events.length > 0 ? <pre>{events}</pre> : null}
        </aside>
      )}
    </div>
  );
}
