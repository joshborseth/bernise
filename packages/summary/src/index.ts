import { emptySpeakable, flushSpeakable, pushSpeakable, splitForTts } from "@bernise/speakable";

export type PromptIntent = "summarize" | "unknown";

export type ThreadMessage = {
  readonly role: string;
  readonly text: string;
  readonly streaming?: boolean;
};

export type ThreadDetail = {
  readonly id: string;
  readonly title: string;
  readonly hasPendingApprovals?: boolean;
  readonly hasPendingUserInput?: boolean;
  readonly messages: ReadonlyArray<ThreadMessage>;
};

const summarizePattern =
  /\b(summarize|summary|what happened|what's going on|whats going on|catch me up|status|how did (it|that) go)\b/i;

export const classifyPrompt = (text: string): PromptIntent =>
  summarizePattern.test(text.trim()) ? "summarize" : "unknown";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asString = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const parseMessage = (value: unknown): ThreadMessage | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const text = asString(value.text) ?? asString(value.content);
  if (text === undefined) {
    return undefined;
  }
  const message: ThreadMessage = {
    role: asString(value.role) ?? "assistant",
    text,
    ...(value.streaming === true ? { streaming: true } : {}),
  };
  return message;
};

export const parseThreadDetail = (value: unknown): ThreadDetail | undefined => {
  const root = isRecord(value) ? value : undefined;
  const thread = root !== undefined && isRecord(root.thread) ? root.thread : root;
  if (thread === undefined) {
    return undefined;
  }
  const id = asString(thread.id) ?? asString(thread.threadId);
  if (id === undefined) {
    return undefined;
  }
  const rawMessages = Array.isArray(thread.messages) ? thread.messages : [];
  const messages: Array<ThreadMessage> = [];
  for (const item of rawMessages) {
    const message = parseMessage(item);
    if (message !== undefined) {
      messages.push(message);
    }
  }
  return {
    id,
    title: asString(thread.title) ?? "untitled thread",
    ...(thread.hasPendingApprovals === true ? { hasPendingApprovals: true } : {}),
    ...(thread.hasPendingUserInput === true ? { hasPendingUserInput: true } : {}),
    messages,
  };
};

const speakableBrief = (text: string): string => {
  const pushed = pushSpeakable(emptySpeakable, text, { skipCode: true });
  const flushed = flushSpeakable(pushed.state, { skipCode: true });
  const sentences = [...pushed.sentences, ...flushed.sentences];
  const clipped = sentences.slice(0, 4).join(" ").trim();
  const parts = splitForTts(clipped.length > 0 ? clipped : "Nothing to read.");
  return parts[0] ?? "Nothing to read.";
};

export const summarizeThread = (detail: ThreadDetail): string => {
  const pending = detail.hasPendingApprovals
    ? "It needs approval."
    : detail.hasPendingUserInput
      ? "It is waiting on you."
      : undefined;
  let lastAssistant: string | undefined;
  for (let index = detail.messages.length - 1; index >= 0; index -= 1) {
    const message = detail.messages[index];
    if (message !== undefined && message.role === "assistant" && message.streaming !== true) {
      lastAssistant = message.text;
      break;
    }
  }
  const body = lastAssistant === undefined ? "No assistant reply yet." : speakableBrief(lastAssistant);
  return [detail.title, pending, body].filter((part) => part !== undefined && part.length > 0).join(" ");
};
