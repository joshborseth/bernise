import {
  CommandId,
  MessageId,
  PersistenceError,
  ThreadId,
  ThreadMessage,
  ThreadSnapshot,
  type ThreadMessageRole,
} from "@bernise/contracts";
import { Effect, Layer, Option, Schema } from "effect";
import * as Context from "effect/Context";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";

export type ThreadPersistenceApi = {
  readonly getThread: Effect.Effect<ThreadSnapshot, PersistenceError>;
  readonly appendUser: (text: string) => Effect.Effect<void, PersistenceError>;
  readonly appendAssistant: (text: string) => Effect.Effect<void, PersistenceError>;
};

export class ThreadPersistence extends Context.Service<ThreadPersistence, ThreadPersistenceApi>()(
  "@bernise/ThreadPersistence",
) {}

const ThreadRow = Schema.Struct({
  threadId: ThreadId,
});

const MessageRow = Schema.Struct({
  messageId: MessageId,
  role: Schema.Literals(["user", "assistant"]),
  text: Schema.String,
  createdAt: Schema.String,
});

const VersionRow = Schema.Struct({
  streamVersion: Schema.Finite,
});

const SequenceRow = Schema.Struct({
  sequence: Schema.Finite,
});

const toPersistenceError = (operation: string, cause: unknown): PersistenceError => {
  if (cause instanceof PersistenceError) {
    return cause;
  }
  if (Schema.isSchemaError(cause)) {
    return new PersistenceError({
      message: `${operation}: ${cause.message.replace(/\s+/g, " ").trim()}`,
    });
  }
  if (cause instanceof Error && cause.message.length > 0) {
    return new PersistenceError({ message: `${operation}: ${cause.message}` });
  }
  return new PersistenceError({ message: `${operation}: ${String(cause)}` });
};

const encodePayload = (payload: unknown): string => JSON.stringify(payload);

export const makeThreadPersistence = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const listThreadIds = SqlSchema.findAll({
    Request: Schema.Void,
    Result: ThreadRow,
    execute: () =>
      sql`
        SELECT thread_id AS "threadId"
        FROM projection_threads
        ORDER BY created_at ASC, thread_id ASC
      `,
  });

  const listMessages = SqlSchema.findAll({
    Request: ThreadRow,
    Result: MessageRow,
    execute: ({ threadId }) =>
      sql`
        SELECT
          message_id AS "messageId",
          role,
          text,
          created_at AS "createdAt"
        FROM projection_thread_messages
        WHERE thread_id = ${threadId}
        ORDER BY position ASC, message_id ASC
      `,
  });

  const readStreamVersion = SqlSchema.findOneOption({
    Request: Schema.Struct({
      aggregateKind: Schema.String,
      streamId: Schema.String,
    }),
    Result: VersionRow,
    execute: ({ aggregateKind, streamId }) =>
      sql`
        SELECT COALESCE(MAX(stream_version), 0) AS "streamVersion"
        FROM orchestration_events
        WHERE aggregate_kind = ${aggregateKind} AND stream_id = ${streamId}
      `,
  });

  const readSequence = SqlSchema.findOneOption({
    Request: Schema.Struct({ eventId: Schema.String }),
    Result: SequenceRow,
    execute: ({ eventId }) =>
      sql`
        SELECT sequence
        FROM orchestration_events
        WHERE event_id = ${eventId}
      `,
  });

  const insertEvent = SqlSchema.void({
    Request: Schema.Struct({
      eventId: Schema.String,
      aggregateKind: Schema.String,
      streamId: Schema.String,
      streamVersion: Schema.Finite,
      eventType: Schema.String,
      occurredAt: Schema.String,
      commandId: Schema.String,
      actorKind: Schema.String,
      payloadJson: Schema.String,
      metadataJson: Schema.String,
    }),
    execute: (event) =>
      sql`
        INSERT INTO orchestration_events (
          event_id,
          aggregate_kind,
          stream_id,
          stream_version,
          event_type,
          occurred_at,
          command_id,
          causation_event_id,
          correlation_id,
          actor_kind,
          payload_json,
          metadata_json
        ) VALUES (
          ${event.eventId},
          ${event.aggregateKind},
          ${event.streamId},
          ${event.streamVersion},
          ${event.eventType},
          ${event.occurredAt},
          ${event.commandId},
          NULL,
          ${event.commandId},
          ${event.actorKind},
          ${event.payloadJson},
          ${event.metadataJson}
        )
      `,
  });

  const insertReceipt = SqlSchema.void({
    Request: Schema.Struct({
      commandId: Schema.String,
      aggregateKind: Schema.String,
      aggregateId: Schema.String,
      acceptedAt: Schema.String,
      resultSequence: Schema.Finite,
      status: Schema.String,
    }),
    execute: (receipt) =>
      sql`
        INSERT INTO orchestration_command_receipts (
          command_id,
          aggregate_kind,
          aggregate_id,
          accepted_at,
          result_sequence,
          status,
          error
        ) VALUES (
          ${receipt.commandId},
          ${receipt.aggregateKind},
          ${receipt.aggregateId},
          ${receipt.acceptedAt},
          ${receipt.resultSequence},
          ${receipt.status},
          NULL
        )
      `,
  });

  const insertThread = SqlSchema.void({
    Request: Schema.Struct({
      threadId: ThreadId,
      title: Schema.String,
      createdAt: Schema.String,
    }),
    execute: (thread) =>
      sql`
        INSERT INTO projection_threads (thread_id, title, created_at, updated_at)
        VALUES (${thread.threadId}, ${thread.title}, ${thread.createdAt}, ${thread.createdAt})
      `,
  });

  const upsertMessage = SqlSchema.void({
    Request: Schema.Struct({
      threadId: ThreadId,
      messageId: MessageId,
      role: Schema.Literals(["user", "assistant"]),
      text: Schema.String,
      streaming: Schema.Finite,
      position: Schema.Finite,
      createdAt: Schema.String,
    }),
    execute: (message) =>
      sql`
        INSERT INTO projection_thread_messages (
          thread_id,
          message_id,
          role,
          text,
          streaming,
          position,
          created_at,
          updated_at
        ) VALUES (
          ${message.threadId},
          ${message.messageId},
          ${message.role},
          ${message.text},
          ${message.streaming},
          ${message.position},
          ${message.createdAt},
          ${message.createdAt}
        )
        ON CONFLICT (thread_id, message_id) DO UPDATE SET
          text = excluded.text,
          streaming = excluded.streaming,
          position = excluded.position,
          updated_at = excluded.updated_at
      `,
  });

  const touchThread = SqlSchema.void({
    Request: Schema.Struct({
      threadId: ThreadId,
      updatedAt: Schema.String,
    }),
    execute: ({ threadId, updatedAt }) =>
      sql`
        UPDATE projection_threads
        SET updated_at = ${updatedAt}
        WHERE thread_id = ${threadId}
      `,
  });

  const appendDomainEvent = Effect.fn("ThreadPersistence.appendDomainEvent")(function* (input: {
    readonly aggregateKind: string;
    readonly streamId: string;
    readonly eventType: string;
    readonly actorKind: string;
    readonly commandId: string;
    readonly payload: unknown;
    readonly occurredAt: string;
  }) {
    const version = yield* readStreamVersion({
      aggregateKind: input.aggregateKind,
      streamId: input.streamId,
    });
    const streamVersion = Option.match(version, {
      onNone: () => 1,
      onSome: (row) => row.streamVersion + 1,
    });
    const eventId = crypto.randomUUID();
    yield* insertEvent({
      eventId,
      aggregateKind: input.aggregateKind,
      streamId: input.streamId,
      streamVersion,
      eventType: input.eventType,
      occurredAt: input.occurredAt,
      commandId: input.commandId,
      actorKind: input.actorKind,
      payloadJson: encodePayload(input.payload),
      metadataJson: "{}",
    });
    const sequenceRow = yield* readSequence({ eventId }).pipe(
      Effect.flatMap((rowOption) =>
        Option.match(rowOption, {
          onNone: () =>
            Effect.fail(
              new PersistenceError({
                message: `Event ${eventId} was not found after insert`,
              }),
            ),
          onSome: (row) => Effect.succeed(row),
        }),
      ),
    );
    yield* insertReceipt({
      commandId: input.commandId,
      aggregateKind: input.aggregateKind,
      aggregateId: input.streamId,
      acceptedAt: input.occurredAt,
      resultSequence: sequenceRow.sequence,
      status: "accepted",
    });
    return sequenceRow.sequence;
  });

  const createThread = Effect.fn("ThreadPersistence.createThread")(function* () {
    const threadId = ThreadId.make(crypto.randomUUID());
    const commandId = CommandId.make(crypto.randomUUID());
    const occurredAt = new Date().toISOString();
    yield* appendDomainEvent({
      aggregateKind: "thread",
      streamId: threadId,
      eventType: "thread.created",
      actorKind: "system",
      commandId,
      payload: {
        threadId,
        title: "New thread",
        createdAt: occurredAt,
      },
      occurredAt,
    });
    yield* insertThread({
      threadId,
      title: "New thread",
      createdAt: occurredAt,
    });
    return threadId;
  });

  const ensureThread = Effect.fn("ThreadPersistence.ensureThread")(function* () {
    const threads = yield* listThreadIds(undefined);
    const existing = threads[0];
    if (existing !== undefined) {
      return existing.threadId;
    }
    return yield* createThread();
  });

  const appendMessage = Effect.fn("ThreadPersistence.appendMessage")(function* (
    role: ThreadMessageRole,
    text: string,
  ) {
    const threadId = yield* ensureThread();
    const messageId = MessageId.make(crypto.randomUUID());
    const commandId = CommandId.make(crypto.randomUUID());
    const occurredAt = new Date().toISOString();
    const position = yield* appendDomainEvent({
      aggregateKind: "thread",
      streamId: threadId,
      eventType: "thread.message-sent",
      actorKind: role === "user" ? "user" : "system",
      commandId,
      payload: {
        threadId,
        messageId,
        role,
        text,
        streaming: false,
        createdAt: occurredAt,
      },
      occurredAt,
    });
    yield* upsertMessage({
      threadId,
      messageId,
      role,
      text,
      streaming: 0,
      position,
      createdAt: occurredAt,
    });
    yield* touchThread({ threadId, updatedAt: occurredAt });
  });

  const getThread = Effect.gen(function* () {
    const threads = yield* listThreadIds(undefined);
    const existing = threads[0];
    if (existing === undefined) {
      return new ThreadSnapshot({ threadId: null, messages: [] });
    }
    const rows = yield* listMessages({ threadId: existing.threadId });
    return new ThreadSnapshot({
      threadId: existing.threadId,
      messages: rows.map(
        (row) =>
          new ThreadMessage({
            id: row.messageId,
            role: row.role,
            text: row.text,
            createdAt: row.createdAt,
          }),
      ),
    });
  });

  const withSql = <A, E>(
    operation: string,
    effect: Effect.Effect<A, E>,
  ): Effect.Effect<A, PersistenceError> =>
    sql
      .withTransaction(effect)
      .pipe(Effect.mapError((cause) => toPersistenceError(operation, cause)));

  return ThreadPersistence.of({
    getThread: withSql("GetThread", getThread),
    appendUser: (text) => withSql("appendUser", appendMessage("user", text)),
    appendAssistant: (text) => withSql("appendAssistant", appendMessage("assistant", text)),
  });
});

export const threadPersistenceLayer = Layer.effect(ThreadPersistence, makeThreadPersistence);

export const threadPersistenceMemory = Layer.sync(ThreadPersistence, () => {
  let threadId: ThreadId | undefined;
  const messages: Array<ThreadMessage> = [];
  const ensure = (): ThreadId => {
    if (threadId === undefined) {
      threadId = ThreadId.make(crypto.randomUUID());
    }
    return threadId;
  };
  const append = (role: ThreadMessageRole, text: string) => {
    ensure();
    messages.push(
      new ThreadMessage({
        id: MessageId.make(crypto.randomUUID()),
        role,
        text,
        createdAt: new Date().toISOString(),
      }),
    );
  };
  return ThreadPersistence.of({
    getThread: Effect.sync(
      () =>
        new ThreadSnapshot({
          threadId: threadId ?? null,
          messages: [...messages],
        }),
    ),
    appendUser: (text) =>
      Effect.sync(() => {
        append("user", text);
      }),
    appendAssistant: (text) =>
      Effect.sync(() => {
        append("assistant", text);
      }),
  });
});
