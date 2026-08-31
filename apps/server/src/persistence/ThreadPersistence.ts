import {
  CommandId,
  defaultThreadTitle,
  MessageId,
  PersistenceError,
  ThreadId,
  ThreadMessage,
  ThreadShell,
  ThreadSnapshot,
  titleFromPrompt,
  type ThreadMessageRole,
} from "@bernise/contracts";
import { Effect, Layer, Option, Schema } from "effect";
import * as Context from "effect/Context";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";

export type ThreadPersistenceApi = {
  readonly listThreads: Effect.Effect<ReadonlyArray<ThreadShell>, PersistenceError>;
  readonly getThread: (threadId: ThreadId) => Effect.Effect<ThreadSnapshot, PersistenceError>;
  readonly createThread: (
    threadId: ThreadId,
    title: string,
  ) => Effect.Effect<ThreadShell, PersistenceError>;
  readonly renameThread: (
    threadId: ThreadId,
    title: string,
  ) => Effect.Effect<ThreadShell, PersistenceError>;
  readonly deleteThread: (threadId: ThreadId) => Effect.Effect<void, PersistenceError>;
  readonly appendUser: (threadId: ThreadId, text: string) => Effect.Effect<void, PersistenceError>;
  readonly appendAssistant: (
    threadId: ThreadId,
    text: string,
  ) => Effect.Effect<void, PersistenceError>;
  readonly getResumeCursor: (
    threadId: ThreadId,
  ) => Effect.Effect<string | undefined, PersistenceError>;
  readonly setResumeCursor: (
    threadId: ThreadId,
    codexThreadId: string,
  ) => Effect.Effect<void, PersistenceError>;
};

export class ThreadPersistence extends Context.Service<ThreadPersistence, ThreadPersistenceApi>()(
  "@bernise/ThreadPersistence",
) {}

const ThreadIdRow = Schema.Struct({
  threadId: ThreadId,
});

const ThreadShellRow = Schema.Struct({
  threadId: ThreadId,
  title: Schema.String,
  createdAt: Schema.String,
  updatedAt: Schema.String,
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

const ResumeRow = Schema.Struct({
  codexThreadId: Schema.String,
});

const FirstUserRow = Schema.Struct({
  text: Schema.String,
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

const toShell = (row: typeof ThreadShellRow.Type): ThreadShell =>
  new ThreadShell({
    id: row.threadId,
    title: row.title,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });

const trimmedTitle = (title: string): string => {
  const collapsed = title.trim().replace(/\s+/g, " ");
  return collapsed.length > 0 ? collapsed : defaultThreadTitle;
};

export const makeThreadPersistence = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const listThreadRows = SqlSchema.findAll({
    Request: Schema.Void,
    Result: ThreadShellRow,
    execute: () =>
      sql`
        SELECT
          thread_id AS "threadId",
          title,
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM projection_threads
        ORDER BY updated_at DESC, thread_id DESC
      `,
  });

  const findThread = SqlSchema.findOneOption({
    Request: ThreadIdRow,
    Result: ThreadShellRow,
    execute: ({ threadId }) =>
      sql`
        SELECT
          thread_id AS "threadId",
          title,
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM projection_threads
        WHERE thread_id = ${threadId}
      `,
  });

  const listMessages = SqlSchema.findAll({
    Request: ThreadIdRow,
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

  const findFirstUserText = SqlSchema.findOneOption({
    Request: ThreadIdRow,
    Result: FirstUserRow,
    execute: ({ threadId }) =>
      sql`
        SELECT text
        FROM projection_thread_messages
        WHERE thread_id = ${threadId} AND role = 'user'
        ORDER BY position ASC, message_id ASC
        LIMIT 1
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
      title: Schema.optionalKey(Schema.String),
      updatedAt: Schema.String,
    }),
    execute: ({ threadId, title, updatedAt }) =>
      title === undefined
        ? sql`
            UPDATE projection_threads
            SET updated_at = ${updatedAt}
            WHERE thread_id = ${threadId}
          `
        : sql`
            UPDATE projection_threads
            SET title = ${title}, updated_at = ${updatedAt}
            WHERE thread_id = ${threadId}
          `,
  });

  const deleteMessages = SqlSchema.void({
    Request: ThreadIdRow,
    execute: ({ threadId }) =>
      sql`DELETE FROM projection_thread_messages WHERE thread_id = ${threadId}`,
  });

  const deleteThreadRow = SqlSchema.void({
    Request: ThreadIdRow,
    execute: ({ threadId }) => sql`DELETE FROM projection_threads WHERE thread_id = ${threadId}`,
  });

  const deleteResume = SqlSchema.void({
    Request: ThreadIdRow,
    execute: ({ threadId }) =>
      sql`DELETE FROM provider_session_runtime WHERE thread_id = ${threadId}`,
  });

  const deleteEvents = SqlSchema.void({
    Request: ThreadIdRow,
    execute: ({ threadId }) =>
      sql`
        DELETE FROM orchestration_events
        WHERE aggregate_kind = 'thread' AND stream_id = ${threadId}
      `,
  });

  const deleteReceipts = SqlSchema.void({
    Request: ThreadIdRow,
    execute: ({ threadId }) =>
      sql`
        DELETE FROM orchestration_command_receipts
        WHERE aggregate_kind = 'thread' AND aggregate_id = ${threadId}
      `,
  });

  const findResume = SqlSchema.findOneOption({
    Request: ThreadIdRow,
    Result: ResumeRow,
    execute: ({ threadId }) =>
      sql`
        SELECT codex_thread_id AS "codexThreadId"
        FROM provider_session_runtime
        WHERE thread_id = ${threadId}
      `,
  });

  const upsertResume = SqlSchema.void({
    Request: Schema.Struct({
      threadId: ThreadId,
      codexThreadId: Schema.String,
      updatedAt: Schema.String,
    }),
    execute: ({ threadId, codexThreadId, updatedAt }) =>
      sql`
        INSERT INTO provider_session_runtime (thread_id, codex_thread_id, updated_at)
        VALUES (${threadId}, ${codexThreadId}, ${updatedAt})
        ON CONFLICT (thread_id) DO UPDATE SET
          codex_thread_id = excluded.codex_thread_id,
          updated_at = excluded.updated_at
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

  const insertCreatedThread = Effect.fn("ThreadPersistence.insertCreatedThread")(function* (
    threadId: ThreadId,
    title: string,
    occurredAt: string,
  ) {
    const commandId = CommandId.make(crypto.randomUUID());
    yield* appendDomainEvent({
      aggregateKind: "thread",
      streamId: threadId,
      eventType: "thread.created",
      actorKind: "system",
      commandId,
      payload: {
        threadId,
        title,
        createdAt: occurredAt,
      },
      occurredAt,
    });
    yield* insertThread({
      threadId,
      title,
      createdAt: occurredAt,
    });
    return new ThreadShell({
      id: threadId,
      title,
      createdAt: occurredAt,
      updatedAt: occurredAt,
    });
  });

  const requireThread = Effect.fn("ThreadPersistence.requireThread")(function* (
    threadId: ThreadId,
  ) {
    const existing = yield* findThread({ threadId });
    return yield* Option.match(existing, {
      onNone: () => Effect.fail(new PersistenceError({ message: `Unknown thread ${threadId}` })),
      onSome: (row) => Effect.succeed(toShell(row)),
    });
  });

  const ensureThread = Effect.fn("ThreadPersistence.ensureThread")(function* (
    threadId: ThreadId,
    title: string,
  ) {
    const existing = yield* findThread({ threadId });
    if (Option.isSome(existing)) {
      return toShell(existing.value);
    }
    return yield* insertCreatedThread(threadId, title, new Date().toISOString());
  });

  const applyTitleFromPrompt = Effect.fn("ThreadPersistence.applyTitleFromPrompt")(function* (
    threadId: ThreadId,
    prompt: string,
    occurredAt: string,
  ) {
    const existing = yield* findThread({ threadId });
    if (Option.isNone(existing) || existing.value.title !== defaultThreadTitle) {
      yield* touchThread({ threadId, updatedAt: occurredAt });
      return;
    }
    const nextTitle = titleFromPrompt(prompt);
    if (nextTitle === defaultThreadTitle) {
      yield* touchThread({ threadId, updatedAt: occurredAt });
      return;
    }
    yield* touchThread({ threadId, title: nextTitle, updatedAt: occurredAt });
  });

  const appendMessage = Effect.fn("ThreadPersistence.appendMessage")(function* (
    threadId: ThreadId,
    role: ThreadMessageRole,
    text: string,
  ) {
    const title = role === "user" ? titleFromPrompt(text) : defaultThreadTitle;
    yield* ensureThread(threadId, title);
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
    if (role === "user") {
      yield* applyTitleFromPrompt(threadId, text, occurredAt);
    } else {
      yield* touchThread({ threadId, updatedAt: occurredAt });
    }
  });

  const backfillTitle = Effect.fn("ThreadPersistence.backfillTitle")(function* (
    row: typeof ThreadShellRow.Type,
  ) {
    if (row.title !== defaultThreadTitle) {
      return toShell(row);
    }
    const first = yield* findFirstUserText({ threadId: row.threadId });
    return yield* Option.match(first, {
      onNone: () => Effect.succeed(toShell(row)),
      onSome: (message) =>
        Effect.gen(function* () {
          const nextTitle = titleFromPrompt(message.text);
          if (nextTitle === defaultThreadTitle) {
            return toShell(row);
          }
          const updatedAt = new Date().toISOString();
          yield* touchThread({
            threadId: row.threadId,
            title: nextTitle,
            updatedAt,
          });
          return new ThreadShell({
            id: row.threadId,
            title: nextTitle,
            createdAt: row.createdAt,
            updatedAt,
          });
        }),
    });
  });

  const listThreads = Effect.gen(function* () {
    const rows = yield* listThreadRows(undefined);
    const shells: Array<ThreadShell> = [];
    for (const row of rows) {
      shells.push(yield* backfillTitle(row));
    }
    return shells;
  });

  const getThread = Effect.fn("ThreadPersistence.getThread")(function* (threadId: ThreadId) {
    const rows = yield* listMessages({ threadId });
    return new ThreadSnapshot({
      threadId,
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

  const createThread = Effect.fn("ThreadPersistence.createThread")(function* (
    threadId: ThreadId,
    title: string,
  ) {
    const existing = yield* findThread({ threadId });
    if (Option.isSome(existing)) {
      return toShell(existing.value);
    }
    return yield* insertCreatedThread(threadId, trimmedTitle(title), new Date().toISOString());
  });

  const renameThread = Effect.fn("ThreadPersistence.renameThread")(function* (
    threadId: ThreadId,
    title: string,
  ) {
    yield* requireThread(threadId);
    const nextTitle = trimmedTitle(title);
    const commandId = CommandId.make(crypto.randomUUID());
    const occurredAt = new Date().toISOString();
    yield* appendDomainEvent({
      aggregateKind: "thread",
      streamId: threadId,
      eventType: "thread.title-updated",
      actorKind: "user",
      commandId,
      payload: { threadId, title: nextTitle },
      occurredAt,
    });
    yield* touchThread({ threadId, title: nextTitle, updatedAt: occurredAt });
    const updated = yield* requireThread(threadId);
    return new ThreadShell({
      ...updated,
      title: nextTitle,
      updatedAt: occurredAt,
    });
  });

  const deleteThread = Effect.fn("ThreadPersistence.deleteThread")(function* (threadId: ThreadId) {
    yield* deleteMessages({ threadId });
    yield* deleteThreadRow({ threadId });
    yield* deleteResume({ threadId });
    yield* deleteEvents({ threadId });
    yield* deleteReceipts({ threadId });
  });

  const getResumeCursor = Effect.fn("ThreadPersistence.getResumeCursor")(function* (
    threadId: ThreadId,
  ) {
    const row = yield* findResume({ threadId });
    return Option.match(row, {
      onNone: () => undefined,
      onSome: (value) => value.codexThreadId,
    });
  });

  const setResumeCursor = Effect.fn("ThreadPersistence.setResumeCursor")(function* (
    threadId: ThreadId,
    codexThreadId: string,
  ) {
    yield* upsertResume({
      threadId,
      codexThreadId,
      updatedAt: new Date().toISOString(),
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
    listThreads: withSql("ListThreads", listThreads),
    getThread: (threadId) => withSql("GetThread", getThread(threadId)),
    createThread: (threadId, title) => withSql("createThread", createThread(threadId, title)),
    renameThread: (threadId, title) => withSql("RenameThread", renameThread(threadId, title)),
    deleteThread: (threadId) => withSql("DeleteThread", deleteThread(threadId)),
    appendUser: (threadId, text) => withSql("appendUser", appendMessage(threadId, "user", text)),
    appendAssistant: (threadId, text) =>
      withSql("appendAssistant", appendMessage(threadId, "assistant", text)),
    getResumeCursor: (threadId) => withSql("getResumeCursor", getResumeCursor(threadId)),
    setResumeCursor: (threadId, codexThreadId) =>
      withSql("setResumeCursor", setResumeCursor(threadId, codexThreadId)),
  });
});

export const threadPersistenceLayer = Layer.effect(ThreadPersistence, makeThreadPersistence);

type MemoryThread = {
  shell: ThreadShell;
  messages: Array<ThreadMessage>;
};

export const threadPersistenceMemory = Layer.sync(ThreadPersistence, () => {
  const threads = new Map<ThreadId, MemoryThread>();
  const cursors = new Map<ThreadId, string>();

  const ensure = (threadId: ThreadId, title: string): MemoryThread => {
    const existing = threads.get(threadId);
    if (existing !== undefined) {
      return existing;
    }
    const occurredAt = new Date().toISOString();
    const created: MemoryThread = {
      shell: new ThreadShell({
        id: threadId,
        title,
        createdAt: occurredAt,
        updatedAt: occurredAt,
      }),
      messages: [],
    };
    threads.set(threadId, created);
    return created;
  };

  const append = (threadId: ThreadId, role: ThreadMessageRole, text: string) => {
    const title = role === "user" ? titleFromPrompt(text) : defaultThreadTitle;
    const record = ensure(threadId, title);
    const occurredAt = new Date().toISOString();
    record.messages.push(
      new ThreadMessage({
        id: MessageId.make(crypto.randomUUID()),
        role,
        text,
        createdAt: occurredAt,
      }),
    );
    const nextTitle =
      role === "user" && record.shell.title === defaultThreadTitle
        ? titleFromPrompt(text)
        : record.shell.title;
    record.shell = new ThreadShell({
      ...record.shell,
      title: nextTitle,
      updatedAt: occurredAt,
    });
  };

  return ThreadPersistence.of({
    listThreads: Effect.sync(() =>
      [...threads.values()]
        .map((record) => record.shell)
        .sort((left, right) => {
          if (left.updatedAt === right.updatedAt) {
            return right.id.localeCompare(left.id);
          }
          return right.updatedAt.localeCompare(left.updatedAt);
        }),
    ),
    getThread: (threadId) =>
      Effect.sync(() => {
        const record = threads.get(threadId);
        return new ThreadSnapshot({
          threadId,
          messages: record === undefined ? [] : [...record.messages],
        });
      }),
    createThread: (threadId, title) =>
      Effect.sync(() => ensure(threadId, trimmedTitle(title)).shell),
    renameThread: (threadId, title) =>
      Effect.gen(function* () {
        const record = threads.get(threadId);
        if (record === undefined) {
          return yield* new PersistenceError({ message: `Unknown thread ${threadId}` });
        }
        const occurredAt = new Date().toISOString();
        record.shell = new ThreadShell({
          ...record.shell,
          title: trimmedTitle(title),
          updatedAt: occurredAt,
        });
        return record.shell;
      }),
    deleteThread: (threadId) =>
      Effect.sync(() => {
        threads.delete(threadId);
        cursors.delete(threadId);
      }),
    appendUser: (threadId, text) =>
      Effect.sync(() => {
        append(threadId, "user", text);
      }),
    appendAssistant: (threadId, text) =>
      Effect.sync(() => {
        append(threadId, "assistant", text);
      }),
    getResumeCursor: (threadId) => Effect.sync(() => cursors.get(threadId)),
    setResumeCursor: (threadId, codexThreadId) =>
      Effect.sync(() => {
        cursors.set(threadId, codexThreadId);
      }),
  });
});
