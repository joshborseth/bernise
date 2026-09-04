# AFK triage

Triage is the on-ramp for issues **this factory did not author**: bug reports, incoming requests, anything raw. This file is for the **issue-created** automation only. Never open a branch, commit, or PR.

Tickets that arrived already `ready-for-agent` (from `/to-tickets`) skip this file; `SKILL.md` hands them off by setting `Todo`.

This run has no maintainer in the loop. **Push right**: do every lookup and verification first, then one Linear checkpoint (labels + comment). Convert unanswered reporter/maintainer questions into `needs-info` or `needs-triage`. Do not wait.

## 1. Gather

Done when redundancy, prior rejection, and prior triage notes are reported in the comment (or explicitly "none").

- Parse existing triage notes / agent briefs on the issue. Do not re-ask resolved questions.
- **Redundancy:** search the codebase by domain concept (glossary terms from `CONTEXT.md`, not just the issue's wording). Record where you looked.
- **Prior rejection:** read `.out-of-scope/*.md` if the directory exists. Match by concept, not keyword.

## 2. Verify

Done when the claim is `confirmed`, `failed`, or `insufficient`.

- **Bug:** reproduce from the reporter's steps (commands, tests, UI). Name the code path when confirmed.
- **Enhancement:** confirm the behaviour is absent. If the search in step 1 found it, the outcome is already-implemented `wontfix`.

## 3. Choose one state

Category (exactly one type label): `Bug` | `Feature` | `Improvement`.

State — pick the first rule that matches:

| Outcome           | When                                                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `wontfix`         | Already implemented. Point at the behaviour. Do **not** write `.out-of-scope/`. Close `Canceled` with that comment.            |
| `needs-triage`    | `.out-of-scope/` match, or a product/scope decision only a maintainer can make. Surface the match; do **not** close.           |
| `needs-info`      | Missing facts only the reporter can supply (repro steps, expected vs actual, which surface). Questions must be specific.       |
| `ready-for-human` | Specified enough to brief, but the work needs judgment, secrets, design taste, or a human-only step.                           |
| `ready-for-agent` | Verified (or clearly specified enhancement), acceptance criteria writable without guessing product calls, no human-only steps. |

Rejected enhancements (`wontfix` because "we don't want this") are a maintainer call. Leave those as `needs-triage` with the case written up.

## 4. Apply

Use the matching template in [BRIEFS.md](BRIEFS.md). Then:

- `ready-for-agent`: post the **Agent Brief**, apply the label, set status `Todo`, **stop** (fresh rule in `SKILL.md`).
- `ready-for-human`: post the brief (include why it cannot be delegated), apply the label, leave status unless it is still unset (then `Backlog`).
- `needs-info`: post **Triage Notes**, apply the label, leave status.
- `needs-triage`: apply the label; comment when there is partial progress or an out-of-scope match.
- `wontfix` (already implemented): comment, apply the label, close `Canceled`.

## Resume (`needs-info`)

If prior triage notes exist, read them. If the reporter answered the outstanding questions, re-run steps 2–4 on the new picture. If they have not, exit with no write.
