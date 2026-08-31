import { Schema } from "effect";

export const ThreadId = Schema.String.pipe(Schema.brand("ThreadId"));
export type ThreadId = typeof ThreadId.Type;

export const MessageId = Schema.String.pipe(Schema.brand("MessageId"));
export type MessageId = typeof MessageId.Type;

export const CommandId = Schema.String.pipe(Schema.brand("CommandId"));
export type CommandId = typeof CommandId.Type;

export const ThreadMessageRole = Schema.Literals(["user", "assistant"]);
export type ThreadMessageRole = typeof ThreadMessageRole.Type;

export const defaultThreadTitle = "New thread";

const titleLimit = 40;

export const titleFromPrompt = (text: string): string => {
  const collapsed = text.trim().replace(/\s+/g, " ");
  if (collapsed.length === 0) {
    return defaultThreadTitle;
  }
  if (collapsed.length <= titleLimit) {
    return collapsed;
  }
  return `${collapsed.slice(0, titleLimit - 1).trimEnd()}…`;
};

export class ThreadMessage extends Schema.Class<ThreadMessage>("ThreadMessage")({
  id: MessageId,
  role: ThreadMessageRole,
  text: Schema.String,
  createdAt: Schema.String,
}) {}

export class ThreadShell extends Schema.Class<ThreadShell>("ThreadShell")({
  id: ThreadId,
  title: Schema.String,
  createdAt: Schema.String,
  updatedAt: Schema.String,
}) {}

export class ThreadList extends Schema.Class<ThreadList>("ThreadList")({
  threads: Schema.Array(ThreadShell),
}) {}

export class ThreadSnapshot extends Schema.Class<ThreadSnapshot>("ThreadSnapshot")({
  threadId: ThreadId,
  messages: Schema.Array(ThreadMessage),
}) {}

export class ThreadDeleted extends Schema.Class<ThreadDeleted>("ThreadDeleted")({
  threadId: ThreadId,
}) {}

export class PersistenceError extends Schema.TaggedError<PersistenceError>()("PersistenceError", {
  message: Schema.String,
}) {}
