---
name: loop-review
description: Review open PRs against their linked GitHub issue and required CI checks, then post a three-group verdict and set the loop labels. Use when asked to run the loop system's reviewer or review its PR queue. Designed for /loop; never merges, never pushes code.
---

# Loop reviewer

One pass = one PR reviewed. Under `/loop`, each iteration runs this skill once.

Review with clean context. If a builder just opened the PR in this same
conversation, do not review it here — a reviewer that shares the builder's
reasoning re-approves the builder's blind spots.

## 1. Find a PR needing review

```bash
gh pr list --state open --json number,title,labels,isDraft,headRefOid,updatedAt,url
```

Skip drafts. Skip anything labeled `loop-stuck`. For each remaining PR, find the
latest comment whose first line is `Loop review of COMMIT_SHA`.

- **Skip** the PR when that recorded SHA equals its current `headRefOid` *and*
  it already carries `loop-approved`, `loop-changes-requested`, or
  `needs-human-review`. It has been reviewed at this commit.
- **Review it again** when new commits landed after the recorded SHA.

Choose the least recently updated PR that needs review. If nothing needs
review, say so and end the pass.

## 2. Read the contract and the code

- Parse the issue number from `Closes #NNN` in the PR body and fetch the full
  issue including comments. **No linked issue is itself a must-fix finding** —
  there is no contract to review against.
- Read the complete diff and every changed file in its surrounding context, not
  just the hunks.
- Review only against the linked issue: acceptance-criteria gaps, defects,
  broken data flow, unnecessary scope expansion, security problems, missing
  loading and error states, and code that future agents will struggle to modify.
- Do not suggest unrelated improvements unless they are severe.

Every must-fix code finding must start with one of these tags:

- `[AC-N]` — the PR does not satisfy that acceptance criterion
- `[DEFECT]` — the implementation is broken while staying inside scope
- `[SECURITY]` — a severe security issue blocks shipping
- `[CI]` — a required GitHub check failed

Non-goals are binding. If fixing a finding would require behavior a non-goal
excludes, do not prescribe code for it. Record
`[SCOPE-CONFLICT AC-N ↔ NG-N]` with the exact contradiction and escalate the PR
to a human.

## 3. Check merge evidence

```bash
gh pr view NUMBER --json headRefOid,mergeable,mergeStateStatus
gh pr checks NUMBER --required --json bucket,name,state,link
```

- If required checks are still pending, or `mergeable` is `UNKNOWN`, report that
  the PR is waiting and end the pass **without** posting a verdict or changing
  labels. A later iteration retries it.
- A failed required check is a `[CI]` must-fix finding.
- A merge conflict is a `[DEFECT]` must-fix finding.
- If the repository has **no required checks at all**, escalate to a human. Do
  not apply `loop-approved`. Absent CI is not green.

Gather all evidence at one exact `headRefOid`, and re-fetch it immediately
before posting. If the head changed while you were reviewing, discard the
review and start fresh on a future pass — a verdict must describe a commit that
still exists at the tip.

## 4. Post one verdict

Post exactly one comment in this structure:

```md
Loop review of COMMIT_SHA

CI: required checks passed | failed | not configured
Mergeability: clean | conflicting

## Review

Summary: one or two plain-language sentences on what this PR does.

## 1. Must fix before merge

None.

## 2. Should fix soon

None.

## 3. Safe to merge

Yes — automated review evidence is complete. A human still makes the merge decision.
```

Then set labels from the verdict. Check which labels exist before removing one,
so an absent label does not fail the command:

| Verdict | Add | Remove |
| --- | --- | --- |
| No must-fix, no escalation | `loop-approved` | `loop-changes-requested` |
| Must-fix present | `loop-changes-requested` | `loop-approved` |
| Scope conflict, no linked issue, or no required CI | `needs-human-review` | `loop-approved`, `loop-changes-requested` |

Preserve a pre-existing `needs-human-review` label even when approving — it may
represent a separate high-risk human gate that this review did not evaluate.

For an escalation, set "Safe to merge" to `No — human decision required.` and
name the precise reason.

Escalation deliberately removes the PR from the automated repair queue. A human
must resolve the cause, amend the issue or the repository configuration as
needed, and remove `needs-human-review` before this skill reviews that same
commit again.

## 5. Hard limits

- **Never merge and never enable auto-merge.**
- Never push commits to the PR branch. The builder repairs; the reviewer judges.
- Never approve or request changes through a formal GitHub review. Use one
  comment plus labels — the loop often runs on the PR author's own token, and
  GitHub rejects self-reviews.
- `loop-approved` is evidence for a human, not merge authorization.
