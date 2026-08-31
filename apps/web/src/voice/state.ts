import { Atom } from "effect/unstable/reactivity";

export const speakingAtom = Atom.make(false).pipe(Atom.keepAlive);

export const codexOfflineSpoken =
  "Oh No! It looks like I cant connect to my AI service right now. [groan]. Try Again Later? [sigh]";

export type VoiceCue = {
  readonly id: string;
  readonly text: string;
};

export const voiceCueAtom = Atom.make<VoiceCue | undefined>(undefined).pipe(Atom.keepAlive);
