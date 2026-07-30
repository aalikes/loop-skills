# loop-skills

Four Claude Code skills that turn GitHub Issues + Pull Requests into a small,
human-gated AI software factory:

**idea → `/loop-spec` interviews you and files the issue → you label it
`agent-ready` → `/loop-build` claims it and opens a PR → `/loop-review` posts a
verdict → you merge.**

Four skills, one approval label, one rule: **humans merge.**

- [`skills/loop-init`](skills/loop-init/SKILL.md) — prepares a repository:
  verifies `gh` auth and push access, detects the real default branch, creates
  the labels idempotently, and reports whether required CI exists.
- [`skills/loop-spec`](skills/loop-spec/SKILL.md) — researches the repo,
  interviews you until the behavior is unambiguous, then files an issue with
  acceptance criteria (`AC-N`) and binding non-goals (`NG-N`).
- [`skills/loop-build`](skills/loop-build/SKILL.md) — claims the next safe
  `agent-ready` issue, implements only its contract, verifies it, and opens a
  PR. Runs repeatedly with `/loop /loop-build`.
- [`skills/loop-review`](skills/loop-review/SKILL.md) — reviews open PRs against
  their linked issue and required checks, then posts a three-group verdict.
  Runs repeatedly with `/loop /loop-review`.

Adapted from [finna/Finn-loop](https://github.com/finna/Finn-loop), which uses
Linear as the issue queue. This version uses GitHub Issues via the `gh` CLI, so
it needs no additional connector, and adds a repair budget (`loop-stuck`) so an
unattended builder cannot grind on one PR forever.

## Requirements

- A Git repository on GitHub with a working `origin` remote
- Claude Code 2.1.71 or newer (`/loop` was added in that release)
- The GitHub CLI (`gh`) authenticated with write access to the target repo
- At least one required status check on the default branch. Without it,
  `/loop-review` labels every PR `needs-human-review` rather than treating
  absent CI as green.

## Install

Copy the skills into your global skills directory:

```bash
for s in loop-init loop-spec loop-build loop-review; do
  mkdir -p "$HOME/.claude/skills/$s"
  cp "skills/$s/SKILL.md" "$HOME/.claude/skills/$s/SKILL.md"
done
```

Then run `/reload-skills` (or restart Claude Code) and confirm `/skills` lists
all four. Install them per-repo instead by copying into `.claude/skills/`.

## Launch

1. `cd` into the target repo, start Claude Code, and run `/loop-init` once.
2. Run `/loop-spec` whenever an idea hits you. Read the filed issue; if you
   approve the exact contract, apply `agent-ready` in GitHub. **Only a human
   applies that label.**
3. Start `/loop /loop-build`. For continuous reviews, run `/loop /loop-review`
   in a second session.
4. Merge only PRs that are `loop-approved`, conflict-free, and green on all
   required checks. A `needs-human-review` or `loop-stuck` PR requires you to
   read and resolve the reason before merging.
5. Answer concrete questions on `blocked` issues, then remove the `blocked`
   label so a future build pass can resume them.

`/loop` runs only while its Claude Code session stays open. Watch the first few
passes and your token usage before leaving a new installation unattended.

Run only one builder loop per repository. The issue assignee is a cooperative
lock between people; two simultaneous sessions on the same GitHub account
cannot reliably lock each other.

## Labels

| Label | On | Meaning |
| --- | --- | --- |
| `agent-ready` | issue | A human approved this contract for an agent to build |
| `blocked` | issue | An agent asked a question; waiting on a human answer |
| `loop-building` | issue | An agent has claimed this issue |
| `loop-approved` | PR | Reviewer found no must-fix issue; a human still merges |
| `loop-changes-requested` | PR | Reviewer found must-fix items |
| `needs-human-review` | PR | Escalated out of the automated queue |
| `loop-stuck` | PR | Repair budget exhausted; a human must intervene |

## What `loop-approved` means

No must-fix finding against the issue contract, all required checks passed, and
the PR was not conflicting at the reviewed commit. It is evidence for the human
merge decision, not permission for an agent to merge.

## The rules that make it work

- If it is not in the issue, it does not exist. No side-channel instructions.
- One issue per PR, sized to a day of agent work or less.
- Acceptance criteria are observable outcomes; non-goals are binding. A PR
  comment cannot expand scope — only editing the issue can.
- Blocked issues and escalated PRs leave the automated queue until a human
  resolves them.
- Spec quality is the bottleneck. Vague acceptance criteria produce confident
  wrong PRs; let `/loop-spec` ask as many questions as it needs.
- Agents never merge and never enable auto-merge.

## CI

`scripts/validate.mjs` is a safety-contract validator, not a build check. It
asserts that each skill still contains the specific clauses that make the loop
safe to run unattended — the builder excluding `blocked` issues, detecting the
default branch instead of hardcoding `origin/main`, refusing a dirty tree and
capping its repair attempts; the reviewer inspecting required checks, recording
the reviewed SHA, never pushing, and never treating absent CI as green; the spec
skill leaving `agent-ready` to a human.

If an edit removes one of those clauses, CI fails rather than quietly widening
what an agent may do. Run it locally with:

```bash
node scripts/validate.mjs
```
