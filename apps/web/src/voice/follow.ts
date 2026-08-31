import { cancelVoice, enqueueVoice } from "./engine.ts";
import { emptySpeakable, flushSpeakable, pushSpeakable, type SpeakableState } from "./speakable.ts";
import type { VoiceCue } from "./state.ts";

const skipCode = { skipCode: true } as const;

type Follow = {
  id: string | undefined;
  length: number;
  sanitizer: SpeakableState;
  flushed: string | undefined;
};

let follow: Follow = {
  id: undefined,
  length: 0,
  sanitizer: emptySpeakable,
  flushed: undefined,
};

let spokenCueId: string | undefined;
let cueLocked = false;
let cueSettled = false;

export const resetVoiceFollow = (): void => {
  spokenCueId = undefined;
  cueLocked = false;
  cueSettled = false;
  follow = {
    id: undefined,
    length: 0,
    sanitizer: emptySpeakable,
    flushed: undefined,
  };
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
    follow = {
      id: input.assistantId,
      length: 0,
      sanitizer: emptySpeakable,
      flushed: undefined,
    };
  }

  if (input.assistantId !== follow.id) {
    cancelVoice();
    follow = {
      id: input.assistantId,
      length: 0,
      sanitizer: emptySpeakable,
      flushed: undefined,
    };
  }

  if (input.assistantId === undefined || input.text === undefined) {
    return;
  }

  if (input.text.length > follow.length) {
    const suffix = input.text.slice(follow.length);
    follow = { ...follow, length: input.text.length };
    const next = pushSpeakable(follow.sanitizer, suffix, skipCode);
    follow = { ...follow, sanitizer: next.state };
    for (const sentence of next.sentences) {
      enqueueVoice(sentence);
    }
  }

  if (!input.pending && follow.flushed !== input.assistantId) {
    follow = { ...follow, flushed: input.assistantId };
    const flushed = flushSpeakable(follow.sanitizer, skipCode);
    follow = { ...follow, sanitizer: flushed.state };
    for (const sentence of flushed.sentences) {
      enqueueVoice(sentence);
    }
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
  };
  cancelVoice();
  const pushed = pushSpeakable(emptySpeakable, cue.text, skipCode);
  const flushed = flushSpeakable(pushed.state, skipCode);
  for (const sentence of [...pushed.sentences, ...flushed.sentences]) {
    enqueueVoice(sentence);
  }
};
