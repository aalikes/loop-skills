---
name: loop-init
description: Prepare a GitHub repository to run the loop system — create the queue and verdict labels, verify gh auth and push access, detect the default branch, and report required CI checks. Use once per repo before running /loop-build or /loop-review, or when those skills report missing labels.
---

# Loop system — repo setup

Run once per repository. Every step is idempotent: re-running is safe and
changes nothing that is already correct. Report findings; do not fix the
repository's CI or push code.

## 1. Verify the environment

Run these and report each result:

```bash
claude --version                                   # must be 2.1.71 or newer for /loop
gh auth status
gh repo view --json nameWithOwner,defaultBranchRef,viewerPermission
git rev-parse --show-toplevel
git remote get-url origin
```

Stop and tell the user what to fix if any of these are true:

- Not inside a Git repository, or `origin` is missing or unreachable.
- `gh` is not authenticated, or `viewerPermission` is not `WRITE`, `MAINTAIN`,
  or `ADMIN`.
- Claude Code is older than 2.1.71 (`/loop` does not exist before that).

Record the real default branch from `defaultBranchRef.name`. Never assume it is
`main`; the other skills depend on this being detected, not guessed.

## 2. Create the labels

```bash
gh label create agent-ready            --color 1D76DB --description "Human-approved: an agent may build this issue" --force
gh label create blocked                --color B60205 --description "Agent asked a question; waiting on a human answer"  --force
gh label create loop-building          --color FBCA04 --description "An agent has claimed this issue"                    --force
gh label create loop-approved          --color 0E8A16 --description "Reviewer found no must-fix issue; a human still merges" --force
gh label create loop-changes-requested --color D93F0B --description "Reviewer found must-fix items; builder should repair" --force
gh label create needs-human-review     --color 5319E7 --description "Escalated out of the automated queue"                --force
gh label create loop-stuck             --color 000000 --description "Repair budget exhausted; a human must intervene"     --force
```

`--force` updates an existing label instead of failing, so this block is safe to
re-run.

## 3. Report the CI situation

```bash
gh api "repos/{owner}/{repo}/branches/$(gh repo view --json defaultBranchRef --jq .defaultBranchRef.name)/protection" 2>/dev/null \
  --jq '.required_status_checks.contexts' || echo "no branch protection configured"
```

Tell the user plainly which case they are in:

- **Required checks exist.** The loop can reach `loop-approved` on its own.
- **No required checks.** `/loop-review` will label every PR
  `needs-human-review` rather than treating absent CI as green. This is
  intentional. Recommend adding at least one required check — typically the
  repo's existing test or lint workflow — if they want unattended approval.

## 4. Smoke test the queue reads

```bash
gh issue list --state open --label agent-ready --search "no:assignee -label:blocked" --json number,title
gh pr list --state open --json number,title,labels,isDraft
```

Both commands succeeding means the loop's read path works.

## 5. Report readiness

Confirm to the user:

- the repository and its detected default branch;
- which labels now exist;
- whether required CI is configured, and the consequence either way;
- that `/loop-spec`, `/loop-build`, and `/loop-review` are available in
  `/skills` (tell them to run `/reload-skills` if not).

Then state the first move: run `/loop-spec` to file an issue, apply
`agent-ready` to it by hand, and start `/loop /loop-build`.
