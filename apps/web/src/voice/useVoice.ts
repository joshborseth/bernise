import { useAtom, useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/unstable/reactivity";
import { useEffect } from "react";
import { chatAtom, speakAtom } from "../chat.ts";
import { audioContext } from "../mascot/audio/context.ts";
import { setVoiceListeners } from "./engine.ts";
import { followAssistantSpeech, speakVoiceCue } from "./follow.ts";
import { speakingAtom, voiceCueAtom } from "./state.ts";

export const useBerniseVoice = (): void => {
  const chat = useAtomValue(chatAtom);
  const speakResult = useAtomValue(speakAtom);
  const pending = AsyncResult.isWaiting(speakResult);
  const voiceCue = useAtomValue(voiceCueAtom);
  const [, setSpeaking] = useAtom(speakingAtom);

  useEffect(() => {
    setVoiceListeners({
      onBusy: (value) => {
        setSpeaking(value);
      },
    });
    return () => {
      setVoiceListeners({});
    };
  }, [setSpeaking]);

  const assistant =
    chat.assistantId === undefined
      ? undefined
      : chat.messages.find(
          (message) => message.id === chat.assistantId && message.from === "assistant",
        );

  useEffect(() => {
    if (pending) {
      void audioContext().resume();
    }
    followAssistantSpeech({
      assistantId: chat.assistantId,
      text: assistant?.from === "assistant" ? assistant.text : undefined,
      pending,
    });
    speakVoiceCue(voiceCue);
  }, [assistant, chat.assistantId, pending, voiceCue]);
};
