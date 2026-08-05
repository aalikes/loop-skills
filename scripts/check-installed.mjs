import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
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

Exit codes: 0 in sync (or installed), 1 drift or missing, 2 bad usage,
            3 a file could not be read or written.`;

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

// A root that exists but is not a directory is a mistyped argument, not drift.
// Catching it here keeps readdirSync from throwing ENOTDIR mid-run and keeps
// exit 1 meaning what the contract says it means.
if (existsSync(root)) {
  let rootStat;
  try {
    rootStat = statSync(root);
  } catch (error) {
    usage(`--root cannot be read (${error.code}): ${root}`);
  }
  if (!rootStat.isDirectory()) {
    usage(`--root must be a directory, but this is not one: ${root}`);
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

// `ERROR` is deliberately distinct from `MISSING`: a file that cannot be read is
// a broken environment, while a file that is not there is ordinary drift. They
// exit differently so a caller can tell them apart.
const errorLine = (name, error, path) => `ERROR   ${name} — ${error.code}: ${path}`;

if (install) {
  const failed = [];
  for (const name of tracked) {
    const destination = installedPath(name);
    try {
      mkdirSync(join(root, name), { recursive: true });
      writeFileSync(destination, readFileSync(trackedPath(name)));
    } catch (error) {
      failed.push(errorLine(name, error, destination));
      continue;
    }
    // Printed only after the write returned, so this line is never a claim
    // about a write that did not happen.
    console.log(`wrote ${destination}`);
  }
  for (const line of failed) {
    console.log(line);
  }
  if (failed.length > 0) {
    console.log(
      `\nInstalled ${tracked.length - failed.length} of ${tracked.length} skills to ${root}; ` +
        `${failed.length} failed.`,
    );
    process.exit(3);
  }
  console.log(`Installed ${tracked.length} skills to ${root}`);
  process.exit(0);
}

const missing = [];
const drifted = [];
const errors = [];

for (const name of tracked) {
  const destination = installedPath(name);

  let source;
  try {
    source = readFileSync(trackedPath(name));
  } catch (error) {
    errors.push(errorLine(name, error, trackedPath(name)));
    continue;
  }

  // ENOENT is the only errno that means "not installed". Everything else —
  // EACCES on an unreadable file or its directory, EISDIR, ENOTDIR — means the
  // file may well be there and we could not look at it, which is not the same
  // thing and must not be reported as MISSING.
  let installed;
  try {
    installed = readFileSync(destination);
  } catch (error) {
    if (error.code === "ENOENT") {
      missing.push({ name, destination });
    } else {
      errors.push(errorLine(name, error, destination));
    }
    continue;
  }

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
let installedNames = [];
if (existsSync(root)) {
  try {
    installedNames = readdirSync(root).filter((name) =>
      existsSync(join(root, name, "SKILL.md")),
    );
  } catch (error) {
    errors.push(errorLine("(install root)", error, root));
  }
}
const untracked = installedNames.filter((name) => !tracked.includes(name)).sort();

for (const entry of drifted) {
  console.log(`DRIFT   ${entry.name} — first differs at line ${entry.line}`);
  console.log(`        ${entry.destination}`);
}
for (const entry of missing) {
  console.log(`MISSING ${entry.name} — expected at ${entry.destination}`);
}
for (const line of errors) {
  console.log(line);
}
for (const name of untracked) {
  console.log(`WARN    ${name} is installed but not tracked in skills/`);
}

const skillErrors = errors.filter((line) => !line.includes("(install root)"));
const inSync = tracked.length - missing.length - drifted.length - skillErrors.length;
console.log(
  `\nChecked ${tracked.length} skills against ${root}: ` +
    `${inSync} in sync, ${drifted.length} drifted, ${missing.length} missing, ` +
    `${skillErrors.length} unreadable, ${untracked.length} untracked.`,
);

// An unreadable file outranks drift: the run could not answer the question it
// was asked, so it must not exit 1 and be mistaken for a clean drift report.
if (errors.length > 0) {
  console.log("Fix the errors above; the comparison above them is incomplete.");
  process.exit(3);
}

if (drifted.length > 0 || missing.length > 0) {
  console.log("Run with --install to overwrite the installed copies.");
  process.exit(1);
}
