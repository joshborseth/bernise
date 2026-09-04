import { Schema } from "effect";

export const WorkspaceEntryKind = Schema.Literals(["directory", "file", "symlink"]);
export type WorkspaceEntryKind = typeof WorkspaceEntryKind.Type;

export class WorkspaceEntry extends Schema.Class<WorkspaceEntry>("WorkspaceEntry")({
  path: Schema.String,
  name: Schema.String,
  kind: WorkspaceEntryKind,
}) {}

export class WorkspaceDirectoryListing extends Schema.Class<WorkspaceDirectoryListing>(
  "WorkspaceDirectoryListing",
)({
  path: Schema.String,
  entries: Schema.Array(WorkspaceEntry),
}) {}

export class WorkspaceFsError extends Schema.TaggedError<WorkspaceFsError>()("WorkspaceFsError", {
  message: Schema.String,
}) {}
