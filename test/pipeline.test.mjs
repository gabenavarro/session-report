import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BIN = join(import.meta.dirname, "..", "scripts", "pipeline.mjs");
const root = mkdtempSync(join(tmpdir(), "session-report-test-"));

/** Build a fake writeup skill dir. `failAudit` makes the gate exit 1. */
function makeWriteup(name, { failAudit = false } = {}) {
  const dir = join(root, name);
  mkdirSync(join(dir, "scripts"), { recursive: true });
  writeFileSync(
    join(dir, "scripts", "audit_writeup.py"),
    `#!/usr/bin/env python3\nimport sys\nsys.stdout.write("audit: fake finding\\n") if ${failAudit ? "True" : "False"} else sys.stdout.write("audit: clean\\n")\nsys.exit(1 if ${failAudit ? "True" : "False"} else 0)\n`,
  );
  return dir;
}

function makeMd2html(name, { failRender = false } = {}) {
  const dir = join(root, name);
  mkdirSync(join(dir, "bin"), { recursive: true });
  writeFileSync(join(dir, "bin", "md2html.mjs"), `#!/usr/bin/env node
import { writeFileSync, existsSync } from "node:fs";
if (process.argv.includes("--version")) { console.log("md2html 0.0.0-fake"); process.exit(0); }
const md = process.argv.find((a) => a.endsWith(".md"));
if (!md || !existsSync(md)) { console.error("no md"); process.exit(1); }
if (${failRender}) { console.error("fake render failure"); process.exit(1); }
writeFileSync(md.replace(/\\.md$/, ".html"), "<html>fake</html>");
console.log(md + " -> " + md.replace(/\\.md$/, ".html"));
`);
  writeFileSync(join(dir, "package.json"), "{}");
  mkdirSync(join(dir, "node_modules"), { recursive: true });
  return dir;
}

function writeReport(name, body = "# T\n") {
  const p = join(root, name);
  writeFileSync(p, body);
  return p;
}

function run(...argv) {
  return spawnSync("node", [BIN, ...argv], { encoding: "utf8" });
}

test("check: healthy env exits 0 and names both skills", () => {
  const w = makeWriteup("wu-ok");
  const m = makeMd2html("m-ok");
  const r = run("check", "--writeup", w, "--md2html", m);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /environment ready/);
});

test("check: missing audit script fails with actionable message", () => {
  const w = join(root, "wu-missing");
  mkdirSync(join(w, "bin"), { recursive: true });
  writeFileSync(join(w, "bin", "placeholder"), "x");
  const m = makeMd2html("m-ok2");
  const r = run("check", "--writeup", w, "--md2html", m);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /audit_writeup\.py not found/);
});

test("check: missing md2html renderer fails", () => {
  const w = makeWriteup("wu-ok3");
  const m = join(root, "m-missing");
  mkdirSync(join(m, "scripts"), { recursive: true });
  writeFileSync(join(m, "scripts", "placeholder"), "x");
  const r = run("check", "--writeup", w, "--md2html", m);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /bin\/md2html\.mjs not found/);
});

test("run: audit failure blocks render, no HTML produced", () => {
  const w = makeWriteup("wu-fail", { failAudit: true });
  const m = makeMd2html("m-ok4");
  const md = writeReport("blocked.md");
  const r = run("run", md, "--writeup", w, "--md2html", m);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /audit: fake finding/);
  assert.match(r.stderr, /audit gate failed/);
  assert.ok(!existsSync(join(root, "blocked.html")), "no HTML from a failing document");
});

test("run: clean audit renders, exit 0, HTML exists", () => {
  const w = makeWriteup("wu-pass");
  const m = makeMd2html("m-ok5");
  const md = writeReport("ok.md");
  const r = run("run", md, "--writeup", w, "--md2html", m);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /audit gate clean/);
  assert.match(r.stdout, /pipeline: complete/);
  assert.ok(existsSync(join(root, "ok.html")));
});

test("run: render failure propagates exit 1", () => {
  const w = makeWriteup("wu-pass2");
  const m = makeMd2html("m-fail", { failRender: true });
  const md = writeReport("fail-render.md");
  const r = run("run", md, "--writeup", w, "--md2html", m);
  assert.equal(r.status, 1);
});

test("run: invalid --theme rejected", () => {
  const w = makeWriteup("wu-pass3");
  const m = makeMd2html("m-ok6");
  const md = writeReport("theme.md");
  const r = run("run", md, "--writeup", w, "--md2html", m, "--theme", "neon");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--theme must be auto\|light\|dark/);
});

test("run: missing flags usage, exit 1", () => {
  const md = writeReport("noflags.md");
  const r = run("run", md);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--writeup <dir> and --md2html <dir> are required/);
});

process.on("exit", () => rmSync(root, { recursive: true, force: true }));
