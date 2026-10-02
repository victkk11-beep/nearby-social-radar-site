const TYPE_LABELS = { competition: "比赛", lecture: "讲座", salon: "沙龙", exhibition: "展览", volunteer: "志愿", part_time: "兼职", internship: "实习", workshop: "工作坊", online: "线上活动" };
const ICONS = { competition: "◒", lecture: "✦", salon: "☕", exhibition: "◌", volunteer: "✋", part_time: "↗", internship: "▦", workshop: "⌁", online: "◎" };
const COVERS = { competition: "competition", lecture: "lecture", salon: "salon", exhibition: "exhibition", volunteer: "volunteer", part_time: "part-time", internship: "internship", workshop: "workshop", online: "online" };
const state = { items: [], filtered: [] };
const $ = (selector) => document.querySelector(selector);
const appScript = document.querySelector('script[src$="/app.js"], script[src="app.js"]');
const publicRoot = new URL("./", appScript?.src || document.baseURI);
const assetUrl = (path) => new URL(path, publicRoot).toString();
const SNAPSHOT_CACHE_KEY = "nearby-social-radar:public-snapshot:v1";
let publicMap = null;
const GCJ_PI = Math.PI;
const GCJ_A = 6378245;
const GCJ_EE = 0.006693421622965943;
function outsideChina(latitude, longitude) { return longitude < 72.004 || longitude > 137.8347 || latitude < 0.8293 || latitude > 55.8271; }
function transformLatitude(x, y) { let ret = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x)); ret += (20 * Math.sin(6 * x * GCJ_PI) + 20 * Math.sin(2 * x * GCJ_PI)) * 2 / 3; ret += (20 * Math.sin(y * GCJ_PI) + 40 * Math.sin(y / 3 * GCJ_PI)) * 2 / 3; ret += (160 * Math.sin(y / 12 * GCJ_PI) + 320 * Math.sin(y * GCJ_PI / 30)) * 2 / 3; return ret; }
function transformLongitude(x, y) { let ret = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x)); ret += (20 * Math.sin(6 * x * GCJ_PI) + 20 * Math.sin(2 * x * GCJ_PI)) * 2 / 3; ret += (20 * Math.sin(x * GCJ_PI) + 40 * Math.sin(x / 3 * GCJ_PI)) * 2 / 3; ret += (150 * Math.sin(x / 12 * GCJ_PI) + 300 * Math.sin(x / 30 * GCJ_PI)) * 2 / 3; return ret; }
function gcj02ToWgs84(latitude, longitude) { if (outsideChina(latitude, longitude)) return [latitude, longitude]; const dLatitude = transformLatitude(longitude - 105, latitude - 35); const dLongitude = transformLongitude(longitude - 105, latitude - 35); const radians = latitude / 180 * GCJ_PI; const magic = 1 - GCJ_EE * Math.sin(radians) ** 2; const sqrtMagic = Math.sqrt(magic); const latitudeDelta = dLatitude * 180 / ((GCJ_A * (1 - GCJ_EE)) / (magic * sqrtMagic) * GCJ_PI); const longitudeDelta = dLongitude * 180 / (GCJ_A / sqrtMagic * Math.cos(radians) * GCJ_PI); return [latitude * 2 - (latitude + latitudeDelta), longitude * 2 - (longitude + longitudeDelta)]; }
function mapCoordinate(value) { if (!value || !Number.isFinite(Number(value.latitude)) || !Number.isFinite(Number(value.longitude))) return null; const latitude = Number(value.latitude); const longitude = Number(value.longitude); return value.coordinateSystem === "gcj02" ? gcj02ToWgs84(latitude, longitude) : [latitude, longitude]; }
function showMapFallback(message) { const map = $("#public-map"); const fallback = $("#map-fallback"); if (publicMap) { publicMap.remove(); publicMap = null; } if (map) map.hidden = true; if (fallback) { fallback.hidden = false; $("#map-fallback-text").textContent = message; } $("#map-status").textContent = message; }
function renderPublicMap(snapshot) {
  const container = $("#public-map");
  if (!container) return;
  const fallback = $("#map-fallback");
  if (fallback) fallback.hidden = true;
  container.hidden = false;
  const center = mapCoordinate(snapshot.center);
  const points = (snapshot.items ?? []).flatMap((item) => { const coordinate = mapCoordinate(item); return coordinate ? [{ item, coordinate }] : []; });
  const initial = center || points[0]?.coordinate;
  if (!initial) { showMapFallback("本轮快照暂时没有可用坐标；下一次采集会继续尝试解析活动地点。"); return; }
  if (!window.L) { showMapFallback("地图底图加载失败，但活动列表仍可正常使用；可稍后重新加载页面。"); return; }
  if (publicMap) { publicMap.remove(); publicMap = null; }
  publicMap = window.L.map(container, { scrollWheelZoom: false, zoomControl: true, attributionControl: false });
  window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors" }).addTo(publicMap);
  const layers = [];
  if (center) layers.push(window.L.marker(center).addTo(publicMap).bindPopup(`<strong>${escapeHtml(snapshot.center.name || "默认起点")}</strong><br><span>公开活动参考起点</span>`));
  points.forEach(({ item, coordinate }) => {
    const link = safeHttpUrl(item.sourceUrl) || safeHttpUrl(item.registrationUrl);
    const popup = `<strong>${escapeHtml(item.title)}</strong><br><span>${escapeHtml(item.venueName || item.city || "地点待定")}</span>${link ? `<br><a href="${escapeHtml(link)}" target="_blank" rel="noreferrer">查看原文 ↗</a>` : ""}`;
    layers.push(window.L.marker(coordinate).addTo(publicMap).bindPopup(popup));
  });
  const bounds = window.L.featureGroup(layers).getBounds();
  if (bounds.isValid() && layers.length > 1) publicMap.fitBounds(bounds.pad(0.18)); else publicMap.setView(initial, 13);
  $("#map-status").textContent = points.length ? `已定位 ${points.length} 个公开活动${center ? ` · 参考起点：${snapshot.center.name || "兴庆校区"}` : ""}` : `已显示参考起点${snapshot.center?.name ? `：${snapshot.center.name}` : ""} · 活动坐标待补齐`;
}
function formatDate(value) { if (!value) return "时间待定"; return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value * 1000)); }
function formatSnapshotTime(value) { return value ? new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "待同步"; }
function category(item) { if (item.type === "lecture") return "lecture"; if (item.type === "competition") return "competition"; if (item.type === "exhibition") return "exhibition"; if (item.type === "volunteer") return "volunteer"; if (item.type === "salon") return "salon"; return "default"; }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>\"']/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;", "'":"&#39;" }[char])); }
function safeHttpUrl(value) { try { const url = new URL(value); return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null; } catch { return null; } }
function applyFilters() { const query = $("#query").value.trim().toLowerCase(); const type = $("#type").value; const timing = $("#timing").value; const fee = $("#fee").value; const now = Math.floor(Date.now() / 1000); const limit = timing === "week" ? now + 7 * 86400 : timing === "month" ? now + 30 * 86400 : timing === "upcoming" ? now + 365 * 86400 : Infinity; state.filtered = state.items.filter((item) => { const haystack = `${item.title} ${item.description} ${item.organizer ?? ""} ${item.venueName ?? ""} ${(item.tags ?? []).join(" ")}`.toLowerCase(); return (!query || haystack.includes(query)) && (type === "all" || item.type === type) && (fee === "all" || item.feeType === fee) && (!item.startsAt || (item.startsAt >= now && item.startsAt <= limit)); }); render(); }
function render() { $("#count").textContent = `${state.filtered.length} 个公开机会`; $("#empty").hidden = state.filtered.length > 0; $("#list").innerHTML = state.filtered.map((item) => { const type = category(item); const cover = COVERS[item.type] ?? "online"; const tags = [TYPE_LABELS[item.type] ?? "其他", ...(item.tags ?? [])].slice(0, 3); const venue = item.isOnline ? "线上活动" : (item.venueName || item.city || "地点待定"); const link = safeHttpUrl(item.sourceUrl) || safeHttpUrl(item.registrationUrl); return `<article class="activity-card"><div class="activity-banner ${type}"><img class="activity-cover" src="${assetUrl(`covers/${cover}.webp`)}" alt="" loading="lazy" decoding="async" /><div class="cover-scrim" aria-hidden="true"></div><span class="banner-icon">${ICONS[item.type] ?? "✦"}</span><span class="banner-name">${escapeHtml(TYPE_LABELS[item.type] ?? "其他活动")}</span></div><div class="activity-content"><h3 class="activity-title">${escapeHtml(item.title)}</h3><div class="tags">${tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div><div class="meta"><span>⌖ ${escapeHtml(venue)}</span><span>◷ ${formatDate(item.startsAt)}</span></div><div class="card-footer"><span>${escapeHtml(item.sourceName || "公开来源")}</span>${link ? `<a href="${escapeHtml(link)}" target="_blank" rel="noreferrer">查看原文 ↗</a>` : ""}</div></div></article>`; }).join(""); }
function readCachedSnapshot() { try { const value = JSON.parse(localStorage.getItem(SNAPSHOT_CACHE_KEY) || "null"); return value && Array.isArray(value.items) ? value : null; } catch { return null; } }
function saveCachedSnapshot(snapshot) { try { localStorage.setItem(SNAPSHOT_CACHE_KEY, JSON.stringify(snapshot)); } catch { /* Storage can be unavailable in private browsing. */ } }
function showSnapshot(snapshot, statusOverride = null) { state.items = snapshot.items ?? []; $("#sync-time").textContent = formatSnapshotTime(snapshot.lastSuccessfulAt || snapshot.generatedAt); $("#sync-status").textContent = statusOverride || snapshot.statusMessage || "公开快照"; $("#sync-status").dataset.status = statusOverride ? "stale" : snapshot.status || "stale"; $("#sync-check").textContent = snapshot.checkedAt ? `检查时间：${formatSnapshotTime(snapshot.checkedAt)}` : ""; const failedSources = (snapshot.sourceHealth ?? []).filter((source) => source.status === "failed"); $("#source-health").textContent = failedSources.length ? `失败来源：${failedSources.map((source) => source.name).join("、")}` : snapshot.sourceCount ? `已检查 ${snapshot.sourceCount} 个来源` : ""; const types = [...new Set(state.items.map((item) => item.type))]; const typeSelect = $("#type"); if (typeSelect.options.length === 1) typeSelect.insertAdjacentHTML("beforeend", types.map((type) => `<option value="${escapeHtml(type)}">${escapeHtml(TYPE_LABELS[type] ?? type)}</option>`).join("")); renderPublicMap(snapshot); applyFilters(); }
async function boot() { const refresh = $("#refresh-data"); if (refresh) refresh.disabled = true; try { const response = await fetch(assetUrl("data/opportunities.json"), { cache: "no-store" }); if (!response.ok) throw new Error("snapshot unavailable"); const snapshot = await response.json(); saveCachedSnapshot(snapshot); showSnapshot(snapshot); } catch { const cached = readCachedSnapshot(); if (cached) { showSnapshot(cached, "网络暂时不可用，显示上次成功快照"); } else { $("#sync-time").textContent = "暂时不可用"; $("#sync-status").textContent = "请稍后刷新"; $("#sync-status").dataset.status = "degraded"; $("#sync-check").textContent = "无法读取公开快照"; $("#count").textContent = "活动数据暂不可用"; } } finally { if (refresh) refresh.disabled = false; } }
["query", "type", "timing", "fee"].forEach((id) => document.getElementById(id).addEventListener(id === "query" ? "input" : "change", applyFilters));
$("#refresh-data").addEventListener("click", () => void boot());
boot();
