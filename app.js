const TYPE_LABELS = { competition: "比赛", lecture: "讲座", salon: "沙龙", exhibition: "展览", volunteer: "志愿", part_time: "兼职", internship: "实习", recruitment: "校园招聘", scholarship: "奖学金", workshop: "工作坊", online: "线上活动" };
const ICONS = { competition: "◒", lecture: "✦", salon: "☕", exhibition: "◌", volunteer: "✋", part_time: "↗", internship: "▦", workshop: "⌁", online: "◎" };
const COVERS = { competition: "competition", lecture: "lecture", salon: "salon", exhibition: "exhibition", volunteer: "volunteer", part_time: "part-time", internship: "internship", recruitment: "internship", scholarship: "lecture", workshop: "workshop", online: "online" };
const state = { items: [], filtered: [] };
const $ = (selector) => document.querySelector(selector);
const appScript = document.querySelector('script[src$="/app.js"], script[src="app.js"]');
const publicRoot = new URL("./", appScript?.src || document.baseURI);
const assetUrl = (path) => new URL(path, publicRoot).toString();
const SNAPSHOT_CACHE_KEY = "nearby-social-radar:public-snapshot:v1";
const mapConfig = window.NSR_MAP_CONFIG || {};
let amapLoader = null;
let publicMap = null;
let currentSnapshot = null;
let mapRevision = 0;
const GCJ_PI = Math.PI;
const GCJ_A = 6378245;
const GCJ_EE = 0.006693421622965943;
function outsideChina(latitude, longitude) { return longitude < 72.004 || longitude > 137.8347 || latitude < 0.8293 || latitude > 55.8271; }
function transformLatitude(x, y) { let ret = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x)); ret += (20 * Math.sin(6 * x * GCJ_PI) + 20 * Math.sin(2 * x * GCJ_PI)) * 2 / 3; ret += (20 * Math.sin(y * GCJ_PI) + 40 * Math.sin(y / 3 * GCJ_PI)) * 2 / 3; ret += (160 * Math.sin(y / 12 * GCJ_PI) + 320 * Math.sin(y * GCJ_PI / 30)) * 2 / 3; return ret; }
function transformLongitude(x, y) { let ret = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x)); ret += (20 * Math.sin(6 * x * GCJ_PI) + 20 * Math.sin(2 * x * GCJ_PI)) * 2 / 3; ret += (20 * Math.sin(x * GCJ_PI) + 40 * Math.sin(x / 3 * GCJ_PI)) * 2 / 3; ret += (150 * Math.sin(x / 12 * GCJ_PI) + 300 * Math.sin(x / 30 * GCJ_PI)) * 2 / 3; return ret; }
function wgs84ToGcj02(latitude, longitude) { if (outsideChina(latitude, longitude)) return [longitude, latitude]; const dLatitude = transformLatitude(longitude - 105, latitude - 35); const dLongitude = transformLongitude(longitude - 105, latitude - 35); const radians = latitude / 180 * GCJ_PI; const magic = 1 - GCJ_EE * Math.sin(radians) ** 2; const sqrtMagic = Math.sqrt(magic); return [longitude + dLongitude * 180 / (GCJ_A / sqrtMagic * Math.cos(radians) * GCJ_PI), latitude + dLatitude * 180 / ((GCJ_A * (1 - GCJ_EE)) / (magic * sqrtMagic) * GCJ_PI)]; }
function mapCoordinate(value) { if (!value || value.latitude === null || value.latitude === undefined || value.longitude === null || value.longitude === undefined || !["gcj02", "wgs84"].includes(value.coordinateSystem)) return null; const latitude = Number(value.latitude); const longitude = Number(value.longitude); if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || (latitude === 0 && longitude === 0) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null; return value.coordinateSystem === "gcj02" ? [longitude, latitude] : wgs84ToGcj02(latitude, longitude); }
function campusReference(item, center) {
  if (item.isOnline || mapCoordinate(item)) return null;
  const venue = `${item.venueName || ""} ${item.address || ""}`;
  if (/创新港|敏行楼|涵英楼/.test(venue)) return { name: "创新港校区", coordinate: wgs84ToGcj02(34.25755, 108.65215) };
  if (/雁塔校区/.test(venue)) return { name: "雁塔校区", coordinate: [108.940770, 34.216116] };
  if (/兴庆校区|仲英楼/.test(venue) && center) return { name: "兴庆校区", coordinate: center };
  return null;
}
function showMapFallback(message) { mapRevision++; const map = $("#public-map"); const fallback = $("#map-fallback"); if (publicMap) { publicMap.destroy(); publicMap = null; } if (map) map.hidden = true; if (fallback) { fallback.hidden = false; $("#map-fallback-text").textContent = message; } $("#map-status").textContent = message; }
function loadAMap() {
  if (window.AMap) return Promise.resolve(window.AMap);
  if (!mapConfig.key || !mapConfig.serviceHost) return Promise.reject(new Error("高德网页地图尚未配置 JS API Key 和安全代理。"));
  if (!amapLoader) amapLoader = new Promise((resolve, reject) => {
    try {
      const host = new URL(mapConfig.serviceHost);
      if (host.protocol !== "https:") throw new Error("高德安全代理必须使用 HTTPS。");
      window._AMapSecurityConfig = { serviceHost: `${host.origin}/_AMapService` };
    } catch (error) { reject(error); return; }
    const script = document.createElement("script");
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(mapConfig.key)}`;
    script.async = true;
    script.onload = () => window.AMap ? resolve(window.AMap) : reject(new Error("高德地图没有完成初始化。"));
    script.onerror = () => reject(new Error("高德地图脚本加载失败，请检查 Key 域名白名单与安全代理。"));
    document.head.appendChild(script);
  }).catch((error) => { amapLoader = null; throw error; });
  return amapLoader;
}
function renderPublicMap(snapshot, items = snapshot.items ?? []) {
  const container = $("#public-map");
  if (!container) return;
  const fallback = $("#map-fallback");
  if (fallback) fallback.hidden = true;
  container.hidden = false;
  const center = mapCoordinate(snapshot.center);
  const points = items.flatMap((item) => { const coordinate = mapCoordinate(item); return coordinate && !item.isOnline ? [{ item, coordinate }] : []; });
  const campusGroups = new Map();
  for (const item of items) {
    const reference = campusReference(item, center);
    if (!reference) continue;
    const group = campusGroups.get(reference.name) || { ...reference, items: [] };
    group.items.push(item);
    campusGroups.set(reference.name, group);
  }
  const initial = center || points[0]?.coordinate || campusGroups.values().next().value?.coordinate;
  if (!initial) { showMapFallback("本轮快照暂时没有可用坐标；下一次采集会继续尝试解析活动地点。"); return; }
  const revision = ++mapRevision;
  const openAt = points[0]?.coordinate || initial;
  $("#map-open").href = `https://uri.amap.com/marker?position=${openAt[0]},${openAt[1]}&name=${encodeURIComponent(points[0]?.item.title || snapshot.center?.name || "西安活动")}`;
  const approximateCount = [...campusGroups.values()].reduce((total, group) => total + group.items.length, 0);
  const unlocatedCount = items.filter((item) => !item.isOnline && !mapCoordinate(item) && !campusReference(item, center)).length;
  $("#map-status").textContent = `匹配活动 ${items.length} 条 · 精确坐标 ${points.length} 条 · 校区参考位置 ${approximateCount} 条 · 未定位 ${unlocatedCount} 条`;
  loadAMap().then((AMap) => {
    if (revision !== mapRevision) return;
    if (!publicMap) publicMap = new AMap.Map(container, { zoom: 13, center: initial, viewMode: "2D" });
    else publicMap.clearMap();
    const infoWindow = new AMap.InfoWindow({ offset: new AMap.Pixel(0, -28) });
    const overlays = [];
    const addPopup = (marker, position, content) => { marker.on("click", () => { infoWindow.setContent(content); infoWindow.open(publicMap, position); }); overlays.push(marker); };
    if (center) addPopup(new AMap.Marker({ position: center, title: snapshot.center.name || "默认起点" }), center, `<strong>${escapeHtml(snapshot.center.name || "默认起点")}</strong><br><span>公开活动参考起点</span>`);
    points.forEach(({ item, coordinate }) => {
      const link = safeHttpUrl(item.sourceUrl) || safeHttpUrl(item.registrationUrl);
      const content = `<strong>${escapeHtml(item.title)}</strong><br><span>${escapeHtml(item.venueName || item.city || "地点待定")}</span>${link ? `<br><a href="${escapeHtml(link)}" target="_blank" rel="noreferrer">查看原文 ↗</a>` : ""}`;
      addPopup(new AMap.Marker({ position: coordinate, title: item.title }), coordinate, content);
    });
    for (const group of campusGroups.values()) {
      const entries = group.items.map((item) => { const link = safeHttpUrl(item.sourceUrl) || safeHttpUrl(item.registrationUrl); return `<li>${link ? `<a href="${escapeHtml(link)}" target="_blank" rel="noreferrer">${escapeHtml(item.title)}</a>` : escapeHtml(item.title)}</li>`; }).join("");
      const content = `<strong>${escapeHtml(group.name)} · ${group.items.length} 条</strong><br><span>校区参考点，非具体楼宇坐标；请以原文地点为准。</span><ul>${entries}</ul>`;
      addPopup(new AMap.CircleMarker({ center: group.coordinate, radius: 11, strokeColor: "#8b671c", fillColor: "#e9bd4c", fillOpacity: 0.7, strokeWeight: 2 }), group.coordinate, content);
    }
    publicMap.add(overlays);
    if (overlays.length > 1) publicMap.setFitView(overlays); else publicMap.setZoomAndCenter(13, initial);
  }).catch((error) => { if (revision === mapRevision) showMapFallback(error instanceof Error ? error.message : "高德地图加载失败。"); });
}
function formatDate(value) { if (!value) return "时间待定"; return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value * 1000)); }
function formatSnapshotTime(value) { return value ? new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "待同步"; }
function displayType(item) { if (/奖学金|助学金|奖助学金/.test(item.category || "")) return "scholarship"; if (/校园招聘|招聘会|双选会/.test(item.category || "")) return "recruitment"; return item.type; }
function category(item) { const type = displayType(item); if (type === "lecture") return "lecture"; if (type === "competition") return "competition"; if (type === "exhibition") return "exhibition"; if (type === "volunteer") return "volunteer"; if (type === "salon") return "salon"; return "default"; }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>\"']/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;", "'":"&#39;" }[char])); }
function safeHttpUrl(value) { try { const url = new URL(value); return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null; } catch { return null; } }
function applyFilters() { const query = $("#query").value.trim().toLowerCase(); const type = $("#type").value; const timing = $("#timing").value; const fee = $("#fee").value; const now = Math.floor(Date.now() / 1000); const limit = timing === "week" ? now + 7 * 86400 : timing === "month" ? now + 30 * 86400 : timing === "upcoming" ? now + 365 * 86400 : Infinity; state.filtered = state.items.filter((item) => { const haystack = `${item.title} ${item.description} ${item.organizer ?? ""} ${item.venueName ?? ""} ${(item.tags ?? []).join(" ")}`.toLowerCase(); return (!query || haystack.includes(query)) && (type === "all" || displayType(item) === type) && (fee === "all" || item.feeType === fee) && (!item.startsAt || (item.startsAt >= now && item.startsAt <= limit)); }); render(); if (currentSnapshot && $("#map-panel")?.open) renderPublicMap(currentSnapshot, state.filtered); }
function render() { $("#count").textContent = `${state.filtered.length} 个公开机会`; $("#empty").hidden = state.filtered.length > 0; $("#list").innerHTML = state.filtered.map((item) => { const type = category(item); const display = displayType(item); const cover = COVERS[display] ?? "online"; const tags = [TYPE_LABELS[display] ?? "其他", ...(item.tags ?? [])].slice(0, 3); const venue = item.isOnline ? "线上活动" : (item.venueName || item.city || "地点待定"); const link = safeHttpUrl(item.sourceUrl) || safeHttpUrl(item.registrationUrl); return `<article class="activity-card"><div class="activity-banner ${type}"><img class="activity-cover" src="${assetUrl(`covers/${cover}.webp`)}" alt="" loading="lazy" decoding="async" /><div class="cover-scrim" aria-hidden="true"></div><span class="banner-icon">${ICONS[display] ?? "✦"}</span><span class="banner-name">${escapeHtml(TYPE_LABELS[display] ?? "其他活动")}</span></div><div class="activity-content"><h3 class="activity-title">${escapeHtml(item.title)}</h3><div class="tags">${tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div><div class="meta"><span>⌖ ${escapeHtml(venue)}</span><span>◷ ${formatDate(item.startsAt)}</span></div><div class="card-footer"><span>${escapeHtml(item.sourceName || "公开来源")}</span>${link ? `<a href="${escapeHtml(link)}" target="_blank" rel="noreferrer">查看原文 ↗</a>` : ""}</div></div></article>`; }).join(""); }
function readCachedSnapshot() { try { const value = JSON.parse(localStorage.getItem(SNAPSHOT_CACHE_KEY) || "null"); return value && Array.isArray(value.items) ? value : null; } catch { return null; } }
function saveCachedSnapshot(snapshot) { try { localStorage.setItem(SNAPSHOT_CACHE_KEY, JSON.stringify(snapshot)); } catch { /* Storage can be unavailable in private browsing. */ } }
function showSnapshot(snapshot, statusOverride = null) { currentSnapshot = snapshot; state.items = snapshot.items ?? []; $("#sync-time").textContent = formatSnapshotTime(snapshot.lastSuccessfulAt || snapshot.generatedAt); $("#sync-status").textContent = statusOverride || snapshot.statusMessage || "公开快照"; $("#sync-status").dataset.status = statusOverride ? "stale" : snapshot.status || "stale"; $("#sync-check").textContent = snapshot.checkedAt ? `检查时间：${formatSnapshotTime(snapshot.checkedAt)}` : ""; const failedSources = (snapshot.sourceHealth ?? []).filter((source) => source.status === "failed"); $("#source-health").textContent = failedSources.length ? `失败来源：${failedSources.map((source) => source.name).join("、")}` : snapshot.sourceCount ? `已检查 ${snapshot.sourceCount} 个来源` : ""; const types = [...new Set(state.items.map(displayType))]; const typeSelect = $("#type"); if (typeSelect.options.length === 1) typeSelect.insertAdjacentHTML("beforeend", types.map((type) => `<option value="${escapeHtml(type)}">${escapeHtml(TYPE_LABELS[type] ?? type)}</option>`).join("")); applyFilters(); }
async function boot() { const refresh = $("#refresh-data"); if (refresh) refresh.disabled = true; try { const response = await fetch(assetUrl("data/opportunities.json"), { cache: "no-store" }); if (!response.ok) throw new Error("snapshot unavailable"); const snapshot = await response.json(); saveCachedSnapshot(snapshot); showSnapshot(snapshot); } catch { const cached = readCachedSnapshot(); if (cached) { showSnapshot(cached, "网络暂时不可用，显示上次成功快照"); } else { $("#sync-time").textContent = "暂时不可用"; $("#sync-status").textContent = "请稍后刷新"; $("#sync-status").dataset.status = "degraded"; $("#sync-check").textContent = "无法读取公开快照"; $("#count").textContent = "活动数据暂不可用"; } } finally { if (refresh) refresh.disabled = false; } }
["query", "type", "timing", "fee"].forEach((id) => document.getElementById(id).addEventListener(id === "query" ? "input" : "change", applyFilters));
$("#map-panel")?.addEventListener("toggle", (event) => { if (event.currentTarget.open && currentSnapshot) renderPublicMap(currentSnapshot, state.filtered); });
$("#refresh-data").addEventListener("click", () => void boot());
boot();
