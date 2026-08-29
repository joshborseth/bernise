import { AsyncResult } from "effect/unstable/reactivity";
import { useAtom, useAtomValue } from "@effect/atom-react";
import { useCallback, useEffect, useRef } from "react";
import { chatAtom, speakAtom } from "../chat.ts";
import { settingsAtom } from "../settings.ts";
import { cancelVoice, flushVoice, pushVoice, setVoiceListeners, warmupVoice } from "./engine.ts";
import { emptySpeakable, flushSpeakable, pushSpeakable, type SpeakableState } from "./speakable.ts";
import { speakingAtom, voiceStatusAtom } from "./state.ts";

export const useBerniseVoice = (): { readonly skip: () => void } => {
  const chat = useAtomValue(chatAtom);
  const settings = useAtomValue(settingsAtom);
  const speakResult = useAtomValue(speakAtom);
  const pending = AsyncResult.isWaiting(speakResult);
  const [, setSpeaking] = useAtom(speakingAtom);
  const [, setStatus] = useAtom(voiceStatusAtom);

  const sanitizerRef = useRef<SpeakableState>(emptySpeakable);
  const seenRef = useRef<{ id: string | undefined; length: number }>({
    id: undefined,
    length: 0,
  });
  const skippedRef = useRef<string | undefined>(undefined);
  const flushedRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    setVoiceListeners({
      onSpeaking: (value) => {
        setSpeaking(value);
      },
      onStatus: (value) => {
        setStatus(value);
      },
    });
    return () => {
      setVoiceListeners({});
    };
  }, [setSpeaking, setStatus]);

  useEffect(() => {
    if (!settings.voice.enabled) {
      cancelVoice();
      return;
    }
    void warmupVoice();
  }, [settings.voice.enabled]);

  const assistant =
    chat.assistantId === undefined
      ? undefined
      : chat.messages.find(
          (message) => message.id === chat.assistantId && message.from === "assistant",
        );

  useEffect(() => {
    if (!settings.voice.enabled) {
      sanitizerRef.current = emptySpeakable;
      seenRef.current = { id: chat.assistantId, length: 0 };
      return;
    }

    if (chat.assistantId !== seenRef.current.id) {
      cancelVoice();
      sanitizerRef.current = emptySpeakable;
      seenRef.current = { id: chat.assistantId, length: 0 };
      skippedRef.current = undefined;
      flushedRef.current = undefined;
    }

    if (
      chat.assistantId === undefined ||
      assistant === undefined ||
      assistant.from !== "assistant"
    ) {
      return;
    }

    if (skippedRef.current === chat.assistantId) {
      return;
    }

    const options = { skipCode: settings.voice.skipCode };
    if (assistant.text.length > seenRef.current.length) {
      const suffix = assistant.text.slice(seenRef.current.length);
      seenRef.current = { id: chat.assistantId, length: assistant.text.length };
      const next = pushSpeakable(sanitizerRef.current, suffix, options);
      sanitizerRef.current = next.state;
      for (const sentence of next.sentences) {
        void pushVoice(sentence, settings.voice.voiceId);
      }
    }

    if (!pending && flushedRef.current !== chat.assistantId) {
      flushedRef.current = chat.assistantId;
      const flushed = flushSpeakable(sanitizerRef.current, options);
      sanitizerRef.current = flushed.state;
      for (const sentence of flushed.sentences) {
        void pushVoice(sentence, settings.voice.voiceId);
      }
      flushVoice();
    }
  }, [
    assistant,
    chat.assistantId,
    pending,
    settings.voice.enabled,
    settings.voice.skipCode,
    settings.voice.voiceId,
  ]);

  const skip = useCallback(() => {
    skippedRef.current = seenRef.current.id;
    cancelVoice();
  }, []);

  return { skip };
};
