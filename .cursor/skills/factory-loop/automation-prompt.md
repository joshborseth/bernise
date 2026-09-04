# Factory loop — Cursor Automations

Paste the fenced prompt into the automation **Prompt** field. The skill in this folder is the source of truth; the prompt only dispatches.

Commit and push `.cursor/skills/factory-loop/` (and `docs/agents/*` if those are still untracked) to the branch the automation checks out **before** saving the automation. Cloud agents only see files on that branch.

## Automation 1 — Issue created → triage only

**Trigger:** Linear → Issue created  
**Team:** Bernise (workspace SLAMMER)  
**Tools:** Linear MCP  
**Repository:** this repo, default branch (needed to search the codebase while triaging)  
**Quality bar:** never open a branch, commit, or PR

```
You are the Bernise factory-loop triage agent (Linear workspace SLAMMER, team Bernise).

Read `.cursor/skills/factory-loop/SKILL.md` and follow the issue-created lane only. Then read TRIAGE.md and BRIEFS.md. Do not read IMPLEMENT.md. If SKILL.md is missing on this branch, comment on the Linear issue that the factory-loop skill is not checked out, and stop.

The triggering Linear issue is in this run's event. Fetch it with Linear get_issue (includeRelations: true) and list_comments. Identifiers look like BER-12. Ignore issues that are not team Bernise.

This automation fires on issue created. It never writes code, never opens a pull request, never commits.

- Raw / unlabeled / needs-triage / needs-info → AFK triage. If you apply ready-for-agent, post the Agent Brief, set status to Todo, and stop.
- Already labelled ready-for-agent → if status is not Todo, set Todo and stop. If it is already Todo, stop with no write.
- ready-for-human, wontfix, wayfinder decision tickets, or Done/Canceled/Duplicate → no writes.

Use Linear addLabels/removeLabels. Every comment starts with the factory-loop disclaimer in BRIEFS.md.
```

If this automation is already saved with the old prompt, replace the Prompt field with the block above.

## Automation 2 — Status → Todo → implement only

Linear has no label-changed trigger. After triage sets `Todo`, this run is the implement session.

**Trigger:** Linear → Status changed (`Todo` if the editor lets you pick a status; otherwise any change and the prompt filters)  
**Tools:** Linear MCP  
**Repository:** this repo, default branch  
**Quality bar:** open a PR; do not merge

```
You are the Bernise factory-loop implement agent (Linear workspace SLAMMER, team Bernise).

Read `.cursor/skills/factory-loop/SKILL.md` and follow the status-changed lane only. Then read IMPLEMENT.md and BRIEFS.md. Do not triage.

This automation fires on Linear status changed. Act only when the issue is labelled ready-for-agent, the new status is Todo, and it is unblocked. Otherwise exit with no writes.

Open a pull request, then post that pull request URL as a Linear comment on the triggering issue and set status In Review. Do not merge.
```

`/to-tickets` issues should be created in **Backlog** (not already `Todo`). The triage automation then sets `Todo`, which is what starts this run. An issue created already on `Todo` + `ready-for-agent` will not get a status-changed event.

## Gap: `needs-info` replies

Linear Automations do not fire on issue comments. Reporter replies will not resume triage unless someone moves the issue or a scheduled automation lists `needs-info` issues with new comments.
