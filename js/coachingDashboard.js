// coachingDashboard.js — Courage Library B2B Coaching Student Dashboard

const SUPABASE_URL = "https://sgagswxzsxlgcspwiuoh.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNnYWdzd3h6c3hsZ2NzcHdpdW9oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5NTA1NTIsImV4cCI6MjA2OTUyNjU1Mn0.ZNfk5WNDPkjKcFsRO48rEYk3dhbLYm_m21aZ-wfywo4";

const { createClient } = supabase;
const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── State ──
let currentUser = null;
let coachingProfile = null; // { id, name, slug, primary_color, logo_url }
let userProfile = null;

// ── Entry point ──
document.addEventListener("DOMContentLoaded", async () => {
  await initDashboard();
});

async function initDashboard() {
  // 1. Auth check
  const { data: { user } } = await client.auth.getUser();
  if (!user) {
    window.location.href = "/index.html?action=login";
    return;
  }
  currentUser = user;

  // 2. Fetch user profile + coaching info
  const { data: profile } = await client
    .from("user_profiles")
    .select("full_name, coaching_id, total_coins, current_streak, max_streak")
    .eq("id", user.id)
    .single();

  if (!profile) { window.location.href = "/index.html"; return; }
  userProfile = profile;

  // 3. If no coaching linked → redirect to regular dashboard
  if (!profile.coaching_id) {
    window.location.href = "/mock/dashboard.html";
    return;
  }

  // 4. Fetch coaching center details
  const { data: coaching } = await client
    .from("coaching_centers")
    .select("id, name, slug, primary_color, logo_url, city")
    .eq("id", profile.coaching_id)
    .single();

  if (!coaching || !coaching.is_active === false) {
    showError("Your coaching center is currently inactive.");
    return;
  }

  coachingProfile = coaching;

  // 5. Apply coaching branding
  applyBranding(coaching);

  // 6. Populate user greeting
  const firstName = (profile.full_name || "Student").split(" ")[0];
  setText("greetingName", firstName);
  setText("statCoins", (profile.total_coins || 0).toLocaleString("en-IN"));
  setText("statStreak", `${profile.current_streak || 0} days`);

  // 7. Load all sections in parallel
  await Promise.all([
    loadUpcomingExams(coaching.id),
    loadRecentResults(user.id, coaching.id),
    loadLeaderboardPreview(coaching.id),
    loadStudentStats(user.id, coaching.id),
  ]);
}

// ── Apply coaching branding ──
function applyBranding(coaching) {
  const color = coaching.primary_color || "#1a56db";
  const name = coaching.name;

  // Update all branded elements
  document.querySelectorAll(".coaching-name").forEach(el => el.textContent = name);
  document.querySelectorAll(".coaching-color-bg").forEach(el => el.style.background = color);
  document.querySelectorAll(".coaching-color-text").forEach(el => el.style.color = color);
  document.querySelectorAll(".coaching-color-border").forEach(el => el.style.borderColor = color);

  // Header gradient
  const header = document.getElementById("coachingHeader");
  if (header) header.style.background = `linear-gradient(135deg, ${color}22, ${color}11)`;

  // Nav accent
  const navAccent = document.getElementById("navCoachingBadge");
  if (navAccent) {
    navAccent.textContent = name;
    navAccent.style.background = color + "20";
    navAccent.style.color = color;
    navAccent.style.borderColor = color + "50";
  }

  // Favicon title
  document.title = `Dashboard | ${name}`;

  // Logo (if provided)
  if (coaching.logo_url) {
    const logoEls = document.querySelectorAll(".coaching-logo");
    logoEls.forEach(el => { el.src = coaching.logo_url; el.classList.remove("hidden"); });
  }

  if (coaching.city) {
    setText("coachingCity", `📍 ${coaching.city}`);
  }
}

// ── Load upcoming exams for this coaching ──
async function loadUpcomingExams(coachingId) {
  const container = document.getElementById("examList");
  container.innerHTML = loadingHTML();

  const now = new Date().toISOString();

  const { data: exams, error } = await client
    .from("scheduled_exams")
    .select(`
      id, mode, schedule_type, day_of_week, is_active,
      start_datetime, end_datetime, attempt_limit,
      exam_patterns ( pattern_name, duration_minutes, total_questions, negative_marking ),
      exam_categories ( name )
    `)
    .eq("coaching_id", coachingId)
    .eq("is_active", true)
    .order("start_datetime", { ascending: true });

  if (error) { container.innerHTML = errorHTML(error.message); return; }

  if (!exams || exams.length === 0) {
    container.innerHTML = `
      <div class="col-span-full text-center py-12 text-gray-400">
        <i class="fas fa-calendar-times text-4xl mb-3 block opacity-40"></i>
        <p class="font-semibold">No exams scheduled yet</p>
        <p class="text-sm mt-1">Your coaching will schedule tests soon. Check back!</p>
      </div>`;
    return;
  }

  // Fetch user's attempts for these exams
  const examIds = exams.map(e => e.id);
  const { data: attempts } = await client
    .from("attempts")
    .select("id, scheduled_exam_id, submitted_at, started_at, total_score")
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

  const isExpired = exam.end_datetime && new Date(exam.end_datetime) < now;
  const notStarted = exam.start_datetime && new Date(exam.start_datetime) > now;
  const limitReached = exam.attempt_limit && completed.length >= exam.attempt_limit;
  const alreadyDone = completed.length > 0;

  const negVal = pattern.negative_marking > 0 ? `-${pattern.negative_marking}` : "None";
  const lastAttempt = completed[completed.length - 1];

  let statusBadge = "";
  let btnHtml = "";
  let cardBorder = coachingProfile?.primary_color || "#1a56db";

  if (isExpired) {
    statusBadge = `<span class="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full font-semibold">Expired</span>`;
    btnHtml = `<button disabled class="w-full py-2.5 rounded-xl bg-gray-100 text-gray-400 text-sm font-semibold cursor-not-allowed"><i class="fas fa-lock mr-1"></i>Expired</button>`;
    cardBorder = "#e5e7eb";
  } else if (notStarted) {
    const startStr = new Date(exam.start_datetime).toLocaleString("en-IN", { day:"numeric", month:"short", hour:"2-digit", minute:"2-digit" });
    statusBadge = `<span class="text-xs bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full font-semibold">Upcoming</span>`;
    btnHtml = `<button disabled class="w-full py-2.5 rounded-xl bg-amber-50 text-amber-600 text-sm font-semibold cursor-not-allowed"><i class="fas fa-clock mr-1"></i>Starts ${startStr}</button>`;
    cardBorder = "#f59e0b";
  } else if (limitReached) {
    statusBadge = `<span class="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-semibold">Limit Reached</span>`;
    btnHtml = `<button disabled class="w-full py-2.5 rounded-xl bg-gray-100 text-gray-400 text-sm font-semibold cursor-not-allowed"><i class="fas fa-ban mr-1"></i>Limit Reached</button>`;
  } else if (alreadyDone) {
    statusBadge = `<span class="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full font-semibold">✓ Completed · ${lastAttempt.total_score ?? 0} pts</span>`;
    btnHtml = `
      <button disabled class="w-full py-2 rounded-xl bg-green-50 text-green-700 text-sm font-semibold border border-green-200"><i class="fas fa-check-circle mr-1"></i>Completed</button>
      ${lastAttempt ? `<a href="/mock/result.html?attempt=${lastAttempt.id}" class="block text-center mt-2 text-sm font-semibold text-blue-600 hover:text-blue-800"><i class="fas fa-chart-bar mr-1"></i>View Result & Analysis</a>` : ""}`;
    cardBorder = "#10b981";
  } else if (incomplete) {
    statusBadge = `<span class="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-semibold animate-pulse">In Progress</span>`;
    btnHtml = `<button onclick="resumeExam('${incomplete.id}', this)" class="w-full py-2.5 rounded-xl text-white text-sm font-bold shadow hover:scale-105 transition" style="background:linear-gradient(135deg,#059669,#10b981)"><i class="fas fa-redo mr-1"></i>Resume Exam</button>`;
  } else {
    statusBadge = `<span class="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-semibold">Live</span>`;
    btnHtml = `<button onclick="startExam('${exam.id}', this)" class="w-full py-2.5 rounded-xl text-white text-sm font-bold shadow hover:scale-105 transition coaching-color-bg"><i class="fas fa-play mr-1"></i>Start Exam</button>`;
  }

  const div = document.createElement("div");
  div.className = "bg-white rounded-2xl p-5 shadow-sm border-l-4 hover:shadow-md transition-all duration-200";
  div.style.borderLeftColor = cardBorder;
  div.style.animationDelay = `${index * 0.06}s`;
  div.innerHTML = `
    <div class="flex items-start justify-between gap-3 mb-3">
      <div class="flex-1 min-w-0">
        <p class="text-xs text-gray-400 font-medium mb-0.5">${exam.exam_categories?.name || ""}</p>
        <h3 class="font-bold text-gray-800 text-base leading-tight">${pattern.pattern_name || "Mock Test"}</h3>
      </div>
      ${statusBadge}
    </div>
    <div class="grid grid-cols-3 gap-2 mb-4">
      <div class="bg-gray-50 rounded-xl p-2 text-center">
        <div class="text-xs text-gray-400">Duration</div>
        <div class="text-sm font-bold text-gray-700">${pattern.duration_minutes ?? "—"}m</div>
      </div>
      <div class="bg-gray-50 rounded-xl p-2 text-center">
        <div class="text-xs text-gray-400">Questions</div>
        <div class="text-sm font-bold text-gray-700">${pattern.total_questions ?? "—"}</div>
      </div>
      <div class="bg-gray-50 rounded-xl p-2 text-center">
        <div class="text-xs text-gray-400">Negative</div>
        <div class="text-sm font-bold text-gray-700">${negVal}</div>
      </div>
    </div>
    ${btnHtml}`;

  // Apply brand color to coaching-color-bg elements in this card
  if (coachingProfile?.primary_color) {
    div.querySelectorAll(".coaching-color-bg").forEach(el => {
      el.style.background = `linear-gradient(135deg, ${coachingProfile.primary_color}, ${coachingProfile.primary_color}cc)`;
    });
  }

  return div;
}

// ── Load student's recent results ──
async function loadRecentResults(userId, coachingId) {
  const container = document.getElementById("recentResults");
  container.innerHTML = loadingHTML("small");

  const { data, error } = await client
    .from("attempts")
    .select(`
      id, total_score, accuracy, time_taken, submitted_at,
      scheduled_exams!inner ( coaching_id, exam_patterns ( pattern_name ), exam_categories ( name ) )
    `)
    .eq("user_id", userId)
    .eq("scheduled_exams.coaching_id", coachingId)
    .not("submitted_at", "is", null)
    .order("submitted_at", { ascending: false })
    .limit(5);

  if (error || !data || data.length === 0) {
    container.innerHTML = `<p class="text-sm text-gray-400 text-center py-4">No results yet. Attempt your first exam!</p>`;

    // Update summary stats
    setText("statAttempts", "0");
    setText("statAvgScore", "0%");
    setText("statBestScore", "—");
    return;
  }

  // Update summary stats
  setText("statAttempts", data.length);
  const avgAcc = data.reduce((s, a) => s + Number(a.accuracy || 0), 0) / data.length;
  setText("statAvgScore", avgAcc.toFixed(1) + "%");
  setText("statBestScore", Math.max(...data.map(a => a.total_score || 0)));

  container.innerHTML = "";
  data.forEach(attempt => {
    const acc = Number(attempt.accuracy || 0);
    const accColor = acc >= 80 ? "#10b981" : acc >= 60 ? "#f59e0b" : "#ef4444";
    const se = attempt.scheduled_exams || {};
    const name = se.exam_patterns?.pattern_name || "Mock Test";
    const date = attempt.submitted_at
      ? new Date(attempt.submitted_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
      : "—";

    const row = document.createElement("div");
    row.className = "flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0";
    row.innerHTML = `
      <div class="flex-1 min-w-0">
        <p class="text-sm font-semibold text-gray-800 truncate">${name}</p>
        <p class="text-xs text-gray-400">${date}</p>
      </div>
      <div class="flex items-center gap-3 flex-shrink-0">
        <span class="text-sm font-bold text-gray-700">${attempt.total_score ?? 0}</span>
        <span class="text-xs font-bold px-2 py-0.5 rounded-full" style="color:${accColor};background:${accColor}18">
          ${acc.toFixed(1)}%
        </span>
        <a href="/mock/result.html?attempt=${attempt.id}" class="text-blue-500 hover:text-blue-700 text-xs">
          <i class="fas fa-external-link-alt"></i>
        </a>
      </div>`;
    container.appendChild(row);
  });
}

// ── Load leaderboard preview (top 5 in coaching) ──
async function loadLeaderboardPreview(coachingId) {
  const container = document.getElementById("leaderboardPreview");
  container.innerHTML = loadingHTML("small");

  // Get all completed attempts for this coaching's exams
  const { data: examIds } = await client
    .from("scheduled_exams")
    .select("id")
    .eq("coaching_id", coachingId);

  if (!examIds || examIds.length === 0) {
    container.innerHTML = `<p class="text-sm text-gray-400 text-center py-4">No exams yet.</p>`;
    return;
  }

  const ids = examIds.map(e => e.id);

  // Get top performers: aggregate by user, sum of best scores
  const { data: attempts } = await client
    .from("attempts")
    .select("user_id, total_score, accuracy")
    .in("scheduled_exam_id", ids)
    .not("submitted_at", "is", null)
    .order("total_score", { ascending: false });

  if (!attempts || attempts.length === 0) {
    container.innerHTML = `<p class="text-sm text-gray-400 text-center py-4">No attempts yet. Be the first!</p>`;
    return;
  }

  // Aggregate: best score per user
  const userBest = {};
  attempts.forEach(a => {
    if (!userBest[a.user_id] || a.total_score > userBest[a.user_id].score) {
      userBest[a.user_id] = { score: a.total_score || 0, accuracy: a.accuracy || 0 };
    }
  });

  // Sort by score descending, take top 5
  const sorted = Object.entries(userBest)
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, 5);

  // Fetch names
  const userIds = sorted.map(([id]) => id);
  const { data: profiles } = await client
    .from("user_profiles")
    .select("id, full_name")
    .in("id", userIds);

  const nameMap = {};
  (profiles || []).forEach(p => { nameMap[p.id] = p.full_name || "Student"; });

  container.innerHTML = "";
  const medals = ["🥇", "🥈", "🥉"];

  sorted.forEach(([userId, stats], i) => {
    const name = nameMap[userId] || "Student";
    const isMe = userId === currentUser.id;
    const row = document.createElement("div");
    row.className = `flex items-center gap-3 py-2 px-3 rounded-xl transition ${isMe ? "bg-blue-50 border border-blue-100" : "hover:bg-gray-50"}`;
    row.innerHTML = `
      <span class="text-base w-5 text-center flex-shrink-0">${medals[i] || `#${i + 1}`}</span>
      <div class="flex-1 min-w-0">
        <p class="text-sm font-bold text-gray-800 truncate">${name}${isMe ? " <span class='text-blue-500 text-xs'>(You)</span>" : ""}</p>
      </div>
      <span class="text-sm font-bold text-gray-700">${stats.score}</span>`;
    container.appendChild(row);
  });

  // Find current user rank
  const myRank = sorted.findIndex(([id]) => id === currentUser.id);
  if (myRank !== -1) {
    setText("myRank", `#${myRank + 1}`);
  } else {
    setText("myRank", "—");
  }
}

// ── Load aggregate stats for this student ──
async function loadStudentStats(userId, coachingId) {
  // Already partially done in loadRecentResults
  // This fills in the streak
  setText("statStreak", `${userProfile?.current_streak || 0} days`);
}

// ── Start exam ──
window.startExam = async function(examId, btn) {
  btn.disabled = true;
  btn.innerHTML = `<i class="fas fa-spinner fa-spin mr-1"></i>Preparing...`;

  try {
    const { data: examCheck } = await client
      .from("scheduled_exams")
      .select("is_active, start_datetime, end_datetime, attempt_limit, exam_patterns(id, duration_minutes, question_source_pattern_id), category_id, coaching_id")
      .eq("id", examId)
      .single();

    if (!examCheck?.is_active) throw new Error("This exam is no longer available.");

    const now = new Date();
    if (examCheck.start_datetime && new Date(examCheck.start_datetime) > now) throw new Error("This exam hasn't started yet.");
    if (examCheck.end_datetime && new Date(examCheck.end_datetime) < now) throw new Error("This exam has expired.");

    const { data: existingAttempts } = await client
      .from("attempts")
      .select("id, submitted_at, started_at")
      .eq("user_id", currentUser.id)
      .eq("scheduled_exam_id", examId);

    const incomplete = (existingAttempts || []).find(a => !a.submitted_at);
    if (incomplete) {
      const maxMs = (examCheck.exam_patterns?.duration_minutes || 60) * 60 * 1000 * 1.5;
      const elapsed = Date.now() - new Date(incomplete.started_at).getTime();
      if (elapsed <= maxMs) {
        window.location.href = `/mock/exam.html?attempt=${incomplete.id}`;
        return;
      }
    }

    if (examCheck.attempt_limit) {
      const done = (existingAttempts || []).filter(a => a.submitted_at).length;
      if (done >= examCheck.attempt_limit) throw new Error(`Attempt limit reached (${examCheck.attempt_limit}).`);
    }

    const { data: newAttempt, error: ae } = await client
      .from("attempts")
      .insert([{ user_id: currentUser.id, scheduled_exam_id: examId, started_at: new Date() }])
      .select()
      .single();

    if (ae) throw new Error(ae.message);

    const patternId = examCheck.exam_patterns?.question_source_pattern_id || examCheck.exam_patterns?.id;

    const { data: sections } = await client
      .from("pattern_sections")
      .select("id, section_name, question_count")
      .eq("pattern_id", patternId);

    if (!sections || sections.length === 0) throw new Error("No sections found for this exam.");

    const sectionNames = sections.map(s => s.section_name);
    const { data: questions } = await client
      .from("questions")
      .select("id, section_name, difficulty")
      .eq("category_id", examCheck.category_id)
      .eq("coaching_id", examCheck.coaching_id)
      .in("section_name", sectionNames)
      .eq("is_active", true);

    if (!questions || questions.length === 0) throw new Error("No questions found. Please contact your admin.");

    let finalQuestions = [];
    sections.forEach(sec => {
      const pool = (questions || []).filter(q => q.section_name === sec.section_name);
      const shuffled = pool.sort(() => Math.random() - 0.5).slice(0, sec.question_count || 0);
      finalQuestions = finalQuestions.concat(shuffled);
    });

    if (finalQuestions.length === 0) throw new Error("Could not assign questions. Contact admin.");

    await client.from("attempt_questions").insert(
      finalQuestions.map((q, idx) => ({
        attempt_id: newAttempt.id,
        question_id: q.id,
        question_order: idx + 1,
      }))
    );

    window.location.href = `/mock/exam.html?attempt=${newAttempt.id}`;
  } catch (err) {
    btn.disabled = false;
    btn.innerHTML = `<i class="fas fa-play mr-1"></i>Start Exam`;
    alert(err.message);
  }
};

window.resumeExam = function(attemptId, btn) {
  btn.disabled = true;
  btn.innerHTML = `<i class="fas fa-spinner fa-spin mr-1"></i>Loading...`;
  window.location.href = `/mock/exam.html?attempt=${attemptId}`;
};

window.logout = async function() {
  await client.auth.signOut();
  window.location.href = "/index.html";
};

// ── Utility helpers ──
function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function loadingHTML(size = "normal") {
  const sz = size === "small" ? "text-xl" : "text-3xl";
  return `<div class="text-center py-6 text-gray-300"><i class="fas fa-spinner fa-spin ${sz}"></i></div>`;
}

function errorHTML(msg) {
  return `<p class="text-red-500 text-sm text-center py-4">${msg}</p>`;
}

function showError(msg) {
  document.body.innerHTML = `
    <div class="min-h-screen flex items-center justify-center">
      <div class="text-center p-8">
        <div class="text-5xl mb-4">⚠️</div>
        <h2 class="text-xl font-bold text-gray-700 mb-2">Error</h2>
        <p class="text-gray-500">${msg}</p>
        <a href="/index.html" class="mt-6 inline-block bg-blue-600 text-white px-6 py-2 rounded-full font-semibold hover:bg-blue-700">Go Home</a>
      </div>
    </div>`;
}