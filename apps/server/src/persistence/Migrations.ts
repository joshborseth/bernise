import { Effect } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Migrator from "effect/unstable/sql/Migrator";

const createOrchestrationEvents = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`PRAGMA foreign_keys = ON`;
  yield* sql`
    CREATE TABLE IF NOT EXISTS orchestration_events (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL UNIQUE,
      aggregate_kind TEXT NOT NULL,
      stream_id TEXT NOT NULL,
      stream_version INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      command_id TEXT,
      causation_event_id TEXT,
      correlation_id TEXT,
      actor_kind TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      metadata_json TEXT NOT NULL
    )
  `;
  yield* sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_orch_events_stream_version
    ON orchestration_events (aggregate_kind, stream_id, stream_version)
  `;
});

const createCommandReceipts = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    CREATE TABLE IF NOT EXISTS orchestration_command_receipts (
      command_id TEXT PRIMARY KEY,
      aggregate_kind TEXT NOT NULL,
      aggregate_id TEXT NOT NULL,
      accepted_at TEXT NOT NULL,
      result_sequence INTEGER NOT NULL,
      status TEXT NOT NULL,
      error TEXT
    )
  `;
});

const createProjections = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    CREATE TABLE IF NOT EXISTS projection_threads (
      thread_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `;
  yield* sql`
    CREATE TABLE IF NOT EXISTS projection_thread_messages (
      thread_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      role TEXT NOT NULL,
      text TEXT NOT NULL,
      streaming INTEGER NOT NULL,
      position INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (thread_id, message_id)
    )
  `;
  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_thread_messages_position
    ON projection_thread_messages (thread_id, position)
  `;
});

const createProviderSessionRuntime = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    CREATE TABLE IF NOT EXISTS provider_session_runtime (
      thread_id TEXT PRIMARY KEY,
      codex_thread_id TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `;
});

export const migrationLoader = Migrator.fromRecord({
  "1_OrchestrationEvents": createOrchestrationEvents,
  "2_OrchestrationCommandReceipts": createCommandReceipts,
  "3_Projections": createProjections,
  "4_ProviderSessionRuntime": createProviderSessionRuntime,
});
