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
let coachingExamIds = [];   // used for realtime filter
let realtimeChannel = null;
let lbRefreshDebounce = null;
let statsRefreshDebounce = null;

// ── Entry point ──
document.addEventListener("DOMContentLoaded", async () => {
  await initDashboard();
});

async function initDashboard() {
  const { data: { user } } = await client.auth.getUser();
  if (!user) { window.location.href = "/index.html?action=login"; return; }
  currentUser = user;

  const { data: profile } = await client
    .from("user_profiles")
    .select("full_name, coaching_id, total_coins, current_streak, max_streak")
    .eq("id", user.id)
    .single();

  if (!profile) { window.location.href = "/index.html"; return; }
  userProfile = profile;

  if (!profile.coaching_id) { window.location.href = "/mock/dashboard.html"; return; }

  const { data: coaching } = await client
    .from("coaching_centers")
    .select("id, name, slug, primary_color, logo_url, city")
    .eq("id", profile.coaching_id)
    .single();

  if (!coaching) { showError("Your coaching center is currently inactive."); return; }
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

  document.querySelectorAll(".coaching-name").forEach(el => el.textContent = name);
  document.title = `Dashboard | ${name}`;

  const hero = document.getElementById("heroBanner");
  if (hero) hero.style.background = `linear-gradient(135deg, ${color} 0%, ${shiftHex(color, -25)} 100%)`;

  const examIcon = document.getElementById("examIconWrap");
  if (examIcon) { examIcon.style.background = color + "18"; examIcon.querySelector("i").style.color = color; }

  if (coaching.logo_url) {
    document.querySelectorAll(".coaching-logo").forEach(el => {
      el.src = coaching.logo_url; el.style.display = "block";
    });
  }

  if (coaching.city) setText("coachingCity", `📍 ${coaching.city}`);
}

// ─────────────────────────────────────────────────────────────
//  REALTIME: subscribe to attempts table changes for this coaching
// ─────────────────────────────────────────────────────────────
async function subscribeToLive(coachingId) {
  // We need exam IDs to filter
  const { data: exams } = await client
    .from("scheduled_exams").select("id").eq("coaching_id", coachingId);
  coachingExamIds = (exams || []).map(e => e.id);

  if (!coachingExamIds.length) return;

  // Unsubscribe any prior channel
  if (realtimeChannel) { await client.removeChannel(realtimeChannel); }

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
          debouncedRefresh(() => {
            loadRecentResults(currentUser.id, coachingProfile.id);
            loadStudentStats(currentUser.id, coachingProfile.id);
          }, statsRefreshDebounce, 800);
        }

        // Always refresh leaderboard (someone's score changed)
        debouncedRefresh(() => {
          loadLeaderboardPreview(coachingProfile.id);
        }, lbRefreshDebounce, 1200);

        // Push live ticker message
        const name = await getDisplayName(row.user_id);
        const scoreStr = row.total_score !== null ? ` · ${row.total_score} pts` : "";
        const isMe = row.user_id === currentUser.id;
        const msg = isMe
          ? `✅ You just submitted an exam${scoreStr}`
          : `🎯 ${name} submitted an exam${scoreStr} — leaderboard updated`;

        if (window.pushTickerEvent) window.pushTickerEvent(msg);
      }
    )
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "attempts" },
      async (payload) => {
        const row = payload.new;
        if (!row || !coachingExamIds.includes(row.scheduled_exam_id)) return;
        if (row.user_id === currentUser.id) return; // don't announce own start

        const name = await getDisplayName(row.user_id);
        if (window.pushTickerEvent) window.pushTickerEvent(`📝 ${name} started an exam`);
      }
    )
    .subscribe();
}

// Cache for user display names (avoid repeated fetches)
const nameCache = {};
async function getDisplayName(userId) {
  if (nameCache[userId]) return nameCache[userId];
  const { data } = await client.from("user_profiles").select("full_name").eq("id", userId).single();
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
    .select(`
      id, mode, schedule_type, day_of_week, is_active,
      start_datetime, end_datetime, attempt_limit,
      exam_patterns!pattern_id ( pattern_name, duration_minutes, total_questions, negative_marking ),
      exam_categories ( name )
    `)
    .eq("coaching_id", coachingId)
    .eq("is_active", true)
    .order("start_datetime", { ascending: true });

  if (error) { container.innerHTML = errorHTML(error.message); return; }

  if (!exams || exams.length === 0) {
    container.innerHTML = `
      <div class="empty">
        <i class="fas fa-calendar-times empty-icon"></i>
        <p class="empty-msg">No exams scheduled yet</p>
        <small class="empty-sub">Your coaching will schedule tests soon. Check back!</small>
      </div>`;
    return;
  }

  const examIds = exams.map(e => e.id);
  const { data: attempts } = await client
    .from("attempts")
    .select("id, scheduled_exam_id, submitted_at, started_at, total_score, accuracy")
    .eq("user_id", currentUser.id)
    .in("scheduled_exam_id", examIds);

  const attemptMap = {};
  (attempts || []).forEach(a => {
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
  const completed = myAttempts.filter(a => a.submitted_at);
  const incomplete = myAttempts.find(a => !a.submitted_at);
  const now = new Date();
  const color = coachingProfile?.primary_color || "#1a56db";

  const isExpired  = exam.end_datetime && new Date(exam.end_datetime) < now;
  const notStarted = exam.start_datetime && new Date(exam.start_datetime) > now;
  const limitReached = exam.attempt_limit && completed.length >= exam.attempt_limit;
  const alreadyDone  = completed.length > 0;
  const lastAttempt  = completed[completed.length - 1];
  const negVal = pattern.negative_marking > 0 ? `-${pattern.negative_marking}` : "None";

  let stripeColor = color;
  let badgeHtml   = "";
  let btnHtml     = "";
  let resultStrip = "";

  if (isExpired) {
    stripeColor = "#9ca3af";
    badgeHtml = badge("Expired", "#dc2626", "#fef2f2");
    btnHtml = disabledBtn("fa-lock", "Expired", "#9ca3af");
  } else if (notStarted) {
    const startStr = new Date(exam.start_datetime).toLocaleString("en-IN", { day:"numeric", month:"short", hour:"2-digit", minute:"2-digit" });
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
    .select(`
      id, total_score, accuracy, submitted_at,
      scheduled_exams!inner ( coaching_id, exam_patterns!pattern_id ( pattern_name ) )
    `)
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
  const avgAcc = data.reduce((s, a) => s + Number(a.accuracy || 0), 0) / data.length;
  setText("statAvgScore", avgAcc.toFixed(1) + "%");
  setText("statBestScore", Math.max(...data.map(a => a.total_score || 0)));

  container.innerHTML = "";
  data.forEach(attempt => {
    const acc = Number(attempt.accuracy || 0);
    const accColor = acc >= 80 ? "#059669" : acc >= 60 ? "#d97706" : "#dc2626";
    const accBg    = acc >= 80 ? "#f0fdf4" : acc >= 60 ? "#fffbeb" : "#fef2f2";
    const name = attempt.scheduled_exams?.exam_patterns?.pattern_name || "Mock Test";
    const date = attempt.submitted_at
      ? new Date(attempt.submitted_at).toLocaleDateString("en-IN", { day:"numeric", month:"short" })
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
    .from("scheduled_exams").select("id").eq("coaching_id", coachingId);

  if (!examIds?.length) {
    container.innerHTML = `<p style="font-size:12px;color:var(--text-3);text-align:center;padding:12px 0;font-weight:600">No exams yet.</p>`;
    return;
  }

  const ids = examIds.map(e => e.id);

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
  attempts.forEach(a => {
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
    .in("id", sorted.map(([id]) => id));

  const nameMap = {};
  (profiles || []).forEach(p => { nameMap[p.id] = p.full_name || "Student"; });

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
    const initials = name.split(" ").map(w => w[0]).join("").slice(0,2).toUpperCase();
    const avatarBg = isMe ? color : `hsl(${(userId.charCodeAt(0)*53 + userId.charCodeAt(1)*37) % 360},55%,52%)`;

    const row = document.createElement("div");
    row.className = `lb-row${isMe ? " is-me" : ""}`;
    row.innerHTML = `
      <span class="lb-rank">${medals[i] || `#${i+1}`}</span>
      <div class="lb-avatar" style="background:${avatarBg}">${initials}</div>
      <span class="lb-name">${name}${isMe ? ' <span style="font-size:10px;color:var(--brand)">(You)</span>' : ""}</span>
      <span class="lb-score">${stats.score}</span>`;
    container.appendChild(row);
  });
}

// ── Load student aggregate stats ──
async function loadStudentStats(userId, coachingId) {
  setText("statStreak", userProfile?.current_streak ? `${userProfile.current_streak}d` : "0d");
}

// ─────────────────────────────────────────────────────────────
//  Start / Resume Exam
// ─────────────────────────────────────────────────────────────
window.startExam = async function(examId, btn) {
  btn.disabled = true;
  btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Preparing…`;

  try {
    const { data: examCheck } = await client
      .from("scheduled_exams")
      .select(`
        is_active, start_datetime, end_datetime, attempt_limit,
        exam_patterns!pattern_id( id, duration_minutes, pattern_sections( id, section_name, question_count ) ),
        coaching_id
      `)
      .eq("id", examId)
      .single();

    if (!examCheck?.is_active) throw new Error("This exam is no longer available.");

    const now = new Date();
    if (examCheck.start_datetime && new Date(examCheck.start_datetime) > now)
      throw new Error("This exam hasn't started yet.");
    if (examCheck.end_datetime && new Date(examCheck.end_datetime) < now)
      throw new Error("This exam has expired.");

    const { data: existingAttempts } = await client
      .from("attempts")
      .select("id, submitted_at, started_at")
      .eq("user_id", currentUser.id)
      .eq("scheduled_exam_id", examId);

    const incomplete = (existingAttempts || []).find(a => !a.submitted_at);
    if (incomplete) {
      const maxMs = (examCheck.exam_patterns?.duration_minutes || 60) * 60 * 1000 * 1.5;
      if (Date.now() - new Date(incomplete.started_at).getTime() <= maxMs) {
        const { data: aqCheck } = await client
          .from("attempt_questions").select("id").eq("attempt_id", incomplete.id).limit(1);
        if (aqCheck?.length > 0) {
          window.location.href = `/coaching/exam.html?attempt=${incomplete.id}`;
          return;
        }
        await client.from("attempts").delete().eq("id", incomplete.id);
      }
    }

    if (examCheck.attempt_limit) {
      const done = (existingAttempts || []).filter(a => a.submitted_at).length;
      if (done >= examCheck.attempt_limit)
        throw new Error(`Attempt limit reached (${examCheck.attempt_limit}).`);
    }

    const { data: newAttempt, error: ae } = await client
      .from("attempts")
      .insert([{ user_id: currentUser.id, scheduled_exam_id: examId, started_at: new Date() }])
      .select().single();

    if (ae) throw new Error(ae.message);

    const sections = examCheck.exam_patterns?.pattern_sections || [];
    if (!sections.length) throw new Error("No sections found for this exam.");

    const sectionIds = sections.map(s => s.id);
    const { data: allQRaw, error: qErr } = await client
      .from("questions")
      .select("id, pattern_section_id, difficulty, is_active")
      .in("pattern_section_id", sectionIds);

    if (qErr) throw new Error("Could not fetch questions: " + qErr.message);

    const allQuestions = (allQRaw || []).filter(q =>
      q.is_active !== false && q.is_active !== "false" && q.is_active !== null
    );

    if (!allQuestions.length)
      throw new Error("No active questions found. Please contact your admin.");

    let finalQuestions = [];
    sections.forEach(sec => {
      const pool = allQuestions
        .filter(q => q.pattern_section_id === sec.id)
        .sort(() => Math.random() - 0.5)
        .slice(0, sec.question_count);
      finalQuestions = finalQuestions.concat(pool);
    });

    if (!finalQuestions.length) throw new Error("Could not assign questions. Contact admin.");

    const { error: aqErr } = await client.from("attempt_questions").insert(
      finalQuestions.map((q, idx) => ({
        attempt_id: newAttempt.id,
        question_id: q.id,
        question_order: idx + 1,
      }))
    );

    if (aqErr) throw new Error("Failed to prepare exam: " + aqErr.message);

    window.location.href = `/coaching/exam.html?attempt=${newAttempt.id}`;

  } catch (err) {
    console.error("startExam error:", err);
    btn.disabled = false;
    const color = coachingProfile?.primary_color || "#1a56db";
    btn.innerHTML = `<i class="fas fa-play"></i> Start Exam`;
    btn.style.background = `linear-gradient(135deg,${color},${shiftHex(color,-20)})`;
    alert("Error: " + err.message);
  }
};

window.resumeExam = function(attemptId, btn) {
  btn.disabled = true;
  btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Loading…`;
  window.location.href = `/coaching/exam.html?attempt=${attemptId}`;
};

window.logout = async function() {
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
    const num = parseInt(hex.replace("#",""), 16);
    const r = Math.min(255, Math.max(0, (num >> 16) + amount));
    const g = Math.min(255, Math.max(0, ((num >> 8) & 0xFF) + amount));
    const b = Math.min(255, Math.max(0, (num & 0xFF) + amount));
    return "#" + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  } catch { return hex; }
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