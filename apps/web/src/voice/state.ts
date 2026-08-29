import { Atom } from "effect/unstable/reactivity";

export type VoiceStatus = "idle" | "loading" | "ready" | "error";

export const speakingAtom = Atom.make(false).pipe(Atom.keepAlive);

export const voiceStatusAtom = Atom.make<VoiceStatus>("idle").pipe(Atom.keepAlive);
