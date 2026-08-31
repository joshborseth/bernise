import { cancelVoice, enqueueVoice, revealVoiceNow } from "./engine.ts";
import { emptySpeakable, flushSpeakable, pushSpeakable, type SpeakableState } from "./speakable.ts";
import type { VoiceCue } from "./state.ts";

const skipCode = { skipCode: true } as const;

type Follow = {
  id: string | undefined;
  length: number;
  sanitizer: SpeakableState;
  flushed: string | undefined;
  held: Array<string>;
};

let follow: Follow = {
  id: undefined,
  length: 0,
  sanitizer: emptySpeakable,
  flushed: undefined,
  held: [],
};

let spokenCueId: string | undefined;
let cueLocked = false;
let cueSettled = false;

const emptyFollow = (id: string | undefined): Follow => ({
  id,
  length: 0,
  sanitizer: emptySpeakable,
  flushed: undefined,
  held: [],
});

export const resetVoiceFollow = (): void => {
  spokenCueId = undefined;
  cueLocked = false;
  cueSettled = false;
  follow = emptyFollow(undefined);
};

const speakHeld = (id: string, until: number, extra: ReadonlyArray<string>): void => {
  const sentences = [...follow.held, ...extra].filter((part) => part.length > 0);
  follow = { ...follow, held: [] };
  if (sentences.length === 0) {
    revealVoiceNow({ id, until });
    return;
  }
  enqueueVoice(sentences.join(" "), { reveal: { id, until } });
};

export const followAssistantSpeech = (input: {
  readonly assistantId: string | undefined;
  readonly text: string | undefined;
  readonly pending: boolean;
}): void => {
  if (cueLocked) {
    if (!input.pending) {
      cueSettled = true;
      return;
    }
    if (!cueSettled) {
      return;
    }
    cueLocked = false;
    cueSettled = false;
    cancelVoice();
    follow = emptyFollow(input.assistantId);
  }

  if (input.assistantId !== follow.id) {
    cancelVoice();
    follow = emptyFollow(input.assistantId);
  }

  if (input.assistantId === undefined || input.text === undefined) {
    return;
  }

  if (input.text.length > follow.length) {
    const suffix = input.text.slice(follow.length);
    const next = pushSpeakable(follow.sanitizer, suffix, skipCode);
    follow = {
      ...follow,
      length: input.text.length,
      sanitizer: next.state,
      held: [...follow.held, ...next.sentences],
    };
  }

  if (!input.pending && follow.flushed !== input.assistantId) {
    follow = { ...follow, flushed: input.assistantId };
    const flushed = flushSpeakable(follow.sanitizer, skipCode);
    follow = { ...follow, sanitizer: flushed.state };
    speakHeld(input.assistantId, follow.length, flushed.sentences);
  }
};

export const speakVoiceCue = (cue: VoiceCue | undefined): void => {
  if (cue === undefined || cue.id === spokenCueId) {
    return;
  }
  spokenCueId = cue.id;
  cueLocked = true;
  cueSettled = false;
  follow = {
    id: undefined,
    length: Number.MAX_SAFE_INTEGER,
    sanitizer: emptySpeakable,
    flushed: undefined,
    held: [],
  };
  cancelVoice();
  const pushed = pushSpeakable(emptySpeakable, cue.text, skipCode);
  const flushed = flushSpeakable(pushed.state, skipCode);
  const sentences = [...pushed.sentences, ...flushed.sentences];
  if (sentences.length === 0) {
    return;
  }
  enqueueVoice(sentences.join(" "));
};
