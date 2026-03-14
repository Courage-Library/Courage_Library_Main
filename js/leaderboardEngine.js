/* ─────────────────────────────────────────────────────────────
   leaderboardEngine.js  —  Courage Library
   Depends on: client (from supabaseClient.js)
───────────────────────────────────────────────────────────── */

let lbAttempts = [];
let lbAttemptId = null;
let lbTab = "all";
let lbTopScore = 0;

/* ── INIT ── */
document.addEventListener("DOMContentLoaded", async () => {
  const params = new URLSearchParams(window.location.search);
  lbAttemptId = params.get("attempt");
  if (!lbAttemptId) return;
  await lbLoad();
});

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

    // 3. All submitted attempts for this exam
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
        user_profiles(full_name)
      `,
      )
      .eq("scheduled_exam_id", examId)
      .not("submitted_at", "is", null);

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
    lbRenderAll(lbAttempts);
  } catch (err) {
    console.error("Leaderboard error:", err);
    lbShowError();
  }
}

/* ── RENDER ALL ── */
function lbRenderAll(attempts) {
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
  lbRenderList(attempts, rankMap);
}

/* ── PODIUM ── */
function lbBuildPodium(attempts) {
  const slots = [attempts[1], attempts[0], attempts[2]];
  const rankNums = [2, 1, 3];
  const rankClass = ["r2", "r1", "r3"];
  const crowns = ["🥈", "👑", "🥉"];

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
      </div>
      <div class="lb-podium-base">#${rn}</div>
    `;
    container.appendChild(div);
  });
}

/* ── LIST ── */
function lbRenderList(source, rankMap) {
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
    document.getElementById("lb-empty")?.classList.remove("hidden");
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
      rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : "";
    const delay = Math.min(idx, 10) * 0.05;

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
          ${isYou ? '<span class="lb-you-badge">You</span>' : ""}
        </div>
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
  const text = `I ranked #${myRank} out of ${total} students in "${exam}" on Courage Library! 🚀`;

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
    lbToast("📋 Result link copied!");
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
      <div style="font-size:2.5rem;margin-bottom:12px;">⚠️</div>
      <div style="font-weight:600;font-size:1rem;margin-bottom:6px;color:#374151;">
        Couldn't load results
      </div>
      <div style="font-size:.85rem;margin-bottom:18px;">
        Please check your connection and try again.
      </div>
      <button onclick="location.reload()"
        style="background:#2563EB;color:white;border:none;padding:9px 24px;
               border-radius:10px;font-size:.88rem;font-weight:600;cursor:pointer;">
        ↺ Retry
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
