#!/usr/bin/env node
/**
 * session-report pipeline — chains technical-session-writeup (audit gate)
 * into md2html (render). The lockstep rule: no HTML from a failing document.
 *
 * Usage:
 *   pipeline.mjs check --writeup <dir> --md2html <dir>
 *   pipeline.mjs run <report.md> --writeup <dir> --md2html <dir>
 *                 [--theme auto|light|dark] [--no-check] [--open]
 *                 [--python <path>] [--out <path>]
 *
 * Exit codes: 0 = success, 1 = environment/audit/render failure.
 */

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

function usage() {
  console.log(`session-report pipeline

Usage:
  pipeline.mjs check --writeup <dir> --md2html <dir>
  pipeline.mjs run <report.md> --writeup <dir> --md2html <dir> [--theme auto|light|dark] [--no-check] [--open] [--python <path>] [--out <path>]`);
  process.exit(1);
}

const args = process.argv.slice(2);
const cmd = args[0];
const rest = args.slice(1);

function opt(name) {
  const i = rest.indexOf(name);
  return i === -1 ? undefined : rest[i + 1];
}
function has(name) {
  return rest.includes(name);
}

function requireDirs() {
  const writeup = opt("--writeup");
  const md2html = opt("--md2html");
  if (!writeup || !md2html) {
    console.error("pipeline: both --writeup <dir> and --md2html <dir> are required");
    usage();
  }
  return { writeup: resolve(writeup), md2html: resolve(md2html) };
}

function envProblem(problem) {
  console.error(`pipeline: ${problem}`);
  process.exit(1);
}

function checkEnvironment(writeup, md2html) {
  const problems = [];
  if (!existsSync(join(writeup, "scripts", "audit_writeup.py")))
    problems.push(`technical-session-writeup: scripts/audit_writeup.py not found in ${writeup}`);
  if (!existsSync(join(md2html, "bin", "md2html.mjs")))
    problems.push(`md2html: bin/md2html.mjs not found in ${md2html}`);
  if (!existsSync(join(md2html, "node_modules")))
    problems.push("md2html: node_modules missing (run its scripts/ensure-env.sh)");

  const py = spawnSync("python3", ["--version"], { encoding: "utf8" });
  if (py.status !== 0) problems.push("python3 not available (audit gate requires it)");

  const xy = spawnSync("node", [join(md2html, "bin", "md2html.mjs"), "--version"], {
    encoding: "utf8",
  });
  const version = xy.status === 0 ? xy.stdout.trim() : null;
  if (!version) problems.push("md2html: renderer not runnable (node_modules?)");

  const venv = join(md2html, ".venv", "bin", "python");
  const hasVenv = existsSync(venv);
  if (!hasVenv)
    console.log("pipeline: note: md2html .venv absent — XY chart blocks will fail until ensure-env.sh runs");

  if (problems.length) {
    problems.forEach((p) => console.error(`pipeline: ${p}`));
    process.exit(1);
  }
  console.log(`pipeline: environment ready (${version})`);
  console.log(`  writeup: ${writeup}`);
  console.log(`  md2html: ${md2html}`);
}

function runAudit(writeup, md) {
  const audit = join(writeup, "scripts", "audit_writeup.py");
  const r = spawnSync("python3", [audit, md], { encoding: "utf8" });
  const out = (r.stdout || "") + (r.stderr || "");
  if (out.trim()) process.stdout.write(out);
  if (r.status === 0) {
    console.log("pipeline: audit gate clean");
    return true;
  }
  console.error("pipeline: audit gate failed — no HTML produced. Fix the findings, then re-run.");
  return false;
}

function render(md2html, md, opts) {
  const argv = [join(md2html, "bin", "md2html.mjs"), resolve(md)];
  if (opts.theme) argv.push("--theme", opts.theme);
  if (opts.python) argv.push("--python", opts.python);
  if (opts.noCheck) argv.push("--no-check");
  if (opts.open) argv.push("--open");
  if (opts.out) argv.push("--out", opts.out);
  const r = spawnSync("node", argv, { stdio: "inherit" });
  return r.status === 0;
}

if (cmd === "check") {
  const dirs = requireDirs();
  checkEnvironment(dirs.writeup, dirs.md2html);
} else if (cmd === "run") {
  const md = rest.find((a) => !a.startsWith("--"));
  if (!md) usage();
  const dirs = requireDirs();
  const theme = opt("--theme");
  if (theme && !["auto", "light", "dark"].includes(theme))
    envProblem(`--theme must be auto|light|dark (got ${theme})`);
  checkEnvironment(dirs.writeup, dirs.md2html);
  if (!existsSync(md)) envProblem(`not found: ${resolve(md)}`);
  if (!runAudit(dirs.writeup, md)) process.exit(1);
  if (!render(dirs.md2html, md, {
    theme,
    python: opt("--python"),
    noCheck: has("--no-check"),
    open: has("--open"),
    out: opt("--out"),
  }))
    process.exit(1);
  console.log("pipeline: complete");
} else {
  usage();
}
