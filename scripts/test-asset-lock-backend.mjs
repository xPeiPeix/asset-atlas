import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, mkdir, readFile, rename, rm, stat, symlink, writeFile } from "node:fs/promises";
import { PassThrough } from "node:stream";
import os from "node:os";
import path from "node:path";
import { createAssetAtlasBackend } from "../server/asset-atlas-backend.mjs";
import { createAssetAtlasRequestHandler } from "./serve-asset-atlas.mjs";
import { loadPrivatePassword } from "./private-password.mjs";

const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "asset-atlas-backend-test-"));
const dataPath = path.join(temporaryDirectory, "data.json");
const locksPath = path.join(temporaryDirectory, "locks.json");
const htmlPath = path.join(temporaryDirectory, "index.html");
const passwordPath = path.join(temporaryDirectory, "password");
const testPassword = "fixture-password";
const secretMarker = "protected-detail-fixture";
const atlas = {
  version: 1,
  metadata: { createdDate: "2026-09-30", fullVerification: "未核验" },
  counts: { total: 3, categories: { 示例: 3 }, statuses: [] },
  cards: [
    {
      id: "T-001", numericId: 1, name: "公开资产", archived: false,
      status: "在用", category: "示例", lastVerified: "2026-09-30",
      avatarDataUrl: "data:image/svg+xml;base64,AA==", summary: "公开摘要",
      markdown: "# 公开资产", tags: ["公开"], fields: [], links: [], diagrams: [],
      searchableText: "公开资产",
    },
    {
      id: "T-002", numericId: 2, name: "封存资产", archived: false,
      status: "低频", category: "示例", lastVerified: "2026-09-30",
      avatarDataUrl: "data:image/svg+xml;base64,AA==", summary: secretMarker,
      markdown: `# ${secretMarker}`, sourcePath: `tools/${secretMarker}.md`,
      tags: [secretMarker], fields: [{ key: "路径", rawMarkdown: `/projects/${secretMarker}`, links: [] }],
      links: [{ href: `https://example.invalid/${secretMarker}`, field: "网站" }],
      diagrams: [{ title: secretMarker, source: `flowchart TB\nA[${secretMarker}]-->B` }],
      searchableText: `封存资产 ${secretMarker}`,
    },
    {
      id: "T-003", numericId: 3, name: "无头像资产", archived: false,
      status: "在用", category: "示例", summary: "最简卡片", markdown: "# 无头像资产",
      tags: [], fields: [], links: [], diagrams: [], searchableText: "无头像资产",
    },
  ],
};
await writeFile(dataPath, JSON.stringify(atlas));
await writeFile(locksPath, JSON.stringify({ version: 1, lockedIds: ["T-002"] }));
await writeFile(htmlPath, '<!doctype html><script>window.__ASSET_ATLAS_ENDPOINT__="/api/data";</script>');

const servers = [];
const errors = [];
let now = Date.now();
async function start({ statePath = locksPath, secureCookies = true, backend = true } = {}) {
  const handler = backend ? createAssetAtlasBackend({
    dataPath, locksPath: statePath, password: testPassword, secureCookies,
    now: () => now, onError: (error) => errors.push(error),
  }) : null;
  const server = createServer(createAssetAtlasRequestHandler({ htmlPath, backend: handler }));
  servers.push(server);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${server.address().port}`;
}
async function login(baseUrl, password = testPassword, extraHeaders = {}) {
  return fetch(`${baseUrl}/api/session/login`, {
    method: "POST", headers: { "Content-Type": "application/json", ...extraHeaders },
    body: JSON.stringify({ password }),
  });
}
async function data(baseUrl, cookie) {
  const response = await fetch(`${baseUrl}/api/data`, { headers: cookie ? { Cookie: cookie } : {} });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control"), /no-store/);
  return response.json();
}
function cookieFor(response) { return response.headers.get("set-cookie").split(";", 1)[0]; }

try {
  const baseUrl = await start();
  let payload = await data(baseUrl);
  assert.equal(payload.authenticated, false);
  assert.equal(payload.cards[0].detailsAvailable, true);
  assert.equal(payload.cards[1].locked, true);
  assert.equal(payload.cards[1].detailsAvailable, false);
  assert.equal(payload.cards[1].name, atlas.cards[1].name);
  assert.equal(payload.cards[1].avatarDataUrl, atlas.cards[1].avatarDataUrl);
  assert.equal(payload.cards[1].category, atlas.cards[1].category);
  assert.equal(payload.cards[1].status, atlas.cards[1].status);
  assert.equal(payload.cards[1].lastVerified, atlas.cards[1].lastVerified);
  assert.equal(JSON.stringify(payload).includes(secretMarker), false);
  assert.equal("markdown" in payload.cards[1], false);
  assert.equal("sourcePath" in payload.cards[1], false);
  assert.equal("sourceRoot" in payload.cards[0], false);
  assert.equal("rootPath" in payload.metadata, false);
  assert.equal(payload.cards[2].detailsAvailable, true);
  assert.equal(payload.cards[2].avatarDataUrl, undefined);
  for (const key of ["tags", "fields", "links", "diagrams"]) assert.deepEqual(payload.cards[1][key], []);

  for (const route of ["/", "/asset-atlas.html"]) {
    const response = await fetch(`${baseUrl}${route}`);
    assert.equal(response.status, 200);
    assert.equal((await response.text()).includes(secretMarker), false);
  }
  for (const route of ["/data.json", "/.asset-atlas/data.json", "/locks.json", "/password", "/tools/T-002.md", "/dist/index.html", "/unknown", "/api/unknown", "/api/data?all=true"]) {
    const response = await fetch(`${baseUrl}${route}`);
    assert.equal(response.status, 404, route);
    assert.equal((await response.text()).includes(secretMarker), false);
  }
  for (const route of ["/", "/api/data", "/api/healthz"]) {
    const response = await fetch(`${baseUrl}${route}`, { method: "HEAD" });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "");
  }
  for (const [route, method, allow] of [["/", "POST", "GET, HEAD"], ["/api/data", "POST", "GET, HEAD"], ["/api/session/login", "GET", "POST"], ["/api/session/logout", "GET", "POST"], ["/api/locks/T-002", "POST", "PUT, DELETE"]]) {
    const response = await fetch(`${baseUrl}${route}`, { method });
    assert.equal(response.status, 405);
    assert.equal(response.headers.get("allow"), allow);
    await response.text();
  }
  assert.equal((await login(baseUrl, "wrong")).status, 401);
  assert.equal((await login(baseUrl, null)).status, 401);
  assert.equal((await login(baseUrl, testPassword, { Origin: "https://example.invalid" })).status, 403);
  for (const body of ["{invalid", "x".repeat(9000)]) {
    const response = await fetch(`${baseUrl}/api/session/login`, { method: "POST", body });
    assert.equal(response.status, 400);
    await response.text();
  }
  let response = await login(baseUrl);
  assert.equal(response.status, 200);
  await response.text();
  const setCookie = response.headers.get("set-cookie");
  for (const attribute of ["HttpOnly", "SameSite=Strict", "Path=/api/", "Secure", "Max-Age=43200"]) assert.ok(setCookie.includes(attribute));
  const sessionCookie = cookieFor(response);
  payload = await data(baseUrl, sessionCookie);
  assert.equal(payload.authenticated, true);
  assert.equal(payload.cards[1].detailsAvailable, true);
  assert.equal(payload.cards[1].markdown, atlas.cards[1].markdown);
  assert.equal(payload.cards[1].sourcePath, atlas.cards[1].sourcePath);

  assert.equal((await fetch(`${baseUrl}/api/locks/T-001`, { method: "PUT" })).status, 401);
  assert.equal((await fetch(`${baseUrl}/api/locks/T-999`, { method: "PUT", headers: { Cookie: sessionCookie } })).status, 404);
  const mutations = await Promise.all(["T-001", "T-003"].map((id) => fetch(`${baseUrl}/api/locks/${id}`, { method: "PUT", headers: { Cookie: sessionCookie } })));
  for (const result of mutations) {
    assert.equal(result.status, 200);
    assert.equal((await result.json()).locked, true);
  }
  assert.deepEqual(JSON.parse(await readFile(locksPath, "utf8")), { version: 1, lockedIds: ["T-001", "T-002", "T-003"] });
  payload = await data(baseUrl);
  assert.ok(payload.cards.every((card) => card.locked && !card.detailsAvailable));
  assert.equal(payload.cards[2].avatarDataUrl, undefined);

  const restartedUrl = await start({ secureCookies: false });
  payload = await data(restartedUrl, sessionCookie);
  assert.equal(payload.authenticated, false);
  assert.ok(payload.cards.every((card) => card.locked && !card.detailsAvailable));
  response = await login(restartedUrl);
  assert.equal(response.headers.get("set-cookie").includes("; Secure"), false);
  await response.text();

  response = await fetch(`${baseUrl}/api/locks/T-001`, { method: "DELETE", headers: { Cookie: sessionCookie } });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { id: "T-001", locked: false });
  assert.equal((await data(baseUrl)).cards[0].detailsAvailable, true);

  const backupState = path.join(temporaryDirectory, "locks-backup.json");
  await rename(locksPath, backupState);
  await mkdir(locksPath);
  response = await fetch(`${baseUrl}/api/locks/T-002`, { method: "DELETE", headers: { Cookie: sessionCookie } });
  assert.equal(response.status, 500);
  assert.equal((await response.text()).includes(temporaryDirectory), false);
  assert.equal((await data(baseUrl)).cards[1].detailsAvailable, false, "A failed persistence write must not unlock a card");
  await rm(locksPath, { recursive: true });
  await rename(backupState, locksPath);
  assert.equal(errors.length, 1);

  response = await fetch(`${baseUrl}/api/session/logout`, { method: "POST", headers: { Cookie: sessionCookie } });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie"), /Max-Age=0/);
  await response.text();
  assert.equal((await data(baseUrl, sessionCookie)).authenticated, false);
  response = await login(baseUrl);
  const expiringCookie = cookieFor(response);
  await response.text();
  now += 12 * 60 * 60 * 1000 - 1;
  assert.equal((await data(baseUrl, expiringCookie)).authenticated, true);
  now += 1;
  payload = await data(baseUrl, expiringCookie);
  assert.equal(payload.authenticated, false);
  assert.equal(payload.cards[1].detailsAvailable, false);
  assert.equal((await fetch(`${baseUrl}/api/locks/T-002`, { method: "DELETE", headers: { Cookie: expiringCookie } })).status, 401);

  const initialLocksPath = path.join(temporaryDirectory, "new-state", "locks.json");
  const newUrl = await start({ statePath: initialLocksPath });
  assert.ok((await data(newUrl)).cards.every((card) => !card.locked));
  assert.deepEqual(JSON.parse(await readFile(initialLocksPath, "utf8")), { version: 1, lockedIds: [] });
  assert.equal((await stat(initialLocksPath)).mode & 0o777, 0o600);
  const corruptLocksPath = path.join(temporaryDirectory, "corrupt-locks.json");
  await writeFile(corruptLocksPath, JSON.stringify({ version: 1, lockedIds: [null] }));
  const corruptUrl = await start({ statePath: corruptLocksPath });
  response = await fetch(`${corruptUrl}/api/data`);
  assert.equal(response.status, 500);
  assert.equal((await response.text()).includes(secretMarker), false);
  assert.equal(errors.length, 2);

  const staticUrl = await start({ backend: false });
  assert.equal((await fetch(`${staticUrl}/api/data`)).status, 404);
  assert.equal((await fetch(`${staticUrl}/`)).status, 200);

  await assert.rejects(loadPrivatePassword(passwordPath, { allowCreate: false }), /Run npm run serve:private in a terminal/);
  const input = new PassThrough();
  const output = new PassThrough();
  input.isTTY = true;
  input.isRaw = false;
  input.setRawMode = (raw) => { input.isRaw = Boolean(raw); };
  output.isTTY = true;
  let promptText = "";
  output.on("data", (chunk) => {
    const text = chunk.toString();
    promptText += text;
    if (["Password: ", "Confirm password: "].includes(text)) {
      queueMicrotask(() => {
        for (const character of testPassword) input.emit("keypress", character, { name: character });
        input.emit("keypress", "\r", { name: "return" });
      });
    }
  });
  assert.equal(await loadPrivatePassword(passwordPath, { input, output }), testPassword);
  assert.equal(promptText.includes(testPassword), false, "Password must not be echoed");
  assert.equal(input.isRaw, false);
  assert.equal((await stat(passwordPath)).mode & 0o777, 0o600);
  assert.equal(await loadPrivatePassword(passwordPath, { allowCreate: false }), testPassword);
  const linkedPasswordPath = path.join(temporaryDirectory, "password-link");
  await symlink(passwordPath, linkedPasswordPath);
  await assert.rejects(loadPrivatePassword(linkedPasswordPath), /regular file/);
} finally {
  await Promise.all(servers.map((server) => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))));
  await rm(temporaryDirectory, { recursive: true, force: true });
}

process.stdout.write("Asset Atlas password protection and server tests passed.\n");
