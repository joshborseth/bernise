# AFK implement

Only for the **status-changed** automation, and only when the issue is already `ready-for-agent`. The Agent Brief on the issue is the contract. Original body and discussion are context.

Skip this file on issue-created runs. Those never implement.

## Preconditions

Done when all of these are true, or the run has stopped:

- Label `ready-for-agent` is present
- No open `blockedBy` (every blocker is `Done` or `Canceled`)
- Status is `Todo`
- An Agent Brief comment exists. If missing, post that the brief is absent, leave `needs-triage`, stop

## Build

1. Claim: `assignee: "me"`, status `In Progress`.
2. Treat **Key interfaces** in the brief as the pre-agreed test seams. Red → green one slice at a time at those seams. Behaviour through public interfaces; no implementation-coupled tests.
3. Before writing Effect code, consult `effect-solutions`. Coding work in this repo must not call model APIs; Codex CLI is the live provider (`docs/harness.md`).
4. Run `vp test run` on touched tests as you go. `vp run typecheck` before review. Full `vp test run` once at the end.
5. Two-axis review of `git diff main...HEAD` (or the repo default branch):
   - **Standards:** repo docs + the smell baseline in the `code-review` skill if present; skip what tooling already enforces.
   - **Spec:** the Agent Brief. Missing criteria, scope creep, wrong behaviour.
     Fix critical Standard/Spec misses before opening a PR.
6. Open a PR. Comment the PR URL on the Linear issue (disclaimer from [BRIEFS.md](BRIEFS.md)). Set status `In Review`.

Do not merge. Do not strip `ready-for-agent` until a human merges or cancels.
