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

## When a skill says "publish to the issue tracker"

Create a Linear issue on team Bernise via `save_issue`.

## When a skill says "fetch the relevant ticket"

Run `get_issue` and `list_comments` for that identifier.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single Linear issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body. Create with `save_issue` (`team: "Bernise"`, `labels: ["wayfinder:map"]`).
- **Child ticket**: an issue with `parentId` set to the map. Labels: `wayfinder:<type>` (`research` / `prototype` / `grilling` / `task`). Once claimed, assign the ticket to the driving dev.
- **Blocking**: Linear native relations. Add an edge with `save_issue` `blockedBy` / `blocks` (append-only). A ticket is unblocked when every blocker is `Done` or `Canceled`.
- **Frontier query**: list the map's open children (`list_issues` on team Bernise, excluding completed/canceled), drop any with an open blocker or an assignee; first in map order wins.
- **Claim**: `save_issue` update with `assignee: "me"`, the session's first write.
- **Resolve**: `save_comment` with the answer, then `save_issue` with `state: "Done"`, then append a context pointer (gist + link) to the map's Decisions-so-far.
