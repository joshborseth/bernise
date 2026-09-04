---
name: factory-loop
description: >-
  Routes a Linear Bernise issue through Matt's engineering factory. Issue-created
  runs AFK triage only and never writes code. Status-changed to Todo runs
  implement only. Used by Cursor Automations.
disable-model-invocation: true
---

# Factory loop

Run one **lane** for the triggering Linear issue, then stop.

The automation prompt names the trigger. That trigger **locks the lane**:

- **Issue created** → triage only. No branch, no commit, no PR.
- **Status changed** → implement only, and only when the new status is `Todo`.

## Read first

- [TRIAGE.md](TRIAGE.md) — AFK triage (issue-created automation)
- [IMPLEMENT.md](IMPLEMENT.md) — AFK implement (status→Todo automation)
- [BRIEFS.md](BRIEFS.md) — comment templates
- `docs/agents/issue-tracker.md` — Linear team Bernise, workspace SLAMMER
- `docs/agents/triage-labels.md` — state-role strings
- `docs/agents/domain.md` — `CONTEXT.md` / ADRs

## Identify

Done when the issue, comments, labels, status, and blocking relations are in context.

1. Resolve the triggering issue (event payload / identifier like `BER-12`). Team must be **Bernise**.
2. Fetch with Linear `get_issue` (`includeRelations: true`) and `list_comments`.
3. Ensure the five state labels exist on Bernise (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). Create any missing label, then continue.
4. Read `CONTEXT.md` and relevant `docs/adr/` if present. Proceed silently if they don't.

## Skip (exit with no Linear write)

Exit immediately when any of these hold:

- Team is not Bernise
- Status is `Done`, `Canceled`, or `Duplicate`
- Labels include `wayfinder:map`, `wayfinder:research`, `wayfinder:prototype`, or `wayfinder:grilling`
- Status is `In Progress` or `In Review` **and** a factory comment already links a PR
- This run's trigger is **status changed** and the new status is anything other than `Todo`

## Router

Exactly one state role on a triaged issue. Type labels (`Bug`, `Feature`, `Improvement`) are category, not state.

### Issue created (triage automation)

| Arrival | Lane |
| --- | --- |
| Unlabeled, or only type labels, or `needs-triage` | **triage** → [TRIAGE.md](TRIAGE.md) |
| `needs-info` | **resume-triage** → [TRIAGE.md](TRIAGE.md) (resume section) |
| `ready-for-agent` already on the issue | **handoff:** if status is not `Todo`, set `Todo` and stop. If it is already `Todo`, stop with no write. Never implement. |
| `ready-for-human` or `wontfix` | Skip |
| Conflicting state roles | Comment the conflict, leave labels, stop |

If triage applies `ready-for-agent`, set status to `Todo`, then **stop**. That status change is what starts the implement automation.

### Status changed (implement automation)

Take [IMPLEMENT.md](IMPLEMENT.md) only when all of these hold: label `ready-for-agent`, new status `Todo`, unblocked. Otherwise skip.

**Blocked:** open `blockedBy` (blocker not `Done`/`Canceled`) → comment that it's waiting, leave `Todo`, stop. Do not implement.

## Linear writes

- Prefer `addLabels` / `removeLabels` over replacing the full set.
- After triage, the issue has exactly one state role. Remove the other four state labels.
- Every factory comment starts with the disclaimer in [BRIEFS.md](BRIEFS.md).
- Status vocabulary: `Backlog`, `Todo`, `In Progress`, `In Review`, `Done`, `Duplicate`, `Canceled`.
