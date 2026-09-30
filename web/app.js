(async () => {
  "use strict";

  const root = document.querySelector("#app");
  if (!root) {
    throw new Error("Asset Atlas app root is missing.");
  }
  const atlas = window.__ASSET_ATLAS__;
  if (!atlas || !Array.isArray(atlas.cards)) throw new Error("Asset Atlas embedded data is missing.");

  const preferredCategoryOrder = [
    "网站与公开服务",
    "信息检索与 AI",
    "网络、服务器与运维",
  ];
  const appearanceStorageKey = "asset-atlas.appearance";
  const paletteStorageKey = "asset-atlas.palette";
  const allowedAppearances = new Set(["light", "dark", "system"]);
  const allowedPalettes = new Set(["aurum", "slate"]);
  const appearanceSequence = ["system", "light", "dark"];
  const viewportMath = window.AssetAtlasViewport;

  if (!viewportMath) {
    throw new Error("Asset Atlas diagram viewport runtime is missing.");
  }

  const state = {
    category: "all",
    status: "all",
    query: "",
    sort: "verified",
    selectedId: null,
    detailOpen: false,
    diagramModal: null,
    visibleLimit: 60,
    appearance: allowedAppearances.has(
      document.documentElement.dataset.appearance,
    )
      ? document.documentElement.dataset.appearance
      : "system",
    palette: allowedPalettes.has(document.documentElement.dataset.palette)
      ? document.documentElement.dataset.palette
      : "aurum",
  };
  let lastDetailTriggerId = null;
  let lastDiagramTrigger = null;
  let listScrollPosition = 0;
  let restoreListAfterRender = false;
  let diagramRenderGeneration = 0;
  let diagramRenderQueue = Promise.resolve();
  let diagramViewportState = null;

  const icons = {
    search:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></svg>',
    chevron:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>',
    close:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 5 14 14M19 5 5 19"/></svg>',
    back:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg>',
    external:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9"/><path d="M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6"/></svg>',
    file:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h8l4 4v14H6Z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>',
    folder:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6.5h7l2 2h9v10.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg>',
    terminal:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 7 5 5-5 5M12 17h7"/></svg>',
    globe:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>',
    calendar:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5.5" width="17" height="15" rx="1"/><path d="M7 3v5M17 3v5M3.5 10h17"/></svg>',
    sun:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M19.1 4.9l-1.7 1.7M6.6 17.4l-1.7 1.7"/></svg>',
    moon:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.4 14.2A8.6 8.6 0 0 1 9.8 3.6a8.6 8.6 0 1 0 10.6 10.6Z"/></svg>',
    monitor:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4.5" width="18" height="12.5" rx="2"/><path d="M9 20.5h6M12 17v3.5"/></svg>',
    expand:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M21 16v5h-5M3 8l6-6M15 3l6 6M3 16l6 6M15 21l6-6"/></svg>',
    plus:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    minus:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>',
    fit:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4H4v4M16 4h4v4M8 20H4v-4M20 16v4h-4"/><path d="M4 8l5-5M15 4l5 5M4 16l5 5M15 20l5-5"/></svg>',
    seal:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.4"/><circle cx="12" cy="12" r="4.6"/></svg>',
    diagram:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="6" height="6" rx="1.5"/><rect x="15" y="15" width="6" height="6" rx="1.5"/><path d="M6 9v3.5A2.5 2.5 0 0 0 8.5 15H15"/></svg>',
  };

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replaceAll("`", "&#096;");
  }

  function allowedHref(href) {
    let url;
    try {
      url = new URL(href);
    } catch {
      return false;
    }

    if (url.protocol === "https:") {
      return url.username === "" && url.password === "";
    }
    if (url.protocol === "http:") {
      return (
        url.username === "" &&
        url.password === "" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      );
    }
    if (url.protocol === "ssh:") {
      return (
        /^[a-z0-9._-]+$/i.test(url.hostname) &&
        url.username === "" &&
        url.password === "" &&
        url.port === "" &&
        (url.pathname === "" || url.pathname === "/") &&
        url.search === "" &&
        url.hash === ""
      );
    }
    if (url.protocol !== "vscode:" || url.search || url.hash) {
      return false;
    }
    if (url.hostname === "file") {
      return url.pathname.startsWith("/");
    }
    if (url.hostname === "vscode-remote") {
      return /^\/ssh-remote\+[a-z0-9._-]+\/.+/i.test(url.pathname);
    }
    return false;
  }

  function renderInlineMarkdown(rawMarkdown) {
    const source = String(rawMarkdown ?? "");
    const tokenPattern = /`([^`]*)`|\[([^\]]+)\]\(([^)]+)\)/g;
    let html = "";
    let cursor = 0;
    let match;

    while ((match = tokenPattern.exec(source)) !== null) {
      html += escapeHtml(source.slice(cursor, match.index));

      if (match[1] !== undefined) {
        html += `<code>${escapeHtml(match[1])}</code>`;
      } else {
        const label = escapeHtml(match[2]);
        const href = match[3].trim();
        if (allowedHref(href)) {
          const isWeb = /^https?:/i.test(href);
          html += `<a class="inline-link" href="${escapeAttribute(href)}"${
            isWeb ? ' target="_blank" rel="noopener noreferrer"' : ""
          }>${label}<span class="inline-link-icon">${icons.external}</span></a>`;
        } else {
          html += escapeHtml(match[0]);
        }
      }

      cursor = tokenPattern.lastIndex;
    }

    html += escapeHtml(source.slice(cursor));
    return html;
  }

  function stripMarkdown(rawMarkdown) {
    return String(rawMarkdown ?? "")
      .replace(/`([^`]*)`/g, "$1")
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 $2");
  }

  function statusInfo(rawStatus) {
    if (rawStatus.includes("在用")) {
      return { key: rawStatus, label: "在用", className: "healthy" };
    }
    if (rawStatus.includes("故障")) {
      return { key: rawStatus, label: "故障", className: "failed" };
    }
    if (rawStatus.includes("已归档")) {
      return { key: rawStatus, label: "已归档", className: "archived" };
    }
    if (rawStatus.includes("低频")) {
      return { key: rawStatus, label: "低频", className: "low" };
    }
    if (rawStatus.includes("降级")) {
      return { key: rawStatus, label: "降级", className: "degraded" };
    }
    if (rawStatus.includes("待核验")) {
      return { key: rawStatus, label: "待核验", className: "pending" };
    }
    return {
      key: rawStatus,
      label:
        rawStatus.replace(/^[^\p{L}\p{N}]+/u, "").trim() || rawStatus.trim(),
      className: "pending",
    };
  }

  function getField(card, key) {
    return card.fields.find((field) => field.key === key);
  }

  function getFilteredCards() {
    const query = state.query.trim().toLocaleLowerCase("zh-CN");
    const filtered = atlas.cards.filter((card) => {
      const categoryMatches =
        state.category === "all" || card.category === state.category;
      const statusMatches =
        state.status === "all" || card.status === state.status;
      const queryMatches =
        query === "" ||
        stripMarkdown(card.searchableText)
          .toLocaleLowerCase("zh-CN")
          .includes(query);
      return categoryMatches && statusMatches && queryMatches;
    });

    return filtered.sort((left, right) => {
      if (state.sort === "idAsc") return left.numericId - right.numericId;
      if (state.sort === "idDesc") return right.numericId - left.numericId;
      if (state.sort === "name") {
        return left.name.localeCompare(right.name, "zh-CN", {
          numeric: true,
          sensitivity: "base",
        });
      }

      const dateComparison = right.lastVerified.localeCompare(
        left.lastVerified,
      );
      if (dateComparison !== 0) return dateComparison;
      return left.name.localeCompare(right.name, "zh-CN", {
        numeric: true,
        sensitivity: "base",
      });
    });
  }

  function categoryEntries() {
    const categories = Object.entries(atlas.counts.categories);
    return categories.sort(([left], [right]) => {
      const leftIndex = preferredCategoryOrder.indexOf(left);
      const rightIndex = preferredCategoryOrder.indexOf(right);
      if (leftIndex === -1 && rightIndex === -1) {
        return left.localeCompare(right, "zh-CN");
      }
      if (leftIndex === -1) return 1;
      if (rightIndex === -1) return -1;
      return leftIndex - rightIndex;
    });
  }

  /* ---------- appearance ---------- */

  function appearanceMeta(appearance = state.appearance) {
    return {
      system: { label: "跟随系统", icon: icons.monitor },
      light: { label: "浅色", icon: icons.sun },
      dark: { label: "深色", icon: icons.moon },
    }[appearance];
  }

  function resolvedTheme(appearance = state.appearance) {
    if (appearance !== "system") return appearance;
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }

  function syncAppearanceControls() {
    const meta = appearanceMeta();
    root.querySelectorAll(".appearance-button").forEach((button) => {
      button.innerHTML = `${meta.icon}<span>${meta.label}</span>`;
      button.title = `当前${meta.label}，点击切换`;
      button.setAttribute("aria-label", `外观：${meta.label}，点击切换`);
    });
  }

  function applyAppearance(appearance, { persist = true } = {}) {
    state.appearance = allowedAppearances.has(appearance)
      ? appearance
      : "system";
    const resolved = resolvedTheme();
    document.documentElement.dataset.appearance = state.appearance;
    document.documentElement.dataset.theme = resolved;
    document.documentElement.style.colorScheme = resolved;
    document
      .querySelector('meta[name="color-scheme"]')
      ?.setAttribute("content", "light dark");

    if (persist) {
      try {
        localStorage.setItem(appearanceStorageKey, state.appearance);
      } catch {
        // Storage may be unavailable for file:// or privacy-restricted contexts.
      }
    }
    syncAppearanceControls();
    if (root.querySelector(".mermaid-target")) {
      void renderVisibleDiagrams();
    }
  }

  function cycleAppearance() {
    const index = appearanceSequence.indexOf(state.appearance);
    applyAppearance(
      appearanceSequence[(index + 1) % appearanceSequence.length],
    );
  }

  /* ---------- palette ---------- */

  function paletteMeta(palette = state.palette) {
    return {
      aurum: { label: "暖金", swatch: "palette-swatch-aurum" },
      slate: { label: "石墨", swatch: "palette-swatch-slate" },
    }[palette];
  }

  function syncPaletteControls() {
    root.querySelectorAll("[data-palette-choice]").forEach((button) => {
      const isActive = button.dataset.paletteChoice === state.palette;
      button.setAttribute("aria-pressed", String(isActive));
      const meta = paletteMeta(button.dataset.paletteChoice);
      button.title = isActive
        ? `当前使用${meta.label}主题`
        : `切换到${meta.label}主题`;
    });
  }

  function applyPalette(palette, { persist = true } = {}) {
    state.palette = allowedPalettes.has(palette) ? palette : "aurum";
    document.documentElement.dataset.palette = state.palette;

    if (persist) {
      try {
        localStorage.setItem(paletteStorageKey, state.palette);
      } catch {
        // Storage may be unavailable for file:// or privacy-restricted contexts.
      }
    }
    syncPaletteControls();
    if (root.querySelector(".mermaid-target")) {
      void renderVisibleDiagrams();
    }
  }

  /* ---------- mermaid ---------- */

  function mermaidConfig() {
    const dark = resolvedTheme() === "dark";
    const slate = state.palette === "slate";
    const themeVariables = slate
      ? dark
        ? {
            darkMode: true,
            background: "transparent",
            primaryColor: "#191c22",
            primaryTextColor: "#e7eaef",
            primaryBorderColor: "#4d5866",
            secondaryColor: "#1b1e25",
            secondaryTextColor: "#cdd3dd",
            secondaryBorderColor: "#39404b",
            tertiaryColor: "#161920",
            tertiaryTextColor: "#aab1bd",
            tertiaryBorderColor: "#333943",
            lineColor: "#7d8ba3",
            textColor: "#e7eaef",
            clusterBkg: "#161920",
            clusterBorder: "#333943",
            edgeLabelBackground: "#111318",
            fontSize: "13px",
          }
        : {
            darkMode: false,
            background: "transparent",
            primaryColor: "#fdfdfe",
            primaryTextColor: "#181b20",
            primaryBorderColor: "#93a1b3",
            secondaryColor: "#eceff4",
            secondaryTextColor: "#333a45",
            secondaryBorderColor: "#c3c9d2",
            tertiaryColor: "#e9ebef",
            tertiaryTextColor: "#4f5661",
            tertiaryBorderColor: "#c3c9d2",
            lineColor: "#5b6b80",
            textColor: "#181b20",
            clusterBkg: "#e9ebef",
            clusterBorder: "#c3c9d2",
            edgeLabelBackground: "#f3f4f6",
            fontSize: "13px",
          }
      : dark
        ? {
            darkMode: true,
            background: "transparent",
            primaryColor: "#1d1b19",
            primaryTextColor: "#ebe7e0",
            primaryBorderColor: "#6f6455",
            secondaryColor: "#221f1c",
            secondaryTextColor: "#d8d2c8",
            secondaryBorderColor: "#4a4238",
            tertiaryColor: "#191715",
            tertiaryTextColor: "#b6b0a6",
            tertiaryBorderColor: "#3d3833",
            lineColor: "#a3907a",
            textColor: "#ebe7e0",
            clusterBkg: "#191715",
            clusterBorder: "#3d3833",
            edgeLabelBackground: "#151312",
            fontSize: "13px",
          }
        : {
            darkMode: false,
            background: "transparent",
            primaryColor: "#fffefa",
            primaryTextColor: "#1c1917",
            primaryBorderColor: "#b3a68c",
            secondaryColor: "#f1ede4",
            secondaryTextColor: "#3c372f",
            secondaryBorderColor: "#cfc7b8",
            tertiaryColor: "#efece5",
            tertiaryTextColor: "#57524b",
            tertiaryBorderColor: "#cfc7b8",
            lineColor: "#8a7350",
            textColor: "#1c1917",
            clusterBkg: "#efece5",
            clusterBorder: "#cfc7b8",
            edgeLabelBackground: "#f6f4ef",
            fontSize: "13px",
          };
    return {
      startOnLoad: false,
      securityLevel: "strict",
      htmlLabels: false,
      suppressErrorRendering: true,
      theme: "base",
      fontFamily:
        '"SF Pro Text", "PingFang SC", "Microsoft YaHei", sans-serif',
      flowchart: {
        htmlLabels: false,
        useMaxWidth: true,
        curve: "basis",
        nodeSpacing: 28,
        rankSpacing: 38,
      },
      themeVariables,
    };
  }

  function diagramForTarget(target) {
    const card = atlas.cards.find(
      (item) => item.id === target.dataset.diagramCardId,
    );
    const diagramIndex = Number(target.dataset.diagramIndex);
    if (!card || !Number.isInteger(diagramIndex)) return null;
    const diagram = card.diagrams?.[diagramIndex];
    return diagram ? { card, diagram, diagramIndex } : null;
  }

  async function performDiagramRender(generation) {
    const targets = [...root.querySelectorAll(".mermaid-target")];
    if (targets.length === 0 || generation !== diagramRenderGeneration) return;

    const runtime = window.mermaid;
    if (!runtime?.initialize || !runtime?.render) {
      targets.forEach((target) => {
        target.innerHTML = '<span class="diagram-error">Mermaid 运行时未加载。</span>';
      });
      return;
    }

    runtime.initialize(mermaidConfig());
    for (let index = 0; index < targets.length; index += 1) {
      if (generation !== diagramRenderGeneration) return;
      const target = targets[index];
      const resolved = diagramForTarget(target);
      if (!resolved) continue;
      target.innerHTML = '<span class="diagram-loading">正在绘制关系图…</span>';

      const renderId = `assetAtlasDiagram${generation}_${index}_${resolved.card.numericId}`;
      try {
        const { svg } = await runtime.render(renderId, resolved.diagram.source);
        if (
          generation !== diagramRenderGeneration ||
          !target.isConnected ||
          diagramForTarget(target)?.diagram !== resolved.diagram
        ) {
          return;
        }
        target.innerHTML = svg;
        const svgElement = target.querySelector("svg");
        svgElement?.removeAttribute("height");
        svgElement?.setAttribute("role", "img");
        svgElement?.setAttribute(
          "aria-label",
          `${resolved.card.name} · ${resolved.diagram.title}`,
        );
        svgElement?.setAttribute("preserveAspectRatio", "xMidYMid meet");
        if (target.classList.contains("mermaid-target-large")) {
          initializeDiagramCanvas(svgElement);
        } else {
          const renderedHeight =
            svgElement?.getBoundingClientRect().height ?? 0;
          target.classList.toggle("is-truncated", renderedHeight > 380);
        }
      } catch {
        if (generation !== diagramRenderGeneration || !target.isConnected) return;
        target.innerHTML =
          '<span class="diagram-error">图表暂时无法渲染，请打开 Markdown 事实源检查。</span>';
      }
    }
  }

  function renderVisibleDiagrams() {
    const generation = ++diagramRenderGeneration;
    diagramRenderQueue = diagramRenderQueue
      .catch(() => {})
      .then(() => performDiagramRender(generation));
    return diagramRenderQueue;
  }

  /* ---------- shell ---------- */

  function renderAvatar(card, className) {
    const safeAvatar =
      typeof card.avatarDataUrl === "string" &&
      card.avatarDataUrl.startsWith("data:image/webp;base64,")
        ? card.avatarDataUrl
        : "";
    const style = safeAvatar
      ? ` style="--asset-avatar-image: url('${escapeAttribute(safeAvatar)}')"`
      : "";
    return `
      <span class="${escapeAttribute(className)} asset-avatar"${style} aria-hidden="true">
        <span class="asset-avatar-fallback">${icons.seal}</span>
        <span class="asset-avatar-image"></span>
      </span>
    `;
  }

  function renderShell() {
    root.innerHTML = `
      <div class="atlas-shell">
        <header class="app-bar">
          <div class="app-bar-inner">
            <button class="brand" type="button" data-action="go-home" aria-label="Asset Atlas 首页，清除筛选并返回列表">
              <span class="brand-mark" aria-hidden="true"></span>
              <span class="brand-copy">
                <span class="brand-name">ASSET ATLAS</span>
                <span class="brand-sub">资产总览</span>
              </span>
            </button>
            <label class="search-control">
              <span class="search-icon">${icons.search}</span>
              <span class="sr-only">搜索资产</span>
              <input
                id="asset-search"
                type="search"
                autocomplete="off"
                placeholder="搜索名称、标签、位置或链接"
              />
              <button class="search-clear" type="button" data-action="clear-search" aria-label="清空搜索" hidden>
                ${icons.close}
              </button>
              <span class="search-shortcut" aria-hidden="true">⌘K</span>
            </label>
            <div class="palette-switch" role="group" aria-label="主题风格">
              <button class="palette-choice" type="button" data-palette-choice="aurum" aria-pressed="true">
                <span class="palette-swatch palette-swatch-aurum" aria-hidden="true"></span>
                <span>暖金</span>
              </button>
              <button class="palette-choice" type="button" data-palette-choice="slate" aria-pressed="false">
                <span class="palette-swatch palette-swatch-slate" aria-hidden="true"></span>
                <span>石墨</span>
              </button>
            </div>
            <button class="appearance-button" type="button" data-action="cycle-appearance"></button>
          </div>
        </header>

        <main class="browse-view">
          <div class="hero">
            <div>
              <h1 class="hero-title">资产总览</h1>
              <p class="hero-sub">工具、服务与入口，一处看清。</p>
            </div>
            <div class="hero-meta">
              <span><strong>${atlas.counts.total}</strong>项资产</span>
              <span><strong>${Object.keys(atlas.counts.categories).length}</strong>个分类</span>
            </div>
          </div>

          <div class="filter-bar" aria-label="筛选与排序"></div>
          <div class="list-meta" aria-live="polite"></div>
          <ul class="asset-grid"></ul>
        </main>

        <main class="detail-view" aria-label="资产详情" hidden></main>

        <dialog class="diagram-dialog" aria-labelledby="diagram-dialog-title"></dialog>
      </div>
    `;
  }

  function renderFilterBar() {
    const bar = root.querySelector(".filter-bar");
    const statuses = atlas.counts.statuses;
    bar.innerHTML = `
      <button
        class="chip${state.category === "all" ? " is-active" : ""}"
        type="button"
        data-category="all"
        aria-pressed="${state.category === "all"}"
      >全部<span class="chip-count">${atlas.counts.total}</span></button>
      ${categoryEntries()
        .map(
          ([category, count]) => `
            <button
              class="chip${state.category === category ? " is-active" : ""}"
              type="button"
              data-category="${escapeAttribute(category)}"
              aria-pressed="${state.category === category}"
            >${escapeHtml(category)}<span class="chip-count">${count}</span></button>
          `,
        )
        .join("")}
      <span class="filter-divider" aria-hidden="true"></span>
      ${statuses
        .map(
          (item) => `
            <button
              class="status-chip${state.status === item.rawStatus ? " is-active" : ""}"
              type="button"
              data-status="${escapeAttribute(item.rawStatus)}"
              aria-pressed="${state.status === item.rawStatus}"
            >
              <span class="status-dot ${item.className}"></span>
              <span>${escapeHtml(item.label)}</span>
              <span class="chip-count">${item.count}</span>
            </button>
          `,
        )
        .join("")}
      <label class="sort-control">
        <span class="sr-only">排序方式</span>
        <select id="asset-sort">
          <option value="verified">最近核验</option>
          <option value="name">名称</option>
          <option value="idAsc">ID 升序</option>
          <option value="idDesc">ID 降序</option>
        </select>
        <span class="sort-chevron">${icons.chevron}</span>
      </label>
    `;
    bar.querySelector("#asset-sort").addEventListener("change", (event) => {
      state.sort = event.target.value;
      state.visibleLimit = 60;
      renderDynamic();
      replaceListHistory();
    });
  }

  function renderGrid(cards) {
    const grid = root.querySelector(".asset-grid");
    const meta = root.querySelector(".list-meta");
    const activeFilters =
      state.category !== "all" || state.status !== "all" || state.query !== "";
    const visibleCards = cards.slice(0, state.visibleLimit);

    meta.textContent =
      cards.length > state.visibleLimit
        ? `已加载 ${visibleCards.length} / ${cards.length} 项资产`
        : activeFilters
          ? `显示 ${cards.length} / ${atlas.counts.total} 项资产`
          : "";

    if (cards.length === 0) {
      grid.innerHTML = `
        <li class="empty-state">
          <div class="empty-state-icon">${icons.search}</div>
          <h2>没有匹配的资产</h2>
          <p>换一个名称、标签、位置或链接试试。</p>
          <button type="button" data-action="reset-filters">清除筛选</button>
        </li>
      `;
      return;
    }

    grid.innerHTML =
      visibleCards
        .map((card) => {
          const status = statusInfo(card.status);
          const isSelected = state.selectedId === card.id && state.detailOpen;
          return `
            <li>
              <article class="asset-card-frame">
                <button
                  class="asset-card${isSelected ? " is-selected" : ""}"
                  type="button"
                  data-asset-id="${escapeAttribute(card.id)}"
                  aria-label="查看 ${escapeAttribute(card.name)} 详情"
                  aria-current="${isSelected ? "true" : "false"}"
                >
                  <span class="asset-card-top">
                    <span class="asset-card-id">${escapeHtml(card.id)}</span>
                    <span class="asset-card-status">
                      <span class="status-dot ${status.className}"></span>
                      <span>${escapeHtml(status.label)}</span>
                    </span>
                  </span>
                  <span class="asset-card-seal">
                    ${renderAvatar(card, "")}
                  </span>
                  <span class="asset-card-name">${escapeHtml(card.name)}${
                    card.diagrams?.length
                      ? `<span class="asset-card-diagram-badge" title="含架构与流程图" role="img" aria-label="含架构与流程图">${icons.diagram}</span>`
                      : ""
                  }</span>
                  <span class="asset-card-meta">${escapeHtml(card.category)} · ${escapeHtml(card.lastVerified)}</span>
                </button>
              </article>
            </li>
          `;
        })
        .join("") +
      (cards.length > state.visibleLimit
        ? `
          <li class="load-more">
            <button type="button" data-action="load-more">
              再加载 ${Math.min(60, cards.length - state.visibleLimit)} 项
            </button>
          </li>
        `
        : "");
  }

  function renderFacts(card, fieldNames) {
    return fieldNames
      .map((fieldName) => getField(card, fieldName))
      .filter(Boolean)
      .map(
        (field) => `
          <div class="fact-row">
            <dt>${escapeHtml(field.key)}</dt>
            <dd>${renderInlineMarkdown(field.rawMarkdown)}</dd>
          </div>
        `,
      )
      .join("");
  }

  function renderAdditionalFacts(card) {
    const handledFields = new Set([
      "状态",
      "分类",
      "标签",
      "头像",
      "头像意象",
      "主维护位置",
      "本机目录",
      "本机打开备用命令",
      "Git 仓库",
      "本机启动",
      "SSH 主机",
      "远端目录",
      "生产网站",
      "管理后台",
      "健康检查",
      "部署方式",
      "日志位置",
      "数据与备份",
      "Secrets 位置",
      "依赖与端口",
      "最近核验",
      "归档日期",
      "归档原因",
      "备注",
    ]);
    const additionalFields = card.fields.filter(
      (field) =>
        !handledFields.has(field.key) && !shortcutFromField(field),
    );

    if (additionalFields.length === 0) return "";
    return `
      <section class="detail-section">
        <h3>其他信息</h3>
        <dl class="facts-list">
          ${additionalFields
            .map(
              (field) => `
                <div class="fact-row">
                  <dt>${escapeHtml(field.key)}</dt>
                  <dd>${renderInlineMarkdown(field.rawMarkdown)}</dd>
                </div>
              `,
            )
            .join("")}
        </dl>
      </section>
    `;
  }

  function shortcutFromField(field) {
    const match = field.key.match(/^快捷键 `([^`]+)`$/);
    if (!match) return null;
    return {
      keys: match[1],
      description: field.rawMarkdown,
    };
  }

  function renderShortcutFacts(card) {
    const shortcuts = card.fields.map(shortcutFromField).filter(Boolean);
    if (shortcuts.length === 0) return "";

    return `
      <section class="detail-section detail-shortcut-section">
        <h3>快捷键</h3>
        <dl class="shortcut-list">
          ${shortcuts
            .map(
              (shortcut) => `
                <div class="shortcut-row">
                  <dt><kbd>${escapeHtml(shortcut.keys)}</kbd></dt>
                  <dd>${renderInlineMarkdown(shortcut.description)}</dd>
                </div>
              `,
            )
            .join("")}
        </dl>
      </section>
    `;
  }

  function renderActionIcon(href) {
    if (href.startsWith("ssh:")) return icons.terminal;
    if (href.startsWith("vscode:")) return icons.folder;
    return icons.globe;
  }

  function actionLabel(link) {
    if (link.label === "登录" && link.href.startsWith("ssh://")) {
      return `登录 ${link.href.slice("ssh://".length)}`;
    }

    if (link.label === "打开" && /^https?:/i.test(link.href)) {
      try {
        return `打开 ${new URL(link.href).host}`;
      } catch {
        return link.label;
      }
    }

    return link.label;
  }

  function renderLinkActions(card) {
    const entryFields = new Set([
      "生产网站",
      "管理后台",
      "健康检查",
      "Git 仓库",
      "本机目录",
      "SSH 主机",
      "远端目录",
    ]);
    const seen = new Set();
    const links = card.links.filter((link) => {
      if (!entryFields.has(link.field) || seen.has(link.href)) return false;
      seen.add(link.href);
      return allowedHref(link.href);
    });
    const prioritizedLinks = links.slice(0, 8);

    return `
      ${prioritizedLinks
        .map((link) => {
          const isWeb = /^https?:/i.test(link.href);
          return `
            <a class="action-link" href="${escapeAttribute(link.href)}"${
              isWeb ? ' target="_blank" rel="noopener noreferrer"' : ""
            }>
              <span class="action-link-icon">${renderActionIcon(link.href)}</span>
              <span class="action-link-copy">
                <small>${escapeHtml(link.field)}</small>
                <strong>${escapeHtml(actionLabel(link))}</strong>
              </span>
              <span class="action-link-external">${icons.external}</span>
            </a>
          `;
        })
        .join("")}
      <a class="action-link" href="data:text/markdown;charset=utf-8,${escapeAttribute(encodeURIComponent(card.markdown))}" download="${escapeAttribute(card.sourcePath.split("/").at(-1))}">
        <span class="action-link-icon">${icons.file}</span>
        <span class="action-link-copy">
          <small>Markdown 事实源</small>
          <strong>下载 ${escapeHtml(card.sourcePath.split("/").at(-1))}</strong>
        </span>
        <span class="action-link-external">${icons.external}</span>
      </a>
    `;
  }

  function renderDiagramSections(card) {
    if (!Array.isArray(card.diagrams) || card.diagrams.length === 0) return "";

    return `
      <section class="detail-section detail-diagram-section">
        <h3>架构与流程</h3>
        <div class="detail-diagram-grid">
          ${card.diagrams
            .map(
              (diagram, index) => `
                <figure class="diagram-figure">
                  <button
                    class="diagram-frame"
                    type="button"
                    data-action="open-diagram"
                    data-card-id="${escapeAttribute(card.id)}"
                    data-diagram-index="${index}"
                    aria-label="放大查看 ${escapeAttribute(card.name)}的${escapeAttribute(diagram.title)}"
                  >
                    <span
                      class="mermaid-target"
                      data-diagram-card-id="${escapeAttribute(card.id)}"
                      data-diagram-index="${index}"
                      aria-live="polite"
                    >
                      <span class="diagram-loading">正在绘制关系图…</span>
                    </span>
                  </button>
                  <figcaption>
                    <span>${escapeHtml(diagram.title)} · Mermaid 实时渲染</span>
                    <button
                      class="diagram-expand-button"
                      type="button"
                      data-action="open-diagram"
                      data-card-id="${escapeAttribute(card.id)}"
                      data-diagram-index="${index}"
                    >
                      <span>${icons.expand}</span>
                      <span>查看大图</span>
                    </button>
                  </figcaption>
                </figure>
              `,
            )
            .join("")}
        </div>
      </section>
    `;
  }

  function renderDetail(card) {
    const panel = root.querySelector(".detail-view");
    const browse = root.querySelector(".browse-view");
    const shell = root.querySelector(".atlas-shell");

    shell.classList.toggle("detail-is-open", Boolean(card && state.detailOpen));

    if (!card || !state.detailOpen) {
      panel.innerHTML = "";
      panel.hidden = true;
      browse.hidden = false;
      return;
    }

    panel.hidden = false;
    browse.hidden = true;

    const status = statusInfo(card.status);
    panel.innerHTML = `
      <div class="detail-topbar">
        <button class="detail-back-button" type="button" data-action="close-detail">
          <span>${icons.back}</span>
          <span>返回资产列表</span>
        </button>
      </div>

      <header class="detail-header">
        ${renderAvatar(card, "detail-asset-avatar")}
        <div class="detail-header-main">
          <div class="detail-title-row">
            <h2>${escapeHtml(card.name)}</h2>
            <span class="detail-id">${escapeHtml(card.id)}</span>
          </div>
          <div class="detail-chips">
            <span class="detail-chip">
              <span class="status-dot ${status.className}"></span>
              <span>${escapeHtml(status.label)}</span>
            </span>
            <button class="detail-chip" type="button" data-category="${escapeAttribute(card.category)}">
              ${escapeHtml(card.category)}
            </button>
          </div>
          <p class="detail-summary">${escapeHtml(card.summary)}</p>
        </div>
      </header>

      <div class="detail-body">
        ${renderDiagramSections(card)}
        ${renderShortcutFacts(card)}
        <div class="detail-column">
          <section class="detail-section">
            <h3>入口</h3>
            <div class="action-links">
              ${renderLinkActions(card)}
            </div>
          </section>
          ${
            card.tags.length
              ? `
                <section class="detail-section">
                  <h3>标签</h3>
                  <div class="tag-list">
                    ${card.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}
                  </div>
                </section>
              `
              : ""
          }
          <section class="detail-section detail-verification">
            <h3>核验与备注</h3>
            <div class="verification-date">
              <span>${icons.calendar}</span>
              <time datetime="${escapeAttribute(card.lastVerified)}">${escapeHtml(card.lastVerified)}</time>
            </div>
            ${
              card.archiveDate
                ? `<div class="archive-note"><strong>归档日期</strong><span>${escapeHtml(card.archiveDate)}</span></div>`
                : ""
            }
            ${
              card.archiveReason
                ? `<div class="archive-note"><strong>归档原因</strong><span>${renderInlineMarkdown(card.archiveReason)}</span></div>`
                : ""
            }
            <div class="detail-note">${renderInlineMarkdown(getField(card, "备注")?.rawMarkdown ?? "无")}</div>
          </section>
        </div>
        <div class="detail-column">
          <section class="detail-section">
            <h3>运行位置</h3>
            <dl class="facts-list">
              ${renderFacts(card, [
                "主维护位置",
                "本机目录",
                "本机打开备用命令",
                "SSH 主机",
                "远端目录",
                "部署方式",
                "本机启动",
              ])}
            </dl>
          </section>
          <section class="detail-section">
            <h3>运行与保管</h3>
            <dl class="facts-list">
              ${renderFacts(card, [
                "Git 仓库",
                "生产网站",
                "管理后台",
                "健康检查",
                "日志位置",
                "数据与备份",
                "Secrets 位置",
                "依赖与端口",
              ])}
            </dl>
          </section>
          ${renderAdditionalFacts(card)}
        </div>
      </div>
    `;
    void renderVisibleDiagrams();
  }

  /* ---------- diagram dialog (unchanged viewport behavior) ---------- */

  function renderDiagramDialog() {
    const dialog = root.querySelector(".diagram-dialog");
    const modal = state.diagramModal;
    const card = atlas.cards.find((item) => item.id === modal?.cardId);
    const diagram = card?.diagrams?.[modal?.diagramIndex];
    if (!dialog || !card || !diagram) {
      closeDiagram();
      return;
    }

    dialog.innerHTML = `
      <div class="diagram-dialog-shell">
        <header class="diagram-dialog-header">
          <div class="diagram-dialog-title">
            <span>${escapeHtml(card.id)} · ${escapeHtml(card.name)}</span>
            <h2 id="diagram-dialog-title">${escapeHtml(diagram.title)}</h2>
          </div>
          <div class="diagram-toolbar" role="toolbar" aria-label="图表缩放工具">
            <button type="button" data-action="diagram-zoom-out" aria-label="缩小图表" title="缩小（-）">${icons.minus}</button>
            <output class="diagram-scale" aria-live="polite">100%</output>
            <button type="button" data-action="diagram-zoom-in" aria-label="放大图表" title="放大（+）">${icons.plus}</button>
            <button class="diagram-toolbar-text" type="button" data-action="diagram-reset" aria-label="将图表恢复为百分之百" title="100%（0）">100%</button>
            <button class="diagram-toolbar-fit" type="button" data-action="diagram-fit" aria-label="使图表适应窗口" title="适应窗口（F）">
              <span>${icons.fit}</span><span>适应窗口</span>
            </button>
            <button class="diagram-dialog-close" type="button" data-action="close-diagram" aria-label="关闭大图" title="关闭（Esc）">
              ${icons.close}
            </button>
          </div>
        </header>
        <div class="diagram-dialog-body diagram-viewport" tabindex="0" aria-label="可缩放、拖动并用方向键平移的${escapeAttribute(diagram.title)}画布">
          <div class="diagram-canvas">
            <div
              class="mermaid-target mermaid-target-large"
              data-diagram-card-id="${escapeAttribute(card.id)}"
              data-diagram-index="${modal.diagramIndex}"
              aria-live="polite"
            >
              <span class="diagram-loading">正在绘制关系图…</span>
            </div>
          </div>
          <div class="diagram-gesture-hint" aria-hidden="true">拖动或方向键平移 · 滚轮或双指缩放</div>
        </div>
      </div>
    `;
    if (!dialog.open) dialog.showModal();
    diagramViewportState = {
      transform: { scale: 1, x: 0, y: 0 },
      contentSize: null,
      pointers: new Map(),
      gestureStart: null,
      mode: "fit",
    };
    requestAnimationFrame(() => dialog.querySelector(".diagram-viewport")?.focus());
    void renderVisibleDiagrams();
  }

  function diagramViewportElements() {
    const dialog = root.querySelector(".diagram-dialog");
    return {
      dialog,
      viewport: dialog?.querySelector(".diagram-viewport") ?? null,
      canvas: dialog?.querySelector(".diagram-canvas") ?? null,
      scaleOutput: dialog?.querySelector(".diagram-scale") ?? null,
    };
  }

  function viewportSize(viewport) {
    const rect = viewport.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }

  function applyDiagramTransform(transform, { mode = "custom" } = {}) {
    const elements = diagramViewportElements();
    if (
      !diagramViewportState?.contentSize ||
      !elements.viewport ||
      !elements.canvas
    ) {
      return;
    }
    const constrained = viewportMath.constrainTransform(
      transform,
      viewportSize(elements.viewport),
      diagramViewportState.contentSize,
    );
    diagramViewportState.transform = constrained;
    diagramViewportState.mode = mode;
    elements.canvas.style.transform = `translate3d(${constrained.x}px, ${constrained.y}px, 0) scale(${constrained.scale})`;
    if (elements.scaleOutput) {
      elements.scaleOutput.value = `${Math.round(constrained.scale * 100)}%`;
      elements.scaleOutput.textContent = elements.scaleOutput.value;
    }
  }

  function fitDiagramToViewport() {
    const elements = diagramViewportElements();
    if (!diagramViewportState?.contentSize || !elements.viewport) return;
    const padding = window.matchMedia("(max-width: 759px)").matches ? 24 : 56;
    applyDiagramTransform(
      viewportMath.fitTransform(
        viewportSize(elements.viewport),
        diagramViewportState.contentSize,
        padding,
      ),
      { mode: "fit" },
    );
  }

  function resetDiagramToActualSize() {
    const elements = diagramViewportElements();
    if (!diagramViewportState?.contentSize || !elements.viewport) return;
    const size = viewportSize(elements.viewport);
    applyDiagramTransform(
      {
        scale: 1,
        x: (size.width - diagramViewportState.contentSize.width) / 2,
        y: (size.height - diagramViewportState.contentSize.height) / 2,
      },
      { mode: "actual" },
    );
  }

  function zoomDiagram(nextScale, anchor = null) {
    const elements = diagramViewportElements();
    if (!diagramViewportState?.contentSize || !elements.viewport) return;
    const size = viewportSize(elements.viewport);
    applyDiagramTransform(
      viewportMath.zoomAtPoint(
        diagramViewportState.transform,
        nextScale,
        anchor ?? { x: size.width / 2, y: size.height / 2 },
      ),
    );
  }

  function initializeDiagramCanvas(svgElement) {
    if (!diagramViewportState || !svgElement.closest(".diagram-canvas")) return;
    const viewBox = svgElement.viewBox?.baseVal;
    const fallback = svgElement.getBoundingClientRect();
    const width = Math.max(1, viewBox?.width || fallback.width || 1);
    const height = Math.max(1, viewBox?.height || fallback.height || 1);
    const target = svgElement.closest(".mermaid-target-large");
    const canvas = svgElement.closest(".diagram-canvas");
    diagramViewportState.contentSize = { width, height };
    svgElement.style.width = `${width}px`;
    svgElement.style.height = `${height}px`;
    if (target) {
      target.style.width = `${width}px`;
      target.style.height = `${height}px`;
    }
    if (canvas) {
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }
    fitDiagramToViewport();
  }

  function pointInViewport(event, viewport) {
    const rect = viewport.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function resetDiagramGesture() {
    if (!diagramViewportState) return;
    const pointers = [...diagramViewportState.pointers.values()];
    if (pointers.length === 1) {
      diagramViewportState.gestureStart = {
        type: "pan",
        transform: { ...diagramViewportState.transform },
        point: { ...pointers[0] },
      };
    } else if (pointers.length >= 2) {
      const [first, second] = pointers;
      diagramViewportState.gestureStart = {
        type: "pinch",
        transform: { ...diagramViewportState.transform },
        midpoint: {
          x: (first.x + second.x) / 2,
          y: (first.y + second.y) / 2,
        },
        distance: Math.hypot(second.x - first.x, second.y - first.y),
      };
    } else {
      diagramViewportState.gestureStart = null;
    }
  }

  function handleDiagramPointerDown(event) {
    const viewport = event.target.closest(".diagram-viewport");
    if (!viewport || !diagramViewportState) return;
    if (event.target.closest("button")) return;
    event.preventDefault();
    viewport.setPointerCapture?.(event.pointerId);
    diagramViewportState.pointers.set(
      event.pointerId,
      pointInViewport(event, viewport),
    );
    viewport.classList.add("is-panning");
    resetDiagramGesture();
  }

  function handleDiagramPointerMove(event) {
    const viewport = event.target.closest(".diagram-viewport");
    if (!viewport || !diagramViewportState?.pointers.has(event.pointerId)) return;
    event.preventDefault();
    diagramViewportState.pointers.set(
      event.pointerId,
      pointInViewport(event, viewport),
    );
    const pointers = [...diagramViewportState.pointers.values()];
    const gesture = diagramViewportState.gestureStart;
    if (pointers.length === 1 && gesture?.type === "pan") {
      applyDiagramTransform(
        viewportMath.panTransform(gesture.transform, {
          x: pointers[0].x - gesture.point.x,
          y: pointers[0].y - gesture.point.y,
        }),
      );
    } else if (pointers.length >= 2 && gesture?.type === "pinch") {
      const [first, second] = pointers;
      applyDiagramTransform(
        viewportMath.pinchTransform(
          gesture.transform,
          gesture.midpoint,
          {
            x: (first.x + second.x) / 2,
            y: (first.y + second.y) / 2,
          },
          gesture.distance,
          Math.hypot(second.x - first.x, second.y - first.y),
        ),
      );
    }
  }

  function handleDiagramPointerEnd(event) {
    const viewport = event.target.closest(".diagram-viewport");
    if (!viewport || !diagramViewportState?.pointers.has(event.pointerId)) return;
    diagramViewportState.pointers.delete(event.pointerId);
    if (viewport.hasPointerCapture?.(event.pointerId)) {
      viewport.releasePointerCapture(event.pointerId);
    }
    viewport.classList.toggle(
      "is-panning",
      diagramViewportState.pointers.size > 0,
    );
    resetDiagramGesture();
  }

  function handleDiagramWheel(event) {
    const viewport = event.target.closest(".diagram-viewport");
    if (!viewport || !diagramViewportState?.contentSize) return;
    event.preventDefault();
    const scaleFactor = viewportMath.wheelScaleFactor(
      event.deltaY,
      event.deltaMode,
      viewport.clientHeight,
    );
    zoomDiagram(
      diagramViewportState.transform.scale * scaleFactor,
      pointInViewport(event, viewport),
    );
  }

  function openDiagram(cardId, diagramIndex, trigger) {
    const card = atlas.cards.find((item) => item.id === cardId);
    if (!card?.diagrams?.[diagramIndex]) return;
    lastDiagramTrigger = trigger ?? null;
    state.diagramModal = { cardId, diagramIndex };
    renderDiagramDialog();
    syncBodyLock();
  }

  function closeDiagram({ restoreFocus = true } = {}) {
    const dialog = root.querySelector(".diagram-dialog");
    if (dialog?.open) dialog.close();
    if (dialog) dialog.innerHTML = "";
    state.diagramModal = null;
    diagramViewportState = null;
    diagramRenderGeneration += 1;
    void renderVisibleDiagrams();
    const focusTarget = lastDiagramTrigger;
    lastDiagramTrigger = null;
    if (restoreFocus) {
      requestAnimationFrame(() => focusTarget?.isConnected && focusTarget.focus());
    }
    syncBodyLock();
  }

  function syncBodyLock() {
    document.body.classList.toggle(
      "no-scroll",
      Boolean(state.diagramModal),
    );
  }

  /* ---------- navigation & history ---------- */

  function safeHashId() {
    try {
      return decodeURIComponent(location.hash.slice(1));
    } catch {
      return "";
    }
  }

  function listSnapshot() {
    return {
      category: state.category,
      status: state.status,
      query: state.query,
      sort: state.sort,
      visibleLimit: state.visibleLimit,
      selectedId: state.selectedId,
      focusedId: lastDetailTriggerId,
      scrollTop: window.scrollY,
    };
  }

  function navigationState(view, options = {}) {
    return {
      ...(history.state ?? {}),
      assetAtlas: {
        view,
        id: options.id ?? null,
        fromList: Boolean(options.fromList),
        list: options.list ?? listSnapshot(),
      },
    };
  }

  function replaceListHistory() {
    if (state.detailOpen) return;
    history.replaceState(
      navigationState("list", { list: listSnapshot() }),
      "",
      `${location.pathname}${location.search}`,
    );
  }

  function applyListSnapshot(snapshot) {
    const validCategories = new Set(["all", ...Object.keys(atlas.counts.categories)]);
    const validStatuses = new Set([
      "all",
      ...atlas.counts.statuses.map((item) => item.rawStatus),
    ]);
    state.category = validCategories.has(snapshot?.category)
      ? snapshot.category
      : "all";
    state.status = validStatuses.has(snapshot?.status) ? snapshot.status : "all";
    state.query = typeof snapshot?.query === "string" ? snapshot.query : "";
    state.sort = ["verified", "name", "idAsc", "idDesc"].includes(
      snapshot?.sort,
    )
      ? snapshot.sort
      : "verified";
    state.visibleLimit = Math.max(60, Number(snapshot?.visibleLimit) || 60);
    state.selectedId = atlas.cards.some((card) => card.id === snapshot?.selectedId)
      ? snapshot.selectedId
      : null;
    listScrollPosition = Math.max(0, Number(snapshot?.scrollTop) || 0);
    lastDetailTriggerId = atlas.cards.some(
      (card) => card.id === snapshot?.focusedId,
    )
      ? snapshot.focusedId
      : state.selectedId;
    restoreListAfterRender = true;
  }

  function syncListControls() {
    const input = root.querySelector("#asset-search");
    const clearButton = root.querySelector(".search-clear");
    const sort = root.querySelector("#asset-sort");
    if (input && document.activeElement !== input) input.value = state.query;
    if (clearButton) clearButton.hidden = state.query === "";
    if (sort) sort.value = state.sort;
  }

  function restoreListPositionAndFocus() {
    if (!restoreListAfterRender || state.detailOpen) return;
    restoreListAfterRender = false;
    requestAnimationFrame(() => {
      window.scrollTo({ top: listScrollPosition, behavior: "instant" });
      if (lastDetailTriggerId) {
        root
          .querySelector(`[data-asset-id="${lastDetailTriggerId}"]`)
          ?.focus({ preventScroll: true });
      }
    });
  }

  function renderDynamic() {
    const cards = getFilteredCards();
    if (
      !state.detailOpen &&
      cards.length > 0 &&
      !cards.some((card) => card.id === state.selectedId)
    ) {
      state.selectedId = cards[0].id;
    }
    if (!state.detailOpen && cards.length === 0) {
      state.selectedId = null;
      state.detailOpen = false;
    }

    renderFilterBar();
    renderGrid(cards);
    renderDetail(
      atlas.cards.find((card) => card.id === state.selectedId) ?? null,
    );
    syncListControls();
    syncBodyLock();
    syncAppearanceControls();
    syncPaletteControls();
    restoreListPositionAndFocus();
  }

  function selectCard(id) {
    const card = atlas.cards.find((item) => item.id === id);
    if (!card) return;
    lastDetailTriggerId = id;
    const snapshot = listSnapshot();
    listScrollPosition = snapshot.scrollTop;
    history.replaceState(
      navigationState("list", { list: snapshot }),
      "",
      `${location.pathname}${location.search}`,
    );
    state.selectedId = id;
    state.detailOpen = true;
    history.pushState(
      navigationState("detail", { id, fromList: true, list: snapshot }),
      "",
      `#${id}`,
    );
    renderDynamic();
    window.scrollTo({ top: 0, behavior: "instant" });
    requestAnimationFrame(() =>
      root.querySelector(".detail-back-button")?.focus(),
    );
  }

  function closeDetail() {
    if (state.diagramModal) closeDiagram();
    const navigation = history.state?.assetAtlas;
    if (navigation?.view === "detail" && navigation.fromList) {
      history.back();
      return;
    }
    state.detailOpen = false;
    restoreListAfterRender = true;
    history.pushState(
      navigationState("list", { list: navigation?.list ?? listSnapshot() }),
      "",
      `${location.pathname}${location.search}`,
    );
    renderDynamic();
  }

  function showCategoryFromDetail(category) {
    if (state.diagramModal) closeDiagram();
    state.category = category;
    state.status = "all";
    state.query = "";
    state.visibleLimit = 60;
    state.detailOpen = false;
    listScrollPosition = 0;
    restoreListAfterRender = true;
    history.pushState(
      navigationState("list", { list: listSnapshot() }),
      "",
      `${location.pathname}${location.search}`,
    );
    renderDynamic();
  }

  function handleHistoryNavigation(event) {
    if (state.diagramModal) closeDiagram({ restoreFocus: false });
    const id = safeHashId();
    const card = atlas.cards.find((item) => item.id === id);
    if (card) {
      state.selectedId = card.id;
      state.detailOpen = true;
      renderDynamic();
      window.scrollTo({ top: 0, behavior: "instant" });
      requestAnimationFrame(() =>
        root.querySelector(".detail-back-button")?.focus(),
      );
      return;
    }
    state.detailOpen = false;
    applyListSnapshot(event.state?.assetAtlas?.list);
    renderDynamic();
  }

  function resetFilters() {
    state.category = "all";
    state.status = "all";
    state.query = "";
    state.visibleLimit = 60;
    const input = root.querySelector("#asset-search");
    input.value = "";
    root.querySelector(".search-clear").hidden = true;
    renderDynamic();
    replaceListHistory();
    input.focus();
  }

  function goHome() {
    if (state.diagramModal) closeDiagram();
    if (!state.detailOpen) return resetFilters();

    state.category = "all";
    state.status = "all";
    state.query = "";
    state.visibleLimit = 60;
    state.selectedId = null;
    state.detailOpen = false;
    listScrollPosition = 0;
    lastDetailTriggerId = null;
    restoreListAfterRender = true;
    history.pushState(
      navigationState("list", {
        list: { ...listSnapshot(), focusedId: null, scrollTop: 0 },
      }),
      "",
      `${location.pathname}${location.search}`,
    );
    renderDynamic();
    requestAnimationFrame(() => root.querySelector("#asset-search")?.focus());
  }

  /* ---------- events ---------- */

  function handleRootClick(event) {
    if (event.target.closest("a")) return;

    const assetCard = event.target.closest("[data-asset-id]");
    if (assetCard) {
      selectCard(assetCard.dataset.assetId);
      return;
    }

    const paletteButton = event.target.closest("[data-palette-choice]");
    if (paletteButton) {
      applyPalette(paletteButton.dataset.paletteChoice);
      return;
    }

    const categoryButton = event.target.closest("[data-category]");
    if (categoryButton) {
      if (state.detailOpen) {
        showCategoryFromDetail(categoryButton.dataset.category);
        return;
      }
      state.category = categoryButton.dataset.category;
      state.visibleLimit = 60;
      renderDynamic();
      replaceListHistory();
      return;
    }

    const statusButton = event.target.closest("[data-status]");
    if (statusButton) {
      state.status =
        state.status === statusButton.dataset.status
          ? "all"
          : statusButton.dataset.status;
      state.visibleLimit = 60;
      renderDynamic();
      replaceListHistory();
      return;
    }

    const actionButton = event.target.closest("[data-action]");
    if (!actionButton) return;

    if (actionButton.dataset.action === "clear-search") {
      state.query = "";
      const input = root.querySelector("#asset-search");
      input.value = "";
      actionButton.hidden = true;
      renderDynamic();
      replaceListHistory();
      input.focus();
    } else if (actionButton.dataset.action === "cycle-appearance") {
      cycleAppearance();
    } else if (actionButton.dataset.action === "go-home") {
      goHome();
    } else if (actionButton.dataset.action === "close-detail") {
      closeDetail();
    } else if (actionButton.dataset.action === "open-diagram") {
      openDiagram(
        actionButton.dataset.cardId,
        Number(actionButton.dataset.diagramIndex),
        actionButton,
      );
    } else if (actionButton.dataset.action === "close-diagram") {
      closeDiagram();
    } else if (actionButton.dataset.action === "diagram-zoom-in") {
      zoomDiagram((diagramViewportState?.transform.scale ?? 1) + 0.2);
    } else if (actionButton.dataset.action === "diagram-zoom-out") {
      zoomDiagram((diagramViewportState?.transform.scale ?? 1) - 0.2);
    } else if (actionButton.dataset.action === "diagram-reset") {
      resetDiagramToActualSize();
    } else if (actionButton.dataset.action === "diagram-fit") {
      fitDiagramToViewport();
    } else if (actionButton.dataset.action === "reset-filters") {
      resetFilters();
    } else if (actionButton.dataset.action === "load-more") {
      state.visibleLimit += 60;
      renderDynamic();
      replaceListHistory();
    }
  }

  function gridColumnCount() {
    const grid = root.querySelector(".asset-grid");
    if (!grid) return 1;
    const columns = getComputedStyle(grid).gridTemplateColumns.split(" ");
    return Math.max(1, columns.length);
  }

  function moveCardFocus(key) {
    const cards = getFilteredCards();
    if (!cards.length) return;
    const buttons = [
      ...root.querySelectorAll(".asset-grid [data-asset-id]"),
    ];
    if (!buttons.length) return;

    const activeIndex = buttons.findIndex(
      (button) => button === document.activeElement,
    );
    const selectedIndex = cards.findIndex(
      (card) => card.id === state.selectedId,
    );
    const currentIndex =
      activeIndex !== -1
        ? activeIndex
        : selectedIndex !== -1
          ? Math.min(selectedIndex, buttons.length - 1)
          : -1;
    const columns = gridColumnCount();
    const offset = {
      ArrowRight: 1,
      ArrowLeft: -1,
      ArrowDown: columns,
      ArrowUp: -columns,
    }[key];

    const nextIndex = Math.min(
      Math.max(currentIndex === -1 ? 0 : currentIndex + offset, 0),
      buttons.length - 1,
    );
    const nextButton = buttons[nextIndex];
    if (!nextButton) return;
    state.selectedId = nextButton.dataset.assetId;
    nextButton.focus();
    nextButton.scrollIntoView({ block: "nearest" });
  }

  function handleKeyboard(event) {
    const target = event.target;
    const isTyping =
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement;

    if (state.diagramModal) {
      const arrowDelta = {
        ArrowLeft: { x: 64, y: 0 },
        ArrowRight: { x: -64, y: 0 },
        ArrowUp: { x: 0, y: 64 },
        ArrowDown: { x: 0, y: -64 },
      }[event.key];
      if (event.key === "Escape") {
        event.preventDefault();
        closeDiagram();
      } else if (["+", "="].includes(event.key)) {
        event.preventDefault();
        zoomDiagram((diagramViewportState?.transform.scale ?? 1) + 0.2);
      } else if (event.key === "-") {
        event.preventDefault();
        zoomDiagram((diagramViewportState?.transform.scale ?? 1) - 0.2);
      } else if (event.key === "0") {
        event.preventDefault();
        resetDiagramToActualSize();
      } else if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        fitDiagramToViewport();
      } else if (arrowDelta && diagramViewportState?.contentSize) {
        event.preventDefault();
        applyDiagramTransform(
          viewportMath.panTransform(
            diagramViewportState.transform,
            arrowDelta,
          ),
        );
      }
      return;
    }

    if (event.key === "Escape") {
      if (state.detailOpen) {
        closeDetail();
      } else if (state.query) {
        resetFilters();
      }
      return;
    }

    if (
      (event.key === "/" && !isTyping) ||
      ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k")
    ) {
      event.preventDefault();
      root.querySelector("#asset-search").focus();
      return;
    }

    if (state.detailOpen || isTyping) return;

    if (["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"].includes(event.key)) {
      event.preventDefault();
      moveCardFocus(event.key);
      return;
    }

    if (event.key === "Enter" && document.activeElement === document.body) {
      const selected = state.selectedId;
      if (selected) {
        event.preventDefault();
        selectCard(selected);
      }
    }
  }

  function initialize() {
    const hashId = safeHashId();
    const hashCard = atlas.cards.find((card) => card.id === hashId);
    const hasValidHash = Boolean(hashCard);
    state.selectedId = hasValidHash ? hashId : null;
    state.detailOpen = hasValidHash;

    applyAppearance(state.appearance, { persist: false });
    applyPalette(state.palette, { persist: false });
    renderShell();

    const searchInput = root.querySelector("#asset-search");
    const searchClear = root.querySelector(".search-clear");
    searchInput.addEventListener("input", (event) => {
      state.query = event.target.value;
      state.visibleLimit = 60;
      searchClear.hidden = state.query === "";
      renderDynamic();
      replaceListHistory();
    });

    root.addEventListener("click", handleRootClick);
    root.addEventListener("pointerdown", handleDiagramPointerDown);
    root.addEventListener("pointermove", handleDiagramPointerMove);
    root.addEventListener("pointerup", handleDiagramPointerEnd);
    root.addEventListener("pointercancel", handleDiagramPointerEnd);
    root.addEventListener("lostpointercapture", handleDiagramPointerEnd);
    root.addEventListener("wheel", handleDiagramWheel, { passive: false });
    const diagramDialog = root.querySelector(".diagram-dialog");
    diagramDialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      closeDiagram();
    });
    diagramDialog.addEventListener("click", (event) => {
      if (event.target === diagramDialog) closeDiagram();
    });
    document.addEventListener("keydown", handleKeyboard);
    window.addEventListener("popstate", handleHistoryNavigation);
    window
      .matchMedia("(prefers-color-scheme: dark)")
      .addEventListener("change", () => {
        if (state.appearance === "system") {
          applyAppearance("system", { persist: false });
        }
      });
    window.addEventListener("resize", () => {
      if (diagramViewportState?.contentSize) {
        if (diagramViewportState.mode === "fit") fitDiagramToViewport();
        else applyDiagramTransform(diagramViewportState.transform, {
          mode: diagramViewportState.mode,
        });
      }
    });
    if (hasValidHash) {
      history.replaceState(
        navigationState("detail", { id: hashId, fromList: false }),
        "",
        `#${hashId}`,
      );
    } else {
      history.replaceState(
        navigationState("list", { list: listSnapshot() }),
        "",
        `${location.pathname}${location.search}`,
      );
    }
    renderDynamic();
  }

  initialize();
})();
