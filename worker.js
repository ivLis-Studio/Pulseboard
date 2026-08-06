const API_ORIGIN = "https://api.hetrixtools.com/v3";
const ALLOWED_METHODS = new Set(["GET", "POST", "PUT", "DELETE"]);
const CONFIG_KEY = "status-pages";
const SESSION_COOKIE = "pulseboard_session";
const SESSION_TTL = 60 * 60 * 24;

function corsHeaders(request) {
  const origin = request.headers.get("Origin");
  const headers = new Headers({
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
  });

  if (origin && origin === new URL(request.url).origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Credentials", "true");
  }
  if (origin) headers.set("Vary", "Origin");
  return headers;
}

function jsonResponse(payload, status, request) {
  const headers = corsHeaders(request);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(payload), { status, headers });
}

function isSafeApiPath(path) {
  return (
    typeof path === "string" &&
    path.startsWith("/") &&
    !path.includes("..") &&
    !path.includes("//")
  );
}

function managedApiKey(env) {
  return env.HETRIXTOOLS_API_KEY || "";
}

function hasAdminConfig(env) {
  return Boolean(
    env.ADMIN_USERNAME && env.ADMIN_PASSWORD && env.DASHBOARD_SESSION_SECRET,
  );
}

function runtimeConfig(env, request) {
  return jsonResponse(
    {
      adminLoginConfigured: hasAdminConfig(env),
      hetrixToolsConfigured: Boolean(managedApiKey(env)),
      configStorageConfigured: Boolean(env.CONFIG),
      logoStorageConfigured: Boolean(env.LOGOS),
    },
    200,
    request,
  );
}

function slugify(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

async function upstreamJson(path, token) {
  const response = await fetch(`${API_ORIGIN}${path}`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
  });
  const raw = await response.text();
  let data = raw;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    /* keep text */
  }
  if (!response.ok) {
    const error = new Error(
      data?.message ||
        data?.error ||
        `HetrixTools returned HTTP ${response.status}.`,
    );
    error.status = response.status;
    throw error;
  }
  return { data, response };
}

async function upstreamCollection(path, collectionKey, token, query = {}) {
  const loadPage = (page) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries({
      ...query,
      per_page: 200,
      page,
    })) {
      if (value !== undefined && value !== null && value !== "")
        search.set(key, String(value));
    }
    return upstreamJson(`${path}?${search.toString()}`, token);
  };
  const first = await loadPage(1);
  const items = [...(first.data?.[collectionKey] || [])];
  const pagination = first.data?.meta?.pagination || first.data?.meta || {};
  const lastPage = Math.min(
    100,
    Math.max(
      1,
      Number(
        pagination.last || pagination.last_page || pagination.total_pages,
      ) || 1,
    ),
  );
  for (let page = 2; page <= lastPage; page += 1) {
    const next = await loadPage(page);
    items.push(...(next.data?.[collectionKey] || []));
  }
  return { ...(first.data || {}), [collectionKey]: items };
}

function publicPageConfig(env) {
  try {
    const value = env.STATUS_PAGE_SLUGS || "{}";
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function listCustomPages(env) {
  if (!env.CONFIG) return [];
  const raw = await env.CONFIG.get(CONFIG_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.sort(
          (a, b) => Number(b.updated_at || 0) - Number(a.updated_at || 0),
        )
      : [];
  } catch {
    return [];
  }
}

async function loadCustomPage(env, slug) {
  return (
    (await listCustomPages(env)).find((page) => page.slug === slug) || null
  );
}

async function saveCustomPages(env, pages) {
  if (!env.CONFIG) return;
  await env.CONFIG.put(CONFIG_KEY, JSON.stringify(pages));
}

function base64UrlEncode(value) {
  const bytes =
    typeof value === "string"
      ? new TextEncoder().encode(value)
      : new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(value) {
  const padded =
    value.replace(/-/g, "+").replace(/_/g, "/") +
    "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function signSession(payload, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return base64UrlEncode(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)),
  );
}

async function sessionToken(env, username) {
  const payload = base64UrlEncode(
    JSON.stringify({
      username,
      exp: Math.floor(Date.now() / 1000) + SESSION_TTL,
    }),
  );
  return `${payload}.${await signSession(payload, env.DASHBOARD_SESSION_SECRET)}`;
}

function cookies(request) {
  return Object.fromEntries(
    (request.headers.get("Cookie") || "")
      .split(";")
      .map((part) => part.trim().split("="))
      .filter(([key, value]) => key && value)
      .map(([key, ...value]) => [key, value.join("=")]),
  );
}

function sameBytes(left, right) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1)
    mismatch |= left[index] ^ right[index];
  return mismatch === 0;
}

async function sessionUser(request, env) {
  if (!env.DASHBOARD_SESSION_SECRET) return null;
  const token = cookies(request)[SESSION_COOKIE] || "";
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return null;
  try {
    const expected = base64UrlDecode(
      await signSession(encodedPayload, env.DASHBOARD_SESSION_SECRET),
    );
    if (!sameBytes(expected, base64UrlDecode(signature))) return null;
    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlDecode(encodedPayload)),
    );
    if (
      !payload?.username ||
      Number(payload.exp) <= Math.floor(Date.now() / 1000)
    )
      return null;
    return { username: payload.username };
  } catch {
    return null;
  }
}

async function isAdminRequest(request, env) {
  return Boolean(await sessionUser(request, env));
}

function sessionCookie(request, value, maxAge = SESSION_TTL) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${value}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

function isCrossOriginWrite(request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return false;
  const origin = request.headers.get("Origin");
  return Boolean(origin && origin !== new URL(request.url).origin);
}

async function readLogoUpload(file) {
  const allowed = new Set(["image/png", "image/jpeg", "image/webp"]);
  if (!allowed.has(file.type) || file.size <= 0 || file.size > 2_000_000)
    return null;
  const data = await file.arrayBuffer();
  const bytes = new Uint8Array(data);
  const ascii = (start, end) =>
    String.fromCharCode(...bytes.slice(start, end));
  const validPng =
    file.type === "image/png" &&
    bytes.length >= 8 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every(
      (value, index) => bytes[index] === value,
    );
  const validJpeg =
    file.type === "image/jpeg" &&
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff;
  const validWebp =
    file.type === "image/webp" &&
    bytes.length >= 12 &&
    ascii(0, 4) === "RIFF" &&
    ascii(8, 12) === "WEBP";
  return validPng || validJpeg || validWebp
    ? { data, contentType: file.type }
    : null;
}

async function adminLogin(request, env) {
  if (request.method !== "POST")
    return jsonResponse(
      { status: "error", message: "Use POST to sign in." },
      405,
      request,
    );
  if (!hasAdminConfig(env))
    return jsonResponse(
      {
        status: "error",
        message:
          "Admin credentials are not configured. Set ADMIN_USERNAME, ADMIN_PASSWORD, and DASHBOARD_SESSION_SECRET.",
      },
      503,
      request,
    );
  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse(
      { status: "error", message: "Body must be valid JSON." },
      400,
      request,
    );
  }
  const username = String(payload?.username || "");
  const password = String(payload?.password || "");
  if (username !== env.ADMIN_USERNAME || password !== env.ADMIN_PASSWORD)
    return jsonResponse(
      { status: "error", message: "Invalid username or password." },
      401,
      request,
    );
  const response = jsonResponse({ status: "ok", username }, 200, request);
  response.headers.set(
    "Set-Cookie",
    sessionCookie(request, await sessionToken(env, username)),
  );
  return response;
}

async function adminSession(request, env) {
  const user = await sessionUser(request, env);
  return jsonResponse(
    user
      ? { authenticated: true, username: user.username }
      : { authenticated: false },
    200,
    request,
  );
}

async function adminLogout(request, env) {
  const response = jsonResponse({ status: "ok" }, 200, request);
  response.headers.set("Set-Cookie", sessionCookie(request, "", 0));
  return response;
}

function validHex(value, fallback) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
    ? value
    : fallback;
}

function parseMonitorIds(value) {
  try {
    const parsed = Array.isArray(value) ? value : JSON.parse(value || "[]");
    return Array.isArray(parsed)
      ? parsed
          .map((id) => String(id).trim())
          .filter(Boolean)
          .slice(0, 1024)
      : [];
  } catch {
    return [];
  }
}

function booleanValue(value, fallback = true) {
  if (value === undefined || value === null || value === "") return fallback;
  return (
    value === true ||
    value === 1 ||
    value === "1" ||
    value === "true" ||
    value === "on"
  );
}

function enumValue(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function integerValue(value, minimum, maximum, fallback) {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.min(maximum, Math.max(minimum, Math.round(number)))
    : fallback;
}

function parseMonitorOverrides(value) {
  try {
    const parsed =
      value && typeof value === "object" && !Array.isArray(value)
        ? value
        : JSON.parse(value || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return {};
    return Object.fromEntries(
      Object.entries(parsed)
        .slice(0, 1024)
        .map(([id, override]) => {
          const normalized = {
            name: String(override?.name || "").slice(0, 120),
            category: String(override?.category || "").slice(0, 80),
          };
          for (const field of [
            "show_target",
            "show_status",
            "show_uptime",
            "show_response_time",
            "show_uptime_bar",
          ]) {
            if (typeof override?.[field] === "boolean")
              normalized[field] = override[field];
          }
          return [String(id).slice(0, 160), normalized];
        }),
    );
  } catch {
    return {};
  }
}

function publicCustomization(page) {
  const values = page || {};
  return {
    slug: values.slug,
    title: values.title,
    subtitle: values.subtitle || "",
    brand_name: values.brand_name || "Pulseboard",
    eyebrow_text: values.eyebrow_text || "Current status",
    monitor_heading: values.monitor_heading || "Services",
    status_nav_label: values.status_nav_label || "Status",
    operational_text: values.operational_text || "All systems operational",
    incident_text: values.incident_text || "Partially degraded service",
    maintenance_text: values.maintenance_text || "Scheduled maintenance in progress",
    unavailable_text: values.unavailable_text || "Status information is incomplete",
    footer_text: values.footer_text || "Powered by Pulseboard",
    logo_text: values.logo_text || "",
    logo_url: values.logo_key
      ? `/assets/logo/${encodeURIComponent(values.slug)}?v=${Number(values.updated_at || 0)}`
      : null,
    monitor_mode: enumValue(
      values.monitor_mode,
      ["source", "all", "selected"],
      page
        ? values.source_page_id
          ? "source"
          : parseMonitorIds(values.monitor_ids).length
            ? "selected"
            : "all"
        : "source",
    ),
    monitor_ids: parseMonitorIds(values.monitor_ids),
    hidden_monitor_ids: parseMonitorIds(values.hidden_monitor_ids),
    nav_page_ids: parseMonitorIds(values.nav_page_ids),
    monitor_overrides: parseMonitorOverrides(values.monitor_overrides),
    sort_mode: enumValue(values.sort_mode, ["api", "name", "status"], "api"),
    locale: enumValue(values.locale, ["en", "ko"], "en"),
    density: enumValue(
      values.density,
      ["comfortable", "compact"],
      "comfortable",
    ),
    monitor_style: enumValue(
      values.monitor_style,
      ["timeline", "cards", "rows", "minimal"],
      "timeline",
    ),
    font_family: enumValue(
      values.font_family,
      ["sans", "serif", "mono", "wanted", "suit", "pretendard", "google"],
      "wanted",
    ),
    google_font_family: String(values.google_font_family || "")
      .replace(/[^\p{L}\p{N} _-]/gu, "")
      .slice(0, 80),
    theme_mode: enumValue(values.theme_mode, ["dark", "light", "system"], "dark"),
    refresh_interval: [0, 30, 60, 120, 300].includes(
      Number(values.refresh_interval),
    )
      ? Number(values.refresh_interval)
      : 60,
    content_width: integerValue(values.content_width, 680, 1400, 1120),
    corner_radius: integerValue(values.corner_radius, 0, 24, 10),
    accent_color: validHex(values.accent_color, "#14b8d4"),
    background_color: validHex(values.background_color, "#080d11"),
    surface_color: validHex(values.surface_color, "#11171d"),
    text_color: validHex(values.text_color, "#dce4ea"),
    muted_color: validHex(values.muted_color, "#8f9ba5"),
    border_color: validHex(values.border_color, "#1c252d"),
    success_color: validHex(values.success_color, "#20d69b"),
    danger_color: validHex(values.danger_color, "#ff365c"),
    light_accent_color: validHex(values.light_accent_color, "#0ba6c0"),
    light_background_color: validHex(values.light_background_color, "#f5f7f9"),
    light_surface_color: validHex(values.light_surface_color, "#ffffff"),
    light_text_color: validHex(values.light_text_color, "#1b252d"),
    light_muted_color: validHex(values.light_muted_color, "#71808a"),
    light_border_color: validHex(values.light_border_color, "#dfe6ea"),
    light_success_color: validHex(values.light_success_color, "#0fa978"),
    light_danger_color: validHex(values.light_danger_color, "#df3157"),
    show_header: booleanValue(values.show_header, true),
    show_navigation: booleanValue(values.show_navigation, true),
    show_status_pages: booleanValue(values.show_status_pages, true),
    show_admin_link: booleanValue(values.show_admin_link, false),
    show_theme_switcher: booleanValue(values.show_theme_switcher, true),
    show_title: booleanValue(values.show_title, true),
    show_last_checked: booleanValue(values.show_last_checked, true),
    show_overall_status: booleanValue(values.show_overall_status, true),
    show_announcement: booleanValue(values.show_announcement, true),
    show_summary: booleanValue(values.show_summary, false),
    show_monitor_heading: booleanValue(values.show_monitor_heading, true),
    show_group_headings: booleanValue(values.show_group_headings, true),
    show_monitor_targets: booleanValue(values.show_monitor_targets, false),
    show_status_text: booleanValue(values.show_status_text, false),
    show_uptime: booleanValue(values.show_uptime, true),
    show_response_time: booleanValue(values.show_response_time, false),
    show_uptime_bar: booleanValue(values.show_uptime_bar, true),
    show_disabled_monitors: booleanValue(values.show_disabled_monitors, false),
    show_footer: booleanValue(values.show_footer, true),
    show_data_provider: booleanValue(values.show_data_provider, true),
    hide_from_search: booleanValue(values.hide_from_search, false),
    seo_title: String(values.seo_title || "").slice(0, 120),
    seo_description: String(values.seo_description || "").slice(0, 240),
    custom_css: String(values.custom_css || "").slice(0, 20000),
  };
}

async function customPagesApi(request, env, url) {
  if (!(await isAdminRequest(request, env)))
    return jsonResponse(
      { status: "error", message: "Admin session required." },
      401,
      request,
    );
  if (!env.CONFIG)
    return jsonResponse(
      {
        status: "error",
        message:
          "KV config storage is not configured. Add the CONFIG binding before using the page builder.",
      },
      503,
      request,
    );

  const parts = url.pathname.split("/").filter(Boolean);
  const slug = parts[3] ? decodeURIComponent(parts[3]) : "";
  const isLogo = parts[4] === "logo";

  if (isLogo) {
    if (!slug)
      return jsonResponse(
        { status: "error", message: "A page slug is required." },
        400,
        request,
      );
    const pages = await listCustomPages(env);
    const page = pages.find((candidate) => candidate.slug === slug);
    if (!page)
      return jsonResponse(
        { status: "error", message: "Custom status page not found." },
        404,
        request,
      );
    if (request.method === "DELETE") {
      if (env.LOGOS) await env.LOGOS.delete(`status-pages/${slug}/logo`);
      page.logo_key = null;
      page.updated_at = Date.now();
      await saveCustomPages(env, pages);
      await purgePublicStatusCache(request, slug);
      return new Response(null, {
        status: 204,
        headers: corsHeaders(request),
      });
    }
    if (request.method !== "POST")
      return jsonResponse(
        { status: "error", message: "Use POST to upload or DELETE to remove a logo." },
        405,
        request,
      );
    if (!env.LOGOS)
      return jsonResponse(
        {
          status: "error",
          message:
            "R2 is not configured. Add the LOGOS bucket binding before uploading images.",
        },
        503,
        request,
      );
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File))
      return jsonResponse(
        {
          status: "error",
          message: "An image file is required.",
        },
        400,
        request,
      );
    const upload = await readLogoUpload(file);
    if (!upload)
      return jsonResponse(
        {
          status: "error",
          message: "Upload a valid PNG, JPG, or WEBP image up to 2 MB.",
        },
        400,
        request,
      );
    const key = `status-pages/${slug}/logo`;
    await env.LOGOS.put(key, upload.data, {
      httpMetadata: {
        contentType: upload.contentType,
        cacheControl: "public, max-age=86400",
      },
    });
    page.logo_key = key;
    page.updated_at = Date.now();
    await saveCustomPages(env, pages);
    await purgePublicStatusCache(request, slug);
    return jsonResponse(
      { status: "ok", logo_url: `/assets/logo/${encodeURIComponent(slug)}` },
      200,
      request,
    );
  }

  if (request.method === "GET" && !slug)
    return jsonResponse(
      { status_pages: await listCustomPages(env) },
      200,
      request,
    );
  if (request.method === "GET" && slug) {
    const page = await loadCustomPage(env, slug);
    return page
      ? jsonResponse(page, 200, request)
      : jsonResponse(
          { status: "error", message: "Custom status page not found." },
          404,
          request,
        );
  }

  if (request.method === "DELETE") {
    if (!slug)
      return jsonResponse(
        { status: "error", message: "A page slug is required." },
        400,
        request,
      );
    if (env.LOGOS) await env.LOGOS.delete(`status-pages/${slug}/logo`);
    await saveCustomPages(
      env,
      (await listCustomPages(env)).filter((page) => page.slug !== slug),
    );
    await purgePublicStatusCache(request, slug);
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse(
      { status: "error", message: "Body must be valid JSON." },
      400,
      request,
    );
  }
  const requestedSlug = String(payload.slug || slug || "")
    .trim()
    .toLowerCase();
  const sourcePageId = String(payload.source_page_id || "").trim();
  const monitorIds = parseMonitorIds(payload.monitor_ids);
  const hiddenMonitorIds = parseMonitorIds(payload.hidden_monitor_ids);
  const navPageIds = parseMonitorIds(payload.nav_page_ids);
  const monitorMode = enumValue(
    payload.monitor_mode,
    ["source", "all", "selected"],
    sourcePageId ? "source" : monitorIds.length ? "selected" : "all",
  );
  const monitorOverrides = parseMonitorOverrides(payload.monitor_overrides);
  const title = String(payload.title || "").trim();
  if (!/^[a-z0-9][a-z0-9-]{0,48}$/.test(requestedSlug) || !title)
    return jsonResponse(
      {
        status: "error",
        message:
          "slug and title are required. Slugs use lowercase letters, numbers, and hyphens.",
      },
      400,
      request,
    );
  if (monitorMode === "source" && !sourcePageId)
    return jsonResponse(
      {
        status: "error",
        message:
          "Choose a HetrixTools Status Page when monitor mode is Source page.",
      },
      400,
      request,
    );
  if (monitorMode === "selected" && !monitorIds.length)
    return jsonResponse(
      {
        status: "error",
        message:
          "Select at least one Uptime Monitor when monitor mode is Selected monitors.",
      },
      400,
      request,
    );
  const values = {
    slug: requestedSlug,
    source_page_id: sourcePageId,
    monitor_mode: monitorMode,
    monitor_ids: JSON.stringify(monitorIds),
    hidden_monitor_ids: JSON.stringify(hiddenMonitorIds),
    nav_page_ids: JSON.stringify(navPageIds),
    monitor_overrides: JSON.stringify(monitorOverrides),
    sort_mode: enumValue(payload.sort_mode, ["api", "name", "status"], "api"),
    title: title.slice(0, 120),
    subtitle: String(payload.subtitle || "").slice(0, 240),
    brand_name: String(payload.brand_name || "Pulseboard").slice(0, 80),
    eyebrow_text: String(payload.eyebrow_text || "Current status").slice(0, 80),
    monitor_heading: String(payload.monitor_heading || "Services").slice(
      0,
      100,
    ),
    status_nav_label: String(payload.status_nav_label || "Status").slice(0, 40),
    operational_text: String(
      payload.operational_text || "All systems operational",
    ).slice(0, 120),
    incident_text: String(
      payload.incident_text || "Partially degraded service",
    ).slice(0, 120),
    maintenance_text: String(
      payload.maintenance_text || "Scheduled maintenance in progress",
    ).slice(0, 120),
    unavailable_text: String(
      payload.unavailable_text || "Status information is incomplete",
    ).slice(0, 120),
    logo_text: String(payload.logo_text || "").slice(0, 4),
    accent_color: validHex(payload.accent_color, "#14b8d4"),
    background_color: validHex(payload.background_color, "#080d11"),
    surface_color: validHex(payload.surface_color, "#11171d"),
    text_color: validHex(payload.text_color, "#dce4ea"),
    muted_color: validHex(payload.muted_color, "#8f9ba5"),
    border_color: validHex(payload.border_color, "#1c252d"),
    success_color: validHex(payload.success_color, "#20d69b"),
    danger_color: validHex(payload.danger_color, "#ff365c"),
    light_accent_color: validHex(payload.light_accent_color, "#0ba6c0"),
    light_background_color: validHex(
      payload.light_background_color,
      "#f5f7f9",
    ),
    light_surface_color: validHex(payload.light_surface_color, "#ffffff"),
    light_text_color: validHex(payload.light_text_color, "#1b252d"),
    light_muted_color: validHex(payload.light_muted_color, "#71808a"),
    light_border_color: validHex(payload.light_border_color, "#dfe6ea"),
    light_success_color: validHex(payload.light_success_color, "#0fa978"),
    light_danger_color: validHex(payload.light_danger_color, "#df3157"),
    font_family: enumValue(
      payload.font_family,
      ["sans", "serif", "mono", "wanted", "suit", "pretendard", "google"],
      "wanted",
    ),
    google_font_family: String(payload.google_font_family || "")
      .replace(/[^\p{L}\p{N} _-]/gu, "")
      .slice(0, 80),
    density: enumValue(
      payload.density,
      ["comfortable", "compact"],
      "comfortable",
    ),
    monitor_style: enumValue(
      payload.monitor_style,
      ["timeline", "cards", "rows", "minimal"],
      "timeline",
    ),
    theme_mode: enumValue(
      payload.theme_mode,
      ["dark", "light", "system"],
      "dark",
    ),
    locale: enumValue(payload.locale, ["en", "ko"], "en"),
    content_width: integerValue(payload.content_width, 680, 1400, 1120),
    corner_radius: integerValue(payload.corner_radius, 0, 24, 10),
    refresh_interval: [0, 30, 60, 120, 300].includes(
      Number(payload.refresh_interval),
    )
      ? Number(payload.refresh_interval)
      : 60,
    show_header: booleanValue(payload.show_header, true),
    show_navigation: booleanValue(payload.show_navigation, true),
    show_status_pages: booleanValue(payload.show_status_pages, true),
    show_admin_link: booleanValue(payload.show_admin_link, false),
    show_theme_switcher: booleanValue(payload.show_theme_switcher, true),
    show_title: booleanValue(payload.show_title, true),
    show_last_checked: booleanValue(payload.show_last_checked, true),
    show_overall_status: booleanValue(payload.show_overall_status, true),
    show_announcement: booleanValue(payload.show_announcement, true),
    show_summary: booleanValue(payload.show_summary, false),
    show_monitor_heading: booleanValue(payload.show_monitor_heading, true),
    show_group_headings: booleanValue(payload.show_group_headings, true),
    show_monitor_targets: booleanValue(payload.show_monitor_targets, false),
    show_status_text: booleanValue(payload.show_status_text, false),
    show_uptime: booleanValue(payload.show_uptime, true),
    show_response_time: booleanValue(payload.show_response_time, false),
    show_uptime_bar: booleanValue(payload.show_uptime_bar, true),
    show_disabled_monitors: booleanValue(payload.show_disabled_monitors, false),
    show_footer: booleanValue(payload.show_footer, true),
    show_data_provider: booleanValue(payload.show_data_provider, true),
    hide_from_search: booleanValue(payload.hide_from_search, false),
    seo_title: String(payload.seo_title || "").slice(0, 120),
    seo_description: String(payload.seo_description || "").slice(0, 240),
    custom_css: String(payload.custom_css || "").slice(0, 20000),
    footer_text: String(payload.footer_text || "Powered by Pulseboard").slice(
      0,
      180,
    ),
    logo_key: null,
    updated_at: Date.now(),
  };

  if (request.method === "POST") {
    const pages = await listCustomPages(env);
    if (pages.some((page) => page.slug === values.slug))
      return jsonResponse(
        {
          status: "error",
          message: "A custom page with that slug already exists.",
        },
        409,
        request,
      );
    await saveCustomPages(env, [values, ...pages]);
    await purgePublicStatusCache(request, values.slug);
    return jsonResponse(values, 201, request);
  }
  if ((request.method === "PUT" || request.method === "DELETE") && !slug)
    return jsonResponse(
      { status: "error", message: "A page slug is required." },
      400,
      request,
    );
  if (request.method === "PUT") {
    const pages = await listCustomPages(env);
    const index = pages.findIndex((page) => page.slug === slug);
    if (index === -1)
      return jsonResponse(
        { status: "error", message: "Custom status page not found." },
        404,
        request,
      );
    values.slug = slug;
    values.logo_key = pages[index].logo_key || null;
    pages[index] = values;
    await saveCustomPages(env, pages);
    await purgePublicStatusCache(request, slug);
    return jsonResponse(values, 200, request);
  }
  return jsonResponse(
    { status: "error", message: "Unsupported page operation." },
    405,
    request,
  );
}

async function logoAsset(request, env, url) {
  if (!env.LOGOS)
    return new Response("Logo storage is not configured.", { status: 404 });
  const slug = decodeURIComponent(
    url.pathname.split("/").filter(Boolean)[2] || "",
  );
  const object = await env.LOGOS.get(`status-pages/${slug}/logo`);
  if (!object) return new Response("Not found", { status: 404 });
  const headers = new Headers(object.httpMetadata || {});
  headers.set("Cache-Control", "public, max-age=86400");
  headers.set("Content-Security-Policy", "default-src 'none'; sandbox");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(object.body, { headers });
}

async function publicStatus(request, env) {
  const token = managedApiKey(env);
  if (!token)
    return jsonResponse(
      {
        status: "error",
        message:
          "Public status pages are not configured. Add HETRIXTOOLS_API_KEY as a Worker secret.",
      },
      503,
      request,
    );

  const url = new URL(request.url);
  const requestedSlug =
    slugify(url.searchParams.get("slug") || "default") || "default";
  try {
    const pagesResponse = await upstreamCollection(
      "/status-pages",
      "status_pages",
      token,
    );
    const pages = pagesResponse.status_pages || [];
    const customPages = await listCustomPages(env);
    const customPage =
      customPages.find((candidate) => candidate.slug === requestedSlug) || null;
    let customization = publicCustomization(customPage);
    const customMonitorIds = customization?.monitor_ids || [];
    const hiddenMonitorIds = new Set(customization?.hidden_monitor_ids || []);
    const slugMap = publicPageConfig(env);
    const configuredId =
      customPage?.source_page_id ||
      slugMap[requestedSlug] ||
      (requestedSlug === "default" ? env.STATUS_PAGE_DEFAULT_ID : "");
    let page;
    if (customPage) {
      const sourcePage = pages.find(
        (candidate) => configuredId && candidate.id === configuredId,
      );
      page =
        customization.monitor_mode === "source"
          ? sourcePage
          : sourcePage || {
              id: customPage.slug,
              name: customPage.title,
              type: "uptime",
              monitors: null,
            };
    } else {
      page =
        pages.find(
          (candidate) => configuredId && candidate.id === configuredId,
        ) ||
        pages.find((candidate) => slugify(candidate.name) === requestedSlug) ||
        (requestedSlug === "default"
          ? pages.find((candidate) => candidate.type === "uptime") ||
            pages[0] || {
              id: "default",
              name: "All systems",
              type: "uptime",
              monitors: null,
            }
          : null);
    }

    if (!page)
      return jsonResponse(
        {
          status: "error",
          message: `Status page not found for /${requestedSlug}.`,
        },
        404,
        request,
      );

    const monitorMode = customization?.monitor_mode || "source";
    const monitorIdSet = new Set(
      (monitorMode === "selected" ? customMonitorIds : page.monitors || []).map(
        (id) => String(id?.id || id),
      ),
    );
    const filterToPage =
      monitorMode === "selected" ||
      (monitorMode === "source" && Array.isArray(page.monitors));
    const collectionIsBlacklist =
      monitorMode === "source" && page.type === "blacklist";
    if (collectionIsBlacklist)
      customization = {
        ...customization,
        show_status_text: true,
        show_uptime: false,
        show_response_time: false,
        show_uptime_bar: false,
      };
    const collectionPath = collectionIsBlacklist
      ? "/blacklist-monitors"
      : "/uptime-monitors";
    const monitorsResponse = await upstreamCollection(
      collectionPath,
      "monitors",
      token,
    );
    const overrides = customization?.monitor_overrides || {};
    const monitors = (monitorsResponse.monitors || [])
      .filter(
        (monitor) => !filterToPage || monitorIdSet.has(String(monitor.id)),
      )
      .filter((monitor) => !hiddenMonitorIds.has(String(monitor.id)))
      .filter(
        (monitor) =>
          customization?.show_disabled_monitors !== false ||
          monitor.monitor_status !== "disabled",
      )
      .map((monitor) => {
        const override = overrides[monitor.id] || {};
        const showTarget =
          typeof override.show_target === "boolean"
            ? override.show_target
            : customization.show_monitor_targets !== false;
        const status = collectionIsBlacklist
          ? (monitor.listed || []).length
            ? "down"
            : "up"
          : String(monitor.monitor_status || "").startsWith("maint")
            ? "maintenance"
            : monitor.monitor_status === "disabled"
              ? "disabled"
              : monitor.uptime_status || "unknown";
        return {
          id: monitor.id,
          name: override.name || monitor.name || null,
          type: monitor.type,
          target: showTarget ? (monitor.target ?? null) : null,
          status,
          monitor_status: monitor.monitor_status,
          uptime: monitor.uptime ?? null,
          response_time: Array.isArray(monitor.locations)
            ? (monitor.locations
                .flatMap((location) => Object.values(location || {}))
                .flatMap((values) => values || [])
                .map((location) => location.response_time)
                .filter(Number.isFinite)[0] ?? null)
            : null,
          listed: monitor.listed || [],
          last_check: monitor.last_check ?? null,
          category:
            override.category || monitor.category || "Monitors",
          display: {
            show_target: override.show_target,
            show_status: override.show_status,
            show_uptime: collectionIsBlacklist ? false : override.show_uptime,
            show_response_time: collectionIsBlacklist
              ? false
              : override.show_response_time,
            show_uptime_bar: collectionIsBlacklist
              ? false
              : override.show_uptime_bar,
          },
        };
      });
    if (!collectionIsBlacklist)
      await Promise.all(
        monitors.map(async (monitor) => {
          monitor.history_token = await signSession(
            `${requestedSlug}:${monitor.id}`,
            token,
          );
        }),
      );
    if (customization?.sort_mode === "name")
      monitors.sort((left, right) =>
        String(left.name || "").localeCompare(String(right.name || "")),
      );
    if (customization?.sort_mode === "status") {
      const priority = {
        down: 0,
        maintenance: 1,
        unknown: 2,
        up: 3,
        disabled: 4,
      };
      monitors.sort(
        (left, right) =>
          (priority[left.status] ?? 2) - (priority[right.status] ?? 2),
      );
    }
    const operational = monitors.filter(
      (monitor) => monitor.status === "up",
    ).length;
    const incidents = monitors.filter(
      (monitor) => monitor.status === "down",
    ).length;
    const maintenance = monitors.filter(
      (monitor) => monitor.status === "maintenance",
    ).length;
    const unavailable = Math.max(
      0,
      monitors.length - operational - incidents - maintenance,
    );
    const selectedNavPages = new Set(customization.nav_page_ids || []);
    const availablePages = pages
      .map((candidate) => ({
        name: candidate.name,
        slug: slugify(candidate.name),
        type: candidate.type,
      }))
      .concat(
        customPages.map((candidate) => ({
          name: candidate.title,
          slug: candidate.slug,
          type: parseMonitorIds(candidate.monitor_ids).length
            ? "uptime"
            : page.type,
          custom: true,
        })),
      )
      .filter(
        (candidate) =>
          customization.show_status_pages !== false &&
          (!selectedNavPages.size || selectedNavPages.has(candidate.slug)),
      );
    const publicCustomizationValues = { ...customization };
    for (const privateField of [
      "monitor_ids",
      "hidden_monitor_ids",
      "monitor_overrides",
      "nav_page_ids",
    ])
      delete publicCustomizationValues[privateField];
    const result = {
      page: {
        name: customPage?.title || page.name,
        type: page.type,
        slug: customPage?.slug || slugify(page.name),
        custom: Boolean(customPage),
        announcement_type:
          customization.show_announcement === false
            ? null
            : page.announcement_type,
        announcement_title:
          customization.show_announcement === false
            ? null
            : page.announcement_title,
        announcement_body:
          customization.show_announcement === false
            ? null
            : page.announcement_body,
      },
      available_pages: availablePages,
      customization: publicCustomizationValues,
      monitors,
      summary: {
        total: monitors.length,
        operational,
        incidents,
        maintenance,
        unavailable,
      },
      fetched_at: Math.floor(Date.now() / 1000),
    };
    const response = jsonResponse(result, 200, request);
    response.headers.set("Cache-Control", "public, max-age=30, s-maxage=60");
    return response;
  } catch (error) {
    return jsonResponse(
      {
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Unable to load public status.",
      },
      error.status || 502,
      request,
    );
  }
}

async function publicMonitorHistory(request, env) {
  const token = managedApiKey(env);
  if (!token)
    return jsonResponse(
      { status: "error", message: "Monitoring is not configured." },
      503,
      request,
    );
  const url = new URL(request.url);
  const monitorId = String(url.searchParams.get("monitor_id") || "").trim();
  const requestedSlug =
    slugify(url.searchParams.get("slug") || "default") || "default";
  const providedToken = String(
    url.searchParams.get("history_token") || "",
  ).trim();
  const days = integerValue(url.searchParams.get("days"), 1, 30, 30);
  const requestedTimezone = String(url.searchParams.get("timezone") || "+00:00");
  const timezone = /^[+-](?:0\d|1[0-4]):[0-5]\d$/.test(requestedTimezone)
    ? requestedTimezone
    : "+00:00";
  if (!/^[a-zA-Z0-9_-]{8,160}$/.test(monitorId))
    return jsonResponse(
      { status: "error", message: "A valid monitor ID is required." },
      400,
      request,
    );
  try {
    const expectedToken = await signSession(
      `${requestedSlug}:${monitorId}`,
      token,
    );
    if (
      !providedToken ||
      !sameBytes(
        base64UrlDecode(expectedToken),
        base64UrlDecode(providedToken),
      )
    )
      return jsonResponse(
        { status: "error", message: "This monitor is not available on the requested public page." },
        403,
        request,
      );
  } catch {
    return jsonResponse(
      { status: "error", message: "A valid public history token is required." },
      403,
      request,
    );
  }
  try {
    const report = await upstreamJson(
      `/uptime-monitors/${encodeURIComponent(monitorId)}/report?days=${days}&timezone=${encodeURIComponent(timezone)}`,
      token,
    );
    const entries = Object.entries(report.data?.data || {})
      .sort(([left], [right]) => left.localeCompare(right))
      .slice(-days)
      .map(([date, details]) => {
        const responseTimes = Object.values(details?.response_time || {})
          .map(Number)
          .filter(Number.isFinite);
        const uptime = Number(details?.uptime?.percentage);
        return {
          date,
          uptime: Number.isFinite(uptime) ? uptime : null,
          downtimes: Number(details?.uptime?.downtimes || 0),
          response_time: responseTimes.length
            ? Math.round(
                responseTimes.reduce((total, value) => total + value, 0) /
                  responseTimes.length,
              )
            : null,
        };
      });
    const response = jsonResponse(
      { timezone: report.data?.timezone || timezone, days: entries },
      200,
      request,
    );
    response.headers.set("Cache-Control", "public, max-age=300, s-maxage=600");
    return response;
  } catch (error) {
    return jsonResponse(
      {
        status: "error",
        message:
          error instanceof Error ? error.message : "Unable to load history.",
      },
      error.status || 502,
      request,
    );
  }
}

async function cachedPublicGet(request, handler, context) {
  const cache = globalThis.caches?.default;
  if (!cache) return handler();
  const cacheKey = new Request(request.url, { method: "GET" });
  const cached = await cache.match(cacheKey);
  if (cached) return cached;
  const response = await handler();
  if (response.ok) {
    const cacheWrite = cache.put(cacheKey, response.clone());
    if (context?.waitUntil) context.waitUntil(cacheWrite);
    else await cacheWrite;
  }
  return response;
}

async function purgePublicStatusCache(request, slug) {
  const cache = globalThis.caches?.default;
  if (!cache || !slug) return;
  const url = new URL(request.url);
  url.pathname = "/api/public/status";
  url.search = "";
  url.searchParams.set("slug", slug);
  await cache.delete(new Request(url, { method: "GET" }));
}

async function proxyRequest(request, env) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  if (request.method !== "POST") {
    return jsonResponse(
      { status: "error", message: "Use POST for the proxy request." },
      405,
      request,
    );
  }

  if (!(await isAdminRequest(request, env)))
    return jsonResponse(
      { status: "error", message: "Admin session required." },
      401,
      request,
    );
  const token = managedApiKey(env);
  if (!token)
    return jsonResponse(
      {
        status: "error",
        message: "Managed HetrixTools API key is not configured.",
      },
      503,
      request,
    );

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse(
      { status: "error", message: "Request body must be valid JSON." },
      400,
      request,
    );
  }

  const { path, method = "GET", query = {}, body } = payload || {};
  const upstreamMethod = String(method).toUpperCase();
  if (!isSafeApiPath(path) || !ALLOWED_METHODS.has(upstreamMethod)) {
    return jsonResponse(
      { status: "error", message: "Invalid API path or method." },
      400,
      request,
    );
  }

  const upstreamUrl = new URL(`${API_ORIGIN}${path}`);
  if (query && typeof query === "object" && !Array.isArray(query)) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "")
        upstreamUrl.searchParams.set(key, String(value));
    }
  }

  const headers = new Headers({
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
  });

  const init = { method: upstreamMethod, headers };
  if (body !== undefined && upstreamMethod !== "GET") {
    headers.set("Content-Type", "application/json");
    init.body = JSON.stringify(body);
  }

  try {
    const upstream = await fetch(upstreamUrl, init);
    const responseHeaders = corsHeaders(request);
    const contentType = upstream.headers.get("Content-Type");
    if (contentType) responseHeaders.set("Content-Type", contentType);

    for (const headerName of [
      "ratelimit-limit-user",
      "ratelimit-remaining-user",
      "ratelimit-reset-user",
      "ratelimit-limit-endpoint",
      "ratelimit-remaining-endpoint",
      "ratelimit-reset-endpoint",
    ]) {
      const value = upstream.headers.get(headerName);
      if (value) responseHeaders.set(headerName, value);
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (error) {
    return jsonResponse(
      {
        status: "error",
        message:
          error instanceof Error ? error.message : "Upstream request failed.",
      },
      502,
      request,
    );
  }
}

export default {
  async fetch(request, env, context) {
    const url = new URL(request.url);
    if (
      isCrossOriginWrite(request) &&
      (url.pathname.startsWith("/api/admin/") ||
        url.pathname === "/api/request")
    )
      return jsonResponse(
        { status: "error", message: "Cross-origin admin requests are not allowed." },
        403,
        request,
      );
    if (url.pathname === "/api/config" && request.method === "GET")
      return runtimeConfig(env, request);
    if (url.pathname === "/api/admin/login") return adminLogin(request, env);
    if (url.pathname === "/api/admin/session" && request.method === "GET")
      return adminSession(request, env);
    if (url.pathname === "/api/admin/logout" && request.method === "POST")
      return adminLogout(request, env);
    if (url.pathname === "/api/public/status" && request.method === "GET")
      return cachedPublicGet(
        request,
        () => publicStatus(request, env),
        context,
      );
    if (url.pathname === "/api/public/history" && request.method === "GET")
      return cachedPublicGet(
        request,
        () => publicMonitorHistory(request, env),
        context,
      );
    if (
      url.pathname === "/api/admin/pages" ||
      url.pathname.startsWith("/api/admin/pages/")
    )
      return customPagesApi(request, env, url);
    if (url.pathname.startsWith("/assets/logo/") && request.method === "GET")
      return logoAsset(request, env, url);
    if (url.pathname === "/api/request") return proxyRequest(request, env);

    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response(
      "Assets binding is not configured. Run `npm run build` first.",
      { status: 500 },
    );
  },
};
