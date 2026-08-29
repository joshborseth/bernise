import { NodeServices } from "@effect/platform-node";
import { Config, Effect, FileSystem, Layer, Path } from "effect";
import { homedir } from "node:os";
import { join } from "node:path";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Migrator from "effect/unstable/sql/Migrator";
import { migrationLoader } from "./Migrations.ts";
import { ThreadPersistence, threadPersistenceLayer } from "./ThreadPersistence.ts";

const stateDirConfig = Config.string("BERNISE_STATE_DIR").pipe(
  Config.withDefault(join(homedir(), ".bernise")),
);

const migrationsLayer = Layer.effectDiscard(Migrator.make({})({ loader: migrationLoader }));

const isBunRuntime = (): boolean => typeof process.versions.bun === "string";

const sqliteClientLayer = (filename: string): Layer.Layer<SqlClient.SqlClient> =>
  Layer.unwrap(
    Effect.promise(async () => {
      // Bun's bundled SQLite omits loadable extensions, so node:sqlite's
      // DatabaseSync fails on open. Vitest still runs under Node.
      if (isBunRuntime()) {
        const { SqliteClient } = await import("@effect/sql-sqlite-bun");
        return SqliteClient.layer({ filename });
      }
      const { SqliteClient } = await import("@effect/sql-sqlite-node");
      return SqliteClient.layer({ filename });
    }),
  );

export const persistenceFromFile = (filename: string) =>
  threadPersistenceLayer.pipe(
    Layer.provide(migrationsLayer),
    Layer.provide(sqliteClientLayer(filename)),
  );

export const persistenceMemory = persistenceFromFile(":memory:");

export const PersistenceLive = Layer.unwrap(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const stateDir = yield* stateDirConfig;
    yield* fs.makeDirectory(stateDir, { recursive: true });
    return persistenceFromFile(path.join(stateDir, "state.sqlite"));
  }),
).pipe(Layer.provide(NodeServices.layer));

export { ThreadPersistence };
