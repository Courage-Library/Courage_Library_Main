// coachingLeaderboard.js — Courage Library B2B Coaching Leaderboard
// Fully scoped to coaching center — no cross-coaching data ever shown

const SUPABASE_URL = "https://sgagswxzsxlgcspwiuoh.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNnYWdzd3h6c3hsZ2NzcHdpdW9oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5NTA1NTIsImV4cCI6MjA2OTUyNjU1Mn0.ZNfk5WNDPkjKcFsRO48rEYk3dhbLYm_m21aZ-wfywo4";

const { createClient } = supabase;
const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── State ──
let currentUser = null;
let coachingId = null;
let coachingProfile = null;
let allExams = [];          // exams belonging to this coaching
let selectedExamId = "all"; // "all" or a specific exam id

document.addEventListener("DOMContentLoaded", async () => {
  await init();
});

async function init() {
  const { data: { user } } = await client.auth.getUser();
  if (!user) { window.location.href = "/index.html?action=login"; return; }
  currentUser = user;

  const { data: profile } = await client
    .from("user_profiles")
    .select("full_name, coaching_id")
    .eq("id", user.id)
    .single();

  if (!profile?.coaching_id) { window.location.href = "/mock/dashboard.html"; return; }
  coachingId = profile.coaching_id;

  const { data: coaching } = await client
    .from("coaching_centers")
    .select("id, name, slug, primary_color, logo_url, city")
    .eq("id", coachingId)
    .single();

  if (!coaching) { showError("Coaching center not found."); return; }
  coachingProfile = coaching;

  applyBranding(coaching);

  await loadExamFilter(coachingId);
  await loadLeaderboard();
}

// ── Branding ──
function applyBranding(coaching) {
  const color = coaching.primary_color || "#1a56db";
  document.querySelectorAll(".coaching-name").forEach(el => el.textContent = coaching.name);
  document.querySelectorAll(".coaching-color-bg").forEach(el => {
    el.style.background = `linear-gradient(135deg, ${color}, ${color}cc)`;
  });
  document.querySelectorAll(".coaching-color-text").forEach(el => el.style.color = color);
  document.title = `Leaderboard | ${coaching.name}`;

  const header = document.getElementById("lbHeader");
  if (header) header.style.background = `linear-gradient(135deg, ${color}, ${color}cc)`;

  if (coaching.city) setText("coachingCity", `📍 ${coaching.city}`);
}

// ── Load exam filter dropdown ──
async function loadExamFilter(coachingId) {
  const { data: exams } = await client
    .from("scheduled_exams")
    .select("id, exam_patterns(pattern_name), exam_categories(name)")
    .eq("coaching_id", coachingId)
    .order("start_datetime", { ascending: false });

  allExams = exams || [];

  const select = document.getElementById("examFilter");
  select.innerHTML = `<option value="all">All Exams (Overall)</option>`;
  allExams.forEach(e => {
    const label = e.exam_patterns?.pattern_name || "Exam";
    select.innerHTML += `<option value="${e.id}">${label}</option>`;
  });

  select.addEventListener("change", (ev) => {
    selectedExamId = ev.target.value;
    loadLeaderboard();
  });
}

// ── Load leaderboard ──
async function loadLeaderboard() {
  const container = document.getElementById("lbContainer");
  container.innerHTML = `
    <div class="text-center py-12 text-gray-300">
      <i class="fas fa-spinner fa-spin text-3xl"></i>
    </div>`;

  // Get relevant exam IDs
  let examIds = allExams.map(e => e.id);
  if (selectedExamId !== "all") {
    examIds = [selectedExamId];
  }

  if (examIds.length === 0) {
    container.innerHTML = emptyHTML("No exams scheduled yet.");
    return;
  }

  // Fetch all completed attempts for these exams
  const { data: attempts, error } = await client
    .from("attempts")
    .select("user_id, total_score, accuracy, time_taken, submitted_at, scheduled_exam_id")
    .in("scheduled_exam_id", examIds)
    .not("submitted_at", "is", null)
    .order("total_score", { ascending: false });

  if (error) { container.innerHTML = `<p class="text-red-500 text-center py-8">${error.message}</p>`; return; }

  if (!attempts || attempts.length === 0) {
    container.innerHTML = emptyHTML("No attempts yet. Be the first to attempt!");
    return;
  }

  // Aggregate per user: best score, avg accuracy, attempts count
  const userStats = {};
  attempts.forEach(a => {
    if (!userStats[a.user_id]) {
      userStats[a.user_id] = { bestScore: 0, totalAccuracy: 0, attempts: 0, fastestTime: Infinity };
    }
    const u = userStats[a.user_id];
    if ((a.total_score || 0) > u.bestScore) u.bestScore = a.total_score || 0;
    u.totalAccuracy += Number(a.accuracy || 0);
    u.attempts++;
    if (a.time_taken && a.time_taken < u.fastestTime) u.fastestTime = a.time_taken;
  });

  // Sort by bestScore desc, then avgAccuracy desc
  const sorted = Object.entries(userStats).sort((a, b) => {
    if (b[1].bestScore !== a[1].bestScore) return b[1].bestScore - a[1].bestScore;
    return (b[1].totalAccuracy / b[1].attempts) - (a[1].totalAccuracy / a[1].attempts);
  });

  // Fetch user names (only these users, from this coaching)
  const userIds = sorted.map(([id]) => id);
  const { data: profiles } = await client
    .from("user_profiles")
    .select("id, full_name")
    .in("id", userIds)
    .eq("coaching_id", coachingId); // security: only coaching's own students

  const nameMap = {};
  (profiles || []).forEach(p => { nameMap[p.id] = p.full_name || "Student"; });

  // Find my rank
  const myRank = sorted.findIndex(([id]) => id === currentUser.id) + 1;
  if (myRank > 0) {
    setText("myRankDisplay", `#${myRank}`);
    setText("myRankOf", `of ${sorted.length} students`);
    document.getElementById("myRankCard").classList.remove("hidden");
  }

  // Render
  container.innerHTML = "";

  // Table header
  const thead = document.createElement("div");
  thead.className = "grid grid-cols-12 gap-2 px-4 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100";
  thead.innerHTML = `
    <div class="col-span-1 text-center">Rank</div>
    <div class="col-span-5">Student</div>
    <div class="col-span-2 text-center">Best Score</div>
    <div class="col-span-2 text-center">Avg Accuracy</div>
    <div class="col-span-2 text-center">Attempts</div>`;
  container.appendChild(thead);

  const medals = ["🥇", "🥈", "🥉"];

  sorted.forEach(([userId, stats], i) => {
    const rank = i + 1;
    const name = nameMap[userId] || "Student";
    const isMe = userId === currentUser.id;
    const avgAcc = (stats.totalAccuracy / stats.attempts).toFixed(1);
    const accColor = Number(avgAcc) >= 80 ? "#10b981" : Number(avgAcc) >= 60 ? "#f59e0b" : "#ef4444";

    const row = document.createElement("div");
    row.className = `grid grid-cols-12 gap-2 px-4 py-3.5 items-center border-b border-gray-50 transition ${isMe ? "bg-blue-50 border-l-4 border-blue-400" : "hover:bg-gray-50"}`;

    // Top 3 special styling
    let rankDisplay = `<span class="text-sm font-bold text-gray-400">#${rank}</span>`;
    if (rank <= 3) {
      rankDisplay = `<span class="text-xl">${medals[rank - 1]}</span>`;
    }

    const nameInitials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
    const avatarColor = isMe ? (coachingProfile?.primary_color || "#1a56db") : "#94a3b8";

    row.innerHTML = `
      <div class="col-span-1 text-center">${rankDisplay}</div>
      <div class="col-span-5 flex items-center gap-2.5 min-w-0">
        <div class="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
          style="background:${avatarColor}">
          ${nameInitials}
        </div>
        <div class="min-w-0">
          <p class="text-sm font-bold text-gray-800 truncate">${name}${isMe ? ' <span class="text-blue-400 text-xs font-medium">(You)</span>' : ""}</p>
        </div>
      </div>
      <div class="col-span-2 text-center">
        <span class="text-sm font-extrabold text-gray-800">${stats.bestScore}</span>
      </div>
      <div class="col-span-2 text-center">
        <span class="text-sm font-bold" style="color:${accColor}">${avgAcc}%</span>
      </div>
      <div class="col-span-2 text-center">
        <span class="text-sm font-semibold text-gray-500">${stats.attempts}</span>
      </div>`;

    container.appendChild(row);
  });
}

function emptyHTML(msg) {
  return `
    <div class="text-center py-14 text-gray-300">
      <i class="fas fa-trophy text-5xl mb-4 block opacity-30"></i>
      <p class="font-semibold text-gray-400">${msg}</p>
    </div>`;
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function showError(msg) {
  document.body.innerHTML = `
    <div class="min-h-screen flex items-center justify-center">
      <div class="text-center p-8">
        <div class="text-5xl mb-4">⚠️</div>
        <p class="text-gray-500">${msg}</p>
        <a href="/coaching/dashboard.html" class="mt-6 inline-block bg-blue-600 text-white px-6 py-2 rounded-full font-semibold">Go Back</a>
      </div>
    </div>`;
}