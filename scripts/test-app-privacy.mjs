import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";

const app = await readFile(new URL("../web/app.js", import.meta.url), "utf8");
const viewport = await readFile(new URL("../web/diagram-viewport.js", import.meta.url), "utf8");
const privateMarker = "fixture-private-location";
const cards = [1, 2].map((number) => ({
  id: `T-00${number}`, numericId: number, name: `Fixture ${number}`,
  summary: number === 2 ? privateMarker : "Public summary",
  sourcePath: `tools/T-00${number}-fixture.md`,
  markdown: number === 2 ? `# Private card\n${privateMarker}` : "# Public card",
  status: "在用", category: "其他", archived: false, lastVerified: "2026-01-01",
  avatarDataUrl: "data:image/webp;base64,AA==", tags: [], fields: [], links: [], diagrams: [],
  searchableText: number === 2 ? `T-002 ${privateMarker}` : "T-001 Public summary",
}));

function fakeService() {
  const service = { authenticated: false, failLogout: false, failData: false, lockedIds: new Set(["T-002"]), calls: [] };
  const response = (status, value) => ({ status, ok: status >= 200 && status < 300, json: async () => value });
  service.fetch = async (url, options = {}) => {
    const path = new URL(url, "http://localhost").pathname;
    service.calls.push({ path, method: options.method ?? "GET" });
    assert.equal(options.credentials, "same-origin");
    if (path === "/api/data") {
      if (service.failData) throw new Error("Offline");
      return response(200, {
        version: 4, authenticated: service.authenticated, metadata: {},
        counts: { total: 2, categories: { 其他: 2 }, statuses: [{ rawStatus: "在用", label: "在用", className: "healthy", count: 2 }] },
        cards: cards.map((card) => {
          const locked = service.lockedIds.has(card.id);
          if (!locked || service.authenticated) return { ...card, locked, detailsAvailable: true };
          const { markdown, sourcePath, summary, searchableText, ...cover } = card;
          return { ...cover, locked, detailsAvailable: false, summary: "Protected", searchableText: card.id };
        }),
      });
    }
    if (path === "/api/session/login") {
      if (JSON.parse(options.body).password !== "fixture-password") return response(401, {});
      service.authenticated = true;
      return response(200, {});
    }
    if (path === "/api/session/logout") {
      if (service.failLogout) throw new Error("Offline");
      service.authenticated = false;
      return response(200, {});
    }
    if (path.startsWith("/api/locks/")) {
      if (!service.authenticated) return response(401, {});
      const id = path.split("/").at(-1);
      if (options.method === "PUT") service.lockedIds.add(id);
      else service.lockedIds.delete(id);
      return response(200, {});
    }
    throw new Error(`Unexpected path: ${path}`);
  };
  return service;
}

async function mount(service, { hash = "", hidden = false } = {}) {
  const dom = new JSDOM('<div id="app"></div>', {
    url: `http://localhost/${hash}`, pretendToBeVisual: true, runScripts: "outside-only",
  });
  const { window } = dom;
  window.matchMedia = () => ({ matches: false, addEventListener() {} });
  window.scrollTo = () => {};
  window.HTMLElement.prototype.scrollIntoView = () => {};
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  window.mermaid = { initialize() {}, async render() { return { svg: "<svg></svg>" }; } };
  window.fetch = service.fetch;
  window.__ASSET_ATLAS_ENDPOINT__ = "/api/data";
  if (hidden) window.sessionStorage.setItem("asset-atlas.session-hidden", "true");
  window.eval(viewport);
  await window.eval(app);
  const $ = (selector) => window.document.querySelector(selector);
  const flush = () => new Promise((resolve) => setTimeout(resolve, 20));
  const submit = async (password, operation = "unlock") => {
    if ($("#privacy-password")) $("#privacy-password").value = password;
    const button = $(`[data-privacy-operation=${operation}]`);
    assert.ok(button, `Missing ${operation} button`);
    $("[data-privacy-form]").dispatchEvent(new window.SubmitEvent("submit", { bubbles: true, cancelable: true, submitter: button }));
    await flush();
  };
  const search = (query) => {
    $("#asset-search").value = query;
    $("#asset-search").dispatchEvent(new window.Event("input", { bubbles: true }));
  };
  return { dom, window, $, submit, flush, search };
}

const service = fakeService();
const ui = await mount(service, { hash: "#T-002" });
const { $, submit, flush, search, window } = ui;
assert.equal($(".privacy-dialog").open, true, "Protected hash should prompt, not show detail");
assert.equal($(".detail-view").hidden, true);
assert.equal($("a[download]"), null);
assert.equal($("#app").innerHTML.includes(privateMarker), false);
assert.ok($('[data-asset-id="T-002"]').closest(".is-private:not(.is-authorized)"));
await submit("wrong-password");
assert.match($(".privacy-message").textContent, /密码不正确/);
assert.equal($("#app").innerHTML.includes(privateMarker), false);
await submit("fixture-password");
assert.equal($(".privacy-dialog").open, false);
assert.equal($(".detail-view").hidden, false);
assert.ok($(".detail-view").textContent.includes(privateMarker));
assert.ok(decodeURIComponent($("a[download]").href).includes(privateMarker));
assert.equal(service.lockedIds.has("T-002"), true, "View unlock must retain card lock");
assert.equal($(".privacy-session-control").hidden, false);

// A failed logout must discard visible details immediately and across reloads.
service.failLogout = true;
$("[data-action=end-privacy-session]").click();
assert.equal($(".detail-view").hidden, true);
assert.equal($("a[download]"), null);
await flush();
assert.equal($("#app").innerHTML.includes(privateMarker), false);
assert.equal($(".privacy-session-notice").hidden, false);
assert.equal(window.sessionStorage.getItem("asset-atlas.session-hidden"), "true");
search(privateMarker);
assert.equal($("[data-asset-id]"), null);
search("");
const reload = await mount(service, { hash: "#T-002", hidden: true });
assert.equal(reload.$(".detail-view").hidden, true);
assert.equal(reload.$("#app").innerHTML.includes(privateMarker), false);
reload.dom.window.close();
service.failLogout = false;
$(".privacy-session-notice button").click();
await flush();
assert.equal(service.authenticated, false);
assert.equal($(".privacy-session-notice").hidden, true);

// The authenticated controls update persistent lock state.
$('[data-action=open-privacy][data-card-id="T-001"]').click();
await submit("fixture-password", "lock");
assert.equal(service.lockedIds.has("T-001"), true);
assert.ok($('[data-asset-id="T-001"]').closest(".is-private"));
$('[data-action=open-privacy][data-card-id="T-001"]').click();
await submit("", "unseal");
assert.equal(service.lockedIds.has("T-001"), false);

// An expired session must discard cached detail and ask for a password again.
$('[data-asset-id="T-002"]').click();
assert.equal($(".detail-view").hidden, false);
service.authenticated = false;
$(".detail-privacy-button").click();
await submit("", "unseal");
assert.match($(".privacy-message").textContent, /会话已过期/);
assert.ok($("#privacy-password"));
assert.equal($("a[download]"), null);
assert.equal($("#app").innerHTML.includes(privateMarker), false);
await submit("fixture-password", "unseal");
assert.equal(service.lockedIds.has("T-002"), false);
assert.equal($(".privacy-dialog").open, false);
assert.ok(service.calls.some(({ path, method }) => path === "/api/locks/T-001" && method === "PUT"));
ui.dom.window.close();

const offlineService = fakeService();
offlineService.failData = true;
const offline = await mount(offlineService);
assert.ok(offline.$(".boot-error [data-reload-page]"));
assert.equal(offline.$("[data-asset-id]"), null);
offline.dom.window.close();
process.stdout.write("Protected cards, password sessions, lock changes, expired sessions, and offline hiding tests passed.\n");
