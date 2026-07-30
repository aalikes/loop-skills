---
name: loop-spec
description: Interview the user about a raw idea until the behavior is unambiguous, then file a build-ready GitHub issue with AC-N acceptance criteria and NG-N non-goals. Use when asked to run the loop system's spec interview, draft a queue-ready issue, or plan a feature for an agent to build. Interactive — requires the user present; never run unattended.
---

# Spec interview

Turns a raw idea into a GitHub issue so complete that a build agent needs
nothing beyond the issue. Works like plan mode: research the codebase,
interview the user in rounds until confident, draft, confirm, file.

The user is the product brain; you are the codebase brain. Never guess a
product decision.

## 1. Research before asking

Read the relevant code first. Find which files are involved, what patterns
already exist, and what constraints apply. Never ask the user something the
codebase can answer for you.

## 2. Interview in rounds

Ask 1–4 questions per round, each with concrete options and your recommended
option first. Ask only genuine product decisions:

- Behavior forks: who sees it, what exactly happens, where does it live
- Scope boundaries: what is explicitly out of this issue
- Edge cases that change acceptance criteria: empty states, permissions,
  failure handling
- Data implications: existing records, migrations

After each round, fold the answers in and apply the confidence test:

> Could two different engineers read this spec and ship the same observable
> behavior?

If any fork remains, ask another round. There is **no cap on rounds**: a small
fix might need two questions; a big feature legitimately needs 10–20 or more.
Never stop early because it feels like a lot of questions, and never pad with
filler questions once the test passes.

## 3. Draft the issue

Use exactly this shape for the issue body:

```md
## Problem

What user or business problem does this solve? One or two sentences.

## Acceptance Criteria

- [ ] AC-1 — Observable, testable outcome one
- [ ] AC-2 — Observable, testable outcome two

## Non-goals

- NG-1 — What must NOT change in this task
- NG-2 — What is explicitly excluded or saved for later

## Relevant files

- path/to/file.ts — why it matters

## Test expectations

- What should be tested, manually or automatically

## How to verify

1. Numbered manual steps anyone can follow to confirm the work: where to
   go, what to do, exactly what should happen. Cover every AC.
```

Rules for the draft:

- Every acceptance criterion is an observable outcome with a stable `AC-N` id.
  Every non-goal has a stable `NG-N` id. These ids are the contract that
  `/loop-build` and `/loop-review` enforce.
- No acceptance criterion may require a non-goal. If one does, resolve the
  contradiction with the user before filing.
- Size the issue to one day of agent work or less. Bigger work becomes a chain
  of small issues, ordered so each is buildable using only merged code from the
  ones before it.
- When an issue depends on another, add a line `Blocked by: #NNN` directly under
  the `## Problem` heading. `/loop-build` refuses to claim an issue whose
  `Blocked by:` references are still open.

## 4. Confirm and file

Show the full draft in chat and get the user's explicit go-ahead. Then file it:

```bash
gh issue create --title "TITLE" --body-file /path/to/draft.md
```

Write the body to a temp file rather than passing it inline, so Markdown,
backticks, and newlines survive intact. Report the exact issue number and URL
that `gh` returns — the build and review skills use that number rather than
guessing it.

For a chain of issues, file them in dependency order so each one's
`Blocked by:` line can reference a real issue number.

## Hard rule

**Never apply the `agent-ready` label.** The user applies it themselves after a
final read. That label is the approval gate between "an idea" and "an agent
builds it", and it is the only place a human authorizes work to enter the loop.

Tell the user which issues you filed and that applying `agent-ready` is their
next step.
