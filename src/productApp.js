import "./product.css";

const publicState = {
  loading: true,
  data: null,
  error: null,
  refreshError: null,
  adminAuthenticated: false,
};
let publicRefreshTimer = null;
let publicThemeMediaBound = false;
let builderPreviewTimer = null;
const publicHistoryQueue = [];
let publicHistoryActive = 0;
const PUBLIC_HISTORY_CONCURRENCY = 3;
const PUBLIC_THEME_STORAGE_KEY = "pulseboard-public-theme";
const ADMIN_TABS = new Set([
  "overview",
  "uptime",
  "blacklist",
  "pages",
  "maintenance",
  "resources",
]);
const adminState = {
  username: "",
  password: "",
  loginConfigured: null,
  checkingSession: true,
  loggedIn: false,
  loading: false,
  error: null,
  data: null,
  activeTab: "overview",
  customPages: [],
  customPagesError: null,
  builderError: null,
  builderNotice: null,
  builderOpen: false,
  builderBusy: false,
  builderDirty: false,
  editingPage: null,
  requestedSourceSlug: null,
  actionError: null,
  actionNotice: null,
  actionBusy: false,
  managedStatusPageId: null,
  monitorDetailId: null,
  monitorDetail: null,
  monitorDetailLoading: false,
  monitorDetailQuery: { days: 30, month: "", timezone: "+00:00", hourly: false },
  blacklistDetailId: null,
  blacklistDetail: null,
  blacklistDetailLoading: false,
};

window.addEventListener("beforeunload", (event) => {
  if (!adminState.builderDirty) return;
  event.preventDefault();
  event.returnValue = "";
});

const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>'"]/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        char
      ],
  );
const icon = (name) => {
  const paths = {
    pulse:
      '<path d="M3 12h4l2.2-6 4.1 12 2.3-6H21" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
    grid: '<rect x="4" y="4" width="6" height="6" rx="1" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="14" y="4" width="6" height="6" rx="1" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="4" y="14" width="6" height="6" rx="1" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="14" y="14" width="6" height="6" rx="1" fill="none" stroke="currentColor" stroke-width="1.8"/>',
    shield:
      '<path d="M12 3 20 6v5.8c0 4.5-3.1 7.7-8 9.2-4.9-1.5-8-4.7-8-9.2V6l8-3Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="m8.5 12 2.2 2.2 4.8-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
    server:
      '<rect x="4" y="4" width="16" height="6" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="4" y="14" width="16" height="6" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M7 7h.1M7 17h.1M10 7h6M10 17h6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    book: '<path d="M5 4.5h10a3 3 0 0 1 3 3V20H8a3 3 0 0 1-3-3z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M8 20V7.5a3 3 0 0 1 3-3M9 10h6M9 13h6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    refresh:
      '<path d="M20 11a8 8 0 0 0-14.7-3L4 10m0-5v5h5M4 13a8 8 0 0 0 14.7 3L20 14m0 5v-5h-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
    arrow:
      '<path d="M5 12h13M13 7l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
    lock: '<rect x="5" y="10" width="14" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    key: '<circle cx="8.5" cy="15.5" r="4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m11.5 12.5 8-8M16 6l2 2M13.5 9.5l2 2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    eye: '<path d="M3.5 12s3-5 8.5-5 8.5 5 8.5 5-3 5-8.5 5-8.5-5-8.5-5Z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="2" fill="none" stroke="currentColor" stroke-width="1.8"/>',
    logout:
      '<path d="M10 5H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4M14 8l4 4-4 4M9 12h9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  };
  return `<svg class="product-icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.grid}</svg>`;
};

const slugify = (value) =>
  String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "") || "default";
const currentPublicSlug = () => {
  const raw = window.location.pathname.split("/").filter(Boolean)[0] || "default";
  try {
    return slugify(decodeURIComponent(raw));
  } catch {
    return slugify(raw);
  }
};
const storedMonitorIds = (value) => {
  try {
    const parsed = Array.isArray(value) ? value : JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};
const storedObject = (value) => {
  try {
    const parsed =
      value && typeof value === "object" ? value : JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
};
const settingBoolean = (value, fallback = true) =>
  value === undefined || value === null || value === ""
    ? fallback
    : value === true || value === "true" || value === 1;
const formatDate = (timestamp, locale = "en") =>
  timestamp
    ? new Date(Number(timestamp) * 1000).toLocaleString(
        locale === "ko" ? "ko-KR" : "en-US",
        {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        },
      )
    : "—";
const formatPercent = (value) =>
  value === null || value === undefined || value === ""
    ? "—"
    : `${Number(value).toFixed(2)}%`;
const statusLabel = (status, locale = "en") =>
  locale === "ko"
    ? { up: "정상", down: "장애", maintenance: "점검", disabled: "비활성" }[
        status
      ] || "확인 중"
    : {
        up: "Operational",
        down: "Incident",
        maintenance: "Maintenance",
        disabled: "Disabled",
      }[status] || "Checking";
const monitorState = (monitor) =>
  monitor.monitor_status?.startsWith("maint")
    ? "maintenance"
    : monitor.monitor_status === "disabled"
      ? "disabled"
      : monitor.status || monitor.uptime_status || "unknown";
const statusClass = (status) =>
  status === "up"
    ? "is-up"
    : status === "down"
      ? "is-down"
      : status === "maintenance"
        ? "is-maintenance"
        : "is-muted";

const PUBLIC_FONT_SOURCES = {
  wanted: {
    href: "https://cdn.jsdelivr.net/gh/wanteddev/wanted-sans@v1.0.3/packages/wanted-sans/fonts/webfonts/variable/split/WantedSansVariable.min.css",
    stack:
      '"Wanted Sans Variable", "Wanted Sans", -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
  },
  suit: {
    href: "https://cdn.jsdelivr.net/gh/sun-typeface/SUIT@2/fonts/variable/woff2/SUIT-Variable.css",
    stack:
      '"SUIT Variable", SUIT, -apple-system, BlinkMacSystemFont, sans-serif',
  },
  pretendard: {
    href: "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css",
    stack:
      '"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
  },
};

function publicFontConfig(customization) {
  const selected = customization.font_family || "wanted";
  if (PUBLIC_FONT_SOURCES[selected]) return PUBLIC_FONT_SOURCES[selected];
  if (selected === "google" && customization.google_font_family) {
    const family = String(customization.google_font_family)
      .replace(/[^\p{L}\p{N} _-]/gu, "")
      .trim()
      .slice(0, 80);
    if (family)
      return {
        href: `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}&display=swap`,
        stack: `"${family.replace(/"/g, "")}", sans-serif`,
      };
  }
  if (selected === "serif")
    return { href: "", stack: 'Georgia, "Times New Roman", serif' };
  if (selected === "mono")
    return { href: "", stack: '"SFMono-Regular", Consolas, monospace' };
  return {
    href: "",
    stack:
      '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  };
}

function syncPublicFont(customization) {
  const config = publicFontConfig(customization);
  const existing = document.querySelector("#pulseboard-public-font");
  if (existing?.href === config.href) return config.stack;
  existing?.remove();
  if (config.href) {
    const link = document.createElement("link");
    link.id = "pulseboard-public-font";
    link.rel = "stylesheet";
    link.href = config.href;
    link.crossOrigin = "anonymous";
    document.head.appendChild(link);
  }
  return config.stack;
}

function publicTheme(customization) {
  let visitorChoice = "";
  if (customization.show_theme_switcher !== false) {
    try {
      visitorChoice = localStorage.getItem(PUBLIC_THEME_STORAGE_KEY) || "";
    } catch {
      /* storage may be unavailable in privacy-restricted browsers */
    }
  }
  if (visitorChoice === "light" || visitorChoice === "dark")
    return visitorChoice;
  if (customization.theme_mode === "light") return "light";
  if (customization.theme_mode === "system")
    return window.matchMedia?.("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark";
  return "dark";
}

function publicPalette(customization, theme) {
  if (theme === "light")
    return {
      accent: customization.light_accent_color || "#0ba6c0",
      canvas: customization.light_background_color || "#f5f7f9",
      surface: customization.light_surface_color || "#ffffff",
      text: customization.light_text_color || "#1b252d",
      muted: customization.light_muted_color || "#71808a",
      border: customization.light_border_color || "#dfe6ea",
      success: customization.light_success_color || "#0fa978",
      danger: customization.light_danger_color || "#df3157",
    };
  return {
    accent: customization.accent_color || "#14b8d4",
    canvas: customization.background_color || "#080d11",
    surface: customization.surface_color || "#11171d",
    text: customization.text_color || "#dce4ea",
    muted: customization.muted_color || "#8f9ba5",
    border: customization.border_color || "#1c252d",
    success: customization.success_color || "#20d69b",
    danger: customization.danger_color || "#ff365c",
  };
}

function renderThemeSwitcher(customization, theme, floating = false) {
  if (customization.show_theme_switcher === false) return "";
  const korean = customization.locale === "ko";
  const nextTheme = theme === "dark" ? "light" : "dark";
  const label = korean
    ? `${nextTheme === "light" ? "라이트" : "다크"} 모드로 전환`
    : `Switch to ${nextTheme} mode`;
  return `<button class="public-theme-switcher ${floating ? "floating" : ""}" type="button" data-public-theme="${nextTheme}" aria-label="${label}" title="${label}"><span aria-hidden="true">${nextTheme === "light" ? "☀" : "☾"}</span><b>${nextTheme === "light" ? (korean ? "라이트" : "Light") : korean ? "다크" : "Dark"}</b></button>`;
}

function renderBrand(compact = false, customization = null) {
  const mark = customization?.logo_url
    ? `<img src="${escapeHtml(customization.logo_url)}" alt="" />`
    : `<span class="logo-text-mark">${escapeHtml((customization?.logo_text || "P").slice(0, 2))}</span>`;
  return `<a class="product-brand" href="/"><span class="product-brand-mark ${customization?.logo_url ? "has-image" : ""}">${customization ? mark : icon("pulse")}</span><span><b>${escapeHtml(customization?.brand_name || "Pulseboard")}</b><small>${compact ? "Admin" : "Public status"}</small></span></a>`;
}

function parseError(response, raw) {
  let data = raw;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    /* text */
  }
  if (!response.ok) {
    if (
      response.status === 401 &&
      adminState.loggedIn &&
      window.location.pathname.startsWith("/admin")
    )
      expireAdminSession();
    const upstreamMessage = data?.message || data?.error;
    const error = new Error(
      response.status === 429
        ? "HetrixTools API rate limit reached. Keep this page open and refresh again in about a minute."
        : upstreamMessage || `Request failed with HTTP ${response.status}.`,
    );
    error.status = response.status;
    throw error;
  }
  return data;
}

function capturePublicFocus() {
  const active = document.activeElement;
  if (!active?.closest?.(".public-app")) return null;
  if (active.matches("[data-public-theme]")) return { type: "theme" };
  if (active.matches("a[href]"))
    return { type: "link", href: active.getAttribute("href") };
  return null;
}

function restorePublicFocus(snapshot) {
  if (!snapshot) return;
  window.requestAnimationFrame(() => {
    if (snapshot.type === "theme") {
      document.querySelector("[data-public-theme]")?.focus();
      return;
    }
    if (snapshot.type === "link")
      [...document.querySelectorAll(".public-app a[href]")]
        .find((link) => link.getAttribute("href") === snapshot.href)
        ?.focus();
  });
}

function revealActiveNavigation(containerSelector, activeSelector) {
  window.requestAnimationFrame(() => {
    const container = document.querySelector(containerSelector);
    const active = container?.querySelector(activeSelector);
    if (!container || !active || container.scrollWidth <= container.clientWidth)
      return;
    container.scrollLeft = Math.max(
      0,
      active.offsetLeft - (container.clientWidth - active.offsetWidth) / 2,
    );
  });
}

async function fetchPublicStatus(silent = false, shouldRender = true) {
  const slug = currentPublicSlug();
  const focusSnapshot = silent ? capturePublicFocus() : null;
  if (!silent) publicState.loading = true;
  try {
    const response = await fetch(
      `/api/public/status?slug=${encodeURIComponent(slug)}`,
      { cache: "no-store" },
    );
    publicState.data = parseError(response, await response.text());
    publicState.error = null;
    publicState.refreshError = null;
  } catch (error) {
    if (silent && publicState.data) publicState.refreshError = error.message;
    else publicState.error = error.message;
  } finally {
    publicState.loading = false;
    if (shouldRender) {
      renderPublicApp();
      restorePublicFocus(focusSnapshot);
    }
  }
}

async function fetchPublicSession(shouldRender = true) {
  try {
    const response = await fetch("/api/admin/session", {
      credentials: "same-origin",
    });
    const session = response.ok ? await response.json() : null;
    publicState.adminAuthenticated = Boolean(session?.authenticated);
  } catch {
    publicState.adminAuthenticated = false;
  }
  if (shouldRender) renderPublicApp();
}

function renderPublicHeader(data, theme) {
  const pages = data?.available_pages || [];
  const customization = data?.customization || {};
  if (customization.show_header === false) return "";
  const selectedPages = new Set(customization.nav_page_ids || []);
  const currentSlug = currentPublicSlug();
  const visiblePages =
    customization.show_status_pages === false
      ? []
      : pages
          .filter((page) => page.slug !== "default")
          .filter((page) => !selectedPages.size || selectedPages.has(page.slug))
          .slice(0, 8);
  const navigation =
    customization.show_navigation === false
      ? ""
      : `<nav class="public-nav" aria-label="Status pages"><a class="public-nav-link ${currentSlug === "default" ? "active" : ""}" href="/" ${currentSlug === "default" ? 'aria-current="page"' : ""}>${escapeHtml(customization.status_nav_label || "Status")}</a>${visiblePages.map((page) => `<a class="public-nav-link ${currentSlug === page.slug ? "active" : ""}" href="/${encodeURIComponent(page.slug)}" ${currentSlug === page.slug ? 'aria-current="page"' : ""}>${escapeHtml(page.name)}</a>`).join("")}${customization.show_admin_link ? `<a class="public-nav-link admin-link" href="/admin">Admin ${icon("arrow")}</a>` : ""}</nav>`;
  return `<header class="public-header"><div class="product-container public-header-inner">${renderBrand(false, customization)}<div class="public-header-actions">${navigation}${renderThemeSwitcher(customization, theme)}</div></div></header>`;
}

function renderPublicError() {
  return `<main class="public-main" id="main-content"><section class="public-empty product-container" role="alert"><div class="empty-mark">${icon("pulse")}</div><div class="product-eyebrow">Pulseboard status</div><h1>Public status pages are not connected yet.</h1><p>${escapeHtml(publicState.error || "Configure the Worker-managed HetrixTools API key to publish a status page.")}</p><div class="empty-actions"><button class="product-button" type="button" data-public-retry>Retry ${icon("refresh")}</button><a class="product-button secondary" href="/admin">Open admin ${icon("arrow")}</a></div></section></main>`;
}

function renderAnnouncement(page, customization) {
  if (
    customization?.show_announcement === false ||
    !page?.announcement_type ||
    page.announcement_type === "none"
  )
    return "";
  return `<section class="announcement announcement-${escapeHtml(page.announcement_type)}"><div class="announcement-mark">!</div><div><b>${escapeHtml(page.announcement_title || "Announcement")}</b><p>${escapeHtml(page.announcement_body || "")}</p></div></section>`;
}

function renderPulseboardCredit(footerText) {
  const text = String(footerText || "Powered by Pulseboard");
  const match = /pulseboard/i.exec(text);
  const link =
    '<a href="https://github.com/ivLis-Studio/Pulseboard" target="_blank" rel="noopener noreferrer">Pulseboard</a>';
  if (!match) return `${escapeHtml(text)} <span aria-hidden="true">·</span> ${link}`;
  return `${escapeHtml(text.slice(0, match.index))}${link}${escapeHtml(text.slice(match.index + match[0].length))}`;
}

const monitorDisplay = (monitor, field, fallback) =>
  typeof monitor.display?.[field] === "boolean"
    ? monitor.display[field]
    : fallback;

function renderUptimeBar(monitor, status) {
  const count = 30;
  const uptime = Number.isFinite(Number(monitor.uptime))
    ? Math.max(0, Math.min(100, Number(monitor.uptime)))
    : null;
  const bars = Array.from(
    { length: count },
    () => '<i class="bar-neutral" aria-hidden="true"></i>',
  ).join("");
  return `<div class="monitor-uptime-bar" data-monitor-id="${escapeHtml(monitor.id)}" data-history-token="${escapeHtml(monitor.history_token || "")}" data-last-check="${escapeHtml(monitor.last_check || "")}" role="group" aria-label="${escapeHtml(uptime === null ? "Loading daily availability" : `Loading daily availability. Reported uptime ${uptime.toFixed(2)}%`)}">${bars}</div>`;
}

function browserTimezoneOffset() {
  const minutes = -new Date().getTimezoneOffset();
  const sign = minutes >= 0 ? "+" : "-";
  const absolute = Math.abs(minutes);
  return `${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`;
}

function historyTooltipElement() {
  let tooltip = document.querySelector("#public-history-tooltip");
  if (tooltip) return tooltip;
  tooltip = document.createElement("div");
  tooltip.id = "public-history-tooltip";
  tooltip.className = "public-history-tooltip";
  tooltip.setAttribute("role", "tooltip");
  tooltip.setAttribute("aria-hidden", "true");
  document.querySelector(".public-app")?.appendChild(tooltip);
  return tooltip;
}

function hideHistoryTooltip(marker) {
  const tooltip = document.querySelector("#public-history-tooltip");
  if (!tooltip || (marker && tooltip.dataset.owner !== marker.dataset.tooltipId))
    return;
  tooltip.classList.remove("is-visible");
  tooltip.setAttribute("aria-hidden", "true");
  delete tooltip.dataset.owner;
}

function showHistoryTooltip(marker, pointerX = null) {
  const tooltip = historyTooltipElement();
  if (!tooltip) return;
  tooltip.textContent = marker.dataset.tooltip || "";
  tooltip.dataset.owner = marker.dataset.tooltipId;
  tooltip.setAttribute("aria-hidden", "false");
  tooltip.classList.add("is-visible");
  const markerRect = marker.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();
  const center = Number.isFinite(pointerX)
    ? pointerX
    : markerRect.left + markerRect.width / 2;
  const left = Math.max(
    12,
    Math.min(
      window.innerWidth - tooltipRect.width - 12,
      center - tooltipRect.width / 2,
    ),
  );
  const top =
    markerRect.top - tooltipRect.height - 10 >= 12
      ? markerRect.top - tooltipRect.height - 10
      : markerRect.bottom + 10;
  tooltip.style.left = `${Math.round(left)}px`;
  tooltip.style.top = `${Math.round(top)}px`;
}

function bindHistoryTooltips(bar) {
  const markers = [...bar.querySelectorAll("i[data-tooltip]")];
  markers.forEach((marker, index) => {
    marker.dataset.tooltipId = `${bar.dataset.monitorId}-${index}`;
    marker.setAttribute("aria-describedby", "public-history-tooltip");
    marker.addEventListener("pointerenter", (event) =>
      showHistoryTooltip(marker, event.clientX),
    );
    marker.addEventListener("pointermove", (event) =>
      showHistoryTooltip(marker, event.clientX),
    );
    marker.addEventListener("pointerleave", () => hideHistoryTooltip(marker));
    marker.addEventListener("focus", () => showHistoryTooltip(marker));
    marker.addEventListener("blur", () => hideHistoryTooltip(marker));
    marker.addEventListener("keydown", (event) => {
      let nextIndex = null;
      if (event.key === "ArrowLeft") nextIndex = Math.max(0, index - 1);
      if (event.key === "ArrowRight")
        nextIndex = Math.min(markers.length - 1, index + 1);
      if (event.key === "Home") nextIndex = 0;
      if (event.key === "End") nextIndex = markers.length - 1;
      if (nextIndex === null) return;
      event.preventDefault();
      marker.tabIndex = -1;
      markers[nextIndex].tabIndex = 0;
      markers[nextIndex].focus();
    });
  });
}

async function hydrateUptimeBar(bar, customization) {
  if (bar.dataset.historyLoading) return;
  bar.dataset.historyLoading = "true";
  try {
    const response = await fetch(
      `/api/public/history?monitor_id=${encodeURIComponent(bar.dataset.monitorId)}&slug=${encodeURIComponent(currentPublicSlug())}&history_token=${encodeURIComponent(bar.dataset.historyToken || "")}&days=30&timezone=${encodeURIComponent(browserTimezoneOffset())}`,
      { cache: "force-cache" },
    );
    const history = parseError(response, await response.text());
    const korean = customization.locale === "ko";
    const lastCheck = bar.dataset.lastCheck
      ? formatDate(bar.dataset.lastCheck, customization.locale)
      : "—";
    const reportedDays = history.days || [];
    const reportedByDate = new Map(
      reportedDays.map((day) => [String(day.date), day]),
    );
    const finalDate = new Date(
      `${reportedDays.at(-1)?.date || new Date().toISOString().slice(0, 10)}T12:00:00`,
    );
    const timelineDays = Array.from({ length: 30 }, (_, index) => {
      const date = new Date(finalDate);
      date.setDate(finalDate.getDate() - (29 - index));
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      return reportedByDate.get(key) || {
        date: key,
        uptime: null,
        downtimes: 0,
        response_time: null,
      };
    });
    bar.innerHTML = timelineDays
      .map((day, index, days) => {
        const uptime = Number.isFinite(day.uptime) ? day.uptime : null;
        const state =
          uptime === null
            ? "neutral"
            : day.downtimes > 0 || uptime < 100
              ? "partial"
              : "up";
        const date = new Date(`${day.date}T00:00:00`).toLocaleDateString(
          korean ? "ko-KR" : "en-US",
          { month: "short", day: "numeric" },
        );
        const details = [
          date,
          uptime === null ? (korean ? "Uptime 없음" : "No uptime data") : formatPercent(uptime),
          uptime === null
            ? ""
            : korean
              ? `장애 ${day.downtimes}회`
              : `${day.downtimes} downtime${day.downtimes === 1 ? "" : "s"}`,
          day.response_time === null
            ? ""
            : korean
              ? `평균 ${day.response_time} ms`
              : `${day.response_time} ms average`,
          index === days.length - 1
            ? korean
              ? `마지막 확인 ${lastCheck}`
              : `Last checked ${lastCheck}`
            : "",
        ].filter(Boolean);
        const tooltip = details.join(" · ");
        return `<i class="bar-${state}" role="img" tabindex="${index === days.length - 1 ? "0" : "-1"}" data-tooltip="${escapeHtml(tooltip)}" aria-label="${escapeHtml(tooltip)}"></i>`;
      })
      .join("");
    bar.setAttribute(
      "aria-label",
      korean ? "최근 30일 일별 Uptime" : "Daily uptime for the last 30 days",
    );
    bar.dataset.historyLoaded = "true";
    bindHistoryTooltips(bar);
  } catch {
    bar.dataset.historyLoading = "failed";
    bar.classList.add("history-unavailable");
    bar.setAttribute(
      "aria-label",
      customization.locale === "ko"
        ? "일별 Uptime 기록을 불러오지 못했습니다"
        : "Daily uptime history is temporarily unavailable",
    );
  }
}

function hydrateVisibleUptimeBars(customization) {
  const bars = [...document.querySelectorAll(".monitor-uptime-bar[data-monitor-id]")];
  if (!("IntersectionObserver" in window)) {
    bars.forEach((bar) => queueUptimeBarHydration(bar, customization));
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        queueUptimeBarHydration(entry.target, customization);
      }
    },
    { rootMargin: "180px" },
  );
  bars.forEach((bar) => observer.observe(bar));
}

function drainPublicHistoryQueue() {
  while (
    publicHistoryActive < PUBLIC_HISTORY_CONCURRENCY &&
    publicHistoryQueue.length
  ) {
    const next = publicHistoryQueue.shift();
    if (!next.bar.isConnected) {
      delete next.bar.dataset.historyQueued;
      continue;
    }
    publicHistoryActive += 1;
    delete next.bar.dataset.historyQueued;
    hydrateUptimeBar(next.bar, next.customization).finally(() => {
      publicHistoryActive = Math.max(0, publicHistoryActive - 1);
      drainPublicHistoryQueue();
    });
  }
}

function queueUptimeBarHydration(bar, customization) {
  if (
    bar.dataset.historyQueued ||
    bar.dataset.historyLoading ||
    bar.dataset.historyLoaded
  )
    return;
  bar.dataset.historyQueued = "true";
  publicHistoryQueue.push({ bar, customization });
  drainPublicHistoryQueue();
}

function renderPublicMonitor(monitor, customization, headingTag = "h3") {
  const status = monitorState(monitor);
  const showTarget = monitorDisplay(
    monitor,
    "show_target",
    customization.show_monitor_targets !== false,
  );
  const showStatus = monitorDisplay(
    monitor,
    "show_status",
    customization.show_status_text !== false,
  );
  const showUptime = monitorDisplay(
    monitor,
    "show_uptime",
    customization.show_uptime !== false,
  );
  const showResponse = monitorDisplay(
    monitor,
    "show_response_time",
    customization.show_response_time !== false,
  );
  const showBar = monitorDisplay(
    monitor,
    "show_uptime_bar",
    customization.show_uptime_bar !== false,
  );
  const metadata = [
    showStatus
      ? `<span class="status-text ${statusClass(status)}">${statusLabel(status, customization.locale)}</span>`
      : "",
    showResponse
      ? `<span class="response-value">${monitor.response_time ? `${monitor.response_time} ms` : "—"}</span>`
      : "",
  ].join("");
  const layoutClasses = [
    showTarget ? "has-target" : "",
    showUptime ? "has-uptime" : "",
    showBar ? "has-bar" : "",
    metadata ? "has-meta" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return `<article class="public-monitor ${layoutClasses}" data-monitor-id="${escapeHtml(monitor.id)}"><div class="monitor-main"><span class="status-indicator ${statusClass(status)}"></span>${showUptime ? `<span class="uptime-badge ${statusClass(status)}">${formatPercent(monitor.uptime)}</span>` : ""}<div class="monitor-copy"><${headingTag}>${escapeHtml(monitor.name || monitor.target || "Unnamed monitor")}</${headingTag}>${showTarget ? `<p>${escapeHtml(monitor.target || monitor.type || "Service monitor")}</p>` : ""}</div></div>${showBar ? renderUptimeBar(monitor, status) : ""}${metadata ? `<div class="monitor-meta">${metadata}</div>` : ""}</article>`;
}

function renderPublicPage() {
  const data = publicState.data;
  const customization = data.customization || {};
  const summary = data.summary || {
    total: 0,
    operational: 0,
    incidents: 0,
    maintenance: 0,
    unavailable: 0,
  };
  const overallState = summary.incidents
    ? "incident"
    : summary.maintenance
      ? "maintenance"
      : summary.unavailable || summary.total === 0
        ? "unknown"
        : "healthy";
  const grouped = (data.monitors || []).reduce((groups, monitor) => {
    const key = monitor.category || "Monitors";
    (groups[key] ||= []).push(monitor);
    return groups;
  }, {});
  const korean = customization.locale === "ko";
  const latestMonitorCheck = Math.max(
    0,
    ...(data.monitors || []).map((monitor) => Number(monitor.last_check) || 0),
  );
  const lastCheckedAt = latestMonitorCheck || data.fetched_at;
  const refreshWarning = publicState.refreshError
    ? `<section class="public-refresh-warning" role="status"><span>${korean ? "새 상태를 불러오지 못해 마지막 정상 데이터를 표시하고 있습니다." : "Live refresh failed. Showing the last successful status."}</span><button type="button" data-public-retry>${korean ? "다시 시도" : "Retry"}</button></section>`
    : "";
  const title =
    customization.show_title === false
      ? ""
    : `<section class="public-title-row"><div><div class="product-eyebrow">${escapeHtml(customization.eyebrow_text || (data.page.type === "blacklist" ? "Blacklist status" : "Uptime status"))}</div><h1>${escapeHtml(customization.title || data.page.name)}</h1>${customization.subtitle ? `<p>${escapeHtml(customization.subtitle)}</p>` : ""}</div>${customization.show_last_checked === false ? "" : `<div class="last-checked"><span>${korean ? "마지막 확인" : "Last checked"}</span><b>${formatDate(lastCheckedAt, customization.locale)}</b></div>`}</section>`;
  const ownerActions = publicState.adminAuthenticated
    ? `<div class="public-owner-actions"><a href="${data.page.custom ? `/admin?tab=pages&page=${encodeURIComponent(data.page.slug || customization.slug || "")}` : `/admin?tab=pages&source=${encodeURIComponent(data.page.slug || "")}`}">${data.page.custom ? (korean ? "상태 페이지 편집" : "Edit status page") : korean ? "상태 페이지 관리" : "Manage status page"}</a><a href="/admin">${korean ? "대시보드" : "Dashboard"}</a></div>`
    : "";
  const overall =
    customization.show_overall_status === false
      ? ""
      : `<section class="overall-banner ${overallState}"><span class="overall-icon">${icon(overallState === "healthy" ? "pulse" : overallState === "maintenance" ? "server" : "shield")}</span><div><strong>${escapeHtml(overallState === "healthy" ? customization.operational_text || "All systems operational" : overallState === "maintenance" ? customization.maintenance_text || "Scheduled maintenance in progress" : overallState === "incident" ? customization.incident_text || "Service disruption detected" : customization.unavailable_text || "Status information is incomplete")}</strong><p>${overallState === "healthy" ? (korean ? `${summary.total}개 서비스가 모두 정상입니다.` : `All ${summary.total} monitored services are responding normally.`) : overallState === "maintenance" ? korean ? `${summary.maintenance}개 서비스가 예정된 점검 중입니다.` : `${summary.maintenance} monitored service${summary.maintenance === 1 ? " is" : "s are"} undergoing scheduled maintenance.` : overallState === "incident" ? korean ? "아래 서비스의 장애를 확인하고 있습니다." : "We are investigating the services listed below." : korean ? "일부 서비스의 최신 상태를 확인할 수 없습니다." : "The latest state of one or more services is unavailable."}</p></div><span class="overall-mark">${overallState === "healthy" ? (korean ? "정상" : "Operational") : overallState === "maintenance" ? (korean ? "점검" : "Maintenance") : overallState === "incident" ? (korean ? "확인 필요" : "Attention") : korean ? "데이터 확인" : "Checking"}</span></section>`;
  const summaryBlock =
    customization.show_summary === false
      ? ""
      : `<section class="public-summary"><div><strong>${summary.total}</strong><span>${korean ? "모니터" : "Monitors"}</span></div><div><strong>${summary.operational}</strong><span>${korean ? "정상" : "Operational"}</span></div><div><strong>${summary.maintenance || 0}</strong><span>${korean ? "점검" : "Maintenance"}</span></div><div><strong>${summary.incidents}</strong><span>${korean ? "장애" : "Incidents"}</span></div></section>`;
  const heading =
    customization.show_monitor_heading === false
      ? ""
      : `<div class="public-section-heading"><div><div class="product-eyebrow">${korean ? "실시간 모니터" : "Live monitors"}</div><h2>${escapeHtml(customization.monitor_heading || "Service status")}</h2></div><span class="public-section-note">${customization.refresh_interval ? (korean ? `${customization.refresh_interval}초마다 자동 갱신` : `Refreshes every ${customization.refresh_interval}s`) : korean ? "자동 갱신 꺼짐" : "Auto refresh off"}</span></div>`;
  const groups =
    Object.entries(grouped)
      .map(
        ([group, monitors]) =>
          `<section class="monitor-group">${customization.show_group_headings === false ? "" : `<div class="monitor-group-heading"><h3>${escapeHtml(group)}</h3><span>${monitors.length} ${korean ? "개" : `monitor${monitors.length === 1 ? "" : "s"}`}</span></div>`}${monitors.map((monitor) => renderPublicMonitor(monitor, customization, customization.show_group_headings === false ? "h3" : "h4")).join("")}</section>`,
      )
      .join("") ||
    `<section class="public-empty small"><div class="empty-mark">${icon("grid")}</div><h2>${korean ? "표시할 모니터가 없습니다" : "No monitors on this page"}</h2><p>${korean ? "관리자 페이지에서 표시할 모니터를 선택하세요." : "Choose visible monitors in the page builder."}</p></section>`;
  const footer =
    customization.show_footer === false
      ? ""
      : `<footer class="public-footer"><span>${renderPulseboardCredit(customization.footer_text)}</span>${customization.show_data_provider === false ? "" : `<span>${korean ? "HetrixTools에서 제공한 모니터링 데이터" : "Monitoring data by HetrixTools"}</span>`}</footer>`;
  return `<main class="public-main" id="main-content"><div class="product-container public-content">${refreshWarning}${title}${ownerActions}${overall}${renderAnnouncement(data.page, customization)}${summaryBlock}${heading}${groups}${footer}</div></main>`;
}

function renderPublicApp() {
  const root = document.querySelector("#app");
  const customization = publicState.data?.customization || {};
  document.documentElement.lang = customization.locale === "ko" ? "ko" : "en";
  document.title =
    customization.seo_title ||
    (publicState.data?.page?.name
      ? `${publicState.data.page.name} · ${customization.brand_name || "Pulseboard"}`
      : "Pulseboard Status");
  const description =
    document.querySelector('meta[name="description"]') ||
    document.head.appendChild(
      Object.assign(document.createElement("meta"), { name: "description" }),
    );
  description.content =
    customization.seo_description ||
    customization.subtitle ||
    "Live service status powered by HetrixTools.";
  let robots = document.querySelector('meta[name="robots"]');
  if (customization.hide_from_search) {
    robots ||= document.head.appendChild(
      Object.assign(document.createElement("meta"), { name: "robots" }),
    );
    robots.content = "noindex,nofollow";
  } else robots?.remove();
  const font = syncPublicFont(customization);
  const effectiveTheme = publicTheme(customization);
  const palette = publicPalette(customization, effectiveTheme);
  const themeColor =
    document.querySelector('meta[name="theme-color"]') ||
    document.head.appendChild(
      Object.assign(document.createElement("meta"), { name: "theme-color" }),
    );
  themeColor.content = palette.canvas;
  const themeStyle = `style="--public-accent:${escapeHtml(palette.accent)};--public-canvas:${escapeHtml(palette.canvas)};--public-surface:${escapeHtml(palette.surface)};--public-text:${escapeHtml(palette.text)};--public-muted:${escapeHtml(palette.muted)};--public-border:${escapeHtml(palette.border)};--public-success:${escapeHtml(palette.success)};--public-danger:${escapeHtml(palette.danger)};--public-width:${Number(customization.content_width) || 1120}px;--public-radius:${Number(customization.corner_radius) || 10}px;--public-font:${escapeHtml(font)}"`;
  const floatingThemeSwitcher =
    customization.show_header === false
      ? renderThemeSwitcher(customization, effectiveTheme, true)
      : "";
  root.innerHTML = `<div class="product-app public-app theme-${effectiveTheme} monitor-style-${escapeHtml(customization.monitor_style || "timeline")} density-${escapeHtml(customization.density || "comfortable")} ${customization.show_header === false ? "header-hidden" : ""}" data-theme="${effectiveTheme}" ${themeStyle}><a class="skip-link" href="#main-content">${customization.locale === "ko" ? "본문으로 건너뛰기" : "Skip to content"}</a>${renderPublicHeader(publicState.data, effectiveTheme)}${floatingThemeSwitcher}${publicState.loading ? `<main class="public-main" id="main-content" aria-busy="true"><div class="product-container loading-state"><span class="loading-spinner" aria-hidden="true"></span><p>Loading live status…</p></div></main>` : publicState.error ? renderPublicError() : renderPublicPage()}</div>`;
  revealActiveNavigation(".public-nav", ".public-nav-link.active");
  document.querySelectorAll("[data-public-theme]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextTheme = button.dataset.publicTheme;
      try {
        localStorage.setItem(PUBLIC_THEME_STORAGE_KEY, nextTheme);
      } catch {
        /* the current render still switches even when storage is unavailable */
      }
      customization.theme_mode = nextTheme;
      renderPublicApp();
      window.requestAnimationFrame(() =>
        document.querySelector("[data-public-theme]")?.focus(),
      );
    });
  });
  document.querySelector("[data-public-retry]")?.addEventListener("click", () =>
    fetchPublicStatus(true),
  );
  if (!publicState.loading && !publicState.error)
    hydrateVisibleUptimeBars(customization);
  document.querySelector("#pulseboard-custom-css")?.remove();
  if (customization.custom_css) {
    const style = document.createElement("style");
    style.id = "pulseboard-custom-css";
    style.textContent = customization.custom_css;
    document.head.appendChild(style);
  }
  window.clearInterval(publicRefreshTimer);
  if (!publicState.loading && Number(customization.refresh_interval) > 0) {
    publicRefreshTimer = window.setInterval(
      () => {
        const active = document.activeElement;
        const inspectingHistory = Boolean(
          active?.closest?.(".monitor-uptime-bar") ||
            document.querySelector(
              '#public-history-tooltip[aria-hidden="false"]',
            ),
        );
        if (!document.hidden && !inspectingHistory) fetchPublicStatus(true);
      },
      Number(customization.refresh_interval) * 1000,
    );
  }
}

async function requestApi(path, method = "GET", query = {}, body) {
  const payload = {
    path,
    method,
    query,
    ...(body === undefined ? {} : { body }),
  };
  const response = await fetch("/api/request", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseError(response, await response.text());
}

async function requestApiAll(path, collectionKey, query = {}) {
  const first = await requestApi(path, "GET", {
    ...query,
    per_page: 200,
    page: 1,
  });
  const pagination = first.meta?.pagination || first.meta || {};
  const lastPage = Math.min(
    100,
    Math.max(
      1,
      Number(
        pagination.last || pagination.last_page || pagination.total_pages,
      ) || 1,
    ),
  );
  if (lastPage === 1) return first;
  const rest = [];
  for (let page = 2; page <= lastPage; page += 1)
    rest.push(
      await requestApi(path, "GET", {
        ...query,
        per_page: 200,
        page,
      }),
    );
  return {
    ...first,
    [collectionKey]: [
      ...(first[collectionKey] || []),
      ...rest.flatMap((page) => page[collectionKey] || []),
    ],
  };
}

function adminDataKeysForTab(tab = adminState.activeTab) {
  if (tab === "overview")
    return ["uptime", "blacklist", "pages", "maintenance"];
  if (tab === "uptime") return ["uptime"];
  if (tab === "blacklist") return ["blacklist"];
  if (tab === "pages") return ["pages", "uptime", "blacklist"];
  if (tab === "maintenance") return ["maintenance", "uptime"];
  return ["limits", "contacts", "rbls"];
}

function syncAdminLocation() {
  if (window.location.pathname !== "/admin") return;
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  if (adminState.activeTab !== "overview")
    url.searchParams.set("tab", adminState.activeTab);
  if (adminState.activeTab === "pages") {
    if (adminState.builderOpen) {
      if (adminState.editingPage)
        url.searchParams.set("page", adminState.editingPage);
      else url.searchParams.set("mode", "new");
    } else if (adminState.managedStatusPageId) {
      const page = adminState.data?.pages?.data?.status_pages?.find(
        (candidate) =>
          String(candidate.id) === String(adminState.managedStatusPageId),
      );
      if (page) url.searchParams.set("source", slugify(page.name));
    }
  }
  window.history.replaceState(null, "", `${url.pathname}${url.search}`);
}

function setBuilderDirty(dirty) {
  adminState.builderDirty = Boolean(dirty);
  const indicator = document.querySelector("[data-builder-dirty]");
  if (indicator) indicator.hidden = !adminState.builderDirty;
}

function closeBuilderState() {
  adminState.builderOpen = false;
  adminState.builderDirty = false;
  adminState.editingPage = null;
  adminState.builderError = null;
  adminState.builderNotice = null;
}

async function confirmDiscardBuilderChanges() {
  if (!adminState.builderDirty) return true;
  return confirmAdminAction({
    title: "Discard unsaved changes?",
    message:
      "Your page settings have changed since the last save. Leaving now will permanently discard those edits.",
    confirmLabel: "Discard changes",
  });
}

async function loadAdminData(keys = adminDataKeysForTab()) {
  adminState.loading = true;
  adminState.error = null;
  renderAdminApp();
  const jobs = {
    limits: () => requestApi("/account/limits"),
    uptime: () => requestApiAll("/uptime-monitors", "monitors"),
    blacklist: () => requestApiAll("/blacklist-monitors", "monitors"),
    pages: () => requestApiAll("/status-pages", "status_pages"),
    maintenance: () =>
      requestApiAll("/schedule-maintenance", "scheduled_maintenances"),
    contacts: () => requestApiAll("/contact-lists", "contact_lists"),
    rbls: () => requestApi("/blacklists"),
  };
  const entries = await Promise.all(
    keys.map(async (key) => {
      const job = jobs[key];
      try {
        return [key, { data: await job() }];
      } catch (error) {
        return [key, { error: error.message }];
      }
    }),
  );
  if (!adminState.loggedIn) {
    adminState.loading = false;
    return;
  }
  adminState.data = {
    ...(adminState.data || {}),
    ...Object.fromEntries(entries),
  };
  if (keys.includes("pages")) {
    await loadCustomPages();
    if (
      adminState.builderOpen &&
      adminState.editingPage &&
      !adminState.customPagesError &&
      !adminState.customPages.some(
        (page) => page.slug === adminState.editingPage,
      )
    ) {
      const missingSlug = adminState.editingPage;
      closeBuilderState();
      adminState.actionError = `Custom page /${missingSlug} was not found.`;
    }
    if (adminState.requestedSourceSlug) {
      const requestedSource =
        adminState.data?.pages?.data?.status_pages?.find(
          (page) => slugify(page.name) === adminState.requestedSourceSlug,
        );
      if (requestedSource)
        adminState.managedStatusPageId = String(requestedSource.id);
      else
        adminState.actionError = `HetrixTools Status Page /${adminState.requestedSourceSlug} was not found.`;
      adminState.requestedSourceSlug = null;
    }
  }
  if (!adminState.loggedIn) {
    adminState.loading = false;
    return;
  }
  adminState.loggedIn = true;
  adminState.loading = false;
  syncAdminLocation();
  renderAdminApp();
}

function openAdminTab(tab, force = false) {
  adminState.activeTab = tab;
  clearAdminActionMessage();
  syncAdminLocation();
  const keys = adminDataKeysForTab(tab);
  const missing = keys.filter(
    (key) => force || !adminState.data?.[key]?.data,
  );
  if (missing.length) loadAdminData(missing);
  else renderAdminApp();
}

async function loadCustomPages() {
  adminState.customPages = [];
  adminState.customPagesError = null;
  try {
    const response = await fetch("/api/admin/pages", {
      credentials: "same-origin",
    });
    const data = parseError(response, await response.text());
    adminState.customPages = data.status_pages || [];
  } catch (error) {
    adminState.customPagesError = error.message;
  }
}

function adminErrorList(data) {
  const grouped = new Map();
  for (const [key, value] of Object.entries(data || {})) {
    if (!value?.error) continue;
    const keys = grouped.get(value.error) || [];
    keys.push(key);
    grouped.set(value.error, keys);
  }
  return [...grouped.entries()]
    .map(
      ([message, keys]) =>
        `<div class="admin-inline-error" role="alert"><b>${escapeHtml(keys.join(", "))}</b> ${escapeHtml(message)}</div>`,
    )
    .join("");
}

function renderAdminAuth() {
  const setupMessage =
    adminState.loginConfigured === false
      ? "Admin login is not configured on this deployment. Add ADMIN_USERNAME, ADMIN_PASSWORD, and DASHBOARD_SESSION_SECRET as Worker secrets."
      : "Sign in with the dashboard account configured in Worker secrets. HetrixTools API credentials never appear in this form.";
  const errorId = adminState.error ? " admin-auth-error" : "";
  const invalid = adminState.error ? 'aria-invalid="true"' : "";
  const disabled = adminState.loading || adminState.loginConfigured === false;
  return `<main class="admin-auth" id="main-content"><div class="admin-auth-card"><span class="admin-auth-mark">${icon("lock")}</span><div class="product-eyebrow">Private workspace</div><h1>Admin console</h1><p>Review monitors, manage public status pages, and publish your branded service status.</p><form id="admin-auth-form" aria-describedby="admin-login-help${errorId}"><label for="admin-username">Username</label><div class="admin-input-wrap"><span>${icon("lock")}</span><input id="admin-username" name="username" type="text" placeholder="admin" value="${escapeHtml(adminState.username)}" autocomplete="username" aria-describedby="admin-login-help${errorId}" ${invalid} required /></div><label for="admin-password">Password</label><div class="admin-input-wrap"><span>${icon("key")}</span><input id="admin-password" name="password" type="password" placeholder="••••••••" value="${escapeHtml(adminState.password)}" autocomplete="current-password" aria-describedby="admin-login-help${errorId}" ${invalid} required /></div><small id="admin-login-help">${escapeHtml(setupMessage)}</small>${adminState.error ? `<div class="admin-form-error" id="admin-auth-error" role="alert">${escapeHtml(adminState.error)}</div>` : ""}<button class="product-button admin-login-button" type="submit" ${disabled ? "disabled" : ""}>${adminState.loading ? "Signing in…" : "Open dashboard"} ${icon("arrow")}</button></form><a class="back-public-link" href="/">${icon("arrow")} View public status page</a></div></main>`;
}

function renderAdminSessionCheck() {
  return `<main class="admin-auth" id="main-content" aria-busy="true"><div class="admin-auth-card session-check-card"><span class="loading-spinner" aria-hidden="true"></span><div><div class="product-eyebrow">Private workspace</div><h1>Checking your session…</h1><p>Securely restoring the dashboard.</p></div></div></main>`;
}

function renderAdminNav() {
  const tabs = [
    ["overview", "Overview", "grid"],
    ["uptime", "Uptime monitors", "pulse"],
    ["blacklist", "Blacklist monitors", "shield"],
    ["pages", "Status pages", "book"],
    ["maintenance", "Maintenance", "server"],
    ["resources", "Account resources", "grid"],
  ];
  return `<aside class="admin-sidebar">${renderBrand(true)}<div class="admin-nav-label">Workspace</div><nav class="admin-nav" aria-label="Admin workspace">${tabs.map(([id, label, iconName]) => `<button class="admin-nav-item ${adminState.activeTab === id ? "active" : ""}" type="button" data-admin-action="set-tab" data-tab="${id}" ${adminState.activeTab === id ? 'aria-current="page"' : ""}>${icon(iconName)}<span>${label}</span></button>`).join("")}</nav><div class="admin-sidebar-footer"><a href="/" target="_blank" rel="noopener noreferrer">View public page ${icon("arrow")}</a><button type="button" data-admin-action="logout">${icon("logout")} Sign out</button></div></aside>`;
}

function renderAdminHeader() {
  const labels = {
    overview: "Overview",
    uptime: "Uptime monitors",
    blacklist: "Blacklist monitors",
    pages: "Status pages",
    maintenance: "Maintenance",
    resources: "Account resources",
  };
  return `<header class="admin-header"><div><span class="admin-breadcrumb">Admin / <b>${escapeHtml(labels[adminState.activeTab] || "Overview")}</b></span></div><div class="admin-header-actions"><span class="managed-badge"><span class="status-indicator is-up"></span>${escapeHtml(adminState.username || "Admin")} signed in</span><button class="refresh-button" type="button" data-admin-action="refresh" ${adminState.loading ? "disabled" : ""}>${icon("refresh")} Refresh</button></div></header>`;
}

function renderStat(label, value, note, tone = "") {
  return `<article class="admin-stat ${tone}"><span>${label}</span><strong>${value}</strong><small>${note}</small></article>`;
}

function renderMonitorTable(
  monitors,
  empty = "No monitors found.",
  actionKind = "",
  monitorKind = actionKind,
) {
  if (!monitors?.length) return `<div class="admin-empty-row">${empty}</div>`;
  const hasAction = Boolean(actionKind);
  const isBlacklist =
    monitorKind === "blacklist" ||
    (!monitorKind && monitors.every((monitor) => Array.isArray(monitor.listed)));
  return `<div class="monitor-table ${hasAction ? "has-actions" : ""}"><div class="monitor-table-head"><span>Monitor</span><span>Status</span><span>${isBlacklist ? "Listed RBLs" : "Uptime"}</span><span>Last check</span>${hasAction ? "<span>Actions</span>" : ""}</div>${monitors
    .map((monitor) => {
      const status = isBlacklist
        ? (monitor.listed || []).length
          ? "down"
          : "up"
        : monitorState(monitor);
      const stateLabel = isBlacklist
        ? status === "down"
          ? "Listed"
          : "Clear"
        : statusLabel(status);
      const metric = isBlacklist
        ? String((monitor.listed || []).length)
        : formatPercent(monitor.uptime);
      const action =
        actionKind === "uptime"
          ? `<button class="table-action" data-admin-action="manage-monitor" data-monitor-id="${escapeHtml(monitor.id)}">${adminState.monitorDetailId === String(monitor.id) ? "Close" : "Manage"}</button>`
          : actionKind === "blacklist"
            ? `<button class="table-action" data-admin-action="blacklist-report" data-monitor-id="${escapeHtml(monitor.id)}">${adminState.blacklistDetailId === String(monitor.id) ? "Close" : "Report"}</button>`
            : "";
      return `<div class="monitor-table-row"><div class="table-monitor"><span class="status-indicator ${statusClass(status)}"></span><div><b>${escapeHtml(monitor.name || monitor.target || "Unnamed")}</b><small>${escapeHtml(monitor.target || monitor.type || "—")}</small></div></div><span class="status-text table-cell-status ${statusClass(status)}" data-label="Status">${stateLabel}</span><span class="table-cell-metric" data-label="${isBlacklist ? "RBLs" : "Uptime"}">${metric}</span><span class="table-date" data-label="Checked">${formatDate(monitor.last_check)}</span>${action}</div>`;
    })
    .join("")}</div>`;
}

const uptimeMonitors = () => adminState.data?.uptime?.data?.monitors || [];
const blacklistMonitors = () => adminState.data?.blacklist?.data?.monitors || [];
const scheduledMaintenances = () =>
  adminState.data?.maintenance?.data?.scheduled_maintenances || [];
const monitorById = (id) =>
  [...uptimeMonitors(), ...blacklistMonitors()].find(
    (monitor) => String(monitor.id) === String(id),
  );
const monitorDisplayName = (id) => {
  const monitor = monitorById(id);
  return monitor?.name || monitor?.target || id || "Unknown monitor";
};
const statusPageMonitorIds = (page) =>
  (page?.monitors || [])
    .map((monitor) => String(monitor?.id || monitor))
    .filter(Boolean);
const browserTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};
const dateTimeLocalValue = (minutesFromNow = 0) => {
  const date = new Date(Date.now() + minutesFromNow * 60_000);
  date.setSeconds(0, 0);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};
const formatTimestamp = (timestamp) =>
  timestamp
    ? new Date(Number(timestamp) * 1000).toLocaleString()
    : "Still ongoing";

function renderAdminFeedback() {
  if (!adminState.actionError && !adminState.actionNotice) return "";
  return `<div class="admin-action-message ${adminState.actionError ? "error" : "success"}" ${adminState.actionError ? 'role="alert"' : 'aria-live="polite"'}>${escapeHtml(adminState.actionError || adminState.actionNotice)}</div>`;
}

function renderUptimeDetail() {
  if (!adminState.monitorDetailId) return "";
  const monitor = monitorById(adminState.monitorDetailId);
  if (adminState.monitorDetailLoading)
    return `<section class="admin-panel detail-panel"><div class="loading-state compact-loading"><span class="loading-spinner"></span><p>Loading monitor operations…</p></div></section>`;
  const detail = adminState.monitorDetail || {};
  const report = detail.report?.data;
  const summary = report?.summary?.uptime || {};
  const responseLocations = Object.entries(report?.summary?.response_time || {});
  const downtimes = detail.downtimes?.data?.downtimes || [];
  const failures = detail.location?.data?.entries || [];
  const agentId = detail.agent?.data?.agent_id;
  const policies = detail.policies?.data;
  const query = adminState.monitorDetailQuery;
  const partialErrors = Object.entries(detail)
    .filter(([, value]) => value?.error)
    .map(([key, value]) => `<div class="detail-inline-error"><b>${escapeHtml(key)}</b><span>${escapeHtml(value.error)}</span></div>`)
    .join("");
  return `<section class="admin-panel detail-panel"><div class="admin-panel-heading"><div><div class="product-eyebrow">Monitor operations</div><h2>${escapeHtml(monitor?.name || monitor?.target || adminState.monitorDetailId)}</h2><p>${escapeHtml(monitor?.target || monitor?.type || adminState.monitorDetailId)}</p></div><button class="text-link" data-admin-action="manage-monitor" data-monitor-id="${escapeHtml(adminState.monitorDetailId)}">Close</button></div>${partialErrors}<form id="monitor-report-form" class="admin-operation-form compact-form"><label><span>Recent days</span><input name="days" type="number" min="1" max="30" value="${escapeHtml(query.days)}" /></label><label><span>Specific month</span><input name="month" type="month" value="${escapeHtml(query.month)}" /></label><label><span>Report timezone</span><input name="timezone" value="${escapeHtml(query.timezone)}" placeholder="+00:00" /></label><label class="inline-check"><input name="hourly" type="checkbox" ${query.hourly ? "checked" : ""} /><span>Hourly website stats</span></label><button class="secondary-action" type="submit">Reload report</button></form><div class="detail-stat-grid"><article><span>Uptime</span><b>${formatPercent(summary.percentage)}</b></article><article><span>Downtimes</span><b>${summary.downtimes ?? "—"}</b></article><article><span>Locations</span><b>${responseLocations.length}</b></article><article><span>Server agent</span><b>${agentId ? "Attached" : "Not attached"}</b></article></div><div class="operation-grid"><section class="operation-card"><div class="operation-card-heading"><div><b>Recent downtimes</b><small>Latest entries returned by the API</small></div><span>${downtimes.length}</span></div><div class="compact-list">${downtimes.slice(0, 20).map((entry) => `<div><span><b>${entry.maintenance ? "Maintenance" : "Incident"}</b><small>${escapeHtml(formatTimestamp(entry.start))} → ${escapeHtml(formatTimestamp(entry.end))}</small></span><code>${escapeHtml(entry.id || "")}</code></div>`).join("") || '<p class="operation-empty">No downtime entries returned.</p>'}</div></section><section class="operation-card"><div class="operation-card-heading"><div><b>Location fail log</b><small>Monitoring-node errors</small></div><span>${failures.length}</span></div><div class="compact-list">${failures.slice(0, 20).map((entry) => `<div><span><b>${escapeHtml(entry.location || "Unknown location")}</b><small>${escapeHtml(entry.data || "No message")}</small></span><time>${escapeHtml(formatTimestamp(entry.timestamp))}</time></div>`).join("") || '<p class="operation-empty">No location failures returned.</p>'}</div></section></div><section class="operation-card server-agent-card"><div class="operation-card-heading"><div><b>Server monitoring agent</b><small>Attach an agent ID or manage all warning policies.</small></div>${agentId ? `<code>${escapeHtml(agentId)}</code>` : ""}</div><div class="server-agent-actions">${agentId ? `<button class="danger-link" data-admin-action="detach-agent" data-monitor-id="${escapeHtml(adminState.monitorDetailId)}">Detach and delete metrics</button>` : `<button class="secondary-action" data-admin-action="attach-agent" data-monitor-id="${escapeHtml(adminState.monitorDetailId)}">Attach new agent ID</button>`}</div>${policies ? `<form id="warning-policies-form" class="json-editor-form"><label><span>Warning policies JSON</span><small>Every server-agent warning policy returned by HetrixTools can be edited here. Keep the object structure and accepted thresholds.</small><textarea name="policies" spellcheck="false">${escapeHtml(JSON.stringify(policies, null, 2))}</textarea></label><button class="secondary-action" type="submit">Save warning policies</button></form>` : `<p class="operation-empty">Warning policies become available when a compatible server agent is attached.</p>`}</section></section>`;
}

function renderBlacklistDetail() {
  if (!adminState.blacklistDetailId) return "";
  const monitor = monitorById(adminState.blacklistDetailId);
  if (adminState.blacklistDetailLoading)
    return `<section class="admin-panel detail-panel"><div class="loading-state compact-loading"><span class="loading-spinner"></span><p>Loading blacklist report…</p></div></section>`;
  const result = adminState.blacklistDetail || {};
  const report = result.data;
  return `<section class="admin-panel detail-panel"><div class="admin-panel-heading"><div><div class="product-eyebrow">Blacklist report</div><h2>${escapeHtml(report?.name || monitor?.name || monitor?.target || "Monitor report")}</h2><p>${escapeHtml(report?.target || monitor?.target || "")}</p></div><button class="text-link" data-admin-action="blacklist-report" data-monitor-id="${escapeHtml(adminState.blacklistDetailId)}">Close</button></div>${result.error ? `<div class="detail-inline-error"><b>report</b><span>${escapeHtml(result.error)}</span></div>` : ""}<form id="blacklist-report-form" class="admin-operation-form compact-form"><label><span>Report date</span><input name="date" type="date" value="${escapeHtml(result.date || "")}" /></label><button class="secondary-action" type="submit">Load date</button></form><div class="compact-list blacklist-report-list">${(report?.listed || []).map((entry) => `<div><span><b>${escapeHtml(entry.rbl || "Unknown RBL")}</b><small>Target is listed</small></span>${entry.delist ? `<a class="text-link" href="${escapeHtml(entry.delist)}" target="_blank" rel="noopener noreferrer">Delist instructions ${icon("arrow")}</a>` : ""}</div>`).join("") || '<p class="operation-empty">No blacklist listings returned for this date.</p>'}</div></section>`;
}

function renderOverviewTab() {
  const data = adminState.data || {};
  const uptime = data.uptime?.data?.monitors || [];
  const blacklist = data.blacklist?.data?.monitors || [];
  const pages = data.pages?.data?.status_pages || [];
  const maintenance = scheduledMaintenances();
  const incidents =
    uptime.filter((monitor) => monitorState(monitor) === "down").length +
    blacklist.filter((monitor) => (monitor.listed || []).length > 0).length;
  const operational = uptime.filter(
    (monitor) => monitorState(monitor) === "up",
  ).length;
  const limits = data.limits?.data;
  return `<div class="admin-page-heading"><div><div class="product-eyebrow">Workspace overview</div><h1>Monitoring, at a glance.</h1><p>Keep your public status page honest and your important services in view.</p></div><span class="admin-last-sync">Last sync ${formatDate(Math.floor(Date.now() / 1000))}</span></div>${adminErrorList(data)}<div class="admin-stat-grid">${renderStat("Uptime monitors", uptime.length, `${operational} operational`)}${renderStat("Active incidents", incidents, incidents ? "Needs attention" : "Everything is calm", incidents ? "alert" : "good")}${renderStat("Status pages", pages.length, "Public pages available")}${renderStat("Monitor capacity", limits?.uptime?.monitors ? `${limits.uptime.monitors.usage} / ${limits.uptime.monitors.limit}` : "—", "HetrixTools account limit")}</div><div class="admin-content-grid"><section class="admin-panel wide"><div class="admin-panel-heading"><div><div class="product-eyebrow">Uptime</div><h2>Recent monitor status</h2></div><button class="text-link" data-admin-action="set-tab" data-tab="uptime">View all ${icon("arrow")}</button></div>${renderMonitorTable(uptime.slice(0, 7), "No uptime monitors returned.")}</section><section class="admin-panel"><div class="admin-panel-heading"><div><div class="product-eyebrow">Public surfaces</div><h2>Status pages</h2></div><button class="text-link" data-admin-action="set-tab" data-tab="pages">Manage ${icon("arrow")}</button></div><div class="page-list">${
    pages
      .slice(0, 5)
      .map(
        (page) =>
          `<a href="/${encodeURIComponent(slugify(page.name))}" target="_blank" rel="noopener noreferrer" class="page-list-row"><span class="page-list-mark">${icon(page.type === "blacklist" ? "shield" : "pulse")}</span><span><b>${escapeHtml(page.name)}</b><small>/${slugify(page.name)}</small></span><span class="page-list-count">${page.monitors?.length || 0}</span></a>`,
      )
      .join("") || `<div class="admin-empty-row">No status pages found.</div>`
  }</div></section><section class="admin-panel"><div class="admin-panel-heading"><div><div class="product-eyebrow">Maintenance</div><h2>Scheduled windows</h2></div><button class="text-link" data-admin-action="set-tab" data-tab="maintenance">View all ${icon("arrow")}</button></div><div class="maintenance-list">${
    maintenance
      .slice(0, 4)
      .map(
        (item) =>
          `<div class="maintenance-row"><span class="maintenance-dot"></span><div><b>${escapeHtml(monitorDisplayName(item.monitor_id))}</b><small>${escapeHtml(item.start || "Scheduled window")}</small></div><span>${escapeHtml(item.timezone || "UTC")}</span></div>`,
      )
      .join("") ||
    `<div class="admin-empty-row">No maintenance scheduled.</div>`
  }</div></section><section class="admin-panel wide"><div class="admin-panel-heading"><div><div class="product-eyebrow">Blacklist</div><h2>Blacklist monitor status</h2></div><button class="text-link" data-admin-action="set-tab" data-tab="blacklist">View all ${icon("arrow")}</button></div>${renderMonitorTable(blacklist.slice(0, 7), "No blacklist monitors returned.")}</section></div>`;
}

const toggleField = (name, title, description, current, fallback = true) =>
  `<label class="toggle-field"><span><b>${escapeHtml(title)}</b><small>${escapeHtml(description)}</small></span><input type="checkbox" name="${name}" ${settingBoolean(current[name], fallback) ? "checked" : ""} /><i aria-hidden="true"></i></label>`;
const fieldValue = (current, name, fallback = "") =>
  escapeHtml(current[name] ?? fallback);

function renderMonitorCustomizer(sourceMonitors, current) {
  const selected = new Set(storedMonitorIds(current.monitor_ids));
  const hidden = new Set(storedMonitorIds(current.hidden_monitor_ids));
  const overrides = storedObject(current.monitor_overrides);
  if (!sourceMonitors.length)
    return `<div class="builder-empty">Uptime Monitors could not be loaded. Check the HetrixTools key, then refresh the dashboard.</div>`;
  return `<div class="monitor-customizer-shell"><div class="monitor-customizer-toolbar"><label><span>Find a monitor</span><input type="search" data-builder-monitor-search placeholder="Search name, target, or type…" /></label><div><button type="button" class="builder-tool-button" data-builder-action="select-all-monitors">Select all</button><button type="button" class="builder-tool-button" data-builder-action="clear-selected-monitors">Clear selected</button><button type="button" class="builder-tool-button" data-builder-action="clear-hidden-monitors">Clear hidden</button><button type="button" class="builder-tool-button" data-builder-action="clear-monitor-overrides">Clear aliases</button></div></div><div class="monitor-customizer"><div class="monitor-customizer-head"><span>Monitor</span><span>Selected</span><span>Hide</span><span>Public name / group</span></div>${sourceMonitors.map((monitor) => `<div class="monitor-customizer-row" data-monitor-search="${escapeHtml(`${monitor.name || ""} ${monitor.target || ""} ${monitor.type || ""}`.toLowerCase())}"><div class="monitor-choice-name"><span class="status-indicator ${statusClass(monitorState(monitor))}"></span><span><b>${escapeHtml(monitor.name || monitor.target || monitor.id)}</b><small>${escapeHtml(monitor.target || monitor.type || monitor.id)}</small></span></div><label class="tiny-check" title="Show when Selected monitors mode is active"><input type="checkbox" name="monitor_ids" value="${escapeHtml(monitor.id)}" ${selected.has(monitor.id) ? "checked" : ""} /><span>Show</span></label><label class="tiny-check" title="Always hide this monitor"><input type="checkbox" name="hidden_monitor_ids" value="${escapeHtml(monitor.id)}" ${hidden.has(monitor.id) ? "checked" : ""} /><span>Hide</span></label><div class="monitor-override-fields"><input name="monitor_name:${escapeHtml(monitor.id)}" value="${escapeHtml(overrides[monitor.id]?.name || "")}" placeholder="Custom name" maxlength="120" /><input name="monitor_group:${escapeHtml(monitor.id)}" value="${escapeHtml(overrides[monitor.id]?.category || "")}" placeholder="Custom group" maxlength="80" /></div></div>`).join("")}</div><p class="monitor-filter-empty" hidden>No monitors match this search.</p></div>`;
}

function pageMonitorScopeLabel(page) {
  const mode =
    page.monitor_mode ||
    (page.source_page_id
      ? "source"
      : storedMonitorIds(page.monitor_ids).length
        ? "selected"
        : "all");
  if (mode === "source") return "HetrixTools source page";
  if (mode === "all") return "all uptime monitors";
  return `${storedMonitorIds(page.monitor_ids).length} selected monitors`;
}

function renderPageBuilder() {
  if (!adminState.builderOpen) return "";
  if (adminState.customPagesError)
    return `<section class="admin-panel builder-locked"><span class="admin-auth-mark">${icon("lock")}</span><div><div class="product-eyebrow">Page builder unavailable</div><h2>Connect KV and R2 storage</h2><p>${escapeHtml(adminState.customPagesError)}</p><small>Bind CONFIG KV for page settings and LOGOS R2 for image uploads.</small></div></section>`;
  const sourcePages = adminState.data?.pages?.data?.status_pages || [];
  const sourceMonitors = adminState.data?.uptime?.data?.monitors || [];
  const current =
    adminState.customPages.find(
      (page) => page.slug === adminState.editingPage,
    ) || {};
  const monitorMode =
    current.monitor_mode ||
    (current.source_page_id
      ? "source"
      : storedMonitorIds(current.monitor_ids).length
        ? "selected"
        : "all");
  const navPages = [
    ...sourcePages.map((page) => ({
      slug: slugify(page.name),
      name: page.name,
      type: "HetrixTools",
    })),
    ...adminState.customPages
      .filter((page) => page.slug !== current.slug)
      .map((page) => ({ slug: page.slug, name: page.title, type: "Custom" })),
  ];
  const selectedNavPages = new Set(storedMonitorIds(current.nav_page_ids));
  return `<section class="admin-panel builder-panel" id="page-builder"><div class="admin-panel-heading"><div><div class="product-eyebrow">Advanced page builder</div><h2>${adminState.editingPage ? "Customize public page" : "Create a custom page"}</h2></div><div class="builder-heading-actions"><span class="builder-dirty-indicator" data-builder-dirty role="status" ${adminState.builderDirty ? "" : "hidden"}>Unsaved changes</span>${adminState.editingPage ? `<a class="text-link" href="/${encodeURIComponent(current.slug)}?preview=${Date.now()}" target="_blank" rel="noopener noreferrer">Open live page ${icon("arrow")}</a><button class="text-link" type="button" data-admin-action="new-page">New page</button>` : `<button class="text-link" type="button" data-admin-action="close-builder">Close builder</button>`}</div></div><p class="builder-intro">Every public element can be shown, hidden, renamed, recoloured, or restyled. Settings stay isolated to this route.</p><div class="builder-editor"><form id="page-builder-form" data-editing-slug="${escapeHtml(adminState.editingPage || "")}"><details class="builder-section" open><summary><span><b>Route & monitor data</b><small>Choose the URL, data source, visible monitors, order, aliases, and groups.</small></span><span>01</span></summary><div class="builder-section-body"><div class="builder-grid"><label><span>Public slug</span><input name="slug" required pattern="[a-z0-9][a-z0-9-]{0,48}" value="${fieldValue(current, "slug")}" placeholder="status" ${adminState.editingPage ? "readonly" : ""} /><small>${adminState.editingPage ? `Public URL: /${escapeHtml(current.slug)} · create a new page to use another route` : "Public URL: /your-slug"}</small></label><label><span>Monitor source mode</span><select name="monitor_mode"><option value="source" ${monitorMode === "source" ? "selected" : ""}>HetrixTools Status Page</option><option value="all" ${monitorMode === "all" ? "selected" : ""}>All Uptime Monitors</option><option value="selected" ${monitorMode === "selected" ? "selected" : ""}>Only selected Uptime Monitors</option></select></label><label><span>Source Status Page</span><select name="source_page_id"><option value="">Select a source page…</option>${sourcePages.map((page) => `<option value="${escapeHtml(page.id)}" ${current.source_page_id === page.id ? "selected" : ""}>${escapeHtml(page.name)} · ${escapeHtml(page.type)}</option>`).join("")}</select><small>Required only in Status Page mode.</small></label><label><span>Monitor order</span><select name="sort_mode"><option value="api" ${current.sort_mode === "api" || !current.sort_mode ? "selected" : ""}>HetrixTools order</option><option value="name" ${current.sort_mode === "name" ? "selected" : ""}>Name A–Z</option><option value="status" ${current.sort_mode === "status" ? "selected" : ""}>Incidents first</option></select></label></div>${toggleField("show_disabled_monitors", "Show disabled monitors", "Include monitors disabled in HetrixTools.", current, false)}${renderMonitorCustomizer(sourceMonitors, current)}</div></details><details class="builder-section"><summary><span><b>Brand & copy</b><small>Control identity, labels, language, logo, and public messaging.</small></span><span>02</span></summary><div class="builder-section-body"><div class="builder-grid"><label><span>Page title</span><input name="title" required maxlength="120" value="${fieldValue(current, "title")}" placeholder="Acme service status" /></label><label><span>Brand name</span><input name="brand_name" maxlength="80" value="${fieldValue(current, "brand_name", "Pulseboard")}" /></label><label class="builder-wide"><span>Subtitle</span><input name="subtitle" maxlength="240" value="${fieldValue(current, "subtitle")}" placeholder="Live updates for our products" /></label><label><span>Eyebrow text</span><input name="eyebrow_text" maxlength="80" value="${fieldValue(current, "eyebrow_text", "Uptime status")}" /></label><label><span>Monitor section title</span><input name="monitor_heading" maxlength="100" value="${fieldValue(current, "monitor_heading", "Service status")}" /></label><label><span>Operational message</span><input name="operational_text" maxlength="120" value="${fieldValue(current, "operational_text", "All systems operational")}" /></label><label><span>Incident message</span><input name="incident_text" maxlength="120" value="${fieldValue(current, "incident_text", "Service disruption detected")}" /></label><label><span>Maintenance message</span><input name="maintenance_text" maxlength="120" value="${fieldValue(current, "maintenance_text", "Scheduled maintenance in progress")}" /></label><label><span>Unavailable-data message</span><input name="unavailable_text" maxlength="120" value="${fieldValue(current, "unavailable_text", "Status information is incomplete")}" /></label><label><span>Navigation home label</span><input name="status_nav_label" maxlength="40" value="${fieldValue(current, "status_nav_label", "Status")}" /></label><label><span>Public language</span><select name="locale"><option value="en" ${current.locale !== "ko" ? "selected" : ""}>English</option><option value="ko" ${current.locale === "ko" ? "selected" : ""}>한국어</option></select></label><label><span>Text logo</span><input name="logo_text" maxlength="4" value="${fieldValue(current, "logo_text")}" placeholder="AC" /></label><label><span>Image logo</span><input name="logo_file" type="file" accept="image/png,image/jpeg,image/webp" /><small>PNG, JPG, WEBP · max 2 MB</small></label>${current.logo_key ? `<label class="builder-wide remove-logo-field"><input name="remove_logo" type="checkbox" /><span><b>Remove uploaded logo</b><small>Use the text logo after the next save.</small></span></label>` : ""}</div></div></details><details class="builder-section"><summary><span><b>Header & navigation</b><small>Hide the entire bar or choose exactly which routes and links appear.</small></span><span>03</span></summary><div class="builder-section-body"><div class="toggle-grid">${toggleField("show_header", "Show top bar", "Display the brand and navigation header.", current, true)}${toggleField("show_navigation", "Show navigation", "Keep the brand but hide all navigation links.", current, true)}${toggleField("show_status_pages", "Show Status Pages", "List HetrixTools/custom status pages in the top bar.", current, true)}${toggleField("show_admin_link", "Show Admin link", "Expose a shortcut to /admin on the public page.", current, false)}</div><label class="stacked-field"><span>Allowed navigation pages</span><small>Leave everything unchecked to show all pages. This setting is ignored when Status Pages are hidden.</small><div class="choice-chip-grid">${navPages.map((page) => `<label class="choice-chip"><input type="checkbox" name="nav_page_ids" value="${escapeHtml(page.slug)}" ${selectedNavPages.has(page.slug) ? "checked" : ""} /><span><b>${escapeHtml(page.name)}</b><small>/${escapeHtml(page.slug)} · ${page.type}</small></span></label>`).join("") || `<span class="builder-empty compact">No additional pages are available yet.</span>`}</div></label></div></details><details class="builder-section"><summary><span><b>Sections & monitor fields</b><small>Switch every block and every monitor metric independently.</small></span><span>04</span></summary><div class="builder-section-body"><div class="toggle-grid">${toggleField("show_title", "Title section", "Page title, eyebrow, and subtitle.", current, true)}${toggleField("show_last_checked", "Last checked", "Timestamp beside the title.", current, true)}${toggleField("show_overall_status", "Overall status", "Large operational or incident banner.", current, true)}${toggleField("show_announcement", "Announcements", "HetrixTools Status Page announcement block.", current, true)}${toggleField("show_summary", "Summary counters", "Monitor, operational, maintenance, and incident totals.", current, true)}${toggleField("show_monitor_heading", "Monitor heading", "Heading above monitor groups.", current, true)}${toggleField("show_group_headings", "Group headings", "Category name and monitor count.", current, true)}${toggleField("show_monitor_targets", "Monitor target", "URL, IP, service, or monitor type under the name.", current, true)}${toggleField("show_status_text", "Status label", "Operational, incident, maintenance, or disabled text.", current, true)}${toggleField("show_uptime", "Uptime percentage", "The uptime value returned by HetrixTools.", current, true)}${toggleField("show_response_time", "Response time", "Response time in milliseconds when available.", current, true)}${toggleField("show_footer", "Footer", "Display the public footer area.", current, true)}${toggleField("show_data_provider", "HetrixTools credit", "Show Monitoring data by HetrixTools in the footer.", current, true)}</div><label class="stacked-field"><span>Footer text</span><input name="footer_text" maxlength="180" value="${fieldValue(current, "footer_text", "Powered by Pulseboard")}" /></label></div></details><details class="builder-section"><summary><span><b>Appearance</b><small>Theme every surface while keeping the default design gradient-free.</small></span><span>05</span></summary><div class="builder-section-body"><div class="theme-palette"><label><span>Accent</span><input name="accent_color" type="color" value="${fieldValue(current, "accent_color", "#147c61")}" /></label><label><span>Background</span><input name="background_color" type="color" value="${fieldValue(current, "background_color", "#f7f9f7")}" /></label><label><span>Surface</span><input name="surface_color" type="color" value="${fieldValue(current, "surface_color", "#ffffff")}" /></label><label><span>Text</span><input name="text_color" type="color" value="${fieldValue(current, "text_color", "#17211c")}" /></label><label><span>Muted</span><input name="muted_color" type="color" value="${fieldValue(current, "muted_color", "#728077")}" /></label><label><span>Border</span><input name="border_color" type="color" value="${fieldValue(current, "border_color", "#dfe7e0")}" /></label><label><span>Healthy</span><input name="success_color" type="color" value="${fieldValue(current, "success_color", "#178c68")}" /></label><label><span>Incident</span><input name="danger_color" type="color" value="${fieldValue(current, "danger_color", "#b34b45")}" /></label></div><div class="builder-grid"><label><span>Font family</span><select name="font_family"><option value="sans" ${current.font_family !== "serif" && current.font_family !== "mono" ? "selected" : ""}>Modern sans</option><option value="serif" ${current.font_family === "serif" ? "selected" : ""}>Editorial serif</option><option value="mono" ${current.font_family === "mono" ? "selected" : ""}>Monospace</option></select></label><label><span>Monitor style</span><select name="monitor_style"><option value="cards" ${current.monitor_style !== "rows" && current.monitor_style !== "minimal" ? "selected" : ""}>Cards</option><option value="rows" ${current.monitor_style === "rows" ? "selected" : ""}>Connected rows</option><option value="minimal" ${current.monitor_style === "minimal" ? "selected" : ""}>Minimal</option></select></label><label><span>Density</span><select name="density"><option value="comfortable" ${current.density !== "compact" ? "selected" : ""}>Comfortable</option><option value="compact" ${current.density === "compact" ? "selected" : ""}>Compact</option></select></label><label><span>Content width</span><input name="content_width" type="number" min="680" max="1400" step="20" value="${fieldValue(current, "content_width", 920)}" /><small>680–1400 pixels</small></label><label><span>Corner radius</span><input name="corner_radius" type="number" min="0" max="24" value="${fieldValue(current, "corner_radius", 8)}" /><small>0–24 pixels</small></label></div></div></details><details class="builder-section"><summary><span><b>SEO, refresh & custom CSS</b><small>Page metadata, indexing, refresh frequency, and complete CSS overrides. 06</small></span><span>06</span></summary><div class="builder-section-body"><div class="builder-grid"><label><span>Auto refresh</span><select name="refresh_interval"><option value="0" ${Number(current.refresh_interval) === 0 ? "selected" : ""}>Off</option>${[30, 60, 120, 300].map((seconds) => `<option value="${seconds}" ${Number(current.refresh_interval ?? 60) === seconds ? "selected" : ""}>Every ${seconds < 60 ? `${seconds} seconds` : `${seconds / 60} minute${seconds > 60 ? "s" : ""}`}</option>`).join("")}</select></label><label><span>Browser/SEO title</span><input name="seo_title" maxlength="120" value="${fieldValue(current, "seo_title")}" placeholder="Acme Status" /></label><label class="builder-wide"><span>SEO description</span><input name="seo_description" maxlength="240" value="${fieldValue(current, "seo_description")}" /></label></div>${toggleField("hide_from_search", "Hide from search engines", "Add noindex and nofollow metadata to this route.", current, false)}<label class="stacked-field"><span>Custom CSS</span><small>Applied after the built-in public-page stylesheet. Use .public-app to scope rules. Maximum 20 KB.</small><textarea name="custom_css" maxlength="20000" spellcheck="false" placeholder=".public-app .overall-banner { border-width: 2px; }">${fieldValue(current, "custom_css")}</textarea></label></div></details><div class="builder-actions"><button class="product-button" type="submit" ${adminState.builderBusy ? "disabled" : ""}>${adminState.builderBusy ? "Saving…" : adminState.editingPage ? "Save all settings" : "Create page"} ${icon(adminState.builderBusy ? "refresh" : "arrow")}</button>${adminState.editingPage ? `<button class="danger-link" type="button" data-admin-action="delete-page" data-page-slug="${escapeHtml(adminState.editingPage)}">Delete page</button>` : ""}</div></form><aside class="builder-preview-column"><div class="preview-heading"><span><b>Live preview</b><small>Updates while you edit</small></span><span class="preview-device-dot"></span></div><iframe id="builder-preview-frame" title="Public status page preview" sandbox=""></iframe></aside></div></section>`;
}

function updateBuilderPreview(form) {
  const frame = document.querySelector("#builder-preview-frame");
  if (!frame) return;
  const values = new FormData(form);
  const checked = (name) => values.has(name);
  const value = (name, fallback = "") => String(values.get(name) || fallback);
  const previewThemeMode = value("theme_mode", "dark");
  const previewIsLight =
    previewThemeMode === "light" ||
    (previewThemeMode === "system" &&
      window.matchMedia?.("(prefers-color-scheme: light)").matches);
  if (previewIsLight) {
    for (const [darkName, lightName, fallback] of [
      ["accent_color", "light_accent_color", "#0ba6c0"],
      ["background_color", "light_background_color", "#f5f7f9"],
      ["surface_color", "light_surface_color", "#ffffff"],
      ["text_color", "light_text_color", "#1b252d"],
      ["muted_color", "light_muted_color", "#71808a"],
      ["border_color", "light_border_color", "#dfe6ea"],
      ["success_color", "light_success_color", "#0fa978"],
      ["danger_color", "light_danger_color", "#df3157"],
    ])
      values.set(darkName, value(lightName, fallback));
  }
  const color = (name, darkFallback, lightFallback) =>
    previewIsLight
      ? value(`light_${name}`, lightFallback)
      : value(name, darkFallback);
  const selectedIds = new Set(values.getAll("monitor_ids").map(String));
  const hiddenIds = new Set(values.getAll("hidden_monitor_ids").map(String));
  const monitorMode = value("monitor_mode", "all");
  const monitors = (adminState.data?.uptime?.data?.monitors || [])
    .filter((monitor) => !hiddenIds.has(String(monitor.id)))
    .filter(
      (monitor) =>
        monitorMode !== "selected" || selectedIds.has(String(monitor.id)),
    )
    .slice(0, 3);
  const radius = Number(value("corner_radius", 8));
  const previewFont = publicFontConfig({
    font_family: value("font_family", "wanted"),
    google_font_family: value("google_font_family"),
  });
  const font = previewFont.stack;
  const fontLink = previewFont.href
    ? `</style><link rel="stylesheet" crossorigin="anonymous" href="${escapeHtml(previewFont.href)}"><style>`
    : "";
  const previewEnhancements = `.monitor-uptime-bar{display:flex;justify-content:flex-end;gap:3px;flex:1}.monitor-uptime-bar i{width:3px;height:15px;border-radius:2px;background:${color("muted_color", "#8f9ba5", "#71808a")}}.monitor-uptime-bar i:nth-last-child(-n+3){background:${color("success_color", "#20d69b", "#0fa978")}}.preview-uptime{display:inline-block;margin-right:6px;padding:2px 5px;border-radius:10px;background:${color("success_color", "#20d69b", "#0fa978")};color:${color("background_color", "#080d11", "#f5f7f9")};font-size:8px}.preview-empty{padding:24px;text-align:center;color:${color("muted_color", "#8f9ba5", "#71808a")}}`;
  const customCss = `${fontLink}${previewEnhancements}${value("custom_css").replace(/<\/style/gi, "<\\/style")}`;
  const shownForMonitor = (monitor, field, globalField) => {
    const setting = value(`monitor_${field}:${monitor.id}`, "inherit");
    return setting === "show"
      ? true
      : setting === "hide"
        ? false
        : checked(globalField);
  };
  const korean = value("locale", "en") === "ko";
  const monitorRows = monitors.length
    ? monitors
        .map((monitor, index) => {
          const publicName = value(
            `monitor_name:${monitor.id}`,
            monitor.name || monitor.target || `Service ${index + 1}`,
          );
          const showBar = shownForMonitor(monitor, "bar", "show_uptime_bar");
          const showUptime = shownForMonitor(monitor, "uptime", "show_uptime");
          const showTarget = shownForMonitor(
            monitor,
            "target",
            "show_monitor_targets",
          );
          const showStatus = shownForMonitor(
            monitor,
            "status",
            "show_status_text",
          );
          const showResponse = shownForMonitor(
            monitor,
            "response",
            "show_response_time",
          );
          const bar = showBar
            ? `<div class="monitor-uptime-bar">${Array.from({ length: 24 }, () => "<i></i>").join("")}</div>`
            : "";
          const metadata = `${showStatus ? `<b>${index === 1 ? (korean ? "장애" : "Incident") : korean ? "정상" : "Operational"}</b>` : ""}${showResponse ? `<span>${48 + index * 17} ms</span>` : ""}`;
          const classes = [
            showTarget ? "has-target" : "",
            showUptime ? "has-uptime" : "",
            showBar ? "has-bar" : "",
            metadata ? "has-meta" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return `<div class="public-monitor ${classes}"><div class="monitor-main"><i class="${index === 1 ? "warn" : ""}"></i><span>${showUptime ? `<b class="preview-uptime">${index === 1 ? "99.92" : "100.00"}%</b>` : ""}<b>${escapeHtml(publicName)}</b>${showTarget ? `<small>${escapeHtml(monitor.target || monitor.type || "https://example.com")}</small>` : ""}</span></div>${bar}${metadata ? `<div class="monitor-meta">${metadata}</div>` : ""}</div>`;
        })
        .join("")
    : `<div class="preview-empty">${korean ? "표시할 모니터가 없습니다." : "No monitors selected for this page."}</div>`;
  frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;background:${value("background_color", "#f7f9f7")};color:${value("text_color", "#17211c")};font-family:${font};font-size:12px}.public-app{min-height:100vh}.public-header{display:${checked("show_header") ? "flex" : "none"};height:54px;align-items:center;justify-content:space-between;padding:0 20px;border-bottom:1px solid ${value("border_color", "#dfe7e0")};background:${value("surface_color", "#ffffff")}}.brand{font-weight:800;color:${value("accent_color", "#147c61")}}nav{display:${checked("show_navigation") ? "flex" : "none"};gap:14px;color:${value("muted_color", "#728077")};font-size:10px}.wrap{width:min(${value("content_width", 920)}px,calc(100% - 34px));margin:auto;padding:32px 0}.title{display:${checked("show_title") ? "flex" : "none"};justify-content:space-between;align-items:end;margin-bottom:18px}.eyebrow{color:${value("accent_color", "#147c61")};font-size:8px;text-transform:uppercase;letter-spacing:.14em;font-weight:800}.title h1{font-size:28px;margin:5px 0}.title p,small{display:block;color:${value("muted_color", "#728077")};margin-top:3px}.overall{display:${checked("show_overall_status") ? "flex" : "none"};padding:15px;border:1px solid ${value("success_color", "#178c68")};border-radius:${radius}px;background:${value("surface_color", "#ffffff")};color:${value("success_color", "#178c68")};font-weight:800}.summary{display:${checked("show_summary") ? "grid" : "none"};grid-template-columns:repeat(3,1fr);margin:12px 0 26px;border:1px solid ${value("border_color", "#dfe7e0")};border-radius:${radius}px;background:${value("surface_color", "#ffffff")}}.summary div{padding:12px;border-right:1px solid ${value("border_color", "#dfe7e0")}}.summary div:last-child{border:0}.summary b{display:block;font-size:18px}.heading{display:${checked("show_monitor_heading") ? "block" : "none"};margin-bottom:10px}.heading h2{margin:4px 0;font-size:16px}.group{display:${checked("show_group_headings") ? "flex" : "none"};justify-content:space-between;color:${value("muted_color", "#728077")};font-size:9px;margin:0 8px 7px}.public-monitor{display:grid;grid-template-columns:minmax(130px,.85fr) minmax(90px,1fr) auto;align-items:center;gap:12px;min-height:${value("density") === "compact" ? 54 : 64}px;padding:${value("density") === "compact" ? "12px 12px" : "15px 14px"};margin-bottom:${value("monitor_style") === "rows" ? 0 : 5}px;border:${value("monitor_style") === "minimal" ? 0 : 1}px solid ${value("border_color", "#dfe7e0")};border-radius:${value("monitor_style") === "rows" ? 0 : radius}px;background:${value("monitor_style") === "minimal" ? "transparent" : value("surface_color", "#ffffff")}}.public-monitor:not(.has-bar):not(.has-meta){grid-template-columns:1fr}.public-monitor.has-bar:not(.has-meta){grid-template-columns:minmax(130px,.85fr) minmax(90px,1fr)}.public-monitor.has-meta:not(.has-bar){grid-template-columns:minmax(130px,1fr) auto}.monitor-main{display:flex;align-items:center;gap:9px;min-width:0}.monitor-main i{width:8px;height:8px;flex:0 0 8px;border-radius:50%;background:${value("success_color", "#178c68")}}.monitor-main i.warn{background:${value("danger_color", "#b34b45")}}.monitor-main span{min-width:0}.monitor-meta{display:flex;justify-content:flex-end;gap:12px;color:${value("muted_color", "#728077")};font-size:9px}.monitor-meta b{color:${value("success_color", "#178c68")}}footer{display:${checked("show_footer") ? "flex" : "none"};justify-content:space-between;margin-top:28px;padding-top:15px;border-top:1px solid ${value("border_color", "#dfe7e0")};color:${value("muted_color", "#728077")};font-size:9px}${customCss}</style></head><body><div class="public-app"><header class="public-header"><span class="brand">${escapeHtml(value("brand_name", "Pulseboard"))}</span><nav><span>${escapeHtml(value("status_nav_label", "Status"))}</span>${checked("show_status_pages") ? "<span>Other page</span>" : ""}${checked("show_admin_link") ? "<span>Admin</span>" : ""}</nav></header><main class="wrap"><section class="title"><div><span class="eyebrow">${escapeHtml(value("eyebrow_text", "Uptime status"))}</span><h1>${escapeHtml(value("title", "Your service status"))}</h1><p>${escapeHtml(value("subtitle", "Live updates for our products"))}</p></div>${checked("show_last_checked") ? "<small>Last checked<br><b>just now</b></small>" : ""}</section><section class="overall">${escapeHtml(value("operational_text", "All systems operational"))}</section><section class="summary"><div><b>3</b><small>Monitors</small></div><div><b>2</b><small>Operational</small></div><div><b>1</b><small>Incidents</small></div></section><section class="heading"><span class="eyebrow">Live monitors</span><h2>${escapeHtml(value("monitor_heading", "Service status"))}</h2></section><div class="group"><b>Services</b><span>3 monitors</span></div>${monitorRows}<footer><span>${escapeHtml(value("footer_text", "Powered by Pulseboard"))}</span>${checked("show_data_provider") ? "<span>Monitoring data by HetrixTools</span>" : ""}</footer></main></div></body></html>`;
}

function scheduleBuilderPreview(form, immediate = false) {
  window.clearTimeout(builderPreviewTimer);
  if (immediate) {
    updateBuilderPreview(form);
    return;
  }
  builderPreviewTimer = window.setTimeout(
    () => updateBuilderPreview(form),
    120,
  );
}

function renderStatusPageMembership(page) {
  if (adminState.managedStatusPageId !== String(page.id)) return "";
  const pool = page.type === "blacklist" ? blacklistMonitors() : uptimeMonitors();
  const selected = new Set(statusPageMonitorIds(page));
  return `<form id="status-page-monitors-form" class="membership-editor" data-page-id="${escapeHtml(page.id)}" data-current-ids="${escapeHtml(JSON.stringify([...selected]))}"><div class="membership-editor-heading"><div><b>Page monitors</b><small>Add or remove monitors on this source Status Page.</small></div><span>${selected.size} selected</span></div><div class="membership-monitor-grid">${pool.map((monitor) => `<label><input type="checkbox" name="monitor_ids" value="${escapeHtml(monitor.id)}" ${selected.has(String(monitor.id)) ? "checked" : ""} /><span><b>${escapeHtml(monitor.name || monitor.target || monitor.id)}</b><small>${escapeHtml(monitor.target || monitor.type || monitor.id)}</small></span></label>`).join("") || '<p class="operation-empty">No compatible monitors were returned.</p>'}</div><div class="membership-actions"><small>Saving sends only the added and removed monitor IDs.</small><button class="secondary-action" type="submit">Save page monitors</button></div></form>`;
}

function renderPagesTab() {
  const pages = adminState.data?.pages?.data?.status_pages || [];
  const customRows =
    adminState.customPages
      .map(
        (page) =>
          `<div class="custom-page-row"><div class="page-list-mark">${page.logo_key ? `<img src="/assets/logo/${encodeURIComponent(page.slug)}" alt="" />` : icon("pulse")}</div><div><b>${escapeHtml(page.title)}</b><small>/${escapeHtml(page.slug)} · ${pageMonitorScopeLabel(page)}</small></div><a class="text-link" href="/${encodeURIComponent(page.slug)}" target="_blank" rel="noopener noreferrer">Preview ${icon("arrow")}</a><button class="text-link" type="button" data-admin-action="edit-page" data-page-slug="${escapeHtml(page.slug)}">Edit</button></div>`,
      )
      .join("") ||
    `<div class="admin-empty-row">No custom pages yet. Create one when you need a dedicated public route.</div>`;
  const sourceRows =
    pages
      .map(
        (page) =>
          `<div class="source-page-item"><div class="pages-admin-row"><div class="page-list-mark">${icon(page.type === "blacklist" ? "shield" : "pulse")}</div><div><b>${escapeHtml(page.name)}</b><small>${page.type === "blacklist" ? "Blacklist" : "Uptime"} · ${statusPageMonitorIds(page).length} monitors</small></div><code>/${slugify(page.name)}</code><a class="text-link" href="/${encodeURIComponent(slugify(page.name))}" target="_blank" rel="noopener noreferrer">Open ${icon("arrow")}</a><button class="table-action" type="button" data-admin-action="manage-status-page" data-page-id="${escapeHtml(page.id)}">${adminState.managedStatusPageId === String(page.id) ? "Close" : "Manage monitors"}</button></div>${renderStatusPageMembership(page)}</div>`,
      )
      .join("") ||
    `<div class="admin-empty-row">Create a Status Page in HetrixTools first.</div>`;
  return `<div class="admin-page-heading"><div><div class="product-eyebrow">Public status</div><h1>Status pages</h1><p>Build custom routes and manage the monitors attached to HetrixTools source pages.</p></div><button class="product-button" type="button" data-admin-action="new-page">New custom page ${icon("arrow")}</button></div>${renderAdminFeedback()}${renderPageBuilder()}<section class="admin-panel full-panel"><div class="admin-panel-heading"><div><div class="product-eyebrow">Your public routes</div><h2>Custom pages</h2></div><span class="public-section-note">${adminState.customPages.length} saved</span></div><div class="custom-pages-list">${customRows}</div></section><div class="slug-help"><b>Automatic routes</b><span>Existing HetrixTools Status Pages also work automatically at /page-name. Their monitor membership can be changed below.</span></div><section class="admin-panel full-panel"><div class="admin-panel-heading"><div><div class="product-eyebrow">Source pages</div><h2>HetrixTools Status Pages</h2></div></div><div class="pages-admin-list">${sourceRows}</div></section>`;
}

function renderMaintenanceTab() {
  const maintenance = scheduledMaintenances();
  const timezone = browserTimezone();
  return `<div class="admin-page-heading"><div><div class="product-eyebrow">Maintenance mode</div><h1>Scheduled maintenance</h1><p>Create one-time or recurring windows and remove schedules that are no longer needed.</p></div><span class="admin-last-sync">${maintenance.length} scheduled</span></div>${renderAdminFeedback()}${adminErrorList({ maintenance: adminState.data?.maintenance })}<section class="admin-panel full-panel maintenance-create-panel"><div class="admin-panel-heading"><div><div class="product-eyebrow">New window</div><h2>Schedule maintenance</h2><p>HetrixTools allows up to 10 schedules per monitor.</p></div></div><form id="maintenance-form" class="admin-operation-form maintenance-form"><label class="field-wide"><span>Uptime monitor</span><select name="monitor_id" required><option value="">Select a monitor…</option>${uptimeMonitors().map((monitor) => `<option value="${escapeHtml(monitor.id)}">${escapeHtml(monitor.name || monitor.target || monitor.id)} · ${escapeHtml(monitor.target || monitor.type || "Monitor")}</option>`).join("")}</select></label><label><span>Starts</span><input name="start" type="datetime-local" value="${dateTimeLocalValue(60)}" required /></label><label><span>Ends</span><input name="end" type="datetime-local" value="${dateTimeLocalValue(120)}" required /></label><label><span>Timezone</span><input name="timezone" list="timezone-options" value="${escapeHtml(timezone)}" required /></label><label class="inline-check field-toggle"><input name="with_notifications" type="checkbox" checked /><span><b>Send notifications</b><small>Use the monitor's configured contacts.</small></span></label><label class="inline-check field-toggle"><input name="recurring" type="checkbox" /><span><b>Recurring schedule</b><small>Repeat this maintenance window.</small></span></label><div class="recurring-fields field-wide" data-recurring-fields hidden><label><span>Repeat every</span><input name="recurring_time" type="number" min="1" value="1" /></label><label><span>Interval</span><select name="recurring_time_type"><option value="hour">Hour(s)</option><option value="day">Day(s)</option><option value="week" selected>Week(s)</option><option value="month">Month(s)</option><option value="year">Year(s)</option></select></label><small>The repeat interval must be at least as long as the maintenance window.</small></div><div class="operation-form-actions field-wide"><small>Scheduled maintenance cannot be edited through API v3. Remove it and create a replacement when times change.</small><button class="product-button" type="submit" ${adminState.actionBusy ? "disabled" : ""}>${adminState.actionBusy ? "Scheduling…" : `Schedule maintenance ${icon("arrow")}`}</button></div><datalist id="timezone-options"><option value="UTC"></option><option value="Asia/Seoul"></option><option value="America/New_York"></option><option value="Europe/London"></option><option value="Europe/Berlin"></option><option value="Asia/Tokyo"></option></datalist></form></section><section class="admin-panel full-panel"><div class="admin-panel-heading"><div><div class="product-eyebrow">Existing windows</div><h2>Scheduled maintenance</h2></div></div><div class="maintenance-admin-list">${maintenance.map((item) => `<div class="maintenance-admin-row"><span class="maintenance-dot"></span><div><b>${escapeHtml(monitorDisplayName(item.monitor_id))}</b><small>${escapeHtml(item.start || "Start not returned")} → ${escapeHtml(item.end || "End not returned")}</small></div><span><b>${escapeHtml(item.timezone || "UTC")}</b><small>${item.recurring ? `Every ${escapeHtml(item.recurring_time)} ${escapeHtml(item.recurring_time_type)}(s)` : "One time"}</small></span><code>${item.with_notifications === false ? "No notifications" : "Notifications on"}</code><button class="danger-link" data-admin-action="delete-maintenance" data-maintenance-id="${escapeHtml(item.id)}" data-monitor-name="${escapeHtml(monitorDisplayName(item.monitor_id))}">Remove</button></div>`).join("") || `<div class="admin-empty-row">No maintenance windows returned.</div>`}</div></section>`;
}

function renderResourcesTab() {
  const data = adminState.data || {};
  const limits = data.limits?.data || {};
  const contacts = data.contacts?.data?.contact_lists || [];
  const rblData = data.rbls?.data || {};
  const rbls = [...(rblData.ipv4 || []), ...(rblData.domains || [])];
  const limitRows = [
    ["Uptime monitors", limits.uptime?.monitors],
    ["Blacklist monitors", limits.blacklist?.monitors],
    ["Blacklist API credits", limits.blacklist?.api_check_credits],
    ["Sub accounts", limits.sub_accounts],
    ["SMS credits", limits.sms_credits],
    ["Legacy API calls", limits.api_v1_v2],
  ].filter(([, value]) => value);
  const contactChannelCount = (contact) =>
    ["email", "phone_sms", "telegram", "pushbullet", "slack", "discord", "mattermost_rocketchat", "microsoft_teams", "pagerduty", "opsgenie", "victorops", "webhook"].filter((key) => Array.isArray(contact[key]) ? contact[key].length : contact[key] && Object.values(contact[key]).some(Boolean)).length;
  return `<div class="admin-page-heading"><div><div class="product-eyebrow">API resources</div><h1>Account resources</h1><p>Read-only account limits, notification-list summaries, and RBL coverage from API v3.</p></div></div>${adminErrorList({ limits: data.limits, contacts: data.contacts, rbls: data.rbls })}<div class="admin-content-grid"><section class="admin-panel"><div class="admin-panel-heading"><div><div class="product-eyebrow">Usage</div><h2>Account limits</h2></div></div><div class="resource-list">${limitRows.map(([label, value]) => `<div><span><b>${escapeHtml(label)}</b><small>Current plan usage</small></span><strong>${escapeHtml(value.usage ?? "—")} / ${escapeHtml(value.limit ?? "—")}</strong></div>`).join("") || '<p class="operation-empty">No limit data returned.</p>'}${limits.account_credit ? `<div><span><b>Account credit</b><small>Current balance</small></span><strong>${escapeHtml(limits.account_credit.balance ?? "—")}</strong></div>` : ""}</div></section><section class="admin-panel"><div class="admin-panel-heading"><div><div class="product-eyebrow">Notifications</div><h2>Contact lists</h2></div><span class="public-section-note">${contacts.length}</span></div><div class="resource-list">${contacts.map((contact) => `<div><span><b>${escapeHtml(contact.name || contact.id)}</b><small>${contact.default ? "Default · " : ""}${contactChannelCount(contact)} configured channel types</small></span><code>${escapeHtml(String(contact.id || "").slice(0, 8))}…</code></div>`).join("") || '<p class="operation-empty">No contact lists returned.</p>'}</div></section><section class="admin-panel wide"><div class="admin-panel-heading"><div><div class="product-eyebrow">Blacklist coverage</div><h2>RBL providers</h2></div><span class="public-section-note">${rbls.length}</span></div><div class="rbl-grid">${rbls.map((rbl) => `<div><b>${escapeHtml(rbl.rbl || rbl.id)}</b><small>${(rblData.domains || []).includes(rbl) ? "Domain" : "IPv4"}${rbl.optional ? " · optional" : ""}${rbl.ignored ? " · ignored" : ""}</small></div>`).join("") || '<p class="operation-empty">No RBL data returned.</p>'}</div></section></div>`;
}

function renderTabContent() {
  const data = adminState.data || {};
  if (adminState.activeTab === "overview") return renderOverviewTab();
  if (adminState.activeTab === "uptime")
    return `<div class="admin-page-heading"><div><div class="product-eyebrow">Uptime monitoring</div><h1>Uptime monitors</h1><p>Inspect reports and downtime logs, then manage server agents and warning policies.</p></div></div>${renderAdminFeedback()}${adminErrorList({ uptime: data.uptime })}<section class="admin-panel full-panel">${renderMonitorTable(data.uptime?.data?.monitors, "No uptime monitors returned.", "uptime")}</section>${renderUptimeDetail()}`;
  if (adminState.activeTab === "blacklist")
    return `<div class="admin-page-heading"><div><div class="product-eyebrow">Blacklist monitoring</div><h1>Blacklist monitors</h1><p>Open each target's current or historical blacklist report.</p></div></div>${renderAdminFeedback()}${adminErrorList({ blacklist: data.blacklist })}<section class="admin-panel full-panel">${renderMonitorTable(data.blacklist?.data?.monitors, "No blacklist monitors returned.", "blacklist")}</section>${renderBlacklistDetail()}`;
  if (adminState.activeTab === "pages") return renderPagesTab();
  if (adminState.activeTab === "maintenance") return renderMaintenanceTab();
  return renderResourcesTab();
}

function renderAdminApp() {
  const root = document.querySelector("#app");
  document.documentElement.lang = "en";
  document.title = "Pulseboard Admin";
  if (adminState.checkingSession) {
    root.innerHTML = `<div class="product-app admin-app"><a class="skip-link" href="#main-content">Skip to session check</a><header class="admin-auth-header"><div class="product-container">${renderBrand(true)}<a href="/">View public page ${icon("arrow")}</a></div></header>${renderAdminSessionCheck()}</div>`;
  } else if (!adminState.loggedIn) {
    root.innerHTML = `<div class="product-app admin-app"><a class="skip-link" href="#main-content">Skip to sign in</a><header class="admin-auth-header"><div class="product-container">${renderBrand(true)}<a href="/">View public page ${icon("arrow")}</a></div></header>${renderAdminAuth()}</div>`;
  } else {
    root.innerHTML = `<div class="product-app admin-app"><a class="skip-link" href="#main-content">Skip to content</a><div class="admin-layout">${renderAdminNav()}<div class="admin-main">${renderAdminHeader()}<main class="admin-content" id="main-content" ${adminState.loading ? 'aria-busy="true"' : ""}>${adminState.loading ? `<div class="loading-state admin-loading"><span class="loading-spinner" aria-hidden="true"></span><p>Syncing HetrixTools…</p></div>` : renderTabContent()}</main></div></div></div>`;
  }
  if (adminState.loggedIn && adminState.activeTab === "pages") {
    root.querySelectorAll(".custom-page-row").forEach((row, index) => {
      const page = adminState.customPages[index];
      const summary = row.querySelector("div:nth-child(2) small");
      if (page && summary)
        summary.textContent = `/${page.slug} · ${pageMonitorScopeLabel(page)}`;
    });
    if (adminState.builderOpen && adminState.editingPage) {
      const actions = root.querySelector("#page-builder .builder-heading-actions");
      if (actions && !actions.querySelector('[data-admin-action="close-builder"]'))
        actions.insertAdjacentHTML(
          "beforeend",
          '<button class="text-link" type="button" data-admin-action="close-builder">Close builder</button>',
        );
    }
  }
  bindAdminEvents();
  revealActiveNavigation(".admin-nav", ".admin-nav-item.active");
}

function showBuilderMessage(form, message, error = false) {
  const editor = form?.closest(".builder-editor");
  if (!editor) return;
  editor.parentElement?.querySelector(":scope > .builder-message")?.remove();
  const notice = document.createElement("div");
  notice.className = `builder-message ${error ? "error" : "success"}`;
  notice.setAttribute(error ? "role" : "aria-live", error ? "alert" : "polite");
  notice.textContent = message;
  editor.before(notice);
}

function setBuilderBusy(form, busy) {
  adminState.builderBusy = busy;
  const button = form?.querySelector('button[type="submit"]');
  if (!button) return;
  button.dataset.originalHtml ||= button.innerHTML;
  button.disabled = busy;
  button.setAttribute("aria-busy", String(busy));
  button.innerHTML = busy ? "Saving…" : button.dataset.originalHtml;
}

async function saveCustomPage(form) {
  adminState.builderError = null;
  adminState.builderNotice = null;
  const formData = new FormData(form);
  const values = Object.fromEntries(formData.entries());
  const monitorIds = formData
    .getAll("monitor_ids")
    .map((id) => String(id))
    .filter(Boolean);
  const hiddenMonitorIds = formData
    .getAll("hidden_monitor_ids")
    .map((id) => String(id))
    .filter(Boolean);
  const navPageIds = formData
    .getAll("nav_page_ids")
    .map((id) => String(id))
    .filter(Boolean);
  const monitorOverrides = {};
  for (const monitor of adminState.data?.uptime?.data?.monitors || []) {
    const name = String(
      formData.get(`monitor_name:${monitor.id}`) || "",
    ).trim();
    const category = String(
      formData.get(`monitor_group:${monitor.id}`) || "",
    ).trim();
    const override = { name, category };
    for (const [field, formField] of [
      ["show_target", "target"],
      ["show_status", "status"],
      ["show_uptime", "uptime"],
      ["show_response_time", "response"],
      ["show_uptime_bar", "bar"],
    ]) {
      const selected = String(
        formData.get(`monitor_${formField}:${monitor.id}`) || "inherit",
      );
      if (selected === "show" || selected === "hide")
        override[field] = selected === "show";
    }
    if (Object.keys(override).length > 2 || name || category)
      monitorOverrides[monitor.id] = override;
  }
  const booleanFields = [
    "show_header",
    "show_navigation",
    "show_status_pages",
    "show_admin_link",
    "show_theme_switcher",
    "show_title",
    "show_last_checked",
    "show_overall_status",
    "show_announcement",
    "show_summary",
    "show_monitor_heading",
    "show_group_headings",
    "show_monitor_targets",
    "show_status_text",
    "show_uptime",
    "show_response_time",
    "show_uptime_bar",
    "show_disabled_monitors",
    "show_footer",
    "show_data_provider",
    "hide_from_search",
  ];
  const file = form.querySelector("[name=logo_file]")?.files?.[0];
  const editingSlug = form.dataset.editingSlug;
  const payload = {
    slug: String(values.slug || "")
      .trim()
      .toLowerCase(),
    source_page_id: values.source_page_id,
    monitor_mode: values.monitor_mode,
    monitor_ids: monitorIds,
    hidden_monitor_ids: hiddenMonitorIds,
    nav_page_ids: navPageIds,
    monitor_overrides: monitorOverrides,
    sort_mode: values.sort_mode,
    title: values.title,
    subtitle: values.subtitle,
    brand_name: values.brand_name,
    eyebrow_text: values.eyebrow_text,
    monitor_heading: values.monitor_heading,
    status_nav_label: values.status_nav_label,
    operational_text: values.operational_text,
    incident_text: values.incident_text,
    maintenance_text: values.maintenance_text,
    unavailable_text: values.unavailable_text,
    logo_text: values.logo_text,
    accent_color: values.accent_color,
    background_color: values.background_color,
    surface_color: values.surface_color,
    text_color: values.text_color,
    muted_color: values.muted_color,
    border_color: values.border_color,
    success_color: values.success_color,
    danger_color: values.danger_color,
    light_accent_color: values.light_accent_color,
    light_background_color: values.light_background_color,
    light_surface_color: values.light_surface_color,
    light_text_color: values.light_text_color,
    light_muted_color: values.light_muted_color,
    light_border_color: values.light_border_color,
    light_success_color: values.light_success_color,
    light_danger_color: values.light_danger_color,
    font_family: values.font_family,
    google_font_family: values.google_font_family,
    monitor_style: values.monitor_style,
    theme_mode: values.theme_mode,
    density: values.density,
    locale: values.locale,
    content_width: Number(values.content_width),
    corner_radius: Number(values.corner_radius),
    refresh_interval: Number(values.refresh_interval),
    seo_title: values.seo_title,
    seo_description: values.seo_description,
    custom_css: values.custom_css,
    footer_text: values.footer_text,
  };
  for (const field of booleanFields) payload[field] = formData.has(field);
  const removeLogo = formData.has("remove_logo");
  if (
    file &&
    (!new Set(["image/png", "image/jpeg", "image/webp"]).has(file.type) ||
      file.size <= 0 ||
      file.size > 2_000_000)
  ) {
    adminState.builderError =
      "Choose a valid PNG, JPG, or WEBP logo no larger than 2 MB.";
    showBuilderMessage(form, adminState.builderError, true);
    return;
  }
  if (file && removeLogo) {
    adminState.builderError =
      "Choose either a new logo upload or Remove uploaded logo, not both.";
    showBuilderMessage(form, adminState.builderError, true);
    return;
  }
  setBuilderBusy(form, true);
  let saved;
  try {
    const endpoint = editingSlug
      ? `/api/admin/pages/${encodeURIComponent(editingSlug)}`
      : "/api/admin/pages";
    const response = await fetch(endpoint, {
      method: editingSlug ? "PUT" : "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    saved = parseError(response, await response.text());
  } catch (error) {
    adminState.builderBusy = false;
    adminState.builderError = error.message;
    setBuilderBusy(form, false);
    showBuilderMessage(form, adminState.builderError, true);
    return;
  }

  adminState.editingPage = saved.slug || payload.slug;
  let logoError = null;
  try {
    if (removeLogo) {
      const removeResponse = await fetch(
        `/api/admin/pages/${encodeURIComponent(adminState.editingPage)}/logo`,
        { method: "DELETE", credentials: "same-origin" },
      );
      if (removeResponse.status !== 204)
        parseError(removeResponse, await removeResponse.text());
    } else if (file) {
      const upload = new FormData();
      upload.append("file", file);
      const uploadResponse = await fetch(
        `/api/admin/pages/${encodeURIComponent(adminState.editingPage)}/logo`,
        { method: "POST", credentials: "same-origin", body: upload },
      );
      parseError(uploadResponse, await uploadResponse.text());
    }
  } catch (error) {
    logoError = error.message;
  }
  await loadCustomPages();
  adminState.builderBusy = false;
  adminState.builderOpen = true;
  adminState.builderDirty = false;
  if (logoError) {
    adminState.builderError = `Page settings were saved, but the logo change failed: ${logoError}`;
    adminState.builderNotice = null;
  } else {
    adminState.builderNotice = `Saved /${adminState.editingPage}. The public route is live.`;
    adminState.builderError = null;
  }
  syncAdminLocation();
  renderAdminApp();
}

async function deleteCustomPage(slug) {
  if (
    !(await confirmAdminAction({
      title: `Delete /${slug}?`,
      message:
        "This removes the custom route, its saved settings, and its uploaded logo. HetrixTools monitors are not deleted.",
      confirmLabel: "Delete page",
    }))
  )
    return;
  try {
    const response = await fetch(
      `/api/admin/pages/${encodeURIComponent(slug)}`,
      { method: "DELETE", credentials: "same-origin" },
    );
    parseError(response, await response.text());
    adminState.editingPage = null;
    adminState.builderOpen = false;
    adminState.builderDirty = false;
    await loadCustomPages();
    adminState.builderNotice = `Deleted /${slug}.`;
    syncAdminLocation();
    renderAdminApp();
  } catch (error) {
    adminState.builderError = error.message;
    showBuilderMessage(
      document.querySelector("#page-builder-form"),
      adminState.builderError,
      true,
    );
  }
}

function clearAdminActionMessage() {
  adminState.actionError = null;
  adminState.actionNotice = null;
}

function showAdminMessageInPlace(anchor, message, error = false) {
  const panel = anchor?.closest(".admin-panel");
  if (!panel) return;
  panel.querySelector(":scope > .inline-action-message")?.remove();
  const notice = document.createElement("div");
  notice.className = `admin-action-message inline-action-message ${error ? "error" : "success"}`;
  notice.setAttribute(error ? "role" : "aria-live", error ? "alert" : "polite");
  notice.textContent = message;
  panel.prepend(notice);
}

function setFormBusy(form, busy, busyText = "Saving…") {
  const button = form?.querySelector('button[type="submit"]');
  if (!button) return;
  button.dataset.originalHtml ||= button.innerHTML;
  button.disabled = busy;
  button.setAttribute("aria-busy", String(busy));
  button.innerHTML = busy ? busyText : button.dataset.originalHtml;
}

function confirmAdminAction({ title, message, confirmLabel }) {
  return new Promise((resolve) => {
    document.querySelector(".admin-confirm-backdrop")?.remove();
    const previousFocus = document.activeElement;
    const backdrop = document.createElement("div");
    backdrop.className = "admin-confirm-backdrop";
    backdrop.innerHTML = `<section class="admin-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-confirm-title" aria-describedby="admin-confirm-description"><span class="admin-confirm-mark">${icon("shield")}</span><div><div class="product-eyebrow">Confirmation required</div><h2 id="admin-confirm-title">${escapeHtml(title)}</h2><p id="admin-confirm-description">${escapeHtml(message)}</p></div><div class="admin-confirm-actions"><button class="secondary-action" type="button" data-confirm-cancel>Cancel</button><button class="danger-action" type="button" data-confirm-accept>${escapeHtml(confirmLabel)}</button></div></section>`;
    document.body.appendChild(backdrop);
    const cancel = backdrop.querySelector("[data-confirm-cancel]");
    const accept = backdrop.querySelector("[data-confirm-accept]");
    const focusable = [cancel, accept];
    const close = (accepted) => {
      backdrop.remove();
      previousFocus?.focus?.();
      resolve(accepted);
    };
    cancel.addEventListener("click", () => close(false));
    accept.addEventListener("click", () => close(true));
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) close(false);
    });
    backdrop.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close(false);
        return;
      }
      if (event.key !== "Tab") return;
      const currentIndex = focusable.indexOf(document.activeElement);
      const nextIndex = event.shiftKey
        ? (currentIndex - 1 + focusable.length) % focusable.length
        : (currentIndex + 1) % focusable.length;
      event.preventDefault();
      focusable[nextIndex].focus();
    });
    window.requestAnimationFrame(() => cancel.focus());
  });
}

async function refreshAdminDataset(key, loader) {
  try {
    adminState.data[key] = { data: await loader() };
  } catch (error) {
    adminState.data[key] = { error: error.message };
    throw error;
  }
}

async function createMaintenance(form) {
  clearAdminActionMessage();
  const formData = new FormData(form);
  const monitorId = String(formData.get("monitor_id") || "");
  const startInput = String(formData.get("start") || "");
  const endInput = String(formData.get("end") || "");
  const start = new Date(startInput);
  const end = new Date(endInput);
  if (!startInput || !endInput || Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf())) {
    adminState.actionError = "Choose valid start and end times.";
    showAdminMessageInPlace(form, adminState.actionError, true);
    return;
  }
  if (!monitorId) {
    adminState.actionError = "Choose the monitor that will enter maintenance.";
    showAdminMessageInPlace(form, adminState.actionError, true);
    return;
  }
  if (
    scheduledMaintenances().filter(
      (item) => String(item.monitor_id) === monitorId,
    ).length >= 10
  ) {
    adminState.actionError =
      "This monitor already has 10 scheduled maintenance windows. Remove one before creating another.";
    showAdminMessageInPlace(form, adminState.actionError, true);
    return;
  }
  if (end <= start) {
    adminState.actionError = "Maintenance must end after it starts.";
    showAdminMessageInPlace(form, adminState.actionError, true);
    return;
  }
  const recurring = formData.has("recurring");
  const recurringTime = Number(formData.get("recurring_time") || 0);
  const recurringType = String(formData.get("recurring_time_type") || "week");
  const intervalHours = recurringTime * ({ hour: 1, day: 24, week: 168, month: 720, year: 8760 }[recurringType] || 0);
  if (recurring && (!Number.isInteger(recurringTime) || recurringTime < 1)) {
    adminState.actionError = "Recurring interval must be a whole number of at least 1.";
    showAdminMessageInPlace(form, adminState.actionError, true);
    return;
  }
  if (recurring && intervalHours * 3_600_000 < end - start) {
    adminState.actionError = "Recurring interval cannot be shorter than the maintenance window.";
    showAdminMessageInPlace(form, adminState.actionError, true);
    return;
  }
  const payload = {
    monitor_id: monitorId,
    start: startInput.replace("T", " "),
    end: endInput.replace("T", " "),
    timezone: String(formData.get("timezone") || "UTC").trim(),
    with_notifications: formData.has("with_notifications"),
  };
  if (recurring) {
    payload.recurring_time = recurringTime;
    payload.recurring_time_type = recurringType;
  }
  adminState.actionBusy = true;
  setFormBusy(form, true, "Scheduling…");
  try {
    await requestApi("/schedule-maintenance", "POST", {}, payload);
    await refreshAdminDataset("maintenance", () =>
      requestApiAll("/schedule-maintenance", "scheduled_maintenances"),
    );
    adminState.actionNotice = `Scheduled maintenance for ${monitorDisplayName(payload.monitor_id)}.`;
    adminState.actionBusy = false;
    renderAdminApp();
  } catch (error) {
    adminState.actionError = error.message;
    adminState.actionBusy = false;
    setFormBusy(form, false);
    showAdminMessageInPlace(form, adminState.actionError, true);
  }
}

async function deleteMaintenance(id, monitorName) {
  if (
    !(await confirmAdminAction({
      title: "Remove scheduled maintenance?",
      message: `The maintenance window for ${monitorName} will be removed from HetrixTools.`,
      confirmLabel: "Remove schedule",
    }))
  )
    return;
  clearAdminActionMessage();
  adminState.actionBusy = true;
  try {
    await requestApi(`/schedule-maintenance/${encodeURIComponent(id)}`, "DELETE");
    await refreshAdminDataset("maintenance", () =>
      requestApiAll("/schedule-maintenance", "scheduled_maintenances"),
    );
    adminState.actionNotice = `Removed scheduled maintenance for ${monitorName}.`;
  } catch (error) {
    adminState.actionError = error.message;
  } finally {
    adminState.actionBusy = false;
    renderAdminApp();
  }
}

async function saveStatusPageMonitors(form) {
  clearAdminActionMessage();
  const pageId = form.dataset.pageId;
  const current = new Set(storedMonitorIds(form.dataset.currentIds));
  const selected = new Set(
    new FormData(form).getAll("monitor_ids").map(String).filter(Boolean),
  );
  const added = [...selected].filter((id) => !current.has(id));
  const removed = [...current].filter((id) => !selected.has(id));
  if (!added.length && !removed.length) {
    adminState.actionNotice = "No Status Page monitor changes to save.";
    showAdminMessageInPlace(form, adminState.actionNotice);
    return;
  }
  adminState.actionBusy = true;
  setFormBusy(form, true, "Saving…");
  try {
    if (added.length)
      await requestApi(`/status-pages/${encodeURIComponent(pageId)}/monitors`, "POST", {}, added);
    if (removed.length)
      await requestApi(`/status-pages/${encodeURIComponent(pageId)}/monitors`, "DELETE", {}, removed);
    await refreshAdminDataset("pages", () =>
      requestApiAll("/status-pages", "status_pages"),
    );
    adminState.actionNotice = `Status Page updated: ${added.length} added, ${removed.length} removed.`;
    adminState.actionBusy = false;
    renderAdminApp();
  } catch (error) {
    adminState.actionError = error.message;
    adminState.actionBusy = false;
    setFormBusy(form, false);
    showAdminMessageInPlace(form, adminState.actionError, true);
  }
}

async function loadMonitorDetail(id, query = adminState.monitorDetailQuery) {
  if (adminState.monitorDetailId === String(id) && !adminState.monitorDetailLoading && query === adminState.monitorDetailQuery) {
    adminState.monitorDetailId = null;
    adminState.monitorDetail = null;
    renderAdminApp();
    return;
  }
  clearAdminActionMessage();
  adminState.monitorDetailId = String(id);
  adminState.monitorDetailQuery = query;
  adminState.monitorDetailLoading = true;
  adminState.monitorDetail = null;
  renderAdminApp();
  const path = `/uptime-monitors/${encodeURIComponent(id)}`;
  const reportQuery = query.month
    ? { month: query.month, timezone: query.timezone, hourly_stats: query.hourly }
    : { days: query.days, timezone: query.timezone, hourly_stats: query.hourly };
  const jobs = {
    report: () => requestApi(`${path}/report`, "GET", reportQuery),
    downtimes: () => requestApi(`${path}/downtimes`, "GET", { per_page: 50, page: 1 }),
    location: () => requestApi(`${path}/location-fail-log`, "GET", { minutes: 20 }),
    agent: () => requestApi(`${path}/server-agent`),
  };
  const entries = await Promise.all(
    Object.entries(jobs).map(async ([key, job]) => {
      try {
        return [key, { data: await job() }];
      } catch (error) {
        return [key, { error: error.message }];
      }
    }),
  );
  const detail = Object.fromEntries(entries);
  if (detail.agent?.data?.agent_id) {
    try {
      detail.policies = {
        data: await requestApi(`${path}/server-agent/warning-policies`),
      };
    } catch (error) {
      detail.policies = { error: error.message };
    }
  } else {
    detail.policies = { data: null };
  }
  adminState.monitorDetail = detail;
  adminState.monitorDetailLoading = false;
  renderAdminApp();
}

async function loadBlacklistReport(id, date = "", force = false) {
  if (adminState.blacklistDetailId === String(id) && !force) {
    adminState.blacklistDetailId = null;
    adminState.blacklistDetail = null;
    renderAdminApp();
    return;
  }
  clearAdminActionMessage();
  adminState.blacklistDetailId = String(id);
  adminState.blacklistDetailLoading = true;
  adminState.blacklistDetail = null;
  renderAdminApp();
  try {
    const data = await requestApi(
      `/blacklist-monitors/${encodeURIComponent(id)}/report`,
      "GET",
      date ? { date } : {},
    );
    adminState.blacklistDetail = { data, date };
  } catch (error) {
    adminState.blacklistDetail = { error: error.message, date };
  } finally {
    adminState.blacklistDetailLoading = false;
    renderAdminApp();
  }
}

async function changeServerAgent(id, method) {
  const destructive = method === "DELETE";
  if (
    destructive &&
    !(await confirmAdminAction({
      title: "Detach server agent?",
      message:
        "This permanently deletes the collected server metrics associated with this agent. This action cannot be undone.",
      confirmLabel: "Detach and delete metrics",
    }))
  )
    return;
  clearAdminActionMessage();
  adminState.actionBusy = true;
  renderAdminApp();
  try {
    const result = await requestApi(
      `/uptime-monitors/${encodeURIComponent(id)}/server-agent`,
      method,
    );
    const notice = destructive
      ? "Server agent detached and collected metrics deleted."
      : `Server agent attached${result.agent_id ? `: ${result.agent_id}` : "."}`;
    adminState.actionBusy = false;
    await loadMonitorDetail(id, { ...adminState.monitorDetailQuery });
    adminState.actionNotice = notice;
    renderAdminApp();
  } catch (error) {
    adminState.actionBusy = false;
    adminState.actionError = error.message;
    renderAdminApp();
  }
}

async function saveWarningPolicies(form) {
  clearAdminActionMessage();
  let policies;
  try {
    policies = JSON.parse(new FormData(form).get("policies"));
  } catch {
    adminState.actionError = "Warning policies must be valid JSON.";
    showAdminMessageInPlace(form, adminState.actionError, true);
    return;
  }
  adminState.actionBusy = true;
  setFormBusy(form, true, "Saving policies…");
  try {
    await requestApi(
      `/uptime-monitors/${encodeURIComponent(adminState.monitorDetailId)}/server-agent/warning-policies`,
      "PUT",
      {},
      policies,
    );
    adminState.actionBusy = false;
    await loadMonitorDetail(adminState.monitorDetailId, { ...adminState.monitorDetailQuery });
    adminState.actionNotice = "Server warning policies saved.";
    renderAdminApp();
  } catch (error) {
    adminState.actionBusy = false;
    adminState.actionError = error.message;
    setFormBusy(form, false);
    showAdminMessageInPlace(form, adminState.actionError, true);
  }
}

async function loginAdmin(form) {
  const formData = new FormData(form);
  adminState.username = String(formData.get("username") || "").trim();
  adminState.password = String(formData.get("password") || "");
  adminState.checkingSession = false;
  adminState.loading = true;
  adminState.error = null;
  renderAdminApp();
  try {
    const response = await fetch("/api/admin/login", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: adminState.username,
        password: adminState.password,
      }),
    });
    const data = parseError(response, await response.text());
    adminState.password = "";
    adminState.loggedIn = true;
    adminState.loading = false;
    adminState.error = null;
    await loadAdminData();
  } catch (error) {
    adminState.loading = false;
    adminState.error = error.message;
    renderAdminApp();
    window.requestAnimationFrame(() => {
      const password = document.querySelector("#admin-password");
      password?.focus();
      password?.select();
    });
  }
}

function expireAdminSession() {
  if (!adminState.loggedIn) return;
  adminState.checkingSession = false;
  adminState.loggedIn = false;
  adminState.loading = false;
  adminState.password = "";
  adminState.data = null;
  adminState.customPages = [];
  adminState.customPagesError = null;
  adminState.builderError = null;
  adminState.builderNotice = null;
  adminState.builderOpen = false;
  adminState.builderBusy = false;
  adminState.builderDirty = false;
  adminState.editingPage = null;
  adminState.actionError = null;
  adminState.actionNotice = null;
  adminState.actionBusy = false;
  adminState.managedStatusPageId = null;
  adminState.monitorDetailId = null;
  adminState.monitorDetail = null;
  adminState.blacklistDetailId = null;
  adminState.blacklistDetail = null;
  adminState.error = "Your admin session expired. Sign in again to continue.";
  syncAdminLocation();
  renderAdminApp();
  window.requestAnimationFrame(() => document.querySelector("#admin-password")?.focus());
}

async function logoutAdmin() {
  try {
    await fetch("/api/admin/logout", {
      method: "POST",
      credentials: "same-origin",
    });
  } catch {
    /* local state still needs clearing */
  }
  adminState.checkingSession = false;
  adminState.loggedIn = false;
  adminState.username = "";
  adminState.password = "";
  adminState.data = null;
  adminState.customPages = [];
  adminState.error = null;
  adminState.customPagesError = null;
  adminState.builderError = null;
  adminState.builderNotice = null;
  adminState.builderOpen = false;
  adminState.builderBusy = false;
  adminState.builderDirty = false;
  adminState.editingPage = null;
  adminState.actionError = null;
  adminState.actionNotice = null;
  adminState.actionBusy = false;
  adminState.managedStatusPageId = null;
  adminState.monitorDetailId = null;
  adminState.monitorDetail = null;
  adminState.blacklistDetailId = null;
  adminState.blacklistDetail = null;
  syncAdminLocation();
  renderAdminApp();
}

function applyBuilderPreset(form, preset) {
  const presets = {
    light: {
      theme_mode: "light",
      light_accent_color: "#0ba6c0",
      light_background_color: "#f5f7f9",
      light_surface_color: "#ffffff",
      light_text_color: "#1b252d",
      light_muted_color: "#71808a",
      light_border_color: "#dfe6ea",
      light_success_color: "#0fa978",
      light_danger_color: "#df3157",
      font_family: "wanted",
      monitor_style: "timeline",
      density: "comfortable",
      corner_radius: "10",
    },
    dark: {
      theme_mode: "dark",
      accent_color: "#14b8d4",
      background_color: "#080d11",
      surface_color: "#11171d",
      text_color: "#dce4ea",
      muted_color: "#8f9ba5",
      border_color: "#1c252d",
      success_color: "#20d69b",
      danger_color: "#ff365c",
      font_family: "wanted",
      monitor_style: "timeline",
      density: "comfortable",
      corner_radius: "10",
    },
    minimal: {
      theme_mode: "light",
      light_accent_color: "#1e2923",
      light_background_color: "#ffffff",
      light_surface_color: "#ffffff",
      light_text_color: "#151a17",
      light_muted_color: "#747d77",
      light_border_color: "#d9dfdb",
      light_success_color: "#147c61",
      light_danger_color: "#b34b45",
      font_family: "sans",
      monitor_style: "minimal",
      density: "compact",
      corner_radius: "0",
    },
  };
  const values = presets[preset];
  if (!values) return;
  for (const [name, value] of Object.entries(values)) {
    const field = form.elements.namedItem(name);
    if (field) field.value = value;
  }
  updateBuilderPreview(form);
}

function enhancePageBuilder(form) {
  if (adminState.builderError || adminState.builderNotice) {
    const message = document.createElement("div");
    message.className = `builder-message ${adminState.builderError ? "error" : "success"}`;
    message.setAttribute(
      adminState.builderError ? "role" : "aria-live",
      adminState.builderError ? "alert" : "polite",
    );
    message.textContent = adminState.builderError || adminState.builderNotice;
    document.querySelector(".builder-editor")?.before(message);
  }

  const current =
    adminState.customPages.find(
      (page) => page.slug === adminState.editingPage,
    ) || {};
  const seoSection = [...form.querySelectorAll(".builder-section")].find(
    (section) =>
      section.querySelector("summary b")?.textContent ===
      "SEO, refresh & custom CSS",
  );
  const seoDescription = seoSection?.querySelector("summary small");
  if (seoDescription)
    seoDescription.textContent =
      "Page metadata, indexing, refresh frequency, and complete CSS overrides.";
  const overrides = storedObject(current.monitor_overrides);
  const fontSelect = form.elements.namedItem("font_family");
  if (fontSelect) {
    for (const [value, label] of [
      ["wanted", "Wanted Sans"],
      ["suit", "SUIT"],
      ["pretendard", "Pretendard"],
      ["google", "Google Fonts · custom"],
    ]) {
      if (!fontSelect.querySelector(`option[value="${value}"]`))
        fontSelect.appendChild(new Option(label, value));
    }
    fontSelect.value = current.font_family || "wanted";
    const fontLabel = fontSelect.closest("label");
    const googleField = document.createElement("label");
    googleField.className = "google-font-field";
    googleField.innerHTML =
      '<span>Google font family</span><input name="google_font_family" maxlength="80" placeholder="e.g. Noto Sans KR" /><small>Enter the exact family name from Google Fonts.</small>';
    googleField.querySelector("input").value = current.google_font_family || "";
    fontLabel?.after(googleField);
    const syncGoogleField = () => {
      googleField.hidden = fontSelect.value !== "google";
    };
    fontSelect.addEventListener("change", syncGoogleField);
    syncGoogleField();
  }

  const styleSelect = form.elements.namedItem("monitor_style");
  if (styleSelect) {
    if (!styleSelect.querySelector('option[value="timeline"]'))
      styleSelect.insertBefore(
        new Option("Status timeline", "timeline"),
        styleSelect.firstChild,
      );
    styleSelect.value = current.monitor_style || "timeline";
  }

  const fieldsSection = [...form.querySelectorAll(".builder-section")].find(
    (section) =>
      section.querySelector("summary b")?.textContent ===
      "Sections & monitor fields",
  );
  const fieldsGrid = fieldsSection?.querySelector(".toggle-grid");
  if (fieldsGrid) {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = toggleField(
      "show_uptime_bar",
      "Availability bars",
      "Show the compact uptime indicator beside each monitor.",
      current,
      true,
    );
    fieldsGrid.appendChild(wrapper.firstElementChild);
  }

  form.querySelectorAll(".monitor-customizer-row").forEach((row) => {
    const monitorId = row.querySelector('[name="monitor_ids"]')?.value;
    const fields = row.querySelector(".monitor-override-fields");
    if (!monitorId || !fields) return;
    const monitorName =
      row.querySelector(".monitor-choice-name b")?.textContent?.trim() ||
      "this monitor";
    fields
      .querySelector(`[name="monitor_name:${CSS.escape(monitorId)}"]`)
      ?.setAttribute("aria-label", `Public name for ${monitorName}`);
    fields
      .querySelector(`[name="monitor_group:${CSS.escape(monitorId)}"]`)
      ?.setAttribute("aria-label", `Public group for ${monitorName}`);
    const visibility = document.createElement("div");
    visibility.className = "monitor-field-overrides";
    const override = overrides[monitorId] || {};
    for (const [formField, storedField, label] of [
      ["target", "show_target", "Address / URL"],
      ["status", "show_status", "Status text"],
      ["uptime", "show_uptime", "Uptime badge"],
      ["response", "show_response_time", "Response time"],
      ["bar", "show_uptime_bar", "Availability bars"],
    ]) {
      const item = document.createElement("label");
      item.innerHTML = `<span>${label}</span><select name="monitor_${formField}:${escapeHtml(monitorId)}"><option value="inherit">Page default</option><option value="show">Show</option><option value="hide">Hide</option></select>`;
      const stored = override[storedField];
      item.querySelector("select").value =
        typeof stored === "boolean" ? (stored ? "show" : "hide") : "inherit";
      visibility.appendChild(item);
    }
    fields.appendChild(visibility);
  });

  if (!adminState.editingPage) {
    applyBuilderPreset(form, "dark");
    for (const [name, checked] of [
      ["show_summary", false],
      ["show_monitor_targets", false],
      ["show_status_text", false],
      ["show_response_time", false],
      ["show_uptime", true],
      ["show_uptime_bar", true],
    ]) {
      const field = form.elements.namedItem(name);
      if (field) field.checked = checked;
    }
    form.elements.namedItem("content_width").value = "1120";
    form.elements.namedItem("eyebrow_text").value = "Current status";
    form.elements.namedItem("monitor_heading").value = "Services";
    form.elements.namedItem("incident_text").value =
      "Partially degraded service";
  }

  const palette = form.querySelector(".theme-palette");
  if (palette) {
    const appearanceSection = palette.closest(".builder-section");
    const appearanceBody = palette.closest(".builder-section-body");
    const modeControls = document.createElement("div");
    modeControls.className = "theme-mode-controls";
    modeControls.innerHTML = `<label><span>Default theme</span><select name="theme_mode"><option value="dark">Dark</option><option value="light">Light</option><option value="system">Follow visitor system</option></select><small>Visitors can override this when the switcher is enabled.</small></label>${toggleField("show_theme_switcher", "Theme switcher", "Let visitors switch between the light and dark palettes.", current, true)}`;
    modeControls.querySelector("select").value = current.theme_mode || "dark";
    appearanceBody?.prepend(modeControls);

    const darkDefaults = {
      accent_color: "#14b8d4",
      background_color: "#080d11",
      surface_color: "#11171d",
      text_color: "#dce4ea",
      muted_color: "#8f9ba5",
      border_color: "#1c252d",
      success_color: "#20d69b",
      danger_color: "#ff365c",
    };
    for (const [name, fallback] of Object.entries(darkDefaults)) {
      const field = form.elements.namedItem(name);
      if (field) field.value = current[name] || fallback;
    }
    const darkHeading = document.createElement("div");
    darkHeading.className = "palette-heading";
    darkHeading.innerHTML =
      "<b>Dark palette</b><small>Used in dark mode and as the default visual preset.</small>";
    palette.before(darkHeading);

    const lightPalette = document.createElement("div");
    lightPalette.className = "theme-palette light-theme-palette";
    const lightFields = [
      ["light_accent_color", "Accent", "#0ba6c0"],
      ["light_background_color", "Background", "#f5f7f9"],
      ["light_surface_color", "Surface", "#ffffff"],
      ["light_text_color", "Text", "#1b252d"],
      ["light_muted_color", "Muted", "#71808a"],
      ["light_border_color", "Border", "#dfe6ea"],
      ["light_success_color", "Healthy", "#0fa978"],
      ["light_danger_color", "Incident", "#df3157"],
    ];
    lightPalette.innerHTML = lightFields
      .map(
        ([name, label, fallback]) =>
          `<label><span>${label}</span><input name="${name}" type="color" value="${escapeHtml(current[name] || fallback)}" /></label>`,
      )
      .join("");
    const lightHeading = document.createElement("div");
    lightHeading.className = "palette-heading";
    lightHeading.innerHTML =
      "<b>Light palette</b><small>Independent colors for the light appearance.</small>";
    palette.after(lightHeading, lightPalette);

    const presets = document.createElement("div");
    presets.className = "builder-presets";
    presets.innerHTML =
      '<span>Quick themes</span><button type="button" data-builder-preset="light">Clean light</button><button type="button" data-builder-preset="dark">Slate dark</button><button type="button" data-builder-preset="minimal">Minimal</button>';
    palette.before(presets);
    presets.querySelectorAll("[data-builder-preset]").forEach((button) => {
      button.addEventListener("click", () => {
        applyBuilderPreset(form, button.dataset.builderPreset);
        setBuilderDirty(true);
        updateBuilderPreview(form);
      });
    });
    appearanceSection?.setAttribute("data-theme-builder", "true");
  }

  const updatePreview = () => updateBuilderPreview(form);
  form.querySelectorAll("[data-builder-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.builderAction;
      if (action === "select-all-monitors")
        form
          .querySelectorAll('[name="monitor_ids"]')
          .forEach((field) => (field.checked = true));
      if (action === "clear-selected-monitors")
        form
          .querySelectorAll('[name="monitor_ids"]')
          .forEach((field) => (field.checked = false));
      if (action === "clear-hidden-monitors")
        form
          .querySelectorAll('[name="hidden_monitor_ids"]')
          .forEach((field) => (field.checked = false));
      if (action === "clear-monitor-overrides")
        form
          .querySelectorAll('[name^="monitor_name:"], [name^="monitor_group:"]')
          .forEach((field) => (field.value = ""));
      setBuilderDirty(true);
      updatePreview();
    });
  });

  const search = form.querySelector("[data-builder-monitor-search]");
  search?.addEventListener("input", () => {
    const query = search.value.trim().toLowerCase();
    let visible = 0;
    form.querySelectorAll("[data-monitor-search]").forEach((row) => {
      row.hidden = Boolean(query) && !row.dataset.monitorSearch.includes(query);
      if (!row.hidden) visible += 1;
    });
    const empty = form.querySelector(".monitor-filter-empty");
    if (empty) empty.hidden = visible > 0;
  });
}

function bindAdminEvents() {
  document.querySelectorAll("[data-admin-action]").forEach((element) => {
    element.addEventListener("click", async (event) => {
      event.preventDefault();
      const action = element.dataset.adminAction;
      if (action === "set-tab") {
        const nextTab = element.dataset.tab;
        if (nextTab === adminState.activeTab) {
          element.focus();
          return;
        }
        if (!(await confirmDiscardBuilderChanges())) return;
        if (adminState.activeTab === "pages" && nextTab !== "pages")
          closeBuilderState();
        openAdminTab(nextTab);
        window.requestAnimationFrame(() => {
          const selector = `[data-admin-action="set-tab"][data-tab="${CSS.escape(nextTab)}"]`;
          document.querySelector(selector)?.focus();
        });
      } else if (action === "new-page") {
        if (!(await confirmDiscardBuilderChanges())) return;
        adminState.activeTab = "pages";
        adminState.editingPage = null;
        adminState.builderOpen = true;
        adminState.builderDirty = false;
        adminState.managedStatusPageId = null;
        adminState.customPagesError = null;
        adminState.builderError = null;
        adminState.builderNotice = null;
        syncAdminLocation();
        renderAdminApp();
        window.requestAnimationFrame(() => {
          document.querySelector('#page-builder [name="slug"]')?.focus();
          document.querySelector("#page-builder")?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        });
      } else if (action === "edit-page") {
        if (
          adminState.builderOpen &&
          adminState.editingPage === element.dataset.pageSlug
        ) {
          const heading = document.querySelector("#page-builder h2");
          heading?.setAttribute("tabindex", "-1");
          heading?.focus();
          document.querySelector("#page-builder")?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
          return;
        }
        if (
          adminState.editingPage !== element.dataset.pageSlug &&
          !(await confirmDiscardBuilderChanges())
        )
          return;
        adminState.activeTab = "pages";
        adminState.editingPage = element.dataset.pageSlug;
        adminState.builderOpen = true;
        adminState.builderDirty = false;
        adminState.managedStatusPageId = null;
        adminState.customPagesError = null;
        adminState.builderError = null;
        adminState.builderNotice = null;
        syncAdminLocation();
        renderAdminApp();
        window.requestAnimationFrame(() => {
          const heading = document.querySelector("#page-builder h2");
          heading?.setAttribute("tabindex", "-1");
          heading?.focus();
          document.querySelector("#page-builder")?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        });
      } else if (action === "close-builder") {
        if (!(await confirmDiscardBuilderChanges())) return;
        const closingSlug = adminState.editingPage;
        closeBuilderState();
        syncAdminLocation();
        renderAdminApp();
        window.requestAnimationFrame(() => {
          const selector = closingSlug
            ? `[data-admin-action="edit-page"][data-page-slug="${CSS.escape(closingSlug)}"]`
            : '[data-admin-action="new-page"]';
          document.querySelector(selector)?.focus();
        });
      } else if (action === "delete-page") {
        deleteCustomPage(element.dataset.pageSlug);
      } else if (action === "manage-status-page") {
        if (!(await confirmDiscardBuilderChanges())) return;
        if (adminState.builderOpen) closeBuilderState();
        adminState.managedStatusPageId =
          adminState.managedStatusPageId === element.dataset.pageId
            ? null
            : element.dataset.pageId;
        clearAdminActionMessage();
        syncAdminLocation();
        renderAdminApp();
      } else if (action === "delete-maintenance") {
        deleteMaintenance(
          element.dataset.maintenanceId,
          element.dataset.monitorName || "this monitor",
        );
      } else if (action === "manage-monitor") {
        loadMonitorDetail(element.dataset.monitorId);
      } else if (action === "blacklist-report") {
        loadBlacklistReport(element.dataset.monitorId);
      } else if (action === "attach-agent") {
        changeServerAgent(element.dataset.monitorId, "POST");
      } else if (action === "detach-agent") {
        changeServerAgent(element.dataset.monitorId, "DELETE");
      } else if (action === "refresh") {
        if (!(await confirmDiscardBuilderChanges())) return;
        setBuilderDirty(false);
        loadAdminData(adminDataKeysForTab());
      } else if (action === "logout") {
        if (!(await confirmDiscardBuilderChanges())) return;
        await logoutAdmin();
      }
    });
  });
  document
    .querySelector("#admin-username")
    ?.addEventListener("input", (event) => {
      adminState.username = event.target.value;
    });
  document
    .querySelector("#admin-password")
    ?.addEventListener("input", (event) => {
      adminState.password = event.target.value;
    });
  document
    .querySelector("#admin-auth-form")
    ?.addEventListener("submit", (event) => {
      event.preventDefault();
      loginAdmin(event.currentTarget);
    });
  const builderForm = document.querySelector("#page-builder-form");
  builderForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    saveCustomPage(event.currentTarget);
  });
  builderForm?.addEventListener("input", (event) => {
    if (event.target.matches("[data-builder-monitor-search]")) return;
    setBuilderDirty(true);
    scheduleBuilderPreview(builderForm);
  });
  builderForm?.addEventListener("change", (event) => {
    if (event.target.matches("[data-builder-monitor-search]")) return;
    setBuilderDirty(true);
    scheduleBuilderPreview(builderForm, true);
  });
  if (builderForm) {
    enhancePageBuilder(builderForm);
    updateBuilderPreview(builderForm);
  }
  const maintenanceForm = document.querySelector("#maintenance-form");
  maintenanceForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    createMaintenance(event.currentTarget);
  });
  const recurringToggle = maintenanceForm?.elements.namedItem("recurring");
  const recurringFields = maintenanceForm?.querySelector(
    "[data-recurring-fields]",
  );
  const syncRecurringFields = () => {
    if (!recurringFields || !recurringToggle) return;
    recurringFields.hidden = !recurringToggle.checked;
    recurringFields
      .querySelectorAll("input, select")
      .forEach((field) => (field.disabled = !recurringToggle.checked));
  };
  recurringToggle?.addEventListener("change", syncRecurringFields);
  syncRecurringFields();
  const membershipForm = document.querySelector("#status-page-monitors-form");
  membershipForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      saveStatusPageMonitors(event.currentTarget);
    });
  const syncMembershipState = () => {
    if (!membershipForm) return;
    const current = new Set(storedMonitorIds(membershipForm.dataset.currentIds));
    const selected = new Set(
      new FormData(membershipForm).getAll("monitor_ids").map(String),
    );
    const changed =
      current.size !== selected.size ||
      [...current].some((id) => !selected.has(id));
    const count = membershipForm.querySelector(
      ".membership-editor-heading > span",
    );
    if (count) count.textContent = `${selected.size} selected${changed ? " · unsaved" : ""}`;
    const submit = membershipForm.querySelector('button[type="submit"]');
    if (submit) submit.disabled = !changed;
  };
  membershipForm?.addEventListener("change", syncMembershipState);
  syncMembershipState();
  document
    .querySelector("#monitor-report-form")
    ?.addEventListener("submit", (event) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      loadMonitorDetail(adminState.monitorDetailId, {
        days: Math.min(30, Math.max(1, Number(formData.get("days")) || 30)),
        month: String(formData.get("month") || ""),
        timezone: String(formData.get("timezone") || "+00:00").trim(),
        hourly: formData.has("hourly"),
      });
    });
  document
    .querySelector("#blacklist-report-form")
    ?.addEventListener("submit", (event) => {
      event.preventDefault();
      const date = String(new FormData(event.currentTarget).get("date") || "");
      loadBlacklistReport(adminState.blacklistDetailId, date, true);
    });
  document
    .querySelector("#warning-policies-form")
    ?.addEventListener("submit", (event) => {
      event.preventDefault();
      saveWarningPolicies(event.currentTarget);
    });
}

async function mountAdmin() {
  const parameters = new URLSearchParams(window.location.search);
  const requestedTab = parameters.get("tab");
  const requestedPage = parameters.get("page");
  const requestedMode = parameters.get("mode");
  const requestedSource = parameters.get("source");
  if (ADMIN_TABS.has(requestedTab)) adminState.activeTab = requestedTab;
  if (requestedPage !== null) {
    adminState.activeTab = "pages";
    adminState.editingPage = requestedPage || null;
    adminState.builderOpen = true;
  } else if (requestedMode === "new") {
    adminState.activeTab = "pages";
    adminState.editingPage = null;
    adminState.builderOpen = true;
  }
  if (requestedSource) {
    adminState.activeTab = "pages";
    adminState.requestedSourceSlug = slugify(requestedSource);
  }
  adminState.checkingSession = true;
  renderAdminApp();
  const [configuration, session] = await Promise.all([
    fetch("/api/config", { credentials: "same-origin" })
      .then(async (response) => (response.ok ? response.json() : null))
      .catch(() => null),
    fetch("/api/admin/session", { credentials: "same-origin" })
      .then(async (response) => (response.ok ? response.json() : null))
      .catch(() => null),
  ]);
  adminState.loginConfigured = configuration
    ? Boolean(configuration.adminLoginConfigured)
    : null;
  adminState.checkingSession = false;
  if (session?.authenticated) {
    adminState.loggedIn = true;
    adminState.username = session.username || "";
    await loadAdminData();
    return;
  }
  adminState.loggedIn = false;
  renderAdminApp();
}

export function mountProductApp() {
  if (
    window.location.pathname === "/admin/api" ||
    window.location.pathname === "/admin/api/"
  ) {
    window.location.replace("/admin");
    return;
  }
  if (
    window.location.pathname === "/admin" ||
    window.location.pathname === "/admin/"
  )
    mountAdmin();
  else {
    renderPublicApp();
    if (!publicThemeMediaBound && window.matchMedia) {
      publicThemeMediaBound = true;
      window
        .matchMedia("(prefers-color-scheme: light)")
        .addEventListener?.("change", () => {
          if (publicState.data?.customization?.theme_mode === "system")
            renderPublicApp();
        });
    }
    Promise.all([
      fetchPublicStatus(false, false),
      fetchPublicSession(false),
    ]).finally(() => renderPublicApp());
  }
}
