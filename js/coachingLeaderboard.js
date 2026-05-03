// coachingLeaderboard.js — Courage Library B2B Leaderboard
// Features: Supabase Realtime live rank updates, auto-refresh on new submissions

const SUPABASE_URL = "https://sgagswxzsxlgcspwiuoh.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNnYWdzd3h6c3hsZ2NzcHdpdW9oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5NTA1NTIsImV4cCI6MjA2OTUyNjU1Mn0.ZNfk5WNDPkjKcFsRO48rEYk3dhbLYm_m21aZ-wfywo4";

const { createClient } = supabase;
const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let coachingId   = null;
let coachingProfile = null;
let realtimeChannel = null;
let refreshDebounce = null;
let liveBarIndex = 0;
let liveBarMessages = [];
let liveBarTimer = null;
const nameCache = {};

document.addEventListener("DOMContentLoaded", async () => { await init(); });

async function init() {
  const { data: { user } } = await client.auth.getUser();
  if (!user) { window.location.href = "/index.html?action=login"; return; }
  currentUser = user;

  const { data: profile } = await client
    .from("user_profiles").select("coaching_id").eq("id", user.id).single();

  if (!profile?.coaching_id) { window.location.href = "/mock/dashboard.html"; return; }
  coachingId = profile.coaching_id;

  const { data: coaching } = await client
    .from("coaching_centers")
    .select("id, name, primary_color, logo_url, city")
    .eq("id", coachingId).single();

  if (!coaching) { showError("Coaching center not found."); return; }
  coachingProfile = coaching;
  applyBranding(coaching);
  await loadLeaderboard();
  subscribeToLive(coachingId);
}

function applyBranding(c) {
  const color = c.primary_color || "#1a56db";
  document.querySelectorAll(".coaching-name").forEach(el => el.textContent = c.name);
  document.title = `Leaderboard | ${c.name}`;
  const hero = document.getElementById("lbHero");
  if (hero) hero.style.background = `linear-gradient(135deg, ${color} 0%, ${adjustHex(color, -28)} 100%)`;
  if (c.city) setText("coachingCity", "📍 " + c.city);
}

async function loadLeaderboard(isRefresh = false) {
  const { data: exams } = await client
    .from("scheduled_exams").select("id").eq("coaching_id", coachingId);
  const examIds = (exams || []).map(e => e.id);

  if (!examIds.length) {
    renderPodium([], {}, 0);
    return;
  }

  const { data: attempts, error } = await client
    .from("attempts")
    .select("user_id, total_score, accuracy")
    .in("scheduled_exam_id", examIds)
    .not("submitted_at", "is", null);

  if (error || !attempts?.length) {
    renderPodium([], {}, 0);
    return;
  }

  // Aggregate: best score, avg accuracy, count
  const stats = {};
  attempts.forEach(a => {
    if (!stats[a.user_id]) stats[a.user_id] = { best: 0, accSum: 0, count: 0 };
    const s = stats[a.user_id];
    if ((a.total_score || 0) > s.best) s.best = a.total_score || 0;
    s.accSum += Number(a.accuracy || 0);
    s.count++;
  });

  const sorted = Object.entries(stats).sort((a, b) => {
    const diff = b[1].best - a[1].best;
    if (diff !== 0) return diff;
    return (b[1].accSum / b[1].count) - (a[1].accSum / a[1].count);
  });

  // Fetch names (scoped to this coaching)
  const userIds = sorted.map(([id]) => id);
  const uncached = userIds.filter(id => !nameCache[id]);

  if (uncached.length) {
    const { data: profiles } = await client
      .from("user_profiles").select("id, full_name")
      .in("id", uncached)
      .eq("coaching_id", coachingId);
    (profiles || []).forEach(p => { nameCache[p.id] = p.full_name || "Student"; });
  }

  const nameMap = {};
  userIds.forEach(id => { nameMap[id] = nameCache[id] || "Student"; });

  // My rank
  const myIdx = sorted.findIndex(([id]) => id === currentUser.id);
  if (myIdx >= 0) {
    const rankCard = document.getElementById("myRankCard");
    const rankEl = document.getElementById("myRankDisplay");
    const ofEl = document.getElementById("myRankOf");
    if (rankCard) rankCard.style.display = "block";
    if (rankEl) rankEl.textContent = "#" + (myIdx + 1);
    if (ofEl) ofEl.textContent = `of ${sorted.length} student${sorted.length !== 1 ? "s" : ""}`;
  }

  // Update hero meta
  const heroMeta = document.getElementById("heroMeta");
  if (heroMeta) heroMeta.style.display = "flex";
  const heroCount = document.getElementById("heroStudentCount");
  if (heroCount) heroCount.innerHTML = `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" style="opacity:0.75"><path d="M2 13c0-2.2 1.8-4 4-4h4c2.2 0 4 1.8 4 4" stroke="rgba(255,255,255,0.9)" stroke-width="1.5" stroke-linecap="round"/><circle cx="8" cy="5" r="3" stroke="rgba(255,255,255,0.9)" stroke-width="1.5"/></svg> ${sorted.length} student${sorted.length !== 1 ? "s" : ""}`;

  renderPodium(sorted, nameMap, sorted.length);
  renderRankList(sorted.slice(3), nameMap, myIdx, isRefresh);

  // Update timestamp
  const ts = document.getElementById("lbUpdateTime");
  if (ts) {
    const now = new Date();
    ts.textContent = `Updated ${now.toLocaleTimeString("en-IN", { hour:"2-digit", minute:"2-digit" })}`;
  }
}

// ─────────────────────────────────────────────────────────────
//  REALTIME: watch for new submissions
// ─────────────────────────────────────────────────────────────
async function subscribeToLive(coachingId) {
  const { data: exams } = await client
    .from("scheduled_exams").select("id").eq("coaching_id", coachingId);
  const examIds = (exams || []).map(e => e.id);
  if (!examIds.length) return;

  if (realtimeChannel) { await client.removeChannel(realtimeChannel); }

  realtimeChannel = client
    .channel("lb-live-" + coachingId)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "attempts" },
      async (payload) => {
        const row = payload.new;
        if (!row || !examIds.includes(row.scheduled_exam_id)) return;
        if (!row.submitted_at || payload.old?.submitted_at) return;

        // Get name
        const name = await getDisplayName(row.user_id);
        const scoreStr = row.total_score !== null ? ` · Score: ${row.total_score}` : "";
        const isMe = row.user_id === currentUser.id;
        const msg = isMe
          ? `✅ Your result is in${scoreStr} — updating rankings…`
          : `🔄 ${name} just submitted${scoreStr} — recalculating…`;

        pushLiveBar(msg);

        // Debounce refresh
        if (refreshDebounce) clearTimeout(refreshDebounce);
        refreshDebounce = setTimeout(() => {
          loadLeaderboard(true);
        }, 1500);
      }
    )
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "attempts" },
      async (payload) => {
        const row = payload.new;
        if (!row || !examIds.includes(row.scheduled_exam_id)) return;
        if (row.user_id === currentUser.id) return;
        const name = await getDisplayName(row.user_id);
        pushLiveBar(`📝 ${name} started an exam right now`);
      }
    )
    .subscribe();
}

// Cache + fetch
async function getDisplayName(userId) {
  if (nameCache[userId]) return nameCache[userId].split(" ")[0];
  const { data } = await client.from("user_profiles").select("full_name").eq("id", userId).single();
  const full = data?.full_name || "A student";
  nameCache[userId] = full;
  return full.split(" ")[0];
}

// ── Live bar message cycling ──
function pushLiveBar(msg) {
  const def = document.getElementById("liveBarDefault");
  if (def) def.remove();

  liveBarMessages.push(msg);

  const scroll = document.getElementById("liveBarScroll");
  if (!scroll) return;

  const prev = scroll.querySelector(".live-bar-item.active");
  if (prev) {
    prev.classList.remove("active");
    prev.classList.add("exit");
    setTimeout(() => { if (prev.parentNode) prev.parentNode.removeChild(prev); }, 500);
  }

  const item = document.createElement("div");
  item.className = "live-bar-item";
  item.textContent = msg;
  scroll.appendChild(item);
  requestAnimationFrame(() => requestAnimationFrame(() => item.classList.add("active")));

  if (liveBarTimer) clearTimeout(liveBarTimer);
  if (liveBarMessages.length > 1) {
    liveBarTimer = setTimeout(() => cycleLiveBar(scroll), 5000);
  }
}

function cycleLiveBar(scroll) {
  if (!scroll || liveBarMessages.length < 2) return;
  const prev = scroll.querySelector(".live-bar-item.active");
  if (prev) {
    prev.classList.remove("active");
    prev.classList.add("exit");
    setTimeout(() => { if (prev.parentNode) prev.parentNode.removeChild(prev); }, 500);
  }
  liveBarIndex = (liveBarIndex + 1) % liveBarMessages.length;
  const item = document.createElement("div");
  item.className = "live-bar-item";
  item.textContent = liveBarMessages[liveBarIndex];
  scroll.appendChild(item);
  requestAnimationFrame(() => requestAnimationFrame(() => item.classList.add("active")));
  liveBarTimer = setTimeout(() => cycleLiveBar(scroll), 5000);
}

// ── PODIUM ──
function renderPodium(sorted, nameMap, total) {
  const grid = document.getElementById("podiumGrid");
  if (!grid) return;

  const slots = [
    { rankIdx: 1, cls: "slot-2nd", medalBg: "#94a3b8", medalText: "2" },
    { rankIdx: 0, cls: "slot-1st", medalBg: "#f59e0b", medalText: "1" },
    { rankIdx: 2, cls: "slot-3rd", medalBg: "#f97316", medalText: "3" },
  ];

  grid.innerHTML = slots.map(({ rankIdx, cls, medalBg, medalText }) => {
    const entry = sorted[rankIdx];
    if (!entry) {
      const emptySize = rankIdx===0 ? 74 : rankIdx===1 ? 60 : 52;
      const emptyFs = rankIdx===0 ? 24 : rankIdx===1 ? 18 : 15;
      const rankLabel = rankIdx + 1;
      return `
        <div class="podium-slot ${cls} podium-empty">
          <div class="podium-avatar-wrap">
            <div class="podium-avatar" style="width:${emptySize}px;height:${emptySize}px;font-size:${emptyFs}px">
              <span style="opacity:0.3;font-size:${emptyFs-2}px">#${rankLabel}</span>
            </div>
            <span class="podium-medal" style="background:${medalBg}">${medalText}</span>
          </div>
          <p class="podium-name">—</p>
          <p class="podium-score" style="font-size:13px;color:#e2e8f0">—</p>
          <p class="podium-acc">No entries yet</p>
          <div class="podium-step"></div>
        </div>`;
    }

    const [userId, s] = entry;
    const name = nameMap[userId] || "Student";
    const initials = name.split(" ").map(w => w[0]).join("").slice(0,2).toUpperCase();
    const isMe = userId === currentUser.id;
    const avatarBg = isMe
      ? (coachingProfile?.primary_color || "#1a56db")
      : `hsl(${(userId.charCodeAt(0)*53 + userId.charCodeAt(1)*37) % 360},55%,52%)`;
    const avgAcc = (s.accSum / s.count).toFixed(1);
    const sizes = { "slot-1st": { av:74, fs:24 }, "slot-2nd": { av:60, fs:18 }, "slot-3rd": { av:52, fs:15 } };
    const sz = sizes[cls];
    const youTag = isMe ? ` <span style="font-size:10px;color:#3b82f6;font-weight:700">(You)</span>` : "";
    const crownHtml = cls === "slot-1st" ? `<span class="podium-crown">👑</span>` : "";

    return `
      <div class="podium-slot ${cls}">
        <div class="podium-avatar-wrap">
          ${crownHtml}
          <div class="podium-avatar" style="width:${sz.av}px;height:${sz.av}px;background:${avatarBg};font-size:${sz.fs}px">${initials}</div>
          <span class="podium-medal" style="background:${medalBg}">${medalText}</span>
        </div>
        <p class="podium-name">${name}${youTag}</p>
        <p class="podium-score">${s.best}</p>
        <p class="podium-acc">${avgAcc}% · ${s.count} test${s.count!==1?"s":""}</p>
        <div class="podium-step"><span class="podium-rank-num">${rankIdx + 1}</span></div>
      </div>`;
  }).join("");
}

// ── RANK LIST (4th onwards) ──
function renderRankList(rest, nameMap, myTotalIdx, isRefresh) {
  const wrap = document.getElementById("rankListWrap");
  const body = document.getElementById("rankListBody");
  if (!wrap || !body) return;
  if (!rest.length) { wrap.style.display = "none"; return; }

  wrap.style.display = "block";
  const color = coachingProfile?.primary_color || "#1a56db";

  const newHtml = rest.map(([userId, s], i) => {
    const rank = i + 4;
    const name = nameMap[userId] || "Student";
    const initials = name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
    const isMe = userId === currentUser.id;
    const avatarBg = isMe ? color : `hsl(${(userId.charCodeAt(0)*53 + userId.charCodeAt(1)*37) % 360},55%,52%)`;
    const avgAcc = (s.accSum / s.count).toFixed(1);
    const acc = Number(avgAcc);
    const accColor = acc >= 80 ? "#059669" : acc >= 60 ? "#d97706" : "#dc2626";
    const accBg    = acc >= 80 ? "#f0fdf4" : acc >= 60 ? "#fffbeb" : "#fef2f2";

    return `<div class="rank-row${isMe ? " is-me" : ""}${isRefresh ? " rank-changed" : ""}" data-user="${userId}">
      <div class="rank-number">#${rank}</div>
      <div class="rank-name-col">
        <div class="rank-avatar" style="background:${avatarBg}">${initials}</div>
        <div style="min-width:0">
          <p class="rank-name">${name}${isMe ? ' <span style="font-size:10px;color:#3b82f6">(You)</span>' : ""}</p>
          <p class="rank-sub">${s.count} test${s.count!==1?"s":""}</p>
        </div>
      </div>
      <div class="rank-score rank-col-score">${s.best}</div>
      <div style="text-align:right">
        <span class="acc-pill" style="color:${accColor};background:${accBg}">${avgAcc}%</span>
      </div>
    </div>`;
  }).join("");

  body.innerHTML = newHtml;
}

// ── Helpers ──
function setText(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }

function adjustHex(hex, amount) {
  try {
    const num = parseInt(hex.replace("#",""), 16);
    const r = Math.min(255, Math.max(0, (num >> 16) + amount));
    const g = Math.min(255, Math.max(0, ((num >> 8) & 0xFF) + amount));
    const b = Math.min(255, Math.max(0, (num & 0xFF) + amount));
    return "#" + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  } catch { return hex; }
}

function showError(msg) {
  document.body.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:'Outfit',sans-serif">
      <div style="text-align:center;padding:40px">
        <div style="font-size:48px;margin-bottom:16px">⚠️</div>
        <p style="color:#64748b;margin-bottom:20px">${msg}</p>
        <a href="/coaching/dashboard.html" style="background:#1a56db;color:#fff;padding:10px 24px;border-radius:100px;font-weight:700;text-decoration:none">Go Back</a>
      </div>
    </div>`;
}