import {
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const avatarDirectory = path.join(projectRoot, "assets/avatars");
const avatarMaxBytes = 32 * 1024;
const avatarPixelSize = 256;
const htmlMaxBytes = 8 * 1024 * 1024;
const diagramMaxBytes = 12 * 1024;
const diagramMaxLines = 160;
const diagramMaxPerCard = 2;
const diagramSectionTitles = new Set(["系统架构", "核心业务流程"]);
const diagramTypes = new Set([
  "flowchart",
  "sequenceDiagram",
  "stateDiagram-v2",
]);
let mermaidValidatorPromise = null;

function splitMarkdownTableRow(line) {
  const cells = [];
  let current = "";
  let escaped = false;

  for (const character of line.trim()) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }

    if (character === "\\") {
      current += character;
      escaped = true;
      continue;
    }

    if (character === "|") {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += character;
  }

  cells.push(current.trim());
  if (cells[0] === "") cells.shift();
  if (cells.at(-1) === "") cells.pop();
  return cells;
}

function extractLinks(rawMarkdown) {
  const links = [];
  const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
  let match;

  while ((match = linkPattern.exec(rawMarkdown)) !== null) {
    links.push({
      label: match[1],
      href: match[2],
    });
  }

  return links;
}

function linesOutsideFences(markdown) {
  const visibleLines = [];
  let openFence = null;

  for (const line of markdown.split(/\r?\n/)) {
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      if (!openFence) {
        openFence = { character: marker[0], length: marker.length };
      } else if (
        marker[0] === openFence.character &&
        marker.length >= openFence.length
      ) {
        openFence = null;
      }
      continue;
    }

    if (!openFence) visibleLines.push(line);
  }

  return visibleLines;
}

function validateDiagramSource(source, sourcePath, title) {
  const normalizedSource = source.trim();
  const sourceBytes = Buffer.byteLength(normalizedSource, "utf8");
  const sourceLines = normalizedSource ? normalizedSource.split(/\r?\n/) : [];
  const location = `${sourcePath}（${title}）`;

  if (!normalizedSource) {
    throw new Error(`Mermaid diagram is empty: ${location}`);
  }
  if (sourceBytes > diagramMaxBytes) {
    throw new Error(
      `Mermaid diagram exceeds ${diagramMaxBytes} bytes: ${location}`,
    );
  }
  if (sourceLines.length > diagramMaxLines) {
    throw new Error(
      `Mermaid diagram exceeds ${diagramMaxLines} lines: ${location}`,
    );
  }

  const firstLine = sourceLines.find((line) => line.trim())?.trim() ?? "";
  const diagramType = firstLine.match(/^([\w-]+)(?:\s|$)/)?.[1] ?? "";
  if (!diagramTypes.has(diagramType)) {
    throw new Error(
      `Unsupported Mermaid diagram type in ${location}: ${diagramType || "missing"}`,
    );
  }

  const forbiddenPatterns = [
    ["configuration directive", /(?:^|[;\n])\s*%%\{/],
    ["frontmatter configuration", /(^|\n)\s*---\s*(?=\n|$)/],
    ["click or link interaction", /(?:^|[;\n])\s*(?:click|links?)\b/i],
    [
      "external resource",
      /\b(?:https?:|javascript:|data:|file:|vscode:|ssh:)|(^|\s)\/\/\S|\burl\s*\(/i,
    ],
    ["image or icon node", /@\{\s*(?:img|icon)\s*:/i],
    ["raw HTML", /<\/?[A-Za-z][^>]*>/],
  ];
  for (const [label, pattern] of forbiddenPatterns) {
    if (pattern.test(normalizedSource)) {
      throw new Error(`Mermaid ${label} is not allowed: ${location}`);
    }
  }

  return {
    title,
    kind: "mermaid",
    diagramType,
    source: normalizedSource,
  };
}

function parseDiagramSections(markdown, sourcePath) {
  const lines = markdown.split(/\r?\n/);
  const diagrams = [];
  const seenTitles = new Set();
  let pendingTitle = null;
  let openFence = null;
  let capturedLines = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const lineNumber = index + 1;

    if (openFence) {
      const closingMatch = line.match(/^\s*(`{3,}|~{3,})(.*)$/);
      if (
        closingMatch &&
        closingMatch[1][0] === openFence.character &&
        closingMatch[1].length >= openFence.length &&
        closingMatch[2].trim() === ""
      ) {
        if (capturedLines) {
          diagrams.push(
            validateDiagramSource(
              capturedLines.join("\n"),
              sourcePath,
              openFence.title,
            ),
          );
          pendingTitle = null;
          capturedLines = null;
        }
        openFence = null;
      } else if (capturedLines) {
        capturedLines.push(line);
      }
      continue;
    }

    const headingMatch = line.match(/^##\s+(.+?)\s*$/);
    if (headingMatch) {
      if (pendingTitle) {
        throw new Error(
          `Missing Mermaid block after ${pendingTitle}: ${sourcePath}:${lineNumber}`,
        );
      }
      const title = headingMatch[1];
      pendingTitle = diagramSectionTitles.has(title) ? title : null;
      if (pendingTitle) {
        if (seenTitles.has(pendingTitle)) {
          throw new Error(
            `Duplicate Mermaid section ${pendingTitle}: ${sourcePath}:${lineNumber}`,
          );
        }
        seenTitles.add(pendingTitle);
      }
      continue;
    }

    const openingMatch = line.match(/^\s*(`{3,}|~{3,})(.*)$/);
    if (openingMatch) {
      const marker = openingMatch[1];
      const info = openingMatch[2].trim();
      if (info === "mermaid") {
        if (!pendingTitle) {
          throw new Error(
            `Mermaid block must follow an allowed section heading: ${sourcePath}:${lineNumber}`,
          );
        }
        capturedLines = [];
        openFence = {
          character: marker[0],
          length: marker.length,
          title: pendingTitle,
        };
      } else {
        if (pendingTitle) {
          throw new Error(
            `Section ${pendingTitle} must contain a mermaid fence: ${sourcePath}:${lineNumber}`,
          );
        }
        openFence = {
          character: marker[0],
          length: marker.length,
          title: null,
        };
      }
      continue;
    }

    if (pendingTitle && line.trim()) {
      throw new Error(
        `Section ${pendingTitle} must contain only one Mermaid block: ${sourcePath}:${lineNumber}`,
      );
    }
  }

  if (openFence?.title) {
    throw new Error(`Unclosed Mermaid block: ${sourcePath}（${openFence.title}）`);
  }
  if (pendingTitle) {
    throw new Error(`Missing Mermaid block after ${pendingTitle}: ${sourcePath}`);
  }
  if (diagrams.length > diagramMaxPerCard) {
    throw new Error(
      `Card contains more than ${diagramMaxPerCard} Mermaid diagrams: ${sourcePath}`,
    );
  }

  return diagrams;
}

async function getMermaidValidator() {
  if (mermaidValidatorPromise) return mermaidValidatorPromise;

  mermaidValidatorPromise = (async () => {
    const dom = new JSDOM("<!doctype html><html><body></body></html>", {
      pretendToBeVisual: true,
    });
    for (const key of [
      "window",
      "document",
      "navigator",
      "Element",
      "HTMLElement",
      "SVGElement",
    ]) {
      const value =
        key === "window"
          ? dom.window
          : key === "document"
            ? dom.window.document
            : dom.window[key];
      Object.defineProperty(globalThis, key, {
        value,
        configurable: true,
      });
    }
    const { default: mermaid } = await import("mermaid");
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      htmlLabels: false,
      suppressErrorRendering: true,
    });
    return mermaid;
  })();

  return mermaidValidatorPromise;
}

async function validateMermaidSyntax(cards) {
  const diagrams = cards.flatMap((card) =>
    card.diagrams.map((diagram) => ({ card, diagram })),
  );
  if (diagrams.length === 0) return;

  const mermaid = await getMermaidValidator();
  for (const { card, diagram } of diagrams) {
    try {
      await mermaid.parse(diagram.source, { suppressErrors: false });
    } catch {
      throw new Error(
        `Invalid Mermaid syntax: ${card.sourcePath}（${diagram.title}）`,
      );
    }
  }
}

function parseCard(markdown, sourcePath, archived) {
  const lines = linesOutsideFences(markdown);
  const diagrams = parseDiagramSections(markdown, sourcePath);
  const headings = lines.filter((line) => /^# /.test(line));
  const headingMatch = headings[0]?.match(/^# (T-(\d{3,})) · (\S.*)$/);
  if (
    headings.length !== 1 ||
    !headingMatch ||
    !Number.isSafeInteger(Number(headingMatch[2])) ||
    headingMatch[1] !== `T-${Number(headingMatch[2]).toString().padStart(3, "0")}`
  ) {
    throw new Error(`Invalid card heading: ${sourcePath}`);
  }
  const fileId = path.basename(sourcePath).match(/^(T-\d+)-/)?.[1];
  if (fileId !== headingMatch[1]) {
    throw new Error(
      `Card ID does not match filename: ${sourcePath} (${headingMatch[1]})`,
    );
  }

  const summaryLine = lines.find((line) => line.startsWith("> "));
  if (!summaryLine?.slice(2).trim()) {
    throw new Error(`Missing card summary: ${sourcePath}`);
  }

  const fields = [];
  for (const line of lines) {
    if (!line.startsWith("|")) continue;
    const cells = splitMarkdownTableRow(line);
    if (
      cells.length !== 2 ||
      cells[0] === "字段" ||
      /^-+$/.test(cells[0])
    ) {
      continue;
    }

    if (fields.some((field) => field.key === cells[0])) {
      throw new Error(`Duplicate card field ${cells[0]}: ${sourcePath}`);
    }
    fields.push({
      key: cells[0],
      rawMarkdown: cells[1],
      links: extractLinks(cells[1]),
    });
  }

  const fieldMap = Object.fromEntries(
    fields.map((field) => [field.key, field.rawMarkdown]),
  );
  const requiredFields = [
    "状态",
    "分类",
    "主维护位置",
    "最近核验",
  ];
  const missingFields = requiredFields.filter((key) => !fieldMap[key]);
  if (missingFields.length > 0) {
    throw new Error(
      `Missing required fields in ${sourcePath}: ${missingFields.join(", ")}`,
    );
  }
  if (fieldMap["最近核验"] !== "未核验" && !validDate(fieldMap["最近核验"])) {
    throw new Error(`最近核验 must be YYYY-MM-DD or 未核验: ${sourcePath}`);
  }
  if (archived !== fieldMap["状态"].includes("已归档")) {
    throw new Error(`Archive status does not match directory: ${sourcePath}`);
  }
  if (archived && headingMatch[1] === "T-000") {
    throw new Error("T-000 must remain active.");
  }
  if (archived && (!validDate(fieldMap["归档日期"]) || !fieldMap["归档原因"])) {
    throw new Error(`Archived cards require 归档日期 and 归档原因: ${sourcePath}`);
  }

  return {
    id: headingMatch[1],
    numericId: Number(headingMatch[2]),
    name: headingMatch[3],
    summary: summaryLine.slice(2).trim(),
    sourcePath,
    markdown,
    archived,
    status: fieldMap["状态"] ?? "⚪ 待核验",
    category: fieldMap["分类"] ?? "其他",
    tags: (fieldMap["标签"] ?? "")
      .split("、")
      .map((tag) => tag.replaceAll("`", "").trim())
      .filter(Boolean),
    mainLocation: fieldMap["主维护位置"] ?? "待核验",
    lastVerified: fieldMap["最近核验"] ?? "待核验",
    archiveDate: fieldMap["归档日期"] ?? null,
    archiveReason: fieldMap["归档原因"] ?? null,
    diagrams,
    fields,
    links: fields.flatMap((field) =>
      field.links.map((link) => ({
        ...link,
        field: field.key,
      })),
    ),
    searchableText: [
      headingMatch[1],
      headingMatch[3],
      summaryLine.slice(2),
      ...fields.flatMap((field) => [
        field.key,
        field.rawMarkdown,
        ...field.links.flatMap((link) => [link.label, link.href]),
      ]),
      ...diagrams.flatMap((diagram) => [diagram.title, diagram.source]),
    ].join(" "),
  };
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? "")) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

async function readCards(directoryName, archived, baseRoot = projectRoot) {
  const directory = path.join(baseRoot, directoryName);
  const entries = await readdir(directory, { withFileTypes: true });
  const fileNames = [];
  for (const entry of entries) {
    if (entry.name === ".gitkeep" && entry.isFile()) continue;
    if (!entry.isFile() || !/^T-\d{3,}-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.test(entry.name)) {
      throw new Error(`Invalid card filename or entry: ${directoryName}/${entry.name}`);
    }
    fileNames.push(entry.name);
  }
  fileNames.sort((left, right) => left.localeCompare(right, "en"));

  return Promise.all(
    fileNames.map(async (fileName) => {
      const sourcePath = `${directoryName}/${fileName}`;
      const markdown = await readFile(
        path.join(baseRoot, sourcePath),
        "utf8",
      );
      return parseCard(markdown, sourcePath, archived);
    }),
  );
}

function validateIndex(cards) {
  const ids = new Set();
  for (const card of cards) {
    if (ids.has(card.id)) throw new Error(`Duplicate permanent ID: ${card.id}`);
    ids.add(card.id);
  }
  if (!cards.some((card) => card.id === "T-000" && !card.archived)) {
    throw new Error("T-000 must exist in tools/.");
  }
  const next = Math.max(...cards.map((card) => card.numericId)) + 1;
  return `T-${String(next).padStart(3, "0")}`;
}

function parseIndexMetadata(readme) {
  const valueFor = (label) => {
    const match = readme.match(new RegExp(`^- ${label}：(.+)$`, "m"));
    return match?.[1]?.trim() ?? "待核验";
  };

  return {
    createdDate: valueFor("创建日期"),
    fullVerification: valueFor("最后全面核验"),
  };
}

function describeStatus(rawStatus) {
  if (rawStatus.includes("在用")) {
    return { label: "在用", className: "healthy", order: 10 };
  }
  if (rawStatus.includes("低频")) {
    return { label: "低频", className: "low", order: 20 };
  }
  if (rawStatus.includes("降级")) {
    return { label: "降级", className: "degraded", order: 25 };
  }
  if (rawStatus.includes("故障")) {
    return { label: "故障", className: "failed", order: 30 };
  }
  if (rawStatus.includes("待核验")) {
    return { label: "待核验", className: "pending", order: 40 };
  }
  if (rawStatus.includes("已归档")) {
    return { label: "已归档", className: "archived", order: 50 };
  }

  const label =
    rawStatus.replace(/^[^\p{L}\p{N}]+/u, "").trim() || rawStatus.trim();
  return { label, className: "pending", order: 45 };
}

function createCounts(cards) {
  const categories = {};
  const statusCounts = new Map();

  for (const card of cards) {
    categories[card.category] = (categories[card.category] ?? 0) + 1;
    const presentation = describeStatus(card.status);
    const current = statusCounts.get(card.status);
    statusCounts.set(card.status, {
      rawStatus: card.status,
      label: presentation.label,
      className: presentation.className,
      order: presentation.order,
      count: (current?.count ?? 0) + 1,
    });
  }

  return {
    total: cards.length,
    categories,
    statuses: [...statusCounts.values()]
      .sort(
        (left, right) =>
          left.order - right.order ||
          left.label.localeCompare(right.label, "zh-CN"),
      )
      .map(({ order: _order, ...status }) => status),
  };
}

function safeScriptJson(value) {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

function replaceTemplateMarker(source, marker, replacement) {
  if (!source.includes(marker)) {
    throw new Error(`Missing template marker: ${marker}`);
  }
  return source.replace(marker, () => replacement);
}

function inspectWebp(buffer) {
  if (
    buffer.length < 20 ||
    buffer.subarray(0, 4).toString("ascii") !== "RIFF" ||
    buffer.subarray(8, 12).toString("ascii") !== "WEBP" ||
    buffer.readUInt32LE(4) + 8 !== buffer.length
  ) {
    throw new Error("Avatar is not a RIFF/WEBP image.");
  }

  let width = null;
  let height = null;
  let imageWidth = null;
  let imageHeight = null;
  let vp8xAlpha = false;
  let hasAlphaChunk = false;
  let vp8lAlpha = false;
  let hasImagePayload = false;
  let offset = 12;

  while (offset + 8 <= buffer.length) {
    const type = buffer.subarray(offset, offset + 4).toString("ascii");
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + chunkSize;
    if (chunkEnd > buffer.length) {
      throw new Error("Avatar contains a truncated WebP chunk.");
    }

    if (type === "VP8X") {
      if (chunkSize < 10) throw new Error("Avatar has an invalid VP8X chunk.");
      vp8xAlpha = Boolean(buffer[chunkStart] & 0x10);
      width = buffer.readUIntLE(chunkStart + 4, 3) + 1;
      height = buffer.readUIntLE(chunkStart + 7, 3) + 1;
    } else if (type === "ALPH") {
      hasAlphaChunk = true;
    } else if (type === "VP8L") {
      if (chunkSize < 5 || buffer[chunkStart] !== 0x2f) {
        throw new Error("Avatar has an invalid VP8L chunk.");
      }
      const dimensions = buffer.readUInt32LE(chunkStart + 1);
      imageWidth = (dimensions & 0x3fff) + 1;
      imageHeight = ((dimensions >>> 14) & 0x3fff) + 1;
      vp8lAlpha = Boolean((dimensions >>> 28) & 1);
      hasImagePayload = true;
    } else if (type === "VP8 ") {
      if (
        chunkSize < 10 ||
        !buffer
          .subarray(chunkStart + 3, chunkStart + 6)
          .equals(Buffer.from([0x9d, 0x01, 0x2a]))
      ) {
        throw new Error("Avatar has an invalid VP8 frame.");
      }
      imageWidth = buffer.readUInt16LE(chunkStart + 6) & 0x3fff;
      imageHeight = buffer.readUInt16LE(chunkStart + 8) & 0x3fff;
      hasImagePayload = true;
    }

    offset = chunkEnd + (chunkSize % 2);
  }

  if (!hasImagePayload || imageWidth === null || imageHeight === null) {
    throw new Error("Avatar is missing a decodable WebP image payload.");
  }
  if (width === null || height === null) {
    width = imageWidth;
    height = imageHeight;
  } else if (width !== imageWidth || height !== imageHeight) {
    throw new Error("Avatar WebP canvas and image dimensions do not match.");
  }
  return {
    width,
    height,
    hasAlpha: vp8lAlpha || (vp8xAlpha && hasAlphaChunk),
  };
}

function avatarHrefFor(card) {
  const field = card.fields.find((item) => item.key === "头像");
  const expectedHref = `../assets/avatars/${card.id}.webp`;
  if (
    !field ||
    field.rawMarkdown !== `[查看](${expectedHref})` ||
    field.links.length !== 1 ||
    field.links[0].href !== expectedHref
  ) {
    throw new Error(
      `Avatar field for ${card.id} must be [查看](${expectedHref}).`,
    );
  }
  return expectedHref;
}

async function loadAvatar(card) {
  if (!card.fields.some((field) => field.key === "头像")) return card;
  const href = avatarHrefFor(card);
  const resolvedPath = path.resolve(
    projectRoot,
    path.dirname(card.sourcePath),
    href,
  );
  const expectedPath = path.join(avatarDirectory, `${card.id}.webp`);
  if (resolvedPath !== expectedPath) {
    throw new Error(`Avatar path escapes the controlled directory: ${card.id}`);
  }

  const fileInfo = await lstat(resolvedPath);
  if (!fileInfo.isFile() || fileInfo.isSymbolicLink()) {
    throw new Error(`Avatar must be a regular non-symlink file: ${card.id}`);
  }
  const [resolvedRealPath, avatarRootRealPath] = await Promise.all([
    realpath(resolvedPath),
    realpath(avatarDirectory),
  ]);
  if (path.dirname(resolvedRealPath) !== avatarRootRealPath) {
    throw new Error(`Avatar resolves outside the controlled directory: ${card.id}`);
  }

  const buffer = await readFile(resolvedPath);
  if (buffer.length > avatarMaxBytes) {
    throw new Error(
      `Avatar exceeds ${avatarMaxBytes} bytes: ${card.id} (${buffer.length})`,
    );
  }
  const image = inspectWebp(buffer);
  if (image.width !== avatarPixelSize || image.height !== avatarPixelSize) {
    throw new Error(
      `Avatar must be ${avatarPixelSize}x${avatarPixelSize}: ${card.id}`,
    );
  }
  if (!image.hasAlpha) {
    throw new Error(`Avatar must contain an alpha channel: ${card.id}`);
  }

  return {
    ...card,
    avatarDataUrl: `data:image/webp;base64,${buffer.toString("base64")}`,
  };
}

async function attachAvatars(cards) {
  return Promise.all(cards.map((card) => loadAvatar(card)));
}

async function build({ privateMode = false } = {}) {
  const [
    activeCards,
    archivedCards,
    readme,
    template,
    stylesheet,
    mermaidRuntime,
    viewportJavascript,
    javascript,
  ] =
    await Promise.all([
      readCards("tools", false),
      readCards("archive", true),
      readFile(path.join(projectRoot, "README.md"), "utf8"),
      readFile(
        path.join(projectRoot, "web/asset-atlas.template.html"),
        "utf8",
      ),
      readFile(path.join(projectRoot, "web/styles.css"), "utf8"),
      readFile(
        path.join(projectRoot, "node_modules/mermaid/dist/mermaid.min.js"),
        "utf8",
      ),
      readFile(path.join(projectRoot, "web/diagram-viewport.js"), "utf8"),
      readFile(path.join(projectRoot, "web/app.js"), "utf8"),
    ]);

  const parsedCards = [...activeCards, ...archivedCards].sort(
    (left, right) => left.numericId - right.numericId,
  );
  const nextId = validateIndex(parsedCards);
  await validateMermaidSyntax(parsedCards);
  const cards = await attachAvatars(parsedCards);
  const payload = {
    version: 1,
    nextId,
    metadata: parseIndexMetadata(readme),
    counts: createCounts(cards),
    cards,
  };
  const mermaidDataUrl = `data:text/javascript;base64,${Buffer.from(
    mermaidRuntime,
    "utf8",
  ).toString("base64")}`;

  const replacements = [
    ["/* ASSET_ATLAS_FOUNDATION_CSS */", stylesheet],
    [
      "/* ASSET_ATLAS_DATA */",
      privateMode
        ? 'window.__ASSET_ATLAS_ENDPOINT__ = "/api/data";'
        : `window.__ASSET_ATLAS__ = ${safeScriptJson(payload)};`,
    ],
    ["/* ASSET_ATLAS_MERMAID */", mermaidDataUrl],
    ["/* ASSET_ATLAS_VIEWPORT_JS */", viewportJavascript],
    ["/* ASSET_ATLAS_JS */", javascript],
  ];
  const html = replacements.reduce(
    (source, [marker, replacement]) =>
      replaceTemplateMarker(source, marker, replacement),
    template,
  );

  const outputBytes = Buffer.byteLength(html);
  if (outputBytes > htmlMaxBytes) {
    throw new Error(
      `asset-atlas.html exceeds ${htmlMaxBytes} bytes (${outputBytes}).`,
    );
  }
  const outputs = privateMode
    ? [
        [".asset-atlas/index.html", html],
        [".asset-atlas/data.json", `${JSON.stringify(payload)}\n`],
      ]
    : [["asset-atlas.html", html], ["dist/index.html", html]];
  const files = outputs.map(([filename, content]) => ({
    destination: path.join(projectRoot, filename),
    temporary: path.join(projectRoot, `${filename}.${process.pid}.tmp`),
    content,
  }));
  await mkdir(path.join(projectRoot, privateMode ? ".asset-atlas" : "dist"), {
    recursive: true,
    ...(privateMode ? { mode: 0o700 } : {}),
  });
  try {
    await Promise.all(files.map(({ temporary, content }) =>
      writeFile(temporary, content, {
        encoding: "utf8",
        flag: "wx",
        ...(privateMode ? { mode: 0o600 } : {}),
      }),
    ));
    for (const { temporary, destination } of files) {
      await rename(temporary, destination);
    }
  } catch (error) {
    await Promise.all(files.map(({ temporary }) =>
      unlink(temporary).catch((cleanupError) => {
        if (cleanupError.code !== "ENOENT") throw cleanupError;
      }),
    ));
    throw error;
  }
  process.stdout.write(
    `Built ${outputs.map(([filename]) => filename).join(" and ")} from ${activeCards.length} active and ${archivedCards.length} archived Markdown cards. next_id=${nextId}\n`,
  );
}

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--private")) {
    throw new Error("Usage: node scripts/build-asset-atlas.mjs [--private]");
  }
  await build({ privateMode: args.includes("--private") });
}

export {
  attachAvatars,
  createCounts,
  describeStatus,
  inspectWebp,
  linesOutsideFences,
  parseCard,
  parseDiagramSections,
  replaceTemplateMarker,
  validateMermaidSyntax,
  readCards,
  safeScriptJson,
  validateIndex,
};
