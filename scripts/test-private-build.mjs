import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, realpath, rm, stat, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const fixture = await realpath(await mkdtemp(path.join(os.tmpdir(), "asset-atlas-private-build-")));
const marker = "private-build-fixture-detail";

try {
  for (const directory of ["scripts", "tools", "archive", "dist", ".asset-atlas"]) {
    await mkdir(path.join(fixture, directory));
  }
  await cp(path.join(projectRoot, "scripts/build-asset-atlas.mjs"), path.join(fixture, "scripts/build-asset-atlas.mjs"));
  await cp(path.join(projectRoot, "web"), path.join(fixture, "web"), { recursive: true });
  await symlink(path.join(projectRoot, "node_modules"), path.join(fixture, "node_modules"), "dir");
  await writeFile(path.join(fixture, "README.md"), "# Example collection\n");
  await writeFile(path.join(fixture, "tools/T-000-example.md"), `# T-000 · Example collection

> ${marker}

| 字段 | 内容 |
|---|---|
| 状态 | ⚪ 待核验 |
| 分类 | 工具 |
| 主维护位置 | 本机 |
| 最近核验 | 未核验 |
`);
  await writeFile(path.join(fixture, "dist/index.html"), "existing static output");
  await writeFile(path.join(fixture, "asset-atlas.html"), "existing offline output");
  const locks = '{"version":1,"lockedIds":["T-000"]}\n';
  await writeFile(path.join(fixture, ".asset-atlas/locks.json"), locks);

  const builder = path.join(fixture, "scripts/build-asset-atlas.mjs");
  await run(process.execPath, [builder, "--private"]);
  const shell = await readFile(path.join(fixture, ".asset-atlas/index.html"), "utf8");
  const data = JSON.parse(await readFile(path.join(fixture, ".asset-atlas/data.json"), "utf8"));
  assert.match(shell, /window\.__ASSET_ATLAS_ENDPOINT__ = "\/api\/data";/);
  assert.equal(shell.includes(marker), false, "private shell must not embed card details");
  assert.equal(shell.includes('window.__ASSET_ATLAS__ = {'), false);
  assert.equal(data.cards[0].summary, marker);
  assert.equal(await readFile(path.join(fixture, "dist/index.html"), "utf8"), "existing static output");
  assert.equal(await readFile(path.join(fixture, "asset-atlas.html"), "utf8"), "existing offline output");
  assert.equal(await readFile(path.join(fixture, ".asset-atlas/locks.json"), "utf8"), locks);
  if (process.platform !== "win32") {
    assert.equal((await stat(path.join(fixture, ".asset-atlas/data.json"))).mode & 0o777, 0o600);
  }

  await run(process.execPath, [builder]);
  const offline = await readFile(path.join(fixture, "asset-atlas.html"), "utf8");
  assert.ok(offline.includes(marker), "static mode remains a complete offline collection");
  assert.equal(offline, await readFile(path.join(fixture, "dist/index.html"), "utf8"));
  assert.equal(await readFile(path.join(fixture, ".asset-atlas/index.html"), "utf8"), shell);
  await assert.rejects(run(process.execPath, [builder, "--unknown"]), /Usage:/);
} finally {
  await rm(fixture, { recursive: true, force: true });
}

process.stdout.write("Private build separation and unchanged static output tests passed.\n");
