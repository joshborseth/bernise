# Issue tracker: Linear

Issues and specs for this repo live in Linear workspace **SLAMMER** (`https://linear.app/slammer`), team **Bernise**. Use the Linear MCP tools for all operations. Do not use GitHub Issues or `gh issue` for this repo's tracker.

## Conventions

- **Create an issue**: `save_issue` with `team: "Bernise"` and a `title`. Put the body in `description` as Markdown. Optional: `state`, `labels`, `priority`, `parentId`, `blocks`, `blockedBy`.
- **Read an issue**: `get_issue` with the issue ID or identifier (e.g. `BER-12`). Fetch discussion with `list_comments` (`issueId`).
- **List issues**: `list_issues` scoped to team `Bernise`, with `state`, `label`, and `assignee` filters as needed.
- **Comment on an issue**: `save_comment` on the issue ID or identifier.
- **Apply / remove labels**: `save_issue` update with `addLabels` / `removeLabels`. If a required label does not exist yet, create it with `create_issue_label` (`name`, `teamId` of Bernise) then apply it.
- **Close**: `save_issue` update with `state: "Done"` (completed) or `state: "Canceled"` (won't do), plus a closing comment.

Team statuses: `Backlog`, `Todo`, `In Progress`, `In Review`, `Done`, `Duplicate`, `Canceled`.
Type labels already on the team: `Feature`, `Bug`, `Improvement`. Triage roles use a separate label set (see `docs/agents/triage-labels.md`).
