// coachingDashboard.js — Courage Library B2B Coaching Dashboard
// Features: Live Supabase Realtime subscription, auto-refresh on new exam submissions

const SUPABASE_URL = "https://sgagswxzsxlgcspwiuoh.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNnYWdzd3h6c3hsZ2NzcHdpdW9oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5NTA1NTIsImV4cCI6MjA2OTUyNjU1Mn0.ZNfk5WNDPkjKcFsRO48rEYk3dhbLYm_m21aZ-wfywo4";

const { createClient } = supabase;
const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── State ──
let currentUser = null;
let coachingProfile = null;
let userProfile = null;
let coachingExamIds = []; // used for realtime filter
let realtimeChannel = null;
let lbRefreshDebounce = null;
let statsRefreshDebounce = null;

// ── Entry point ──
document.addEventListener("DOMContentLoaded", async () => {
  await initDashboard();
});

async function initDashboard() {
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    window.location.href = "/index.html?action=login";
    return;
  }
  currentUser = user;

  const { data: profile } = await client
    .from("user_profiles")
    .select("full_name, coaching_id, total_coins, current_streak, max_streak")
    .eq("id", user.id)
    .single();

  if (!profile) {
    window.location.href = "/index.html";
    return;
  }
  userProfile = profile;

  if (!profile.coaching_id) {
    window.location.href = "/mock/dashboard.html";
    return;
  }

  const { data: coaching } = await client
    .from("coaching_centers")
    .select("id, name, slug, primary_color, logo_url, city")
    .eq("id", profile.coaching_id)
    .single();

  if (!coaching) {
    showError("Your coaching center is currently inactive.");
    return;
  }
  coachingProfile = coaching;

  applyBranding(coaching);

  const firstName = (profile.full_name || "Student").split(" ")[0];
  setText("greetingName", firstName);

  const coins = profile.total_coins || 0;
  if (coins > 0) {
    setText("statCoins", coins.toLocaleString("en-IN"));
    const badge = document.getElementById("coinsBadge");
    if (badge) badge.style.display = "flex";
  }

  const streak = profile.current_streak || 0;
  setText("statStreak", streak ? `${streak}d` : "0d");
  setText("sideStreak", streak);

  await Promise.all([
    loadUpcomingExams(coaching.id),
    loadRecentResults(user.id, coaching.id),
    loadLeaderboardPreview(coaching.id),
    loadStudentStats(user.id, coaching.id),
  ]);

  // ── Start live realtime channel ──
  subscribeToLive(coaching.id);
}

// ── Apply coaching branding ──
function applyBranding(coaching) {
  const color = coaching.primary_color || "#1a56db";
  const name = coaching.name;

  document
    .querySelectorAll(".coaching-name")
    .forEach((el) => (el.textContent = name));
  document.title = `Dashboard | ${name}`;

  const hero = document.getElementById("heroBanner");
  if (hero)
    hero.style.background = `linear-gradient(135deg, ${color} 0%, ${shiftHex(color, -25)} 100%)`;

  const examIcon = document.getElementById("examIconWrap");
  if (examIcon) {
    examIcon.style.background = color + "18";
    examIcon.querySelector("i").style.color = color;
  }

  document.querySelectorAll(".coaching-logo").forEach((el) => {
    if (coaching.logo_url) {
      el.src = coaching.logo_url;
    } else {
      el.src =
        "https://ui-avatars.com/api/?name=" +
        encodeURIComponent(coaching.name) +
        "&background=1a56db&color=fff&bold=true";
    }

    el.style.display = "block";
  });

  if (coaching.city) setText("coachingCity", `📍 ${coaching.city}`);
}

// ─────────────────────────────────────────────────────────────
//  REALTIME: subscribe to attempts table changes for this coaching
// ─────────────────────────────────────────────────────────────
async function subscribeToLive(coachingId) {
  // We need exam IDs to filter
  const { data: exams } = await client
    .from("scheduled_exams")
    .select("id")
    .eq("coaching_id", coachingId);
  coachingExamIds = (exams || []).map((e) => e.id);

  if (!coachingExamIds.length) return;

  // Unsubscribe any prior channel
  if (realtimeChannel) {
    await client.removeChannel(realtimeChannel);
  }

  realtimeChannel = client
    .channel("dashboard-live-" + coachingId)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "attempts",
        // Filter: submitted_at goes from null → value (exam submitted)
      },
      async (payload) => {
        const row = payload.new;
        if (!row) return;

        // Only care about this coaching's exams
        if (!coachingExamIds.includes(row.scheduled_exam_id)) return;

        // Only care when it's just been submitted
        if (!row.submitted_at || payload.old?.submitted_at) return;

        // If it's our own submission, refresh stats & results
        if (row.user_id === currentUser.id) {
          debouncedRefresh(
            () => {
              loadRecentResults(currentUser.id, coachingProfile.id);
              loadStudentStats(currentUser.id, coachingProfile.id);
            },
            statsRefreshDebounce,
            800,
          );
        }

        // Always refresh leaderboard (someone's score changed)
        debouncedRefresh(
          () => {
            loadLeaderboardPreview(coachingProfile.id);
          },
          lbRefreshDebounce,
          1200,
        );

        // Push live ticker message
        const name = await getDisplayName(row.user_id);
        const scoreStr =
          row.total_score !== null ? ` · ${row.total_score} pts` : "";
        const isMe = row.user_id === currentUser.id;
        const msg = isMe
          ? `✅ You just submitted an exam${scoreStr}`
          : `🎯 ${name} submitted an exam${scoreStr} — leaderboard updated`;

        if (window.pushTickerEvent) window.pushTickerEvent(msg);
      },
    )
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "attempts" },
      async (payload) => {
        const row = payload.new;
        if (!row || !coachingExamIds.includes(row.scheduled_exam_id)) return;
        if (row.user_id === currentUser.id) return; // don't announce own start

        const name = await getDisplayName(row.user_id);
        if (window.pushTickerEvent)
          window.pushTickerEvent(`📝 ${name} started an exam`);
      },
    )
    .subscribe();
}

// Cache for user display names (avoid repeated fetches)
const nameCache = {};
async function getDisplayName(userId) {
  if (nameCache[userId]) return nameCache[userId];
  const { data } = await client
    .from("user_profiles")
    .select("full_name")
    .eq("id", userId)
    .single();
  const name = data?.full_name?.split(" ")[0] || "A student";
  nameCache[userId] = name;
  return name;
}

function debouncedRefresh(fn, timerRef, delay) {
  if (timerRef) clearTimeout(timerRef);
  timerRef = setTimeout(fn, delay);
  return timerRef;
}

// ── Load upcoming exams ──
async function loadUpcomingExams(coachingId) {
  const container = document.getElementById("examList");

  const { data: exams, error } = await client
    .from("scheduled_exams")
    .select(
      `
      id, mode, schedule_type, day_of_week, is_active,
      start_datetime, end_datetime, attempt_limit,
      exam_patterns!pattern_id ( pattern_name, duration_minutes, total_questions, negative_marking ),
      exam_categories ( name )
    `,
    )
    .eq("coaching_id", coachingId)
    .eq("is_active", true)
    .order("start_datetime", { ascending: true });

  if (error) {
    container.innerHTML = errorHTML(error.message);
    return;
  }

  if (!exams || exams.length === 0) {
    container.innerHTML = `
      <div class="empty">
        <i class="fas fa-calendar-times empty-icon"></i>
        <p class="empty-msg">No exams scheduled yet</p>
        <small class="empty-sub">Your coaching will schedule tests soon. Check back!</small>
      </div>`;
    return;
  }

  const examIds = exams.map((e) => e.id);
  const { data: attempts } = await client
    .from("attempts")
    .select(
      "id, scheduled_exam_id, submitted_at, started_at, total_score, accuracy",
    )
    .eq("user_id", currentUser.id)
    .in("scheduled_exam_id", examIds);

  const attemptMap = {};
  (attempts || []).forEach((a) => {
    if (!attemptMap[a.scheduled_exam_id]) attemptMap[a.scheduled_exam_id] = [];
    attemptMap[a.scheduled_exam_id].push(a);
  });

  container.innerHTML = "";
  exams.forEach((exam, i) => {
    const card = buildExamCard(exam, attemptMap[exam.id] || [], i);
    container.appendChild(card);
  });
}

// ── Build exam card ──
function buildExamCard(exam, myAttempts, index) {
  const pattern = exam.exam_patterns || {};
  const completed = myAttempts.filter((a) => a.submitted_at);
  const incomplete = myAttempts.find((a) => !a.submitted_at);
  const now = new Date();
  const color = coachingProfile?.primary_color || "#1a56db";

  const isExpired = exam.end_datetime && new Date(exam.end_datetime) < now;
  const notStarted = exam.start_datetime && new Date(exam.start_datetime) > now;
  const limitReached =
    exam.attempt_limit && completed.length >= exam.attempt_limit;
  const alreadyDone = completed.length > 0;
  const lastAttempt = completed[completed.length - 1];
  const negVal =
    pattern.negative_marking > 0 ? `-${pattern.negative_marking}` : "None";

  let stripeColor = color;
  let badgeHtml = "";
  let btnHtml = "";
  let resultStrip = "";

  if (isExpired) {
    stripeColor = "#9ca3af";
    badgeHtml = badge("Expired", "#dc2626", "#fef2f2");
    btnHtml = disabledBtn("fa-lock", "Expired", "#9ca3af");
  } else if (notStarted) {
    const startStr = new Date(exam.start_datetime).toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
    stripeColor = "#f59e0b";
    badgeHtml = badge("Upcoming", "#d97706", "#fffbeb");
    btnHtml = disabledBtn("fa-clock", `Starts ${startStr}`, "#f59e0b");
  } else if (limitReached) {
    stripeColor = "#9ca3af";
    badgeHtml = badge("Limit Reached", "#6b7280", "#f3f4f6");
    btnHtml = disabledBtn("fa-ban", "Limit Reached", "#9ca3af");
  } else if (alreadyDone && !incomplete) {
    stripeColor = "#10b981";
    badgeHtml = badge("✓ Completed", "#059669", "#f0fdf4");
    const acc = Number(lastAttempt.accuracy || 0).toFixed(1);
    resultStrip = `
      <div class="exam-result-strip">
        <span class="score">${lastAttempt.total_score ?? 0}</span>
        <span style="font-size:11px;color:#059669;font-weight:600;margin-left:6px">pts</span>
        <span class="acc">${acc}% accuracy</span>
      </div>`;
    btnHtml = `
      <button disabled class="btn" style="background:#f0fdf4;color:#059669;border:1px solid #bbf7d0;cursor:default">
        <i class="fas fa-check-circle"></i> Completed
      </button>
      ${lastAttempt ? `<a href="/coaching/result.html?attempt=${lastAttempt.id}" class="btn btn-ghost" style="text-decoration:none"><i class="fas fa-chart-bar"></i> View Result & Analysis</a>` : ""}`;
  } else if (incomplete) {
    stripeColor = "#3b82f6";
    badgeHtml = `<span class="exam-badge" style="background:#eff6ff;color:#2563eb;animation:pulse 1.5s infinite">
      <span style="width:6px;height:6px;border-radius:50%;background:#3b82f6;animation:pulse-ring 1.4s infinite;display:inline-block"></span>
      In Progress</span>`;
    btnHtml = `<button onclick="resumeExam('${incomplete.id}', this)" class="btn btn-primary" style="background:linear-gradient(135deg,#059669,#10b981)">
      <i class="fas fa-redo"></i> Resume Exam
    </button>`;
  } else {
    badgeHtml = badge("Live", color, color + "15");
    btnHtml = `<button onclick="startExam('${exam.id}', this)" class="btn btn-primary" style="background:linear-gradient(135deg,${color},${shiftHex(color, -20)})">
      <i class="fas fa-play"></i> Start Exam
    </button>`;
  }

  const div = document.createElement("div");
  div.className = "exam-card";
  div.style.animationDelay = `${index * 0.07}s`;
  div.innerHTML = `
    <div class="exam-card-stripe" style="background:${stripeColor}"></div>
    <div class="exam-card-body">
      <div class="exam-header">
        <div style="flex:1;min-width:0">
          <p class="exam-category">${exam.exam_categories?.name || ""}</p>
          <h3 class="exam-name">${pattern.pattern_name || "Mock Test"}</h3>
        </div>
        ${badgeHtml}
      </div>
      <div class="exam-stats">
        <div class="exam-stat-box">
          <div class="val">${pattern.duration_minutes ?? "—"}m</div>
          <div class="lbl">Duration</div>
        </div>
        <div class="exam-stat-box">
          <div class="val">${pattern.total_questions ?? "—"}</div>
          <div class="lbl">Questions</div>
        </div>
        <div class="exam-stat-box">
          <div class="val">${negVal}</div>
          <div class="lbl">Negative</div>
        </div>
      </div>
      ${resultStrip}
      ${btnHtml}
    </div>`;

  return div;
}

function badge(text, color, bg) {
  return `<span class="exam-badge" style="color:${color};background:${bg}">${text}</span>`;
}
function disabledBtn(icon, label, color) {
  return `<button disabled class="btn" style="background:#f8fafc;color:${color};border:1px solid #e4ecf7;cursor:not-allowed">
    <i class="fas ${icon}"></i> ${label}
  </button>`;
}

// ── Load recent results ──
async function loadRecentResults(userId, coachingId) {
  const container = document.getElementById("recentResults");

  const { data, error } = await client
    .from("attempts")
    .select(
      `
      id, total_score, accuracy, submitted_at,
      scheduled_exams!inner ( coaching_id, exam_patterns!pattern_id ( pattern_name ) )
    `,
    )
    .eq("user_id", userId)
    .eq("scheduled_exams.coaching_id", coachingId)
    .not("submitted_at", "is", null)
    .order("submitted_at", { ascending: false })
    .limit(5);

  if (error || !data || data.length === 0) {
    container.innerHTML = `<p style="font-size:12px;color:var(--text-3);text-align:center;padding:16px 0;font-weight:600">No results yet. Attempt your first exam!</p>`;
    setText("statAttempts", "0");
    setText("statAvgScore", "0%");
    setText("statBestScore", "—");
    return;
  }

  setText("statAttempts", data.length);
  const avgAcc =
    data.reduce((s, a) => s + Number(a.accuracy || 0), 0) / data.length;
  setText("statAvgScore", avgAcc.toFixed(1) + "%");
  setText("statBestScore", Math.max(...data.map((a) => a.total_score || 0)));

  container.innerHTML = "";
  data.forEach((attempt) => {
    const acc = Number(attempt.accuracy || 0);
    const accColor = acc >= 80 ? "#059669" : acc >= 60 ? "#d97706" : "#dc2626";
    const accBg = acc >= 80 ? "#f0fdf4" : acc >= 60 ? "#fffbeb" : "#fef2f2";
    const name =
      attempt.scheduled_exams?.exam_patterns?.pattern_name || "Mock Test";
    const date = attempt.submitted_at
      ? new Date(attempt.submitted_at).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
        })
      : "—";

    const row = document.createElement("div");
    row.className = "result-row";
    row.innerHTML = `
      <div class="result-dot" style="background:${accColor}"></div>
      <div class="result-info">
        <p class="result-name">${name}</p>
        <p class="result-date">${date}</p>
      </div>
      <div class="result-right">
        <span class="result-score">${attempt.total_score ?? 0}</span>
        <span class="acc-pill" style="color:${accColor};background:${accBg}">${acc.toFixed(1)}%</span>
        <a href="/coaching/result.html?attempt=${attempt.id}" class="result-link"><i class="fas fa-external-link-alt"></i></a>
      </div>`;
    container.appendChild(row);
  });
}

// ── Load leaderboard preview ──
async function loadLeaderboardPreview(coachingId) {
  const container = document.getElementById("leaderboardPreview");

  const { data: examIds } = await client
    .from("scheduled_exams")
    .select("id")
    .eq("coaching_id", coachingId);

  if (!examIds?.length) {
    container.innerHTML = `<p style="font-size:12px;color:var(--text-3);text-align:center;padding:12px 0;font-weight:600">No exams yet.</p>`;
    return;
  }

  const ids = examIds.map((e) => e.id);

  const { data: attempts } = await client
    .from("attempts")
    .select("user_id, total_score, accuracy")
    .in("scheduled_exam_id", ids)
    .not("submitted_at", "is", null)
    .order("total_score", { ascending: false });

  if (!attempts?.length) {
    container.innerHTML = `<p style="font-size:12px;color:var(--text-3);text-align:center;padding:12px 0;font-weight:600">No attempts yet. Be first!</p>`;
    return;
  }

  const userBest = {};
  attempts.forEach((a) => {
    if (!userBest[a.user_id] || a.total_score > userBest[a.user_id].score) {
      userBest[a.user_id] = { score: a.total_score || 0 };
    }
  });

  const sorted = Object.entries(userBest)
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, 5);

  const { data: profiles } = await client
    .from("user_profiles")
    .select("id, full_name")
    .in(
      "id",
      sorted.map(([id]) => id),
    );

  const nameMap = {};
  (profiles || []).forEach((p) => {
    nameMap[p.id] = p.full_name || "Student";
  });

  // My rank
  const myIdx = sorted.findIndex(([id]) => id === currentUser.id);
  if (myIdx !== -1) {
    setText("myRank", `#${myIdx + 1}`);
    const rankBadge = document.getElementById("heroRankBadge");
    if (rankBadge) {
      rankBadge.style.display = "block";
      // count all users
      setText("myRankOf", `of ${Object.keys(userBest).length}`);
    }
  } else {
    setText("myRank", "—");
  }

  const medals = ["🥇", "🥈", "🥉"];
  const color = coachingProfile?.primary_color || "#1a56db";

  container.innerHTML = "";
  sorted.forEach(([userId, stats], i) => {
    const name = nameMap[userId] || "Student";
    const isMe = userId === currentUser.id;
    const initials = name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
    const avatarBg = isMe
      ? color
      : `hsl(${(userId.charCodeAt(0) * 53 + userId.charCodeAt(1) * 37) % 360},55%,52%)`;

    const row = document.createElement("div");
    row.className = `lb-row${isMe ? " is-me" : ""}`;
    row.innerHTML = `
      <span class="lb-rank">${medals[i] || `#${i + 1}`}</span>
      <div class="lb-avatar" style="background:${avatarBg}">${initials}</div>
      <span class="lb-name">${name}${isMe ? ' <span style="font-size:10px;color:var(--brand)">(You)</span>' : ""}</span>
      <span class="lb-score">${stats.score}</span>`;
    container.appendChild(row);
  });
}

// ── Load student aggregate stats ──
async function loadStudentStats(userId, coachingId) {
  setText(
    "statStreak",
    userProfile?.current_streak ? `${userProfile.current_streak}d` : "0d",
  );
}

// ─────────────────────────────────────────────────────────────
//  Start / Resume Exam — WITH PASSKEY SYSTEM
// ─────────────────────────────────────────────────────────────
window.startExam = async function (examId, btn) {
  btn.disabled = true;
  btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Preparing…`;

  try {
    // ── Fetch exam to check if passkey is required ──
    const { data: examCheck } = await client
      .from("scheduled_exams")
      .select(
        `
        id, is_active, start_datetime, end_datetime, attempt_limit, passkey,
        exam_patterns!pattern_id( id, pattern_name, duration_minutes ),
        coaching_id
      `,
      )
      .eq("id", examId)
      .single();

    if (!examCheck?.is_active)
      throw new Error("This exam is no longer available.");

    const nowMs = Date.now();

    const startMs = examCheck.start_datetime
      ? new Date(examCheck.start_datetime.replace(" ", "T")).getTime()
      : 0;

    const endMs = examCheck.end_datetime
      ? new Date(examCheck.end_datetime.replace(" ", "T")).getTime()
      : 0;

    if (startMs > nowMs) {
      throw new Error("This exam hasn't started yet.");
    }

    if (endMs && endMs < nowMs) {
      throw new Error("This exam has expired.");
    }

    // ── Check for existing incomplete attempt (resume scenario) ──
    const { data: existingAttempts } = await client
      .from("attempts")
      .select("id, submitted_at, started_at")
      .eq("user_id", currentUser.id)
      .eq("scheduled_exam_id", examId);

    const incomplete = (existingAttempts || []).find((a) => !a.submitted_at);
    if (incomplete) {
      const maxMs =
        (examCheck.exam_patterns?.duration_minutes || 60) * 60 * 1000 * 1.5;
      if (Date.now() - new Date(incomplete.started_at).getTime() <= maxMs) {
        const { data: aqCheck } = await client
          .from("attempt_questions")
          .select("id")
          .eq("attempt_id", incomplete.id)
          .limit(1);
        if (aqCheck?.length > 0) {
          // Resume existing attempt — no passkey needed
          window.location.href = `/coaching/exam.html?attempt=${incomplete.id}`;
          return;
        }
        await client.from("attempts").delete().eq("id", incomplete.id);
      }
    }

    // ── Check attempt limit ──
    if (examCheck.attempt_limit) {
      const done = (existingAttempts || []).filter(
        (a) => a.submitted_at,
      ).length;
      if (done >= examCheck.attempt_limit)
        throw new Error(`Attempt limit reached (${examCheck.attempt_limit}).`);
    }

    // ── PASSKEY FLOW ──
    // If exam has passkey → show passkey modal
    // If no passkey → directly call edge function (NULL passkey allowed)
    if (examCheck.passkey) {
      // Show passkey modal
      showPasskeyModal(examId, examCheck, btn);
    } else {
      // No passkey required — call edge function with null passkey
      await verifyAndStartExam(examId, null, btn);
    }
  } catch (err) {
    console.error("startExam error:", err);
    btn.disabled = false;
    const color = coachingProfile?.primary_color || "#1a56db";
    btn.innerHTML = `<i class="fas fa-play"></i> Start Exam`;
    btn.style.background = `linear-gradient(135deg,${color},${shiftHex(color, -20)})`;
    alert("Error: " + err.message);
  }
};

// ── Show Passkey Modal ──
function showPasskeyModal(examId, examData, originalBtn) {
  // Create modal backdrop
  const modal = document.createElement("div");
  modal.id = "passkeyModal";
  modal.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    padding: 16px;
    font-family: 'Outfit', -apple-system, BlinkMacSystemFont, sans-serif;
  `;

  // Create modal content
  const modalBox = document.createElement("div");
  modalBox.style.cssText = `
    background: white;
    border-radius: 16px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    width: 100%;
    max-width: 440px;
    overflow: hidden;
  `;

  // Header
  const header = document.createElement("div");
  header.style.cssText = `
    background: linear-gradient(135deg, #2563eb 0%, #4f46e5 100%);
    padding: 24px;
    color: white;
  `;
  header.innerHTML = `
    <div style="display: flex; align-items: center; gap: 12px;">
      <div style="width: 40px; height: 40px; background: rgba(255,255,255,0.2); border-radius: 12px; display: flex; align-items: center; justify-content: center;">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      </div>
      <div>
        <h2 style="font-size: 18px; font-weight: 700; margin: 0; line-height: 1.3;">Passkey Required</h2>
        <p style="font-size: 11px; margin: 4px 0 0 0; color: rgba(255,255,255,0.8);">Enter the code shared by your teacher</p>
      </div>
    </div>
  `;

  // Body
  const body = document.createElement("div");
  body.style.cssText = "padding: 24px;";
  body.innerHTML = `
    <div style="margin-bottom: 20px;">
      <label style="display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 8px;">Exam Passkey</label>
      <input 
        type="text" 
        id="passkeyInput" 
        maxlength="5"
        placeholder="Enter code"
        style="
          width: 100%;
          padding: 14px 16px;
          text-align: center;
          font-size: 28px;
          font-weight: 700;
          letter-spacing: 0.3em;
          border: 2px solid #e5e7eb;
          border-radius: 12px;
          outline: none;
          transition: border-color 0.2s;
          font-family: 'Courier New', monospace;
        "
      />
      <p id="passkeyError" style="color: #dc2626; font-size: 12px; margin-top: 8px; display: none; font-weight: 500;"></p>
    </div>

    <div style="display: flex; gap: 12px;">
      <button 
        id="cancelPasskey"
        style="
          flex: 1;
          padding: 12px 16px;
          background: #f3f4f6;
          color: #374151;
          border: none;
          border-radius: 12px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s;
        "
      >
        Cancel
      </button>
      <button 
        id="submitPasskey"
        style="
          flex: 1;
          padding: 12px 16px;
          background: #2563eb;
          color: white;
          border: none;
          border-radius: 12px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s;
          box-shadow: 0 2px 8px rgba(37, 99, 235, 0.3);
        "
      >
        Start Exam
      </button>
    </div>
  `;

  modalBox.appendChild(header);
  modalBox.appendChild(body);
  modal.appendChild(modalBox);
  document.body.appendChild(modal);

  const input = document.getElementById("passkeyInput");
  const submitBtn = document.getElementById("submitPasskey");
  const cancelBtn = document.getElementById("cancelPasskey");
  const errorEl = document.getElementById("passkeyError");

  // Hover effects
  submitBtn.addEventListener("mouseenter", () => {
    submitBtn.style.background = "#1d4ed8";
  });
  submitBtn.addEventListener("mouseleave", () => {
    submitBtn.style.background = "#2563eb";
  });

  cancelBtn.addEventListener("mouseenter", () => {
    cancelBtn.style.background = "#e5e7eb";
  });
  cancelBtn.addEventListener("mouseleave", () => {
    cancelBtn.style.background = "#f3f4f6";
  });

  // Input focus effect
  input.addEventListener("focus", () => {
    input.style.borderColor = "#2563eb";
  });
  input.addEventListener("blur", () => {
    if (!errorEl.style.display || errorEl.style.display === "none") {
      input.style.borderColor = "#e5e7eb";
    }
  });

  // Auto-focus input
  setTimeout(() => input.focus(), 100);

  // Only allow numbers
  input.addEventListener("input", (e) => {
    e.target.value = e.target.value.replace(/[^0-9]/g, "");
    errorEl.style.display = "none";
    input.style.borderColor = "#2563eb";
  });

  // Submit on Enter
  input.addEventListener("keypress", (e) => {
    if (e.key === "Enter" && input.value.trim()) {
      submitBtn.click();
    }
  });

  // Cancel button
  cancelBtn.addEventListener("click", () => {
    modal.remove();
    originalBtn.disabled = false;
    const color = coachingProfile?.primary_color || "#1a56db";
    originalBtn.innerHTML = `<i class="fas fa-play"></i> Start Exam`;
    originalBtn.style.background = `linear-gradient(135deg,${color},${shiftHex(color, -20)})`;
  });

  // Submit button
  submitBtn.addEventListener("click", async () => {
    const passkey = input.value.trim();
    if (!passkey) {
      errorEl.textContent = "Please enter the passkey";
      errorEl.style.display = "block";
      input.style.borderColor = "#dc2626";
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Verifying…`;
    submitBtn.style.cursor = "not-allowed";
    submitBtn.style.opacity = "0.7";

    try {
      await verifyAndStartExam(examId, passkey, originalBtn);
      modal.remove();
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.style.cursor = "pointer";
      submitBtn.style.opacity = "1";
      submitBtn.innerHTML = "Start Exam";
      errorEl.textContent = err.message;
      errorEl.style.display = "block";
      input.style.borderColor = "#dc2626";
      input.value = "";
      input.focus();
    }
  });
}

// ── Call Edge Function to Verify Passkey + Create Attempt ──
async function verifyAndStartExam(examId, passkey, btn) {
  const {
    data: { session },
  } = await client.auth.getSession();
  if (!session) throw new Error("Authentication required");

  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/verify-passkey-and-start`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ exam_id: examId, passkey }),
    },
  );

  const result = await response.json();

  if (!response.ok || !result.success) {
    throw new Error(result.error || "Failed to start exam");
  }

  // Success — redirect to exam
  window.location.href = `/coaching/exam.html?attempt=${result.attempt_id}`;
}

window.resumeExam = function (attemptId, btn) {
  btn.disabled = true;
  btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Loading…`;
  window.location.href = `/coaching/exam.html?attempt=${attemptId}`;
};

window.logout = async function () {
  if (realtimeChannel) await client.removeChannel(realtimeChannel);
  await client.auth.signOut();
  window.location.href = "/index.html";
};

// ── Utility helpers ──
function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function shiftHex(hex, amount) {
  try {
    const num = parseInt(hex.replace("#", ""), 16);
    const r = Math.min(255, Math.max(0, (num >> 16) + amount));
    const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amount));
    const b = Math.min(255, Math.max(0, (num & 0xff) + amount));
    return "#" + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  } catch {
    return hex;
  }
}

function errorHTML(msg) {
  return `<p style="color:#dc2626;font-size:12px;text-align:center;padding:16px">${msg}</p>`;
}

function showError(msg) {
  document.body.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center">
      <div style="text-align:center;padding:40px">
        <div style="font-size:48px;margin-bottom:16px">⚠️</div>
        <p style="color:#64748b;margin-bottom:20px;font-family:'Outfit',sans-serif">${msg}</p>
        <a href="/index.html" style="background:#1a56db;color:#fff;padding:10px 24px;border-radius:100px;font-weight:700;text-decoration:none;font-family:'Outfit',sans-serif">Go Home</a>
      </div>
    </div>`;
}
