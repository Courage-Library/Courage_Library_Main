/* ─────────────────────────────────────────────────────────────
   leaderboardEngine.js  —  Courage Library
   Depends on: client (from supabaseClient.js)
───────────────────────────────────────────────────────────── */

// ✅ SUPABASE_URL and SUPABASE_ANON_KEY needed by awardTop10Badge()
// If supabaseClient.js already exposes these globally, these are safe no-ops.
if (typeof SUPABASE_URL === "undefined") {
  var SUPABASE_URL = "https://sgagswxzsxlgcspwiuoh.supabase.co";
}
if (typeof SUPABASE_ANON_KEY === "undefined") {
  var SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNnYWdzd3h6c3hsZ2NzcHdpdW9oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5NTA1NTIsImV4cCI6MjA2OTUyNjU1Mn0.ZNfk5WNDPkjKcFsRO48rEYk3dhbLYm_m21aZ-wfywo4";
}

let lbAttempts = [];
let lbAttemptId = null;
let lbTab = "all";
let lbTopScore = 0;

// ── 4-tier level helper (mirrors studentDashboard.js) ───────────────────────
function lbGetLevel(lifetimeCoins) {
  const c = lifetimeCoins || 0;
  if (c >= 6000) return { label: "Legend",   color: "#f59e0b", bg: "rgba(245,158,11,0.12)", border: "#b45309" };
  if (c >= 3000) return { label: "Luminary",  color: "#c084fc", bg: "rgba(168,85,247,0.12)",  border: "#7c3aed" };
  if (c >= 1000) return { label: "Scholar",   color: "#38bdf8", bg: "rgba(0,168,255,0.10)",   border: "#0284c7" };
  return               { label: "Seeker",    color: "#8080c0", bg: "rgba(80,80,180,0.10)",   border: "#3030a0" };
}

function lbLevelPill(lifetimeCoins) {
  const { label, color, bg, border } = lbGetLevel(lifetimeCoins);
  return `<span style="display:inline-flex;align-items:center;gap:4px;
    background:${bg};border:0.5px solid ${border};color:${color};
    padding:2px 8px 2px 5px;border-radius:100px;
    font-family:'Syne',sans-serif;font-size:.65rem;font-weight:800;letter-spacing:.04em;white-space:nowrap">
    <svg width="13" height="13" viewBox="0 0 64 64"><use href="#badge-${label.toLowerCase()}"/></svg>
    ${label}
  </span>`;
}

const LB_BADGE_META = {
  first_mock:         { icon: "🎯" },
  accuracy_80:        { icon: "🎯" },
  streak_7:           { icon: "🔥" },
  streak_14:          { icon: "🔥" },
  streak_30:          { icon: "🔥" },
  coins_1000:         { icon: "🪙" },
  coins_3000:         { icon: "💎" },
  top_10_leaderboard: { icon: "🏆" },
};

const BADGE_PRIORITY = [
  "top_10_leaderboard","coins_3000","streak_30","streak_14",
  "streak_7","accuracy_80","coins_1000","first_mock"
];

/* ── INIT ── */
document.addEventListener("DOMContentLoaded", async () => {
  const params = new URLSearchParams(window.location.search);
  lbAttemptId = params.get("attempt");
  if (!lbAttemptId) return;
  await lbLoad();
});

function clCoinIcon(size = 14, variant = 'sm') {
  return `<svg width="${size}" height="${size}" viewBox="0 0 160 160" style="vertical-align:middle;display:inline-block;flex-shrink:0">
    <use href="#CLcoin-${variant}"/>
  </svg>`;
}

/* ── LOAD DATA ── */
async function lbLoad() {
  try {
    // 1. Get exam id
    const { data: attempt, error: e1 } = await client
      .from("attempts")
      .select("scheduled_exam_id")
      .eq("id", lbAttemptId)
      .single();

    if (e1 || !attempt) {
      lbShowError();
      return;
    }

    const examId = attempt.scheduled_exam_id;

    // 2. Exam title — non-blocking, updates subtitle when ready
    client
      .from("scheduled_exams")
      .select("title")
      .eq("id", examId)
      .single()
      .then(({ data: exam }) => {
        if (exam?.title) lbSet("lb-subtitle", exam.title);
      });

    // 3. All submitted attempts for this exam — today only (IST-aware)
    const todayIST = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    const todayStart = new Date(todayIST + "T00:00:00+05:30");
    const todayEnd   = new Date(todayIST + "T23:59:59+05:30");

    const { data: attempts, error: e2 } = await client
      .from("attempts")
      .select(
        `
        id,
        user_id,
        total_score,
        accuracy,
        time_taken,
        submitted_at,
        user_profiles(full_name, total_coins, lifetime_coins, current_streak)
      `,
      )
      .eq("scheduled_exam_id", examId)
      .not("submitted_at", "is", null)
      .gte("submitted_at", todayStart.toISOString())
      .lte("submitted_at", todayEnd.toISOString());

    if (e2 || !attempts) {
      lbShowError();
      return;
    }

    // 4. Sort: score desc → accuracy desc → time asc
    attempts.sort((a, b) => {
      if (b.total_score !== a.total_score) return b.total_score - a.total_score;
      if (b.accuracy !== a.accuracy) return b.accuracy - a.accuracy;
      return new Date(a.submitted_at) - new Date(b.submitted_at);
    });

    // Keep only best attempt per user
    const bestByUser = new Map();
    attempts.forEach((a) => {
      if (!bestByUser.has(a.user_id)) {
        bestByUser.set(a.user_id, a);
      }
    });
    lbAttempts = Array.from(bestByUser.values());

    // Fetch badges for all users (batch)
    const userIds = lbAttempts.map(a => a.user_id);
    let badgeMap = new Map();
    if (userIds.length > 0) {
      const { data: allBadges } = await client
        .from("user_badges")
        .select("user_id, badge_type")
        .in("user_id", userIds);
      (allBadges ?? []).forEach(b => {
        if (!badgeMap.has(b.user_id)) badgeMap.set(b.user_id, []);
        badgeMap.get(b.user_id).push(b.badge_type);
      });
    }

    lbRenderAll(lbAttempts, badgeMap);

    // If very few attempts — show encouraging context message
    if (lbAttempts.length <= 2) {
      const subtitle = document.getElementById("lb-subtitle");
      if (subtitle && !document.getElementById("lb-early-msg")) {
        const msg = document.createElement("div");
        msg.id = "lb-early-msg";
        msg.style.cssText = "text-align:center;font-size:.78rem;color:#6b7280;margin:8px 0 16px;padding:10px 16px;background:#f8faff;border-radius:10px;border:1px solid #e8edf5;";
        msg.innerHTML = `<i class="fas fa-info-circle" style="color:#3b82f6;margin-right:5px"></i>
          Only ${lbAttempts.length} attempt${lbAttempts.length !== 1 ? "s" : ""} so far — results update live!
          Share the exam link to see more students on the board.`;
        subtitle.insertAdjacentElement("afterend", msg);
      }
    }

    // Award top-10 badge if current user qualifies
    const myIdx  = lbAttempts.findIndex(a => a.id === lbAttemptId);
    const myRank = myIdx + 1;
    if (myIdx >= 0 && myRank <= 10) {
      awardTop10Badge().catch(err => console.warn("top-10 badge skipped:", err));
    }

  } catch (err) {
    console.error("Leaderboard error:", err);
    lbShowError();
  }
}

/* ── AWARD TOP-10 BADGE ── */
async function awardTop10Badge() {
  const { data: { session } } = await client.auth.getSession();
  if (!session) return;

  const res = await fetch(
    `${SUPABASE_URL}/functions/v1/award-badge`,
    {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${session.access_token}`,
        "apikey":        SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ badge_type: "top_10_leaderboard" }),
    }
  );
  const data = await res.json().catch(() => ({}));
  if (data.success) lbToast("🏆 Badge unlocked: Top 10 Leaderboard!");
}

/* ── RENDER ALL ── */
function lbRenderAll(attempts, badgeMap = new Map()) {
  const skel = document.getElementById("lb-skeleton");
  if (skel) skel.style.display = "none";

  const total = attempts.length;
  const scores = attempts.map((a) => a.total_score || 0);
  const avg = total ? Math.round(scores.reduce((s, v) => s + v, 0) / total) : 0;
  lbTopScore = scores[0] || 0;

  lbSet("lb-stat-total", total);
  lbSet("lb-stat-avg", avg);
  lbSet("lb-stat-top", lbTopScore);

  // Build rank map ONCE — O(n) not O(n²)
  const rankMap = new Map();
  attempts.forEach((a, i) => rankMap.set(a.id, i + 1));

  const myIdx = attempts.findIndex((a) => a.id === lbAttemptId);
  const myRank = myIdx >= 0 ? myIdx + 1 : 0;

  // ── YOUR RANK CARD ──
  if (myIdx >= 0) {
    const me = attempts[myIdx];

    // Correct percentile: rank 1 of N → 100th percentile
    const pct =
      total > 1 ? Math.round(((total - myRank) / (total - 1)) * 100) : 100;
    const suffix =
      pct === 11 || pct === 12 || pct === 13
        ? "th"
        : pct % 10 === 1
          ? "st"
          : pct % 10 === 2
            ? "nd"
            : pct % 10 === 3
              ? "rd"
              : "th";

    lbShow("lb-your-card");
    lbSet("lb-your-rank-num", `#${myRank}`);
    lbSet("lb-your-rank-of", `of ${total}`);
    lbSet("lb-pct-val", `${pct}${suffix}`);

    const ring = document.getElementById("lb-pct-ring");
    if (ring) ring.style.setProperty("--pct", `${pct}%`);

    const pills = document.getElementById("lb-your-pills");
    if (pills)
      pills.innerHTML = `
      <span class="lb-pill lb-pill-score">
        <i class="fas fa-star" style="color:#3B82F6;font-size:.7rem"></i>
        ${me.total_score} marks
      </span>
      <span class="lb-pill lb-pill-acc">
        <i class="fas fa-bullseye" style="color:#059669;font-size:.7rem"></i>
        ${me.accuracy}%
      </span>
      <span class="lb-pill lb-pill-time">
        <i class="fas fa-clock" style="color:#6B7280;font-size:.7rem"></i>
        ${lbFmt(me.time_taken)}
      </span>
    `;

    // Score bar: your score vs top score
    const barPct =
      lbTopScore > 0 ? Math.round((me.total_score / lbTopScore) * 100) : 0;
    const barEl = document.getElementById("lb-your-bar");
    if (barEl)
      barEl.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-top:10px;">
        <div style="flex:1;height:5px;background:rgba(255,255,255,.18);border-radius:999px;overflow:hidden;">
          <div style="width:${barPct}%;height:100%;
                      background:linear-gradient(90deg,#60A5FA,#A78BFA);
                      border-radius:999px;transition:width 1.1s ease .3s;"></div>
        </div>
        <span style="font-size:.7rem;color:rgba(255,255,255,.55);white-space:nowrap;">
          ${barPct}% of top score
        </span>
      </div>
    `;

    // Confetti for top 3
    if (myRank <= 3) lbConfetti();
  }

  // ── PODIUM ──
  if (total >= 1) {
    lbShow("lb-podium");
    lbBuildPodium(attempts);
  }

  // ── LIST ──
  lbRenderList(attempts, rankMap, badgeMap);
}

/* ── PODIUM ── */
function lbBuildPodium(attempts) {
  const slots = [attempts[1], attempts[0], attempts[2]];
  const rankNums = [2, 1, 3];
  const rankClass = ["r2", "r1", "r3"];
  const crowns = [
    '<i class="fas fa-medal"     style="color:#A8B8C8"></i>',
    '<i class="fas fa-crown"     style="color:#F5A623"></i>',
    '<i class="fas fa-medal"     style="color:#CD7F32"></i>',
  ];

  const container = document.getElementById("lb-podium-container");
  if (!container) return;
  container.innerHTML = "";

  slots.forEach((a, i) => {
    if (!a) return;
    const fullName = a.user_profiles?.full_name || "Student";
    const parts = fullName.trim().split(" ");
    // First name only in podium — avoids overflow entirely
    const dispName = parts[0];
    const initials = parts
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
    const isYou = a.id === lbAttemptId;
    const rn = rankNums[i];

    const coins    = a.user_profiles?.total_coins    ?? null;
    const ltCoins  = a.user_profiles?.lifetime_coins  ?? coins ?? 0;
    const streak   = a.user_profiles?.current_streak  ?? 0;
    const coinsChip = coins !== null
      ? `<div style="margin-top:6px;display:inline-flex;align-items:center;gap:4px;background:rgba(245,166,35,.15);color:#92400e;font-size:.68rem;font-weight:600;padding:2px 8px;border-radius:999px;">
           <svg width="16" height="16"><use href="#CLcoin-sm"/></svg>${coins.toLocaleString('en-IN')}
         </div>`
      : '';

    const div = document.createElement("div");
    div.className = `lb-podium-card ${rankClass[i]}`;
    div.innerHTML = `
      <div class="lb-crown">${crowns[i]}</div>
      <div class="lb-avatar">${initials}</div>
      <div class="lb-podium-body">
        <span class="lb-podium-name" title="${fullName}">${dispName}</span>
        ${isYou ? '<div style="margin-top:4px;"><span class="lb-you-badge">You</span></div>' : ""}
        <div class="lb-podium-score">${a.total_score}</div>
        <div class="lb-podium-score-label">MARKS</div>
        ${coinsChip}
        <div style="margin-top:6px;">${lbLevelPill(ltCoins)}</div>
      </div>
      <div class="lb-podium-base">#${rn}</div>
    `;
    container.appendChild(div);
  });
}

/* ── LIST ── */
function lbRenderList(source, rankMap, badgeMap = new Map()) {
  if (!rankMap) {
    rankMap = new Map();
    lbAttempts.forEach((a, i) => rankMap.set(a.id, i + 1));
  }

  const container = document.getElementById("lb-list");
  if (!container) return;
  container.innerHTML = "";

  const list = lbTab === "top10" ? source.slice(0, 10) : source;
  const myInList = list.some((a) => a.id === lbAttemptId);

  if (list.length === 0) {
    // Show encouraging empty state
    const emptyEl = document.getElementById("lb-empty");
    if (emptyEl) {
      emptyEl.classList.remove("hidden");
      emptyEl.innerHTML = `
        <div style="text-align:center;padding:40px 20px">
          <div style="font-size:2.5rem;margin-bottom:12px">🏆</div>
          <div style="font-weight:700;font-size:1rem;color:#374151;margin-bottom:6px">
            Be the first to complete this test!
          </div>
          <div style="font-size:.82rem;color:#6b7280;max-width:260px;margin:0 auto;line-height:1.55">
            The first to finish — results update live! You could top the leaderboard.
          </div>
        </div>`;
    }
    return;
  }
  document.getElementById("lb-empty")?.classList.add("hidden");

  list.forEach((a, idx) => {
    const rank = rankMap.get(a.id) || idx + 1;
    const isYou = a.id === lbAttemptId;
    const name = a.user_profiles?.full_name || "Student";
    const initials = name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
    const medal =
      rank === 1
        ? '<i class="fas fa-trophy"  style="color:#F5A623;font-size:.95rem"></i>'
        : rank === 2
        ? '<i class="fas fa-medal"   style="color:#A8B8C8;font-size:.95rem"></i>'
        : rank === 3
        ? '<i class="fas fa-medal"   style="color:#CD7F32;font-size:.95rem"></i>'
        : "";
    const delay = Math.min(idx, 10) * 0.05;

    const coins  = a.user_profiles?.total_coins      ?? null;
    const ltCoins= a.user_profiles?.lifetime_coins    ?? coins ?? 0;
    const streak = a.user_profiles?.current_streak    ?? 0;

    // Badge icons — top 2 most prestigious
    const userBadges = badgeMap.get(a.user_id) ?? [];
    const topBadges  = BADGE_PRIORITY.filter(b => userBadges.includes(b)).slice(0, 2);
    const badgeHtml  = topBadges.map(b => `<span title="${b.replace(/_/g,' ')}">${LB_BADGE_META[b]?.icon || "🏅"}</span>`).join("");

    const subLine = (coins !== null || streak >= 2) ? `
      <div style="display:flex;align-items:center;gap:6px;margin-top:3px;flex-wrap:wrap;">
        ${coins !== null ? `<span class="lb-pill lb-pill-coin"><svg width="16" height="16"><use href="#CLcoin-sm"/></svg>${coins.toLocaleString('en-IN')}</span>` : ''}
        ${streak >= 2    ? `<span class="lb-pill lb-pill-streak"><i class="fas fa-fire" style="font-size:.65rem"></i>${streak}d streak</span>` : ''}
        ${lbLevelPill(ltCoins)}
      </div>` : `<div style="margin-top:3px;">${lbLevelPill(ltCoins)}</div>`;

    const row = document.createElement("div");
    row.className = `lb-row${isYou ? " lb-you" : ""}`;
    row.dataset.name = name.toLowerCase();
    row.style.animationDelay = `${delay}s`;

    row.innerHTML = `
      <div class="lb-rank-num">${medal || rank}</div>
      <div class="lb-mini-av">${initials}</div>
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
          <span style="font-weight:600;font-size:.88rem;">${name}</span>
          ${badgeHtml ? `<span style="font-size:.9rem;line-height:1;">${badgeHtml}</span>` : ''}
          ${isYou ? '<span class="lb-you-badge">You</span>' : ""}
        </div>
        ${subLine}
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0;">
        <div style="display:flex;gap:5px;">
          <span class="lb-pill lb-pill-score">${a.total_score}</span>
          <span class="lb-pill lb-pill-acc">${a.accuracy}%</span>
        </div>
        <span class="lb-pill lb-pill-time">${lbFmt(a.time_taken)}</span>
      </div>
    `;
    container.appendChild(row);
  });

  // ── PIN YOUR ROW if outside visible list ──
  if (!myInList && lbAttemptId) {
    const me = lbAttempts.find((a) => a.id === lbAttemptId);
    const myRank = rankMap.get(lbAttemptId);
    if (me && myRank) {
      const initials = (me.user_profiles?.full_name || "ST")
        .split(" ")
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();
      const sep = document.createElement("div");
      sep.style.cssText =
        "text-align:center;font-size:.75rem;color:#94A3B8;padding:4px 0;letter-spacing:.08em;";
      sep.textContent = "· · · · ·";
      container.appendChild(sep);

      const myCoins   = me.user_profiles?.total_coins    ?? null;
      const myLtCoins = me.user_profiles?.lifetime_coins  ?? myCoins ?? 0;
      const myStreak  = me.user_profiles?.current_streak  ?? 0;
      const mySubLine = (myCoins !== null || myStreak >= 2) ? `
        <div style="display:flex;align-items:center;gap:6px;margin-top:3px;flex-wrap:wrap;">
          ${myCoins !== null ? `<span class="lb-pill lb-pill-coin"><svg width="16" height="16"><use href="#CLcoin-sm"/></svg>${myCoins.toLocaleString('en-IN')}</span>` : ''}
          ${myStreak >= 2    ? `<span class="lb-pill lb-pill-streak"><i class="fas fa-fire" style="font-size:.65rem"></i>${myStreak}d streak</span>` : ''}
          ${lbLevelPill(myLtCoins)}
        </div>` : `<div style="margin-top:3px;">${lbLevelPill(myLtCoins)}</div>`;

      const pinned = document.createElement("div");
      pinned.className = "lb-row lb-you";
      pinned.style.cssText = "opacity:1;transform:none;animation:none;";
      pinned.innerHTML = `
        <div class="lb-rank-num">${myRank}</div>
        <div class="lb-mini-av">${initials}</div>
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
            <span style="font-weight:600;font-size:.88rem;">${me.user_profiles?.full_name || "Student"}</span>
            <span class="lb-you-badge">You</span>
          </div>
          ${mySubLine}
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0;">
          <div style="display:flex;gap:5px;">
            <span class="lb-pill lb-pill-score">${me.total_score}</span>
            <span class="lb-pill lb-pill-acc">${me.accuracy}%</span>
          </div>
          <span class="lb-pill lb-pill-time">${lbFmt(me.time_taken)}</span>
        </div>
      `;
      container.appendChild(pinned);
    }
  }
}

/* ── TAB SWITCH ── */
function lbSetTab(btn, tab) {
  document
    .querySelectorAll(".lb-tab")
    .forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  lbTab = tab;
  const q = document.getElementById("lb-search")?.value.toLowerCase() || "";
  const src = q
    ? lbAttempts.filter((a) =>
        (a.user_profiles?.full_name || "").toLowerCase().includes(q),
      )
    : lbAttempts;
  lbRenderList(src);
}

/* ── SEARCH ── */
function lbFilter() {
  const q = document.getElementById("lb-search")?.value.toLowerCase() || "";
  const src = q
    ? lbAttempts.filter((a) =>
        (a.user_profiles?.full_name || "").toLowerCase().includes(q),
      )
    : lbAttempts;
  lbRenderList(src);
}

/* ── SHARE ── */
function lbShare() {
  const myIdx = lbAttempts.findIndex((a) => a.id === lbAttemptId);
  const myRank = myIdx >= 0 ? myIdx + 1 : "?";
  const total = lbAttempts.length;
  const exam = document.getElementById("lb-subtitle")?.textContent || "an exam";
  const text = `I ranked #${myRank} out of ${total} students in "${exam}" on Courage Library!`;

  if (navigator.share) {
    navigator
      .share({
        title: "My Exam Result — Courage Library",
        text,
        url: window.location.href,
      })
      .catch(() => {});
  } else {
    navigator.clipboard.writeText(`${text}\n${window.location.href}`);
    lbToast('<i class="fas fa-clipboard-check" style="margin-right:5px"></i>Result link copied!');
  }
}

/* ── CONFETTI (lightweight, CSS canvas only) ── */
function lbConfetti() {
  const colors = [
    "#3B82F6",
    "#6366F1",
    "#F5A623",
    "#10B981",
    "#F97316",
    "#EC4899",
  ];
  const canvas = document.createElement("canvas");
  canvas.style.cssText =
    "position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999;";
  document.body.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const pieces = Array.from({ length: 110 }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * -canvas.height,
    r: Math.random() * 6 + 3,
    color: colors[Math.floor(Math.random() * colors.length)],
    speed: Math.random() * 3 + 2,
    spin: Math.random() * 0.18 - 0.09,
    angle: 0,
    drift: (Math.random() - 0.5) * 0.8,
  }));

  let frame = 0;
  (function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pieces.forEach((p) => {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 2);
      ctx.restore();
      p.y += p.speed;
      p.angle += p.spin;
      p.x += p.drift;
    });
    if (++frame < 200) requestAnimationFrame(draw);
    else canvas.remove();
  })();
}

/* ── ERROR STATE ── */
function lbShowError() {
  const skel = document.getElementById("lb-skeleton");
  if (skel)
    skel.innerHTML = `
    <div style="text-align:center;padding:48px 20px;color:#64748B;">
      <div style="font-size:2.5rem;margin-bottom:12px;color:#F59E0B;">
        <i class="fas fa-triangle-exclamation"></i>
      </div>
      <div style="font-weight:600;font-size:1rem;margin-bottom:6px;color:#374151;">
        Couldn't load results
      </div>
      <div style="font-size:.85rem;margin-bottom:18px;">
        Please check your connection and try again.
      </div>
      <button onclick="location.reload()"
        style="background:#2563EB;color:white;border:none;padding:9px 24px;
               border-radius:10px;font-size:.88rem;font-weight:600;cursor:pointer;">
        <i class="fas fa-rotate-right" style="margin-right:4px"></i>Retry
      </button>
    </div>
  `;
}

/* ── HELPERS ── */
function lbFmt(secs) {
  if (!secs) return "—";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}
function lbSet(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}
function lbShow(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = "";
}
function lbToast(msg) {
  const t = document.getElementById("lb-toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 3000);
}