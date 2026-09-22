import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BIN = join(import.meta.dirname, "..", "scripts", "pipeline.mjs");
const root = mkdtempSync(join(tmpdir(), "session-report-test-"));

/** Build a fake writeup skill dir. `failAudit` makes the gate exit 1. */
function makeWriteup(name, { failAudit = false, failOn = null } = {}) {
  const dir = join(root, name);
  mkdirSync(join(dir, "scripts"), { recursive: true });
  writeFileSync(
    join(dir, "scripts", "audit_writeup.py"),
    `#!/usr/bin/env python3
import sys
name = sys.argv[1]
fail = ${failAudit ? "True" : failOn ? `(${JSON.stringify(failOn)} in name)` : "False"}
sys.stdout.write("audit: fake finding\\n") if fail else sys.stdout.write("audit: clean\\n")
sys.exit(1 if fail else 0)
`,
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
  assert.match(r.stdout, /pipeline: complete \(1 file\)/);
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

test("CLI: --help exits 0, --version prints version", () => {
  const h = run("--help");
  assert.equal(h.status, 0, "--help is a successful query");
  assert.match(h.stdout, /Usage:/);
  const v = run("--version");
  assert.equal(v.status, 0);
  assert.match(v.stdout.trim(), /^session-report pipeline \d+\.\d+\.\d+$/);
});

test("run: multiple inputs all rendered", () => {
  const w = makeWriteup("wu-m1");
  const m = makeMd2html("m-m1");
  const a = writeReport("multi-a.md");
  const b = writeReport("multi-b.md");
  const r = run("run", a, b, "--writeup", w, "--md2html", m);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(existsSync(join(root, "multi-a.html")), "first rendered");
  assert.ok(existsSync(join(root, "multi-b.html")), "second rendered (was silently dropped)");
  assert.match(r.stdout, /pipeline: complete \(2 files\)/);
});

test("run: directory input expands to its .md files, skips README.md", () => {
  const w = makeWriteup("wu-dir");
  const m = makeMd2html("m-dir");
  const d = join(root, "dir-in");
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, "one.md"), "# 1\n");
  writeFileSync(join(d, "two.md"), "# 2\n");
  writeFileSync(join(d, "README.md"), "# R\n");
  const r = run("run", d, "--writeup", w, "--md2html", m);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(existsSync(join(d, "one.html")));
  assert.ok(existsSync(join(d, "two.html")));
  assert.ok(!existsSync(join(d, "README.html")), "README skipped");
  assert.match(r.stdout, /pipeline: complete \(2 files\)/);
});
test("run: one failing input leaves others rendered, exits 1", () => {
  const w = makeWriteup("wu-mix", { failOn: "-bad.md" });
  const m = makeMd2html("m-mix");
  const bad = writeReport("report-bad.md");
  const good = writeReport("report-good.md");
  const r = run("run", bad, good, "--writeup", w, "--md2html", m);
  assert.equal(r.status, 1, "exit 1 when any input fails");
  assert.ok(!existsSync(join(root, "report-bad.html")), "failing input produced no HTML");
  assert.ok(existsSync(join(root, "report-good.html")), "other input still rendered");
  assert.match(r.stderr, /1 of 2 file\(s\) failed/);
});

test("run: --out with multiple inputs rejected", () => {
  const w = makeWriteup("wu-m3");
  const m = makeMd2html("m-m3");
  const a = writeReport("out-a.md");
  const b = writeReport("out-b.md");
  const r = run("run", a, b, "--out", join(root, "x.html"), "--writeup", w, "--md2html", m);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--out applies to a single input/);
});

test("run: missing flags usage, exit 1", () => {
  const md = writeReport("noflags.md");
  const r = run("run", md);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--writeup <dir> and --md2html <dir> are required/);
});

process.on("exit", () => rmSync(root, { recursive: true, force: true }));
