const SUPABASE_URL = "https://sgagswxzsxlgcspwiuoh.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNnYWdzd3h6c3hsZ2NzcHdpdW9oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5NTA1NTIsImV4cCI6MjA2OTUyNjU1Mn0.ZNfk5WNDPkjKcFsRO48rEYk3dhbLYm_m21aZ-wfywo4";

const { createClient } = supabase;
const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── Daily Schedule Constants ─────────────────────────────────────────────────
const DAILY_OPEN_HOUR  = 5;   // 5:00 AM
const DAILY_CLOSE_HOUR = 23;  // 11:00 PM (11:59 PM effectively — see check below)

// JS getDay() → 0=Sunday, 1=Monday, ..., 6=Saturday
const DAY_INDEX_TO_NAME = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];

const DAY_LABELS = {
  monday:    "Monday",
  tuesday:   "Tuesday",
  wednesday: "Wednesday",
  thursday:  "Thursday",
  friday:    "Friday",
  saturday:  "Saturday",
  sunday:    "Sunday",
};

document.addEventListener("DOMContentLoaded", async () => {
  await checkAuth();
  await loadPerformanceAnalytics();
  await loadAvailableExams();
});

async function checkAuth() {
  const { data: { user } } = await client.auth.getUser();
  if (!user) window.location.href = "/index.html?checkAuth=1";
}

// ─── Performance Analytics (unchanged) ────────────────────────────────────────
async function loadPerformanceAnalytics() {
  const { data: { user } } = await client.auth.getUser();

  const { data } = await client
    .from("attempts")
    .select(`total_score, accuracy, time_taken, submitted_at,
      scheduled_exams ( schedule_type, active_section, exam_categories ( name ), exam_patterns ( pattern_name ) )`)
    .eq("user_id", user.id)
    .not("submitted_at", "is", null);

  if (!data || data.length === 0) {
    document.getElementById("totalAttempts").textContent = "0";
    document.getElementById("avgAccuracy").textContent   = "0%";
    document.getElementById("bestScore").textContent     = "0";
    document.getElementById("totalTime").textContent     = "0 hrs";
    renderRecentAttempts([]);
    return;
  }

  document.getElementById("totalAttempts").innerText = data.length;
  const avgAccuracy = data.reduce((s, a) => s + Number(a.accuracy || 0), 0) / data.length;
  document.getElementById("avgAccuracy").innerText = avgAccuracy.toFixed(1) + "%";
  document.getElementById("bestScore").innerText = Math.max(...data.map(a => a.total_score || 0));
  const totalSeconds = data.reduce((s, a) => s + (a.time_taken || 0), 0);
  document.getElementById("totalTime").innerText = (totalSeconds / 3600).toFixed(1) + " hrs";
  renderRecentAttempts(data.slice(-5).reverse());
}

// ─── Daily Time Window Check ──────────────────────────────────────────────────
function isDailyWindowOpen() {
  const now   = new Date();
  const hours = now.getHours();
  const mins  = now.getMinutes();
  // Open: 5:00 AM to 11:59 PM
  if (hours < DAILY_OPEN_HOUR) return false;
  if (hours === 23 && mins === 59) return false; // edge: 11:59 PM — still open
  if (hours >= 24) return false;
  return true;
}

// Returns next open time string for display
function getNextOpenTime() {
  const now      = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(DAILY_OPEN_HOUR, 0, 0, 0);
  return tomorrow.toLocaleString("en-IN", {
    weekday: "short", day: "numeric", month: "short",
    hour: "2-digit", minute: "2-digit", hour12: true
  });
}

// Calculate mock number from launch date
function getMockNumber(launchDate, dayOfWeek) {
  if (!launchDate) return 1;
  const launch = new Date(launchDate);
  const today  = new Date();
  today.setHours(0, 0, 0, 0);
  launch.setHours(0, 0, 0, 0);

  const diffDays = Math.floor((today - launch) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 1;

  // Count how many times this day_of_week has occurred since launch
  const dayNames = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
  const launchDayIdx = launch.getDay();
  const targetDayIdx = dayNames.indexOf(dayOfWeek);

  // Days from launch to first occurrence of this day
  let daysToFirst = (targetDayIdx - launchDayIdx + 7) % 7;

  if (diffDays < daysToFirst) return null; // Not started yet

  const weeksCompleted = Math.floor((diffDays - daysToFirst) / 7);
  return weeksCompleted + 1;
}

// ─── Schedule Info Popup ─────────────────────────────────────────────────────
function injectScheduleInfoPopup() {
  if (document.getElementById("schedInfoOverlay")) return;
  const overlay = document.createElement("div");
  overlay.id = "schedInfoOverlay";
  overlay.style = "display:none;position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,.55);backdrop-filter:blur(4px);align-items:center;justify-content:center;padding:16px;";
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:20px;max-width:520px;width:100%;box-shadow:0 24px 64px rgba(15,23,42,.2);overflow:hidden;animation:fadeInUp .25s ease;max-height:90vh;overflow-y:auto;">

      <!-- Header -->
      <div style="background:linear-gradient(135deg,#1a56db,#1e3a8a);padding:18px 20px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:1">
        <div>
          <div style="font-size:.62rem;font-weight:700;color:#93c5fd;text-transform:uppercase;letter-spacing:.1em;margin-bottom:3px">SSC GD Daily Schedule</div>
          <div style="font-size:.98rem;font-weight:800;color:#fff">Weekly Mock Test Plan</div>
        </div>
        <button onclick="document.getElementById('schedInfoOverlay').style.display='none'" style="width:30px;height:30px;border-radius:8px;background:rgba(255,255,255,.15);border:none;color:#fff;cursor:pointer;font-size:.9rem;display:flex;align-items:center;justify-content:center">✕</button>
      </div>

      <div style="padding:18px 20px 20px;display:flex;flex-direction:column;gap:16px">

        <!-- Schedule Table -->
        <div>
          <div style="font-size:.68rem;font-weight:800;color:#1a56db;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px"><i class="fas fa-calendar-alt mr-1"></i> Weekly Schedule</div>
          <div style="border-radius:12px;overflow:hidden;border:1px solid #e2e8f4;">
            <table style="width:100%;border-collapse:collapse;font-size:.78rem;">
              <thead>
                <tr style="background:#f0f6ff;">
                  <th style="padding:8px 12px;text-align:left;font-weight:800;color:#1e40af;font-size:.68rem;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid #bfdbfe">Day</th>
                  <th style="padding:8px 12px;text-align:left;font-weight:800;color:#1e40af;font-size:.68rem;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid #bfdbfe">Subject</th>
                  <th style="padding:8px 12px;text-align:center;font-weight:800;color:#1e40af;font-size:.68rem;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid #bfdbfe">Q</th>
                  <th style="padding:8px 12px;text-align:center;font-weight:800;color:#1e40af;font-size:.68rem;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid #bfdbfe">Marks</th>
                  <th style="padding:8px 12px;text-align:center;font-weight:800;color:#1e40af;font-size:.68rem;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid #bfdbfe">Time</th>
                </tr>
              </thead>
              <tbody>
                ${[
                  ["Monday",    "General Awareness",  "20", "40",  "20m", false],
                  ["Tuesday",   "Reasoning",          "20", "40",  "20m", false],
                  ["Wednesday", "Quant Aptitude",     "20", "40",  "20m", false],
                  ["Thursday",  "English Grammar",    "20", "40",  "20m", false],
                  ["Friday",    "Hindi",              "20", "40",  "20m", false],
                  ["Saturday",  "Mixed (All 5)",      "50", "100", "30m", false],
                  ["Sunday",    "Full Mock Test",     "100","200", "60m", true],
                ].map(([day, subj, q, marks, time, highlight], i) => `
                  <tr style="background:${highlight ? '#fff7ed' : i%2===0 ? '#fff' : '#f8faff'};border-bottom:1px solid #f1f5f9">
                    <td style="padding:7px 12px;font-weight:700;color:${highlight ? '#c2410c' : '#0f172a'}">${day}</td>
                    <td style="padding:7px 12px;color:#374151">${subj}</td>
                    <td style="padding:7px 12px;text-align:center;font-weight:700;color:#1d4ed8">${q}</td>
                    <td style="padding:7px 12px;text-align:center;font-weight:700;color:#059669">${marks}</td>
                    <td style="padding:7px 12px;text-align:center;color:#64748b">${time}</td>
                  </tr>`).join("")}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Rules -->
        <div style="background:#f8faff;border:1px solid #e8edf5;border-radius:12px;overflow:hidden">
          <div style="padding:10px 14px;background:#f0f6ff;border-bottom:1px solid #e2e8f4;font-size:.68rem;font-weight:800;color:#1a56db;text-transform:uppercase;letter-spacing:.08em"><i class="fas fa-shield-alt mr-1"></i> Rules</div>
          ${[
            ["fas fa-clock",       "#dbeafe","#1d4ed8", "5:00 AM – 11:59 PM only",      "Tests lock outside this window every day."],
            ["fas fa-ban",         "#fee2e2","#dc2626", "One attempt per day",           "No retakes. Missed = gone. Real exam discipline."],
            ["fas fa-minus-circle","#fef3c7","#d97706", "Negative marking −0.5",        "Wrong answer costs half a mark. Attempt wisely."],
          ].map(([icon, bg, color, title, desc], i, arr) => `
            <div style="display:flex;gap:10px;align-items:center;padding:10px 14px;${i < arr.length-1 ? 'border-bottom:1px solid #f1f5f9' : ''}">
              <span style="width:26px;height:26px;border-radius:7px;background:${bg};color:${color};display:flex;align-items:center;justify-content:center;font-size:.68rem;flex-shrink:0"><i class="${icon}"></i></span>
              <div style="flex:1"><span style="font-size:.78rem;font-weight:800;color:#0f172a">${title}</span><span style="font-size:.72rem;color:#64748b;margin-left:6px">${desc}</span></div>
            </div>`).join("")}
        </div>

      </div>
    </div>`;
  overlay.addEventListener("click", e => { if (e.target === overlay) overlay.style.display = "none"; });
  document.body.appendChild(overlay);
}

window.openScheduleInfo = function() {
  injectScheduleInfoPopup();
  document.getElementById("schedInfoOverlay").style.display = "flex";
};

// ─── Streak Calculator ───────────────────────────────────────────────────────
function calculateStreak(attempts) {
  // attempts = array of submitted_at date strings
  if (!attempts || attempts.length === 0) return 0;

  // Get unique dates student completed any test (daily_auto only)
  const dates = [...new Set(
    attempts
      .filter(a => a.submitted_at)
      .map(a => new Date(a.submitted_at).toDateString())
  )].map(d => new Date(d)).sort((a, b) => b - a); // newest first

  if (dates.length === 0) return 0;

  const today     = new Date(); today.setHours(0,0,0,0);
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);

  // Streak must include today or yesterday to be "active"
  const newest = new Date(dates[0]); newest.setHours(0,0,0,0);
  if (newest < yesterday) return 0; // streak broken

  let streak = 1;
  for (let i = 1; i < dates.length; i++) {
    const curr = new Date(dates[i]); curr.setHours(0,0,0,0);
    const prev = new Date(dates[i-1]); prev.setHours(0,0,0,0);
    const diffDays = Math.round((prev - curr) / (1000 * 60 * 60 * 24));
    if (diffDays === 1) streak++;
    else break;
  }
  return streak;
}

// ─── Countdown Helpers ───────────────────────────────────────────────────────

// Active interval IDs so we can clear them on re-render
const _countdownIntervals = [];

function clearAllCountdowns() {
  _countdownIntervals.forEach(id => clearInterval(id));
  _countdownIntervals.length = 0;
}

function formatCountdown(ms) {
  if (ms <= 0) return "00:00:00";
  const totalSecs = Math.floor(ms / 1000);
  const days  = Math.floor(totalSecs / 86400);
  const hrs   = Math.floor((totalSecs % 86400) / 3600);
  const mins  = Math.floor((totalSecs % 3600) / 60);
  const secs  = totalSecs % 60;
  if (days > 0) return `${days}d ${String(hrs).padStart(2,"0")}h ${String(mins).padStart(2,"0")}m`;
  return `${String(hrs).padStart(2,"0")}:${String(mins).padStart(2,"0")}:${String(secs).padStart(2,"0")}`;
}

function getClosingMs() {
  const now    = new Date();
  const close  = new Date();
  close.setHours(23, 59, 59, 0);
  return close - now;
}

function getOpeningMs(dayOfWeek) {
  // Returns ms until next occurrence of dayOfWeek at 5:00 AM
  const dayNames = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
  const now      = new Date();
  const todayIdx = now.getDay();
  const targetIdx = dayNames.indexOf(dayOfWeek);
  let daysAhead = (targetIdx - todayIdx + 7) % 7;
  if (daysAhead === 0) daysAhead = 7; // already passed today
  const opening = new Date();
  opening.setDate(opening.getDate() + daysAhead);
  opening.setHours(5, 0, 0, 0);
  return opening - now;
}

function startCountdown(elementId, getMs, urgent = false) {
  const el = document.getElementById(elementId);
  if (!el) return;
  function tick() {
    const ms = getMs();
    if (ms <= 0) { el.textContent = "00:00:00"; return; }
    el.textContent = formatCountdown(ms);
    if (urgent && ms < 3600000) { // under 1 hour — red
      el.style.color = "#dc2626";
      el.style.background = "#fee2e2";
      el.style.borderColor = "#fca5a5";
    }
  }
  tick();
  const id = setInterval(tick, 1000);
  _countdownIntervals.push(id);
}

// ─── Toggle Scheduled Cards ──────────────────────────────────────────────────

// ─── Load Available Exams ─────────────────────────────────────────────────────
async function loadAvailableExams() {
  const { data: { user } } = await client.auth.getUser();

  const { data, error } = await client
    .from("scheduled_exams")
    .select(`
      id, mode, availability_type, is_active,
      start_datetime, end_datetime, is_premium, attempt_limit,
      schedule_type, day_of_week, exam_type, launch_date, category_id,
      language,
      exam_patterns ( pattern_name, duration_minutes, negative_marking, total_questions ),
      exam_categories ( name )
    `)
    .eq("is_active", true);

  if (error) { console.error(error); return; }

  clearAllCountdowns();
  const container = document.getElementById("examList");
  container.innerHTML = "";

  if (!data || data.length === 0) {
    container.innerHTML = `
      <div style="grid-column:1/-1">
        <div class="empty-box">
          <div class="empty-ico"><i class="fas fa-calendar-times"></i></div>
          <h3>No Tests Available</h3>
          <p>No mock tests are scheduled right now. Check back soon!</p>
        </div>
      </div>`;
    return;
  }

  // Separate daily_auto from manual schedules
  const dailyExams  = data.filter(e => e.schedule_type === "daily_auto");
  const manualExams = data.filter(e => e.schedule_type !== "daily_auto");

  // Fetch user attempts for all exams
  const examIds = data.map(e => e.id);
  const { data: userAttempts } = await client
    .from("attempts")
    .select("id, scheduled_exam_id, submitted_at, started_at, total_score")
    .eq("user_id", user.id)
    .in("scheduled_exam_id", examIds);

  // Fetch all daily_auto attempts for streak calculation
  const dailyExamIds = dailyExams.map(e => e.id);
  const { data: streakAttempts } = dailyExamIds.length > 0 ? await client
    .from("attempts")
    .select("submitted_at")
    .eq("user_id", user.id)
    .in("scheduled_exam_id", dailyExamIds)
    .not("submitted_at", "is", null) : { data: [] };

  const currentStreak = calculateStreak(streakAttempts || []);

  const attemptsByExam = {};
  (userAttempts || []).forEach(a => {
    if (!attemptsByExam[a.scheduled_exam_id]) attemptsByExam[a.scheduled_exam_id] = [];
    attemptsByExam[a.scheduled_exam_id].push(a);
  });

  const now        = new Date();
  const todayName  = DAY_INDEX_TO_NAME[now.getDay()]; // e.g. "monday"
  const windowOpen = isDailyWindowOpen();

  // ── Subject name map for daily sectional cards ──
  const SUBJECT_NAMES = {
    monday:    "General Awareness",
    tuesday:   "Reasoning",
    wednesday: "Quant Aptitude",
    thursday:  "English Grammar",
    friday:    "Hindi",
    saturday:  "Mixed Sectional",
    sunday:    "Full Mock Test",
  };

  const SUBJECT_ICONS = {
    monday:    "fas fa-newspaper",
    tuesday:   "fas fa-brain",
    wednesday: "fas fa-calculator",
    thursday:  "fas fa-spell-check",
    friday:    "fas fa-language",
    saturday:  "fas fa-layer-group",
    sunday:    "fas fa-file-alt",
  };

  // ── Build card HTML helper ──
  function buildDailyCard(exam, i) {
    const isToday    = exam.day_of_week === todayName;
    const mockNumber = getMockNumber(exam.launch_date, exam.day_of_week);
    const myAttempts = attemptsByExam[exam.id] || [];
    const completedAttempts  = myAttempts.filter(a => a.submitted_at);
    const incompleteAttempt  = myAttempts.find(a => !a.submitted_at);

    let isAbandoned = false;
    const pattern = exam.exam_patterns || {};
    if (incompleteAttempt?.started_at) {
      const maxMs  = (pattern.duration_minutes || 60) * 60 * 1000 * 1.5;
      const elapsed = now - new Date(incompleteAttempt.started_at);
      if (elapsed > maxMs) isAbandoned = true;
    }

    const alreadyDone = completedAttempts.length > 0;
    const isLive      = isToday && windowOpen;
    const dayLabel    = DAY_LABELS[exam.day_of_week] || exam.day_of_week;
    const subjectName  = SUBJECT_NAMES[exam.day_of_week] || pattern.pattern_name || "Mock Test";
    const subjectIcon  = SUBJECT_ICONS[exam.day_of_week] || "fas fa-file-alt";
    const categoryName = exam.exam_categories?.name || "";
    const mockLabel    = mockNumber ? `${mockNumber}` : "";
    // Title = "SSC GD - Mixed Sectional" (no number — shown as badge)
    const cardTitle    = categoryName
      ? `${categoryName} - ${subjectName}`
      : subjectName;
    const negVal       = pattern.negative_marking != null ? `-${pattern.negative_marking}` : "None";
    const totalMarks   = (pattern.total_questions || 0) * 2;
    const countdownId  = `cd-${exam.id}`;

    let btnHtml = "", availHtml = "", accentClass = "";
    let badgeText = "", badgeStyle = "";

    if (!isToday) {
      accentClass = "locked";
      badgeText   = mockLabel ? `${dayLabel} / T${mockLabel}` : dayLabel;
      badgeStyle  = "background:#f1f5f9;color:#94a3b8;";
      availHtml   = `<div class="exam-avail" style="justify-content:space-between;color:#64748b"><span style="display:flex;align-items:center;gap:6px"><span class="avail-dot" style="background:#cbd5e1"></span>Opens at 5:00 AM</span><span id="${countdownId}" style="font-size:.72rem;font-weight:800;background:#f1f5f9;color:#64748b;border:1px solid #e2e8f4;padding:2px 8px;border-radius:20px;font-variant-numeric:tabular-nums;letter-spacing:.02em">--:--:--</span></div>`;
      btnHtml     = `<button class="btn-start-exam disabled-btn" disabled><i class="fas fa-lock mr-1"></i> Upcoming</button>`;
    } else if (!windowOpen) {
      accentClass = "locked";
      badgeText   = mockLabel ? `Today / T${mockLabel}` : "Today";
      badgeStyle  = "background:#fef3c7;color:#92400e;";
      const openingToday = new Date(); openingToday.setHours(5,0,0,0);
      const msTillOpen = openingToday - now;
      const hh = Math.floor(msTillOpen/3600000);
      const mm = Math.floor((msTillOpen%3600000)/60000);
      const opensInText = hh > 0 ? `${hh}h ${mm}m` : `${mm}m`;
      availHtml   = `<div class="exam-avail" style="justify-content:space-between;color:#d97706"><span style="display:flex;align-items:center;gap:6px"><span class="avail-dot" style="background:#f59e0b"></span>Opens today at 5:00 AM</span><span style="font-size:.72rem;font-weight:800;background:#fef3c7;color:#d97706;border:1px solid #fde68a;padding:2px 8px;border-radius:20px">in ${opensInText}</span></div>`;
      btnHtml     = `<button class="btn-start-exam disabled-btn" disabled><i class="fas fa-clock mr-1"></i> Opens in ${opensInText}</button>`;
    } else if (alreadyDone) {
      accentClass = "done";
      badgeText   = mockLabel ? `Done / T${mockLabel}` : "Done";
      badgeStyle  = "background:#d1fae5;color:#065f46;";
      const completedScore = completedAttempts[completedAttempts.length - 1]?.total_score ?? null;
      const totalPossible = (pattern.total_questions || 0) * 2;
      const scoreText = completedScore !== null ? ` · Score: ${completedScore}/${totalPossible}` : "";
      availHtml   = `<div class="exam-avail ok"><span class="avail-dot" style="background:#10b981"></span>Completed today ✓${scoreText}</div>`;
      btnHtml     = `<button class="btn-start-exam disabled-btn" disabled style="background:#d1fae5;color:#065f46;border:1.5px solid #6ee7b7;"><i class="fas fa-check-circle mr-1"></i> Completed${completedScore !== null ? ` · ${completedScore}/${totalPossible}` : ""}</button>`;
    } else if (incompleteAttempt && !isAbandoned) {
      badgeText   = mockLabel ? `Today / T${mockLabel}` : "Today";
      badgeStyle  = "background:#dcfce7;color:#166534;";
      availHtml   = `<div class="exam-avail ok"><span class="avail-dot"></span>In progress — resume now</div>`;
      btnHtml     = `<button class="btn-start-exam active" style="background:linear-gradient(135deg,#059669,#10b981)" onclick="resumeExam('${incompleteAttempt.id}', this)"><i class="fas fa-redo mr-1"></i> Resume Exam</button>`;
    } else {
      badgeText   = mockLabel ? `Today / T${mockLabel}` : "Today";
      badgeStyle  = "background:#dcfce7;color:#166534;";
      const streakBadge = currentStreak >= 2
        ? `<span style="font-size:.7rem;font-weight:800;background:#fff7ed;color:#c2410c;border:1px solid #fed7aa;padding:2px 9px;border-radius:20px;display:inline-flex;align-items:center;gap:4px">🔥 ${currentStreak} day streak</span>`
        : "";
      availHtml   = `<div style="display:flex;flex-direction:column;gap:5px">
        <div class="exam-avail ok" style="justify-content:space-between"><span style="display:flex;align-items:center;gap:6px"><span class="avail-dot"></span>Live now · closes 11:59 PM</span><span id="${countdownId}" style="font-size:.72rem;font-weight:800;background:#dcfce7;color:#166534;border:1px solid #86efac;padding:2px 8px;border-radius:20px;font-variant-numeric:tabular-nums;letter-spacing:.02em">--:--:--</span></div>
        ${streakBadge ? `<div>${streakBadge}</div>` : ""}
      </div>`;
      const minsLeft = Math.floor(getClosingMs() / 60000);
      const warnAttr = (minsLeft <= 30 && minsLeft > 0)
        ? `onclick="if(!confirm('Only ${minsLeft} minutes left today and this exam is ${pattern.duration_minutes} minutes long. Start anyway?')) return; startExam('${exam.id}', this)"`
        : `onclick="startExam('${exam.id}', this)"`;
      btnHtml     = `<button class="btn-start-exam active" ${warnAttr}><i class="fas fa-play mr-1"></i> Start Exam</button>`;
    }

    const card = document.createElement("div");
    card.className = "exam-card";
    card.style.animation = `fadeInUp .45s ease ${i * 0.07}s both`;
    card.innerHTML = `
      <div class="exam-card-accent ${accentClass}"></div>
      <div class="exam-card-body">
        <div class="exam-card-head">
          <div style="flex:1;min-width:0">
            <div class="exam-card-title" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${cardTitle}</div>
          </div>
          <span class="exam-type-badge" style="${badgeStyle};margin-left:8px;flex-shrink:0">${badgeText}</span>
        </div>
        ${availHtml}
        <div class="exam-meta-grid">
          <div class="meta-chip">
            <div class="meta-chip-icon"><i class="far fa-clock"></i></div>
            <div><div class="meta-chip-label">Duration</div><div class="meta-chip-value">${pattern.duration_minutes ?? "—"} min</div></div>
          </div>
          <div class="meta-chip">
            <div class="meta-chip-icon green"><i class="fas fa-list-ol"></i></div>
            <div><div class="meta-chip-label">Questions</div><div class="meta-chip-value">${pattern.total_questions ?? "—"}</div></div>
          </div>
          <div class="meta-chip">
            <div class="meta-chip-icon amber"><i class="fas fa-minus-circle"></i></div>
            <div><div class="meta-chip-label">Negative</div><div class="meta-chip-value">${negVal}</div></div>
          </div>
          <div class="meta-chip">
            <div class="meta-chip-icon indigo"><i class="fas fa-star"></i></div>
            <div><div class="meta-chip-label">Total Marks</div><div class="meta-chip-value">${totalMarks}</div></div>
          </div>
        </div>
      </div>
      <div class="exam-card-footer">${btnHtml}</div>`;
    return card;
  }

  // ── Sort daily exams: today first, then rest in week order ──
  const weekOrder = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"];
  const todayIdx  = weekOrder.indexOf(todayName);
  dailyExams.sort((a, b) => {
    const ar = (weekOrder.indexOf(a.day_of_week) - todayIdx + 7) % 7;
    const br = (weekOrder.indexOf(b.day_of_week) - todayIdx + 7) % 7;
    return ar - br;
  });

  const todayExams     = dailyExams.filter(e => e.day_of_week === todayName);
  const scheduledExams = dailyExams.filter(e => e.day_of_week !== todayName);

  // ── SECTION 1: Today's Test ──
  if (todayExams.length > 0) {
    const sec = document.createElement("div");
    sec.style = "grid-column:1/-1;";
    sec.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="width:4px;height:20px;border-radius:99px;background:linear-gradient(180deg,#1a56db,#60a5fa);display:inline-block;flex-shrink:0"></span>
          <span style="font-family:'Sora',sans-serif;font-size:1.05rem;font-weight:800;color:#0f172a">Today's Test</span>
          <button onclick="openScheduleInfo()" title="How it works" style="width:22px;height:22px;border-radius:50%;background:#e0e7ff;border:none;color:#4338ca;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;font-size:.7rem;transition:background .15s" onmouseover="this.style.background='#c7d2fe'" onmouseout="this.style.background='#e0e7ff'"><i class="fas fa-info"></i></button>
        </div>
        <span style="font-size:.72rem;font-weight:600;color:#94a3b8">${windowOpen ? "✓ Open · 5:00 AM – 11:59 PM" : "Opens at 5:00 AM"}</span>
      </div>`;
    container.appendChild(sec);
    // Today card spans full width
    const todayWrapper = document.createElement("div");
    todayWrapper.style = "grid-column:1/-1;max-width:420px;";
    container.appendChild(todayWrapper);
    todayExams.forEach((exam, i) => {
      const card = buildDailyCard(exam, i);
      todayWrapper.appendChild(card);
      // Start live closing countdown
      setTimeout(() => startCountdown(`cd-${exam.id}`, getClosingMs, true), 50);
    });
  }

  // ── SECTION 2: Scheduled Mock Tests ──
  if (scheduledExams.length > 0) {
    const sec = document.createElement("div");
    sec.style = "grid-column:1/-1;margin-top:32px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;";
    sec.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px">
        <span style="width:4px;height:20px;border-radius:99px;background:linear-gradient(180deg,#6366f1,#818cf8);display:inline-block;flex-shrink:0"></span>
        <span style="font-family:'Sora',sans-serif;font-size:1.05rem;font-weight:800;color:#0f172a">Scheduled Mock Tests</span>
      </div>
      <span style="font-size:.72rem;font-weight:600;color:#94a3b8">Available on their respective days</span>`;
    container.appendChild(sec);
    scheduledExams.forEach((exam, i) => {
      container.appendChild(buildDailyCard(exam, i));
      setTimeout(() => startCountdown(`cd-${exam.id}`, () => getOpeningMs(exam.day_of_week), false), 50);
    });
  }

  // ── SECTION 3: Other Mock Tests ──
  if (manualExams.length > 0) {
    const sec = document.createElement("div");
    sec.style = "grid-column:1/-1;margin-top:32px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;";
    sec.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px">
        <span style="width:4px;height:20px;border-radius:99px;background:linear-gradient(180deg,#0891b2,#22d3ee);display:inline-block;flex-shrink:0"></span>
        <span style="font-family:'Sora',sans-serif;font-size:1.05rem;font-weight:800;color:#0f172a">Other Mock Tests</span>
      </div>
      <span style="font-size:.72rem;font-weight:600;color:#94a3b8">Practice anytime</span>`;
    container.appendChild(sec);

    manualExams.forEach((exam, i) => {
      const pattern      = exam.exam_patterns || {};
      const myAttempts   = attemptsByExam[exam.id] || [];
      const completedAttempts = myAttempts.filter(a => a.submitted_at);
      const incompleteAttempt = myAttempts.find(a => !a.submitted_at);

      let isAbandoned = false;
      if (incompleteAttempt?.started_at) {
        const maxMs  = (pattern.duration_minutes || 60) * 60 * 1000 * 1.5;
        const elapsed = now - new Date(incompleteAttempt.started_at);
        if (elapsed > maxMs) isAbandoned = true;
      }

      const isExpired    = exam.end_datetime   && new Date(exam.end_datetime) < now;
      const notStarted   = exam.start_datetime && new Date(exam.start_datetime) > now;
      const limitReached = exam.attempt_limit  && completedAttempts.length >= exam.attempt_limit;
      const avType       = (exam.availability_type || "practice").toLowerCase();
      const badgeClass   = isExpired ? "badge-expired" : avType === "live" ? "badge-live" : avType === "weekly" ? "badge-weekly" : "badge-practice";
      const negVal       = pattern.negative_marking != null ? `-${pattern.negative_marking}` : "None";

      let btnHtml = "";
      if (isExpired) {
        btnHtml = `<button class="btn-start-exam disabled-btn" disabled><i class="fas fa-lock"></i> Expired</button>`;
      } else if (notStarted) {
        const startStr = new Date(exam.start_datetime).toLocaleString("en-IN", { day:"numeric", month:"short", hour:"2-digit", minute:"2-digit" });
        btnHtml = `<button class="btn-start-exam disabled-btn" disabled><i class="fas fa-clock"></i> Starts ${startStr}</button>`;
      } else if (limitReached) {
        btnHtml = `<button class="btn-start-exam disabled-btn" disabled><i class="fas fa-ban"></i> Limit Reached</button>`;
      } else if (incompleteAttempt && !isAbandoned) {
        btnHtml = `<button class="btn-start-exam active" style="background:linear-gradient(135deg,#059669,#10b981)" onclick="resumeExam('${incompleteAttempt.id}', this)"><i class="fas fa-redo"></i> Resume</button>`;
      } else {
        btnHtml = `<button class="btn-start-exam active" onclick="startExam('${exam.id}', this)"><i class="fas fa-play"></i> Start Exam</button>`;
      }

      const attemptsInfo = exam.attempt_limit
        ? `<span style="font-size:.65rem;color:#94a3b8;font-weight:700">${completedAttempts.length}/${exam.attempt_limit} attempts</span>`
        : completedAttempts.length > 0
          ? `<span style="font-size:.65rem;color:#94a3b8;font-weight:700">Attempted ${completedAttempts.length}×</span>`
          : "";

      const card = document.createElement("div");
      card.className = "exam-card";
      card.style.animation = `fadeInUp .45s ease ${i * 0.07}s both`;
      card.innerHTML = `
        <div class="exam-card-accent ${isExpired ? "expired" : ""}"></div>
        <div class="exam-card-body">
          <div class="exam-card-head">
            <div class="exam-card-title">${pattern.pattern_name || "Mock Test"}</div>
            <span class="exam-type-badge ${badgeClass}">${isExpired ? "Expired" : avType}</span>
          </div>
          <div class="exam-avail ${isExpired || notStarted ? "exp" : "ok"}">
            <span class="avail-dot"></span>
            ${isExpired ? "No longer available" : notStarted ? "Not started yet" : "Available now"}
            ${attemptsInfo ? `&nbsp;·&nbsp;${attemptsInfo}` : ""}
          </div>
          <div class="exam-meta-grid">
            <div class="meta-chip"><div class="meta-chip-icon"><i class="far fa-clock"></i></div><div><div class="meta-chip-label">Duration</div><div class="meta-chip-value">${pattern.duration_minutes ?? "—"} min</div></div></div>
            <div class="meta-chip"><div class="meta-chip-icon green"><i class="fas fa-list-ol"></i></div><div><div class="meta-chip-label">Questions</div><div class="meta-chip-value">${pattern.total_questions ?? "—"}</div></div></div>
            <div class="meta-chip"><div class="meta-chip-icon amber"><i class="fas fa-minus-circle"></i></div><div><div class="meta-chip-label">Negative</div><div class="meta-chip-value">${negVal}</div></div></div>
            <div class="meta-chip"><div class="meta-chip-icon indigo"><i class="fas fa-layer-group"></i></div><div><div class="meta-chip-label">Mode</div><div class="meta-chip-value">${exam.mode || "—"}</div></div></div>
          </div>
        </div>
        <div class="exam-card-footer">${btnHtml}</div>`;
      container.appendChild(card);
    });
  }
}

// ─── Fisher-Yates shuffle ─────────────────────────────────────────────────────
function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const DIFFICULTY_RATIO = { easy: 0.6, medium: 0.3, hard: 0.1 };

function pickQuestionsForSection(allQuestions, section) {
  const needed = section.question_count || 0;
  if (needed === 0) return [];
  const pool = allQuestions.filter(q => q.pattern_section_id === section.id);
  if (pool.length === 0) { console.warn(`No questions for section: ${section.section_name}`); return []; }
  const hasTopics = pool.some(q => q.topic && q.topic.trim() !== "");
  let selected = [];
  if (hasTopics) {
    const byTopic = {};
    pool.forEach(q => { const t = (q.topic?.trim()) ? q.topic.trim() : "__untagged__"; if (!byTopic[t]) byTopic[t] = []; byTopic[t].push(q); });
    const topics = Object.keys(byTopic);
    const fairShare = Math.ceil(needed / topics.length);
    let topicPicked = [], overflow = [];
    topics.forEach(topic => { const shuffled = shuffleArray(byTopic[topic]); const take = Math.min(shuffled.length, fairShare); topicPicked = topicPicked.concat(shuffled.slice(0, take)); if (shuffled.length > take) overflow = overflow.concat(shuffled.slice(take)); });
    topicPicked = shuffleArray(topicPicked);
    if (topicPicked.length >= needed) { selected = topicPicked.slice(0, needed); }
    else { selected = topicPicked.concat(shuffleArray(overflow).slice(0, needed - topicPicked.length)); }
  } else {
    selected = shuffleArray(pool).slice(0, needed);
  }
  return applyDifficultyBalance(selected, pool, needed);
}

function applyDifficultyBalance(currentSelection, fullPool, needed) {
  const targets = { easy: Math.round(needed * DIFFICULTY_RATIO.easy), medium: Math.round(needed * DIFFICULTY_RATIO.medium), hard: Math.floor(needed * DIFFICULTY_RATIO.hard) };
  const tSum = targets.easy + targets.medium + targets.hard;
  targets.easy += (needed - tSum);
  const poolByDiff = { easy: [], medium: [], hard: [] };
  fullPool.forEach(q => { const d = (q.difficulty || "easy").toLowerCase(); if (poolByDiff[d]) poolByDiff[d].push(q); });
  Object.keys(poolByDiff).forEach(d => { poolByDiff[d] = shuffleArray(poolByDiff[d]); });
  let result = [], deficit = 0;
  ["easy","medium","hard"].forEach(diff => { const want = targets[diff]; const available = poolByDiff[diff]; const take = Math.min(want, available.length); result = result.concat(available.slice(0, take)); deficit += (want - take); });
  if (deficit > 0) { const already = new Set(result.map(q => q.id)); const leftover = shuffleArray(fullPool.filter(q => !already.has(q.id))); result = result.concat(leftover.slice(0, deficit)); }
  return shuffleArray(result).slice(0, needed);
}

// ─── Resume Exam ──────────────────────────────────────────────────────────────
window.resumeExam = function(attemptId, btn) {
  btn.disabled = true;
  btn.innerHTML = `<span style="display:flex;align-items:center;justify-content:center;gap:8px">
    <svg style="width:16px;height:16px;animation:spin .75s linear infinite" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,.35)" stroke-width="3"/>
      <path d="M22 12a10 10 0 0 1-10 10" stroke="white" stroke-width="3" stroke-linecap="round"/>
    </svg>Loading...</span>`;
  window.location.href = `/mock/exam.html?attempt=${attemptId}`;
};

// ─── Start Exam ───────────────────────────────────────────────────────────────
window.startExam = async function(examId, btn, chosenLanguage = null) {
  // If exam language is "both" and no language chosen yet — ask first
  if (!chosenLanguage) {
    const { data: examLangCheck } = await client
      .from("scheduled_exams")
      .select("language")
      .eq("id", examId)
      .single();

    if (examLangCheck?.language === "both") {
      showDashboardLangPicker((lang) => window.startExam(examId, btn, lang));
      return;
    }
  }

  btn.disabled = true;
  btn.innerHTML = `<span style="display:flex;align-items:center;justify-content:center;gap:8px">
    <svg style="width:16px;height:16px;animation:spin .75s linear infinite;flex-shrink:0" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,.35)" stroke-width="3"/>
      <path d="M22 12a10 10 0 0 1-10 10" stroke="white" stroke-width="3" stroke-linecap="round"/>
    </svg>Preparing Exam...</span>`;

  try {
    const { data: { user } } = await client.auth.getUser();

    // Fetch exam details
    const { data: examCheck } = await client
      .from("scheduled_exams")
      .select("is_active, start_datetime, end_datetime, is_premium, attempt_limit, language, schedule_type, day_of_week, active_section, exam_type, exam_patterns(id, duration_minutes)")
      .eq("id", examId)
      .single();

    if (!examCheck || !examCheck.is_active) throw new Error("This exam is no longer available.");

    // For daily_auto — enforce time window + day check
    if (examCheck.schedule_type === "daily_auto") {
      const now      = new Date();
      const todayName = DAY_INDEX_TO_NAME[now.getDay()];

      if (examCheck.day_of_week !== todayName)
        throw new Error(`This exam is only available on ${DAY_LABELS[examCheck.day_of_week]}. Come back then!`);

      if (!isDailyWindowOpen())
        throw new Error("Today's exam window is closed. Come back at 5:00 AM.");
    } else {
      // Manual exam checks
      const now = new Date();
      if (examCheck.start_datetime && new Date(examCheck.start_datetime) > now) throw new Error("This exam has not started yet.");
      if (examCheck.end_datetime   && new Date(examCheck.end_datetime)   < now) throw new Error("This exam has expired.");
    }

    // Check existing attempts
    const { data: existingAttempts } = await client
      .from("attempts")
      .select("id, submitted_at, started_at")
      .eq("user_id", user.id)
      .eq("scheduled_exam_id", examId);

    const incomplete = (existingAttempts || []).find(a => !a.submitted_at);

    if (incomplete) {
      const durMins = examCheck.exam_patterns?.duration_minutes || 60;
      const maxMs   = durMins * 60 * 1000 * 1.5;
      const elapsed = incomplete.started_at ? Date.now() - new Date(incomplete.started_at).getTime() : Infinity;
      if (elapsed <= maxMs) {
        window.location.href = `/mock/exam.html?attempt=${incomplete.id}`;
        return;
      } else {
        await client.from("attempt_questions").delete().eq("attempt_id", incomplete.id);
        await client.from("answers").delete().eq("attempt_id", incomplete.id);
        await client.from("attempts").delete().eq("id", incomplete.id);
      }
    }

    // For daily_auto: check already completed today
    if (examCheck.schedule_type === "daily_auto") {
      const completed = (existingAttempts || []).filter(a => a.submitted_at);
      if (completed.length > 0) {
        const lastAttempt = completed[completed.length - 1];
        const lastDate    = new Date(lastAttempt.submitted_at);
        const today       = new Date();
        if (lastDate.toDateString() === today.toDateString()) {
          throw new Error("You have already completed today's test. Come back tomorrow at 5:00 AM!");
        }
      }
    } else {
      if (examCheck.attempt_limit) {
        const completed = (existingAttempts || []).filter(a => a.submitted_at).length;
        if (completed >= examCheck.attempt_limit)
          throw new Error(`Attempt limit reached (${examCheck.attempt_limit}).`);
      }
    }

    // Create attempt
    const { data: newAttempt, error: attemptError } = await client
      .from("attempts")
      .insert([{ user_id: user.id, scheduled_exam_id: examId, started_at: new Date() }])
      .select()
      .single();

    if (attemptError) throw new Error(attemptError.message);

    const patternId = examCheck.exam_patterns.id;

    // All question types use Daily Sectional section IDs as the question pool
    // Mixed & Full Mock share the same questions — just different question_count per section
    const DAILY_PATTERN_ID = 'aaaaaaaa-0001-0001-0001-000000000001';

    let sectionsQuery = client
      .from("pattern_sections")
      .select("id, section_name, question_count")
      .eq("pattern_id", DAILY_PATTERN_ID);

    // For daily sectional — only load the active section for today
    if (examCheck.exam_type === "daily_sectional" && examCheck.active_section) {
      sectionsQuery = sectionsQuery.eq("section_name", examCheck.active_section);
    }

    // For Mixed — override question_count to 10 per section
    // For Full Mock — override question_count to 20 per section
    // (pattern_sections question_count is for daily=20, so we override for mixed/full)

    let { data: sections } = await sectionsQuery;

    if (!sections || sections.length === 0) throw new Error("No sections found for this exam pattern.");

    // Override question_count based on exam type
    if (examCheck.exam_type === "mixed") {
      sections = sections.map(s => ({ ...s, question_count: 10 }));
    } else if (examCheck.exam_type === "full_mock") {
      sections = sections.map(s => ({ ...s, question_count: 20 }));
    }

    const examLang    = examCheck.language || "english";
    // Use student's chosen language for "both" exams
    const langToFetch = examLang === "both" ? (chosenLanguage || "hindi") : examLang;
    const sectionIds  = sections.map(s => s.id);

    let qQuery = client
      .from("questions")
      .select("id, pattern_section_id, topic, difficulty, language")
      .in("pattern_section_id", sectionIds)
      .eq("is_active", true);

    if (langToFetch) qQuery = qQuery.eq("language", langToFetch);

    const { data: allQuestions } = await qQuery;

    if (!allQuestions || allQuestions.length === 0) throw new Error("No active questions found for this exam.");

    let finalQuestions = [];
    sections.forEach(section => {
      finalQuestions = finalQuestions.concat(pickQuestionsForSection(allQuestions, section));
    });

    if (finalQuestions.length === 0) throw new Error("Could not assign any questions. Contact admin.");

    const { error: insertError } = await client
      .from("attempt_questions")
      .insert(finalQuestions.map((q, index) => ({
        attempt_id:     newAttempt.id,
        question_id:    q.id,
        question_order: index + 1,
      })));

    if (insertError) throw new Error(insertError.message);

    // Store chosen language so examEngine skips its own picker
    if (chosenLanguage) sessionStorage.setItem('chosenExamLanguage', chosenLanguage);
    window.location.href = `/mock/exam.html?attempt=${newAttempt.id}`;

  } catch (err) {
    console.error("startExam error:", err);
    btn.disabled = false;
    btn.innerHTML = `<i class="fas fa-play"></i> Start Exam`;
    alert(err.message);
  }
};

// ─── Render Recent Attempts ───────────────────────────────────────────────────
function renderRecentAttempts(attempts) {
  const container = document.getElementById("recentAttempts");
  if (!container) return;

  if (!attempts || attempts.length === 0) {
    container.innerHTML = `
      <div class="empty-box">
        <div class="empty-ico"><i class="fas fa-rocket"></i></div>
        <h3>No Attempts Yet</h3>
        <p>Start your first mock test — your performance history will appear here.</p>
      </div>`;
    return;
  }

  const accClass    = acc => acc >= 80 ? "p-green" : acc >= 60 ? "p-amber" : "p-red";
  const accMobClass = acc => acc >= 80 ? "acc-green" : acc >= 60 ? "acc-amber" : "acc-red";

  // Show more logic — show 5, shadow 6th
  const ATTEMPTS_INITIAL = 5;
  const hasMore = attempts.length > ATTEMPTS_INITIAL;
  const visibleAttempts = attempts; // render all, CSS controls visibility

  const desktopRows = attempts.map((a, idx) => {
    const acc  = Number(a.accuracy ?? 0);
    const se = a.scheduled_exams || {};
    const isDaily = se.schedule_type === "daily_auto";
    const catName = se.exam_categories?.name || "";
    const name = isDaily && se.active_section && catName
      ? `${catName} - ${se.active_section}`
      : se.exam_patterns?.pattern_name || "Mock";
    const date = a.submitted_at ? new Date(a.submitted_at).toLocaleDateString("en-IN", { day:"numeric", month:"short", year:"numeric" }) : "—";
    return `<div class="attempt-row${idx >= ATTEMPTS_INITIAL ? ' hidden-attempt' : ''}">
      <div><div class="attempt-name">${name}</div><div class="attempt-date">${date}</div></div>
      <div><span class="a-pill p-blue">${a.total_score ?? 0}</span></div>
      <div><span class="a-pill ${accClass(acc)}">${acc.toFixed(1)}%</span></div>
      <div class="attempt-time">${formatDuration(a.time_taken)}</div>
    </div>`;
  }).join("");

  const mobileCards = attempts.map((a, idx) => {
    const acc  = Number(a.accuracy ?? 0);
    const se = a.scheduled_exams || {};
    const isDaily = se.schedule_type === "daily_auto";
    const catName = se.exam_categories?.name || "";
    const name = isDaily && se.active_section && catName
      ? `${catName} - ${se.active_section}`
      : se.exam_patterns?.pattern_name || "Mock";
    const date = a.submitted_at ? new Date(a.submitted_at).toLocaleDateString("en-IN", { day:"numeric", month:"short", year:"numeric" }) : "—";
    return `<div class="attempt-mob${idx >= ATTEMPTS_INITIAL ? ' hidden-attempt' : ''}">
      <div class="amb-top"><div class="amb-name">${name}</div><div class="amb-date">${date}</div></div>
      <div class="amb-chips">
        <div class="amb-chip score"><div class="amb-chip-val">${a.total_score ?? 0}</div><div class="amb-chip-lbl">Score</div></div>
        <div class="amb-chip ${accMobClass(acc)}"><div class="amb-chip-val">${acc.toFixed(1)}%</div><div class="amb-chip-lbl">Accuracy</div></div>
        <div class="amb-chip time"><div class="amb-chip-val">${formatDuration(a.time_taken)}</div><div class="amb-chip-lbl">Time</div></div>
      </div>
    </div>`;
  }).join("");

  const showMoreBtn = hasMore ? `
    <div id="attemptShowMoreWrap">
      <div id="attemptShadow" style="height:80px;background:linear-gradient(to bottom,transparent,#fff);pointer-events:none;margin-top:-80px;position:relative;z-index:2"></div>
      <div style="text-align:center;padding:8px 0 12px;position:relative;z-index:3">
        <button id="attemptShowMore" onclick="toggleAttempts()" style="background:#fff;border:1.5px solid #e2e8f4;color:#1a56db;font-weight:800;font-size:.82rem;padding:9px 24px;border-radius:100px;cursor:pointer;box-shadow:0 2px 8px rgba(15,23,42,.08);transition:all .18s" onmouseover="this.style.boxShadow='0 4px 16px rgba(26,86,219,.15)'" onmouseout="this.style.boxShadow='0 2px 8px rgba(15,23,42,.08)'">
          <i class="fas fa-chevron-down mr-1"></i> Show All (${attempts.length - ATTEMPTS_INITIAL} more)
        </button>
      </div>
    </div>` : '';

  container.innerHTML = `
    <div class="attempts-thead"><div>Exam</div><div>Score</div><div>Accuracy</div><div>Time</div></div>
    ${desktopRows}${mobileCards}${showMoreBtn}`;
}

// ─── Dashboard Language Picker ───────────────────────────────────────────────
function showDashboardLangPicker(onSelect) {
  const existing = document.getElementById("dashLangPicker");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "dashLangPicker";
  overlay.style = "position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,.55);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:20px";
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:24px;max-width:360px;width:100%;box-shadow:0 32px 80px rgba(15,23,42,.25);overflow:hidden;">

      <!-- Header strip -->
      <div style="background:linear-gradient(135deg,#1a56db 0%,#1e3a8a 100%);padding:28px 24px 24px;text-align:center">
        <img src="/images/logo.png" alt="Courage Library" style="width:44px;height:44px;border-radius:12px;margin:0 auto 12px;display:block;background:#fff;padding:4px;">
        <div style="font-family:'Sora',sans-serif;font-size:1.05rem;font-weight:800;color:#fff;margin-bottom:4px">Courage Library</div>
        <div style="font-size:.72rem;color:#93c5fd;font-weight:500">Mock Test Platform</div>
      </div>

      <!-- Body -->
      <div style="padding:24px 24px 28px;text-align:center">
        <div style="font-family:'Sora',sans-serif;font-size:.98rem;font-weight:800;color:#0f172a;margin-bottom:4px">Select Exam Language</div>
        <div style="font-size:.76rem;color:#94a3b8;margin-bottom:20px">परीक्षा की भाषा चुनें</div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <button id="dashLangEn"
            style="padding:16px 12px;border-radius:14px;border:2px solid #dbeafe;background:#f8faff;color:#1d4ed8;font-weight:800;font-size:.9rem;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:6px;transition:all .18s"
            onmouseover="this.style.background='#dbeafe';this.style.borderColor='#3b82f6'"
            onmouseout="this.style.background='#f8faff';this.style.borderColor='#dbeafe'">
            <span style="font-size:1.1rem;font-weight:900;color:#1a56db;letter-spacing:.02em">A</span>
            <span style="font-size:.88rem">English</span>
            <span style="font-size:.62rem;color:#64748b;font-weight:600">Medium</span>
          </button>
          <button id="dashLangHi"
            style="padding:16px 12px;border-radius:14px;border:2px solid #fed7aa;background:#fff7ed;color:#c2410c;font-weight:800;font-size:.9rem;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:6px;transition:all .18s"
            onmouseover="this.style.background='#fed7aa';this.style.borderColor='#f97316'"
            onmouseout="this.style.background='#fff7ed';this.style.borderColor='#fed7aa'">
            <span style="font-size:1.1rem;font-weight:900;color:#ea580c;font-family:'Noto Sans Devanagari',sans-serif">अ</span>
            <span style="font-size:.88rem;font-family:'Noto Sans Devanagari',sans-serif">हिंदी</span>
            <span style="font-size:.62rem;color:#64748b;font-weight:600">माध्यम</span>
          </button>
        </div>
      </div>
    </div>`;

  overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);

  // Use addEventListener instead of inline onclick to keep scope
  document.getElementById("dashLangEn").addEventListener("click", () => {
    overlay.remove();
    onSelect("english");
  });
  document.getElementById("dashLangHi").addEventListener("click", () => {
    overlay.remove();
    onSelect("hindi");
  });
}

window.toggleAttempts = function() {
  const hidden = document.querySelectorAll(".hidden-attempt");
  const btn    = document.getElementById("attemptShowMore");
  const shadow = document.getElementById("attemptShadow");
  if (hidden.length > 0) {
    hidden.forEach(c => c.style.display = "");
    if (btn)    btn.innerHTML = '<i class="fas fa-chevron-up mr-1"></i> Show Less';
    if (shadow) shadow.style.display = "none";
  } else {
    document.querySelectorAll(".attempt-row, .attempt-mob").forEach((c, i) => {
      if (i >= 5) c.style.display = "none";
    });
    if (btn)    btn.innerHTML = '<i class="fas fa-chevron-down mr-1"></i> Show All';
    if (shadow) shadow.style.display = "block";
  }
};

function formatDuration(time) {
  if (!time) return "—";
  let seconds = Number(time);
  if (seconds > 100000) seconds = Math.floor(seconds / 1000);
  const hrs  = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hrs > 0)  return `${hrs}h ${mins}m`;
  if (mins > 0) return `${mins}m`;
  return "<1m";
}