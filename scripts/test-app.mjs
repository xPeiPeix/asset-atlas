import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";

const html = await readFile(new URL("../asset-atlas.html", import.meta.url), "utf8");
assert.equal(await readFile(new URL("../dist/index.html", import.meta.url), "utf8"), html);
const dom = new JSDOM(html, {
  url: "http://localhost/asset-atlas.html",
  pretendToBeVisual: true,
  runScripts: "outside-only",
});
const { window } = dom;
window.matchMedia = () => ({ matches: false, addEventListener() {} });
window.scrollTo = () => {};
window.HTMLElement.prototype.scrollIntoView = () => {};
window.mermaid = {
  initialize() {},
  async render() { return { svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text>Diagram</text></svg>' }; },
};
for (const script of window.document.scripts) {
  if (!script.src) window.eval(script.textContent);
}
const delay = () => new Promise((resolve) => setTimeout(resolve, 30));
await delay();
const $ = (selector) => window.document.querySelector(selector);
const $$ = (selector) => [...window.document.querySelectorAll(selector)];
const cards = window.__ASSET_ATLAS__.cards;
assert.ok(cards.length > 1);
assert.equal($$("[data-asset-id]").length, cards.length);
assert.equal($$("[data-action*='privacy'], [type=password]").length, 0);
assert.equal($$("script[src]").every((script) => script.src.startsWith("data:")), true);

const search = $("#asset-search");
search.value = cards[0].id;
search.dispatchEvent(new window.Event("input", { bubbles: true }));
assert.equal($$("[data-asset-id]").length, 1);
$("[data-asset-id]").click();
await delay();
assert.equal(window.location.hash, `#${cards[0].id}`);
assert.equal($(".detail-view").hidden, false);
const download = $("a[download]");
assert.equal(decodeURIComponent(download.getAttribute("href").split(",").slice(1).join(",")), cards[0].markdown);
window.history.back();
await delay();
assert.equal($(".detail-view").hidden, true);
assert.equal($("#asset-search").value, cards[0].id);
window.history.forward();
await delay();
assert.equal($(".detail-view").hidden, false);
$("[data-action=go-home]").click();
assert.equal($$("[data-asset-id]").length, cards.length);

const category = cards[0].category;
$$("[data-category]").find((button) => button.dataset.category === category).click();
assert.equal($$("[data-asset-id]").length, cards.filter((card) => card.category === category).length);
$("[data-action=go-home]").click();
const status = cards[0].status;
$$("[data-status]").find((button) => button.dataset.status === status).click();
assert.equal($$("[data-asset-id]").length, cards.filter((card) => card.status === status).length);
$("[data-palette-choice=slate]").click();
assert.equal(window.document.documentElement.dataset.palette, "slate");
assert.equal(window.localStorage.getItem("asset-atlas.palette"), "slate");
$("[data-action=cycle-appearance]").click();
assert.equal(window.document.documentElement.dataset.appearance, "light");
assert.equal(window.localStorage.getItem("asset-atlas.appearance"), "light");
dom.window.close();
process.stdout.write("Search, filters, detail history, Markdown download, and appearance tests passed.\n");
