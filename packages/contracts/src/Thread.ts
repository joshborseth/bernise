import { Schema } from "effect";

export const ThreadId = Schema.String.pipe(Schema.brand("ThreadId"));
export type ThreadId = typeof ThreadId.Type;

export const MessageId = Schema.String.pipe(Schema.brand("MessageId"));
export type MessageId = typeof MessageId.Type;

export const CommandId = Schema.String.pipe(Schema.brand("CommandId"));
export type CommandId = typeof CommandId.Type;

export const ThreadMessageRole = Schema.Literals(["user", "assistant"]);
export type ThreadMessageRole = typeof ThreadMessageRole.Type;

export class ThreadMessage extends Schema.Class<ThreadMessage>("ThreadMessage")({
  id: MessageId,
  role: ThreadMessageRole,
  text: Schema.String,
  createdAt: Schema.String,
}) {}

export class ThreadSnapshot extends Schema.Class<ThreadSnapshot>("ThreadSnapshot")({
  threadId: Schema.NullOr(ThreadId),
  messages: Schema.Array(ThreadMessage),
}) {}

export class PersistenceError extends Schema.TaggedError<PersistenceError>()("PersistenceError", {
  message: Schema.String,
}) {}
