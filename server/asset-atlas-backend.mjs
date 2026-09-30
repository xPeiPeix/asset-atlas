import { randomBytes, timingSafeEqual } from "node:crypto";
import { lstat, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const cardIdPattern = /^T-\d{3,}$/;
const sessionCookieName = "asset_atlas_session";
const sessionLifetime = 12 * 60 * 60 * 1000;
const jsonHeaders = {
  "Cache-Control": "private, no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
};

function sendJson(response, statusCode, payload, extraHeaders = {}) {
  response.writeHead(statusCode, { ...jsonHeaders, ...extraHeaders });
  response.end(JSON.stringify(payload));
}

async function readJsonBody(request) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 8192) throw new Error("Request body is too large.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function cookieValue(request) {
  const header = request.headers.cookie ?? "";
  if (!header || header.length > 8192) return "";
  for (const item of header.split(";")) {
    const separator = item.indexOf("=");
    if (separator !== -1 && item.slice(0, separator).trim() === sessionCookieName) {
      return item.slice(separator + 1).trim();
    }
  }
  return "";
}

function normalizedPassword(value) {
  if (!Buffer.isBuffer(value) && typeof value !== "string") {
    throw new Error("Asset Atlas password is missing or invalid.");
  }
  const buffer = Buffer.from(value);
  if (buffer.length === 0 || buffer.length > 1024) {
    throw new Error("Asset Atlas password must contain between 1 and 1024 bytes.");
  }
  return buffer;
}

function createSessionAuth(password, secureCookies, now) {
  const expectedPassword = normalizedPassword(password);
  const sessions = new Map();
  const cookieAttributes = [
    "Path=/api/", "HttpOnly", "SameSite=Strict",
    ...(secureCookies ? ["Secure"] : []),
  ].join("; ");
  return {
    matches(candidate) {
      if (typeof candidate !== "string") return false;
      const provided = Buffer.from(candidate, "utf8");
      return provided.length === expectedPassword.length && timingSafeEqual(provided, expectedPassword);
    },
    has(request) {
      const token = cookieValue(request);
      const expiresAt = sessions.get(token);
      if (expiresAt === undefined) return false;
      if (expiresAt <= now()) {
        sessions.delete(token);
        return false;
      }
      return true;
    },
    create() {
      const time = now();
      for (const [token, expiresAt] of sessions) {
        if (expiresAt <= time) sessions.delete(token);
      }
      const token = randomBytes(32).toString("base64url");
      sessions.set(token, time + sessionLifetime);
      return `${sessionCookieName}=${token}; ${cookieAttributes}; Max-Age=${sessionLifetime / 1000}`;
    },
    clear(request) {
      sessions.delete(cookieValue(request));
      return `${sessionCookieName}=; ${cookieAttributes}; Max-Age=0`;
    },
  };
}

function validateAtlasData(payload) {
  if (!payload || typeof payload !== "object" || !Number.isInteger(payload.version) ||
      !payload.metadata || !payload.counts || !Array.isArray(payload.cards)) {
    throw new Error("Asset Atlas data has an invalid top-level shape.");
  }
  const ids = new Set();
  for (const card of payload.cards) {
    if (!card || typeof card !== "object" || !cardIdPattern.test(card.id) ||
        typeof card.name !== "string" ||
        (card.avatarDataUrl !== undefined && typeof card.avatarDataUrl !== "string")) {
      throw new Error("Asset Atlas data contains an invalid card.");
    }
    if (ids.has(card.id)) throw new Error(`Asset Atlas data contains duplicate ID ${card.id}.`);
    ids.add(card.id);
  }
  return payload;
}

function validateLockState(payload) {
  if (!payload || payload.version !== 1 || !Array.isArray(payload.lockedIds) ||
      payload.lockedIds.some((id) => typeof id !== "string" || !cardIdPattern.test(id))) {
    throw new Error("Asset Atlas lock state is invalid.");
  }
  return new Set(payload.lockedIds);
}

function publicLockedCard(card) {
  return {
    id: card.id,
    numericId: card.numericId,
    name: card.name,
    archived: card.archived,
    status: card.status,
    category: card.category,
    lastVerified: card.lastVerified,
    avatarDataUrl: card.avatarDataUrl,
    locked: true,
    detailsAvailable: false,
    summary: "此资产已封存，输入密码后可查看完整资料。",
    tags: [],
    fields: [],
    links: [],
    diagrams: [],
    searchableText: [card.id, card.name, card.status, card.category, card.lastVerified].join(" "),
  };
}

function presentAtlasData(atlas, lockedIds, authenticated) {
  return {
    ...atlas,
    authenticated,
    cards: atlas.cards.map((card) => {
      const locked = lockedIds.has(card.id);
      if (locked && !authenticated) return publicLockedCard(card);
      return { ...card, locked, detailsAvailable: true };
    }),
  };
}

async function readLockState(locksPath) {
  let info;
  try {
    info = await lstat(locksPath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await mkdir(path.dirname(locksPath), { recursive: true, mode: 0o700 });
    try {
      await writeFile(locksPath, `${JSON.stringify({ version: 1, lockedIds: [] }, null, 2)}\n`, {
        encoding: "utf8", mode: 0o600, flag: "wx",
      });
      return new Set();
    } catch (writeError) {
      if (writeError.code !== "EEXIST") throw writeError;
      return readLockState(locksPath);
    }
  }
  if (!info.isFile() || info.isSymbolicLink()) {
    throw new Error("Asset Atlas lock state must be a regular file.");
  }
  return validateLockState(JSON.parse(await readFile(locksPath, "utf8")));
}

async function persistLockState(locksPath, lockedIds) {
  const orderedIds = [...lockedIds].sort((left, right) => left.localeCompare(right, "en", { numeric: true }));
  const temporaryPath = `${locksPath}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify({ version: 1, lockedIds: orderedIds }, null, 2)}\n`, {
      encoding: "utf8", mode: 0o600, flag: "wx",
    });
    await rename(temporaryPath, locksPath);
  } catch (error) {
    await unlink(temporaryPath).catch((cleanupError) => {
      if (cleanupError.code !== "ENOENT") throw cleanupError;
    });
    throw error;
  }
}

function routeFor(request) {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  if (url.search !== "") return { kind: "not-found" };
  if (url.pathname === "/api/healthz") return { kind: "health" };
  if (url.pathname === "/api/data") return { kind: "data" };
  if (url.pathname === "/api/session/login") return { kind: "login" };
  if (url.pathname === "/api/session/logout") return { kind: "logout" };
  const lockMatch = url.pathname.match(/^\/api\/locks\/(T-\d{3,})$/);
  return lockMatch ? { kind: "lock", id: lockMatch[1] } : { kind: "not-found" };
}

function createAssetAtlasBackend({ dataPath, locksPath, password, secureCookies = false,
  now = Date.now, onError = (error) => console.error(error) }) {
  if (!dataPath || !locksPath) throw new Error("Asset Atlas backend requires dataPath and locksPath.");
  const session = createSessionAuth(password, secureCookies, now);
  let atlasPromise;
  let lockStatePromise;
  const getAtlas = () => atlasPromise ??= readFile(dataPath, "utf8").then((content) => validateAtlasData(JSON.parse(content)));
  const getLocks = () => lockStatePromise ??= readLockState(locksPath);
  let mutationQueue = Promise.resolve();

  return async function handleRequest(request, response) {
    try {
      const route = routeFor(request);
      if (route.kind === "not-found") return sendJson(response, 404, { error: "Not found" });
      const methods = { health: "GET, HEAD", data: "GET, HEAD", login: "POST", logout: "POST", lock: "PUT, DELETE" };
      if (!methods[route.kind].split(", ").includes(request.method)) {
        return sendJson(response, 405, { error: "Method not allowed" }, { Allow: methods[route.kind] });
      }
      if (!["GET", "HEAD"].includes(request.method) && request.headers.origin) {
        let originHost;
        try { originHost = new URL(request.headers.origin).host; } catch { /* Reject malformed origins below. */ }
        if (originHost !== request.headers.host) return sendJson(response, 403, { error: "Origin not allowed" });
      }
      if (route.kind === "health") {
        await Promise.all([getAtlas(), getLocks()]);
        return sendJson(response, 200, { ok: true });
      }
      if (route.kind === "login") {
        let body;
        try { body = await readJsonBody(request); }
        catch { return sendJson(response, 400, { error: "Invalid request" }); }
        if (!session.matches(body?.password)) return sendJson(response, 401, { error: "Invalid password" });
        return sendJson(response, 200, { success: true }, { "Set-Cookie": session.create() });
      }
      if (route.kind === "logout") {
        return sendJson(response, 200, { success: true }, { "Set-Cookie": session.clear(request) });
      }
      if (route.kind === "data") {
        const [atlas, lockedIds] = await Promise.all([getAtlas(), getLocks()]);
        return sendJson(response, 200, presentAtlasData(atlas, lockedIds, session.has(request)));
      }
      if (!session.has(request)) return sendJson(response, 401, { error: "Password required" });
      const atlas = await getAtlas();
      if (!atlas.cards.some((card) => card.id === route.id)) return sendJson(response, 404, { error: "Unknown asset" });
      const mutation = mutationQueue.catch(() => {}).then(async () => {
        const nextLockedIds = new Set(await getLocks());
        if (request.method === "PUT") nextLockedIds.add(route.id);
        else nextLockedIds.delete(route.id);
        await persistLockState(locksPath, nextLockedIds);
        lockStatePromise = Promise.resolve(nextLockedIds);
        return { id: route.id, locked: nextLockedIds.has(route.id) };
      });
      mutationQueue = mutation;
      return sendJson(response, 200, await mutation);
    } catch (error) {
      onError(error);
      sendJson(response, 500, { error: "Asset Atlas backend failed" });
    }
  };
}

export { createAssetAtlasBackend, presentAtlasData, publicLockedCard, validateAtlasData, validateLockState };
