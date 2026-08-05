import { existsSync, readFileSync, readdirSync } from "node:fs";

const root = new URL("../", import.meta.url);

function read(relativePath) {
  return readFileSync(new URL(relativePath, root), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const skillNames = ["loop-build", "loop-init", "loop-review", "loop-spec"];
const actualSkillNames = readdirSync(new URL("skills/", root), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

assert(
  JSON.stringify(actualSkillNames) === JSON.stringify(skillNames),
  `Expected only ${skillNames.join(", ")}; found ${actualSkillNames.join(", ")}`,
);

for (const skillName of skillNames) {
  const relativePath = `skills/${skillName}/SKILL.md`;
  const text = read(relativePath);
  const frontmatter = text.match(/^---\n([\s\S]*?)\n---\n/);

  assert(frontmatter, `${relativePath} is missing YAML frontmatter`);

  const fields = frontmatter[1]
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const name = fields.find((line) => line.startsWith("name: "))?.slice(6);
  const description = fields
    .find((line) => line.startsWith("description: "))
    ?.slice(13);

  assert(fields.length === 2, `${relativePath} must contain only name and description frontmatter`);
  assert(name === skillName, `${relativePath} name must be ${skillName}`);
  assert(description, `${relativePath} needs a description`);
  assert(
    description.length <= 500,
    `${relativePath} description is ${description.length} chars; keep it under 500`,
  );
}

const build = read("skills/loop-build/SKILL.md");
const review = read("skills/loop-review/SKILL.md");
const spec = read("skills/loop-spec/SKILL.md");
const init = read("skills/loop-init/SKILL.md");
const readme = read("README.md");

// Step 3 verifies a claim this same pass just wrote. GitHub's search index lags
// writes by several seconds, so that verification has to be a direct read of the
// issue; a search query can report the claim as never having happened.
const claimSection = build.match(/## 3\. Claim[\s\S]*?(?=\n## )/)?.[0] ?? "";

// Safety contracts. Each of these encodes a rule that makes the loop safe to run
// unattended. If an edit removes one, CI fails rather than quietly widening what
// an agent is allowed to do.
const requiredContracts = [
  [build.includes("not labeled `blocked`"), "builder must exclude blocked issues from the queue"],
  [build.includes("defaultBranchRef"), "builder must detect the default branch"],
  [!build.includes("origin/main"), "builder must not hardcode origin/main"],
  [build.includes("git status --porcelain"), "builder must refuse a dirty working tree"],
  [build.includes("remove `loop-changes-requested`"), "builder escalation must leave the repair queue"],
  [build.includes("Never merge"), "builder must never merge"],
  [/repair budget/i.test(build), "builder must cap its repair attempts"],
  [build.includes("loop-stuck"), "builder must have an escape hatch label"],
  [
    claimSection.includes("gh issue view NUMBER") && !claimSection.includes("--search"),
    "builder must confirm its claim with a direct issue read, never a lagging search query",
  ],
  [review.includes("gh pr checks NUMBER --required"), "reviewer must inspect required checks"],
  [review.includes("Loop review of COMMIT_SHA"), "reviewer must record the reviewed SHA"],
  [review.includes("Never merge and never enable auto-merge"), "reviewer must never merge"],
  [review.includes("Never push commits to the PR branch"), "reviewer must never push code"],
  [/absent CI is not green/i.test(review), "reviewer must not treat missing CI as passing"],
  [spec.includes("Never apply the `agent-ready` label"), "spec must leave the approval gate to a human"],
  [init.includes("gh label create agent-ready"), "init must create the queue label"],
  [/humans merge/i.test(readme), "README must state the humans-merge rule"],
];

for (const [condition, message] of requiredContracts) {
  assert(condition, message);
}

for (const match of readme.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
  const target = match[1];
  if (!target.startsWith("http") && !target.startsWith("#")) {
    assert(existsSync(new URL(target, root)), `README link does not exist: ${target}`);
  }
}

console.log(
  `Validated ${skillNames.length} skills, README links, and ${requiredContracts.length} safety contracts.`,
);
