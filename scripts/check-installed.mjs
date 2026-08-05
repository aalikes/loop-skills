import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const USAGE = `Usage: node scripts/check-installed.mjs [--install] [--root <path>]

Compares the SKILL.md files tracked in skills/ against their installed copies.

  (no flags)      Read-only. Reports drift and exits 1 if any skill is
                  missing or differs; exits 0 when every skill matches.
  --install       Copy each tracked skill over its installed counterpart.
  --root <path>   Install root to compare against.
                  Default: $HOME/.claude/skills

Exit codes: 0 in sync (or installed), 1 drift detected, 2 bad usage.`;

function usage(message) {
  process.stderr.write(`${message}\n\n${USAGE}\n`);
  process.exit(2);
}

const skillsDir = fileURLToPath(new URL("../skills/", import.meta.url));

let install = false;
let root = join(homedir(), ".claude", "skills");

const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 1) {
  const arg = argv[i];
  if (arg === "--install") {
    install = true;
  } else if (arg === "--root") {
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      usage("--root requires a path argument");
    }
    root = resolve(value);
    i += 1;
  } else {
    usage(`Unrecognized argument: ${arg}`);
  }
}

const tracked = readdirSync(skillsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

const trackedPath = (name) => join(skillsDir, name, "SKILL.md");
const installedPath = (name) => join(root, name, "SKILL.md");

// The byte comparison decides whether a skill has drifted; this only locates
// where, for the report. It compares decoded text, so bytes that differ can
// still decode to the same string — distinct invalid UTF-8 all becomes U+FFFD.
// The loop then falls through to `limit`, which is a usable line number for a
// file that has genuinely drifted.
function firstDifferingLine(a, b) {
  const left = a.split("\n");
  const right = b.split("\n");
  const limit = Math.max(left.length, right.length);
  for (let i = 0; i < limit; i += 1) {
    if (left[i] !== right[i]) {
      return i + 1;
    }
  }
  return limit;
}

if (install) {
  for (const name of tracked) {
    const destination = installedPath(name);
    mkdirSync(join(root, name), { recursive: true });
    writeFileSync(destination, readFileSync(trackedPath(name)));
    console.log(`wrote ${destination}`);
  }
  console.log(`Installed ${tracked.length} skills to ${root}`);
  process.exit(0);
}

const missing = [];
const drifted = [];

for (const name of tracked) {
  const destination = installedPath(name);
  if (!existsSync(destination)) {
    missing.push({ name, destination });
    continue;
  }
  const source = readFileSync(trackedPath(name));
  const installed = readFileSync(destination);
  if (source.equals(installed)) {
    continue;
  }
  drifted.push({
    name,
    destination,
    line: firstDifferingLine(source.toString(), installed.toString()),
  });
}

// An installed skill is a directory holding a SKILL.md. Testing for that file
// rather than for a directory gets the symlink case right for free: existsSync
// follows links, so a skill symlinked in from a vault counts, while a broken
// link, a loose file, and a directory with no SKILL.md all correctly do not.
// Dirent.isDirectory() would miss the symlinked case — it is false for a
// symlink even when the link points at a directory.
const installedNames = existsSync(root)
  ? readdirSync(root).filter((name) => existsSync(join(root, name, "SKILL.md")))
  : [];
const untracked = installedNames.filter((name) => !tracked.includes(name)).sort();

for (const entry of drifted) {
  console.log(`DRIFT   ${entry.name} — first differs at line ${entry.line}`);
  console.log(`        ${entry.destination}`);
}
for (const entry of missing) {
  console.log(`MISSING ${entry.name} — expected at ${entry.destination}`);
}
for (const name of untracked) {
  console.log(`WARN    ${name} is installed but not tracked in skills/`);
}

const inSync = tracked.length - missing.length - drifted.length;
console.log(
  `\nChecked ${tracked.length} skills against ${root}: ` +
    `${inSync} in sync, ${drifted.length} drifted, ${missing.length} missing, ` +
    `${untracked.length} untracked.`,
);

if (drifted.length > 0 || missing.length > 0) {
  console.log("Run with --install to overwrite the installed copies.");
  process.exit(1);
}
