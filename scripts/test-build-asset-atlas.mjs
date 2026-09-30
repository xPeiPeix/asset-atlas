import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { JSDOM } from "jsdom";
import {
  parseCard,
  readCards,
  replaceTemplateMarker,
  safeScriptJson,
  validateIndex,
  validateMermaidSyntax,
} from "./build-asset-atlas.mjs";

function cardMarkdown(id = "T-000", archived = false) {
  return `# ${id} · Example

> Find a useful tool again.

| 字段 | 内容 |
|---|---|
| 状态 | ${archived ? "⚫ 已归档" : "⚪ 待核验"} |
| 分类 | 工具 |
| 主维护位置 | 本机 |
| 最近核验 | 未核验 |
${archived ? "| 归档日期 | 2026-09-01 |\n| 归档原因 | Replaced. |\n" : ""}
`;
}
function readmeFor(cards) {
  return `## 全部工具

| ID | 工具 | 分类 | 一句话用途 | 主要位置 | 状态 | 最近核验 |
|---|---|---|---|---|---|---|
${cards.filter((card) => !card.archived).map((card) =>
    `| [${card.id}](${card.sourcePath}) | ${card.name} | ${card.category} | ${card.summary} | ${card.mainLocation} | ${card.status} | ${card.lastVerified} |`,
  ).join("\n")}

## 已归档

| ID | 工具 | 原用途 | 最后位置 | 归档日期 | 归档原因 |
|---|---|---|---|---|---|
${cards.filter((card) => card.archived).map((card) =>
    `| [${card.id}](${card.sourcePath}) | ${card.name} | ${card.summary} | ${card.mainLocation} | ${card.archiveDate} | ${card.archiveReason} |`,
  ).join("\n")}
`;
}

const atlas = parseCard(cardMarkdown(), "tools/T-000-example.md", false);
const archived = parseCard(cardMarkdown("T-012", true), "archive/T-012-example.md", true);
assert.equal(atlas.lastVerified, "未核验");
assert.equal(atlas.tags.length, 0);
assert.equal(atlas.markdown, cardMarkdown());
assert.equal(validateIndex(readmeFor([atlas, archived]), [atlas, archived]), "T-013");
assert.equal(validateIndex(readmeFor([atlas]), [atlas]), "T-001");
assert.throws(() => validateIndex(readmeFor([atlas]), [atlas, atlas]), /Duplicate permanent ID/);
assert.throws(() => validateIndex(readmeFor([archived]), [archived]), /T-000 must exist/);
assert.throws(() => validateIndex(readmeFor([atlas]).replace("Find a useful tool again.", "Different."), [atlas]), /README summary differs/);
assert.throws(() => validateIndex(readmeFor([atlas]).replace("tools/T-000-example.md", "tools/T-001-example.md"), [atlas]), /Invalid or duplicate README card link/);
assert.throws(() => validateIndex(readmeFor([atlas]), [atlas, archived]), /missing cards/);
for (const id of ["T-0", "T-00", "T-0000", "T-0101", "T-9007199254740992"]) {
  assert.throws(() => parseCard(cardMarkdown(id), `tools/${id}-example.md`, false), /Invalid card heading/);
}
assert.throws(() => parseCard(cardMarkdown("T-001"), "tools/T-002-example.md", false), /does not match filename/);
assert.throws(() => parseCard(cardMarkdown("T-000", true), "archive/T-000-example.md", true), /must remain active/);
assert.throws(() => parseCard(cardMarkdown("T-001", true), "tools/T-001-example.md", false), /Archive status/);
assert.throws(() => parseCard(cardMarkdown("T-001"), "archive/T-001-example.md", true), /Archive status/);
assert.throws(() => parseCard(cardMarkdown().replace("未核验", "2026-02-30"), atlas.sourcePath, false), /最近核验/);
assert.throws(() => parseCard(cardMarkdown().replace("| 主维护位置 | 本机 |\n", ""), atlas.sourcePath, false), /Missing required fields/);
assert.throws(() => parseCard(`${cardMarkdown()}\n| 状态 | 在用 |\n`, atlas.sourcePath, false), /Duplicate card field/);

const sourceWithFence = `${cardMarkdown()}\n\`\`\`text\n# T-999 · Not a card\n| 状态 | fake |\n\`\`\`\n`;
assert.equal(parseCard(sourceWithFence, atlas.sourcePath, false).status, atlas.status);
const diagramCard = parseCard(`${cardMarkdown()}\n## 系统架构\n\n\`\`\`mermaid\nflowchart LR\nA[Card] --> B[Page]\n\`\`\`\n`, atlas.sourcePath, false);
await validateMermaidSyntax([diagramCard]);
await assert.rejects(() => validateMermaidSyntax([{ ...diagramCard, diagrams: [{ ...diagramCard.diagrams[0], source: 'flowchart LR\nA["unclosed]' }] }]), /Invalid Mermaid syntax/);

const dangerous = { summary: '</script><script>window.injected = true</script>\u2028&', title: "<img src=x onerror=alert(1)>" };
const serialized = safeScriptJson(dangerous);
assert.equal(serialized.includes("<"), false);
const dom = new JSDOM(`<script>window.card = ${serialized};</script>`, { runScripts: "dangerously" });
assert.equal(dom.window.document.scripts.length, 1);
assert.equal(dom.window.injected, undefined);
assert.deepEqual(JSON.parse(JSON.stringify(dom.window.card)), dangerous);
dom.window.close();
assert.equal(replaceTemplateMarker("A /* MARK */ B", "/* MARK */", "$& $1 $$"), "A $& $1 $$ B");

const fixture = await mkdtemp(path.join(os.tmpdir(), "asset-atlas-test-"));
try {
  await mkdir(path.join(fixture, "tools"));
  await writeFile(path.join(fixture, "tools", "notes.md"), "Not a card.");
  await assert.rejects(() => readCards("tools", false, fixture), /Invalid card filename/);
  await rm(path.join(fixture, "tools", "notes.md"));
  await writeFile(path.join(fixture, "tools", "T-001-example.md"), "Not a card.");
  await assert.rejects(() => readCards("tools", false, fixture), /Invalid card heading/);
} finally {
  await rm(fixture, { recursive: true });
}
process.stdout.write("Card, index, diagram, and script escaping tests passed.\n");
