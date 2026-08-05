---
name: loop-build
description: Claim the next safe agent-ready GitHub issue, implement only its contract, verify it, and open a PR — or repair review feedback on an existing PR. Use when asked to run the loop system's builder, work the approved queue, or fix loop review feedback. Designed for /loop; one pass does exactly one unit of work.
---

# Loop builder

One pass = one unit of work: either repair review feedback on one existing PR,
or build one issue end to end. Under `/loop`, each iteration runs this skill
once. End the pass when the unit is done — do not start a second one.

## 0. Preflight

Before touching GitHub, branches, or files:

```bash
gh repo view --json nameWithOwner,defaultBranchRef --jq '{repo:.nameWithOwner,default:.defaultBranchRef.name}'
git status --porcelain
```

- Confirm this is the intended repository and `origin` is reachable.
- Use the detected default branch. Never assume it is `main`.
- The working tree must be clean. If `git status --porcelain` is non-empty,
  report the dirty paths and end the pass. Never stash, reset, checkout over,
  or commit unrelated work.

If the loop labels do not exist, say so and tell the user to run `/loop-init`.
Do not create labels from this skill.

## 1. Review feedback first

Repairs take priority over new work, so approved-but-imperfect PRs converge
instead of piling up.

```bash
gh pr list --state open --label loop-changes-requested \
  --json number,title,headRefName,headRefOid,labels,updatedAt,url
```

Skip every PR carrying `needs-human-review` or `loop-stuck`; those have left
the automated repair queue until a human resolves them.

If any PR remains, take the **least recently updated** one and:

1. Read its linked issue (`Closes #NNN` in the PR body) and the latest comment
   whose first line is `Loop review of COMMIT_SHA`.
2. Check out its branch.
3. Fix **only** the items under "Must fix before merge". Nothing else.
4. Run the relevant checks, push, then remove `loop-changes-requested` and
   comment describing exactly what changed.
5. End the pass.

**Repair budget.** Count the `Loop review of` comments already on the PR. If
there are 3 or more and the reviewer still requested changes, do not attempt
another repair: add `loop-stuck`, remove `loop-changes-requested`, comment
summarizing what was tried and what remains, and end the pass. An agent must
not argue with a reviewer indefinitely, nor quietly broaden the issue contract
to make a check pass.

If a proposed fix would cross a non-goal or requires a product decision, do not
implement it. Comment the exact conflict, add `needs-human-review`, remove
`loop-changes-requested`, and end the pass. This stops the next loop iteration
from retrying a decision only a human can make.

## 2. Pick

```bash
gh issue list --state open --label agent-ready \
  --search "no:assignee -label:blocked sort:created-asc" \
  --json number,title,labels,body,url
```

An issue is claimable only if all of these hold:

- labeled `agent-ready`
- unassigned
- not labeled `blocked`, `needs-human-review`, or `loop-stuck`
- every issue referenced by a `Blocked by: #NNN` line in its body is **closed**
- no open PR already says `Closes #NNN` for it

Prefer higher priority if the repo uses priority labels, then oldest first. If
nothing is claimable, say so plainly and end the pass. Do not invent work, do
not relax these conditions, and do not pick a blocked issue.

The `--search` filter above narrows the queue and nothing more. GitHub's search
index trails writes by several seconds, so a search result can still describe an
issue as it was *before* a label or assignee that this same pass just wrote.
Never use it to confirm your own write — an issue you just claimed can come back
unclaimed, and an issue somebody else just claimed can come back available. Step
3 reads the issue directly for exactly that reason.

## 3. Claim (the cooperative lock)

```bash
gh issue edit NUMBER --add-assignee @me --add-label loop-building
```

Claim **before** reading deeply or writing code. Then immediately confirm the
claim with a direct read of the issue:

```bash
gh issue view NUMBER --json number,assignees,labels
```

This reads the issue itself, so it reflects the claim you just wrote. Confirming
with the queue query from step 2 instead would be unreliable: that query goes
through an index that lags writes, and it can report your own claim as never
having happened. If the issue now comes back blocked, assigned to somebody else,
or no longer `agent-ready`, release nothing you did not take and return to step
2.

The assignee prevents two different people from taking the same issue. It is
not an atomic lock between simultaneous sessions authenticated as the same
GitHub account, so **run only one builder loop per repository.** Use separate
clean worktrees if you deliberately work more than one repository at once.

## 4. Read

Fetch the full issue including comments:

```bash
gh issue view NUMBER --json number,title,body,comments,labels,url
```

Implement only its acceptance criteria. Non-goals are binding. Compare every
`AC-N` against every `NG-N` before editing a file.

No unrelated changes. No opportunistic refactors. If it is not in the issue, it
does not exist — there are no side-channel instructions.

If an acceptance criterion is ambiguous, contradicts a non-goal, or depends on
unmerged work, go to step 8. Never guess.

## 5. Build

- Fetch the latest default branch from `origin`, then create or resume a branch
  named `issue-NNN-short-slug` using the real issue number.
- Implement the acceptance criteria in the repository's existing style,
  architecture, and naming conventions.
- Add or update tests when the change affects logic, data flow, permissions,
  integrations, or user-visible behavior.
- Preserve every behavior outside the issue contract.

## 6. Verify

Run the project's relevant lint, typecheck, build, and the narrowest useful
tests. Everything attributable to this change must pass before opening a PR.

If a broad check has a pre-existing failure unrelated to this work, run the
targeted check instead, preserve the evidence of both, and disclose both
results in the PR body. Never present a pre-existing failure as caused by this
change, and never present it as passing.

Read `git diff` and `git status` before shipping. Stop if the diff contains
unrelated work, generated artifacts, or secrets.

## 7. Ship

Push the branch and open a PR with `gh pr create`. The description must
include:

- What changed and why
- `Closes #NNN` — the real issue number, so GitHub links them
- A scope ledger: one evidence line per `AC-N`, one preservation line per
  `NG-N`, and the literal line `Other behavior changes: None`
- Numbered manual test steps matching what was actually built
- Automated checks run, and their results
- `Risk: Low` / `Medium` / `High`

If `Other behavior changes: None` is not true, stop and get the issue amended
before opening the PR. Only editing the issue can expand scope.

Then comment the PR URL on the issue and remove `loop-building` from it.

**Never merge. Never enable auto-merge.** End the pass.

## 8. Blocked

Comment exactly one specific question a human can answer asynchronously, apply
the `blocked` label, and unassign yourself:

```bash
gh issue edit NUMBER --add-label blocked --remove-label loop-building --remove-assignee @me
```

Leave `agent-ready` in place. The pick query in step 2 excludes `blocked`, so
the issue safely reappears in the queue only after a human answers and removes
that label.

Never write "this is unclear" as the question. State the exact decision, the
available options, your recommendation, and which acceptance criterion it
affects. End the pass so the next iteration can pick different work.
