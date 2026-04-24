const SUPABASE_URL = "https://sgagswxzsxlgcspwiuoh.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNnYWdzd3h6c3hsZ2NzcHdpdW9oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5NTA1NTIsImV4cCI6MjA2OTUyNjU1Mn0.ZNfk5WNDPkjKcFsRO48rEYk3dhbLYm_m21aZ-wfywo4";

const { createClient } = supabase;
const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
// Tracks whether a user is logged in — used to gate the Attempt button only
window._currentUser = null;
let notificationUser = null;

// ── Animated coin counter ─────────────────────────────────────────────────────
// Usage: animateCount(fromVal, toVal, durationMs, targetElement)
// If fromVal === toVal nothing plays. Safe to call repeatedly.
function animateCount(
  from,
  to,
  duration = 600,
  el = document.getElementById("userCoins"),
) {
  if (!el) return;
  const start = performance.now();
  const delta = to - from;
  if (delta === 0) {
    el.textContent = to.toLocaleString("en-IN");
    return;
  }

  function tick(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    // ease-out cubic — fast start, gentle landing
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(from + delta * eased).toLocaleString("en-IN");
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function showCoinBurst(
  amount,
  anchorEl = document.getElementById("userCoins"),
) {
  CL_AUDIO.clink();
  if (!anchorEl || amount <= 0) return;

  const rect = anchorEl.getBoundingClientRect();
  const burst = document.createElement("div");
  burst.className = "cl-burst";
  burst.textContent = `+${amount.toLocaleString("en-IN")} CL`;

  // Position centred above the element, accounting for scroll
  burst.style.left = rect.left + rect.width / 2 + window.scrollX + "px";
  burst.style.top = rect.top + window.scrollY - 4 + "px";
  burst.style.transform = "translateX(-50%)";

  document.body.appendChild(burst);
  setTimeout(() => burst.remove(), 1300);
}

const CL_AUDIO = {
  ctx: null,
  muted: sessionStorage.getItem("cl-mute") === "1",

  _ensure() {
    if (!this.ctx)
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === "suspended") this.ctx.resume();
  },

  /** Metallic clink — two detuned sine waves, fast exponential decay */
  clink(volume = 0.28) {
    if (this.muted) return;
    try {
      this._ensure();
      const ctx = this.ctx;
      const now = ctx.currentTime;

      [
        [1320, 0],
        [1760, 0.018],
      ].forEach(([freq, delay]) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now + delay);
        // Brief pitch drop for metallic feel
        osc.frequency.exponentialRampToValueAtTime(
          freq * 0.85,
          now + delay + 0.12,
        );
        gain.gain.setValueAtTime(volume, now + delay);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.15);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + delay);
        osc.stop(now + delay + 0.16);
      });
    } catch (e) {
      // AudioContext blocked or unavailable — silent fail
    }
  },

  toggleMute() {
    this.muted = !this.muted;
    sessionStorage.setItem("cl-mute", this.muted ? "1" : "0");
    return this.muted;
  },

  /** Short beep — used by exam timer at 5-min and 1-min warnings */
  beep(volume = 0.4) {
    if (this.muted) return;
    try {
      this._ensure();
      const ctx = this.ctx;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.setValueAtTime(880, now);
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.32);
    } catch (e) {
      // AudioContext blocked or unavailable — silent fail
    }
  },
};

function clCoinIcon(size = 14, variant = "sm") {
  return `<svg width="${size}" height="${size}" viewBox="0 0 160 160" style="vertical-align:middle;display:inline-block;flex-shrink:0">
    <use href="#CLcoin-${variant}"/>
  </svg>`;
}

function startRewardUnlockListener(userId) {
  client
    .channel(`reward-unlock-${userId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        const notif = payload.new;

        // Only react to reward_unlocked type
        if (notif.type !== "reward_unlocked") return;

        // 1. Re-fetch the latest coin total and refresh the reward bar
        client
          .from("user_profiles")
          .select("total_coins")
          .eq("id", userId)
          .single()
          .then(({ data }) => {
            if (data) updateRewardProgress(data.total_coins);
          });

        // 2. Show an in-page unlock popup (non-blocking, auto-dismisses)
        showRewardUnlockPopup(notif.title, notif.message);
      },
    )
    .subscribe();
}

function showRewardUnlockPopup(title, message) {
  // Remove any existing popup first
  document.getElementById("reward-unlock-popup")?.remove();

  const popup = document.createElement("div");
  popup.id = "reward-unlock-popup";
  popup.style.cssText = `
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    background: #1a1a2e;
    color: white;
    padding: 16px 24px;
    border-radius: 14px;
    text-align: center;
    z-index: 9999;
    min-width: 280px;
    max-width: 360px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    animation: slideUp 0.3s ease-out;
  `;

  popup.innerHTML = `
    <div style="font-size:20px;margin-bottom:6px">${title}</div>
    <div style="font-size:13px;opacity:0.85;line-height:1.4">${message}</div>
    <button
      onclick="document.getElementById('reward-unlock-popup').remove(); window.location.href='/mock/reward.html';"
      style="
        margin-top:12px;
        background:#f59e0b;
        color:#1a1a2e;
        border:none;
        padding:8px 20px;
        border-radius:8px;
        font-weight:600;
        cursor:pointer;
        font-size:13px;
      "
    >
      Claim Now →
    </button>
  `;

  document.body.appendChild(popup);

  // Auto-dismiss after 8 seconds
  setTimeout(() => popup.remove(), 8000);
}

// ─── Daily Schedule Constants ─────────────────────────────────────────────────
const DAILY_OPEN_HOUR = 5; // 5:00 AM
const DAILY_CLOSE_HOUR = 23; // 11:00 PM (11:59 PM effectively — see check below)

// JS getDay() → 0=Sunday, 1=Monday, ..., 6=Saturday
const DAY_INDEX_TO_NAME = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

const DAY_LABELS = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

document.addEventListener("DOMContentLoaded", async () => {
  await checkAuth();
  await loadPerformanceAnalytics();
  await loadAvailableExams();
  await loadCoinsAndProgress();
  await initNotifications();
});

async function checkAuth() {
  const {
    data: { user },
  } = await client.auth.getUser();
  window._currentUser = user || null;
  // No redirect here — guests can browse freely; gate is on the Attempt button
  // Dispatch a custom event so dashboard.html does not need a fragile setTimeout
  document.dispatchEvent(
    new CustomEvent("cl:authReady", { detail: { user: window._currentUser } }),
  );
}

// ─── Guest Auth Prompt ────────────────────────────────────────────────────────
window.showGuestAuthPrompt = function () {
  if (document.getElementById("guestAuthOverlay")) return;

  const overlay = document.createElement("div");
  overlay.id = "guestAuthOverlay";
  overlay.style =
    "position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,.6);backdrop-filter:blur(5px);display:flex;align-items:center;justify-content:center;padding:20px;";
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:24px;max-width:380px;width:100%;box-shadow:0 32px 80px rgba(15,23,42,.25);overflow:hidden;animation:fadeInUp .25s ease;">

      <!-- Header -->
      <div style="background:linear-gradient(135deg,#1a56db 0%,#1e3a8a 100%);padding:28px 24px 24px;text-align:center;position:relative">
        <button onclick="document.getElementById('guestAuthOverlay').remove()" style="position:absolute;top:14px;right:14px;width:28px;height:28px;border-radius:8px;background:rgba(255,255,255,.15);border:none;color:#fff;cursor:pointer;font-size:.85rem;display:flex;align-items:center;justify-content:center">✕</button>
        <img src="/images/logo.png" alt="Courage Library" style="width:48px;height:48px;border-radius:14px;margin:0 auto 12px;display:block;background:#fff;padding:5px;box-shadow:0 4px 16px rgba(0,0,0,.2);">
        <div style="font-family:'Sora',sans-serif;font-size:1.1rem;font-weight:800;color:#fff;margin-bottom:4px">Join Free to Attempt</div>
        <div style="font-size:.75rem;color:#93c5fd;font-weight:500">Track your progress · All tests free · Daily mocks</div>
      </div>

      <!-- Body -->
      <div style="padding:24px 24px 28px;">

        <!-- Value props -->
        <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:22px;">
          ${[
            [
              "fas fa-clipboard-check",
              "#dbeafe",
              "#1d4ed8",
              "Free daily & weekly mock tests",
            ],
            [
              "fas fa-chart-line",
              "#d1fae5",
              "#059669",
              "Track accuracy & score history",
            ],
            [
              "fas fa-fire",
              "#fff7ed",
              "#c2410c",
              "Build streaks, stay consistent",
            ],
          ]
            .map(
              ([icon, bg, color, text]) => `
            <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:#f8faff;border-radius:12px;border:1px solid #e8edf5;">
              <span style="width:30px;height:30px;border-radius:9px;background:${bg};color:${color};display:flex;align-items:center;justify-content:center;font-size:.72rem;flex-shrink:0"><i class="${icon}"></i></span>
              <span style="font-size:.82rem;font-weight:700;color:#0f172a">${text}</span>
            </div>`,
            )
            .join("")}
        </div>

        <!-- Buttons -->
        <a href="/index.html?action=signup" style="display:flex;align-items:center;justify-content:center;gap:8px;width:100%;height:46px;background:linear-gradient(135deg,#1a56db,#2563eb);color:#fff;border-radius:14px;font-weight:800;font-size:.95rem;text-decoration:none;margin-bottom:10px;box-shadow:0 4px 16px rgba(26,86,219,.35);">
          <i class="fas fa-user-plus"></i> Create Free Account
        </a>
        <a href="/index.html?action=login" style="display:flex;align-items:center;justify-content:center;gap:8px;width:100%;height:44px;background:#fff;color:#1d4ed8;border:1.5px solid #bfdbfe;border-radius:14px;font-weight:800;font-size:.9rem;text-decoration:none;">
          <i class="fas fa-sign-in-alt"></i> Already have an account? Log In
        </a>
      </div>
    </div>`;

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });
  document.body.appendChild(overlay);
};

async function loadPerformanceAnalytics() {
  // Guest users — show placeholder stats with a subtle sign-in nudge
  if (!_currentUser) {
    document.getElementById("totalAttempts").textContent = "—";
    document.getElementById("avgAccuracy").textContent = "—";
    document.getElementById("bestScore").textContent = "—";
    // totalTime element removed from UI
    renderRecentAttempts([], true); // true = guest mode
    return;
  }

  const user = _currentUser;
  const { data } = await client
    .from("attempts")
    .select(
      `total_score, accuracy, time_taken, submitted_at,
      scheduled_exams ( schedule_type, active_section, exam_categories ( name ), exam_patterns ( pattern_name ) )`,
    )
    .eq("user_id", user.id)
    .not("submitted_at", "is", null);

  if (!data || data.length === 0) {
    document.getElementById("totalAttempts").textContent = "0";
    document.getElementById("avgAccuracy").textContent = "0%";
    document.getElementById("bestScore").textContent = "0";
    // totalTime element removed from UI
    renderRecentAttempts([]);
    return;
  }

  document.getElementById("totalAttempts").innerText = data.length;
  const avgAccuracy =
    data.reduce((s, a) => s + Number(a.accuracy || 0), 0) / data.length;
  document.getElementById("avgAccuracy").innerText =
    avgAccuracy.toFixed(1) + "%";
  document.getElementById("bestScore").innerText = Math.max(
    ...data.map((a) => a.total_score || 0),
  );
  const totalSeconds = data.reduce((s, a) => s + (a.time_taken || 0), 0);
  renderRecentAttempts(data.slice(-5).reverse());
}

// ─── Daily Time Window Check ──────────────────────────────────────────────────
function isDailyWindowOpen() {
  const now = new Date();
  const hours = now.getHours();
  const mins = now.getMinutes();
  // Open: 5:00 AM to 11:59 PM
  if (hours < DAILY_OPEN_HOUR) return false;
  if (hours === 23 && mins === 59) return false; // edge: 11:59 PM — still open
  if (hours >= 24) return false;
  return true;
}

// Returns next open time string for display
function getNextOpenTime() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(DAILY_OPEN_HOUR, 0, 0, 0);
  return tomorrow.toLocaleString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

// Calculate mock number from launch date
function getMockNumber(launchDate, dayOfWeek) {
  if (!launchDate) return 1;
  const launch = new Date(launchDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  launch.setHours(0, 0, 0, 0);

  const diffDays = Math.floor((today - launch) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 1;

  // Count how many times this day_of_week has occurred since launch
  const dayNames = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];
  const launchDayIdx = launch.getDay();
  const targetDayIdx = dayNames.indexOf(dayOfWeek);

  // Days from launch to first occurrence of this day
  let daysToFirst = (targetDayIdx - launchDayIdx + 7) % 7;

  if (diffDays < daysToFirst) return null; // Not started yet

  const weeksCompleted = Math.floor((diffDays - daysToFirst) / 7);
  return weeksCompleted + 1;
}

// ─── Schedule Info Popup ─────────────────────────────────────────────────────

// Add new series schedules here as you expand — no other code needs to change
const SCHEDULE_DATA = {
  "SSC GD": {
    rows: [
      ["Monday",    "General Awareness",  "20",  "40",  "20m", false],
      ["Tuesday",   "Reasoning",          "20",  "40",  "20m", false],
      ["Wednesday", "Quant Aptitude",     "20",  "40",  "20m", false],
      ["Thursday",  "English Grammar",    "20",  "40",  "20m", false],
      ["Friday",    "Hindi",              "20",  "40",  "20m", false],
      ["Saturday",  "Mixed (All 5)",      "50",  "100", "30m", false],
      ["Sunday",    "Full Mock Test",     "100", "200", "60m", true],
    ],
  },
  "UP Police Constable": {
    rows: [
      ["Monday",    "Hindi",                        "37",  "74",  "30m", false],
      ["Tuesday",   "General Knowledge",            "38",  "76",  "30m", false],
      ["Wednesday", "Numerical Ability",            "25",  "50",  "25m", false],
      ["Thursday",  "Mental Aptitude",              "50",  "100", "40m", false],
      ["Friday",    "Mental Aptitude + Numerical",  "50",  "100", "40m", false],
      ["Saturday",  "Mixed — All 4 Subjects",       "75",  "150", "60m", false],
      ["Sunday",    "Full Mock Test",               "150", "300", "120m", true],
    ],
  },
};

function injectScheduleInfoPopup(categoryName) {
  // Remove existing so it re-renders with correct category data
  document.getElementById("schedInfoOverlay")?.remove();

  const key = Object.keys(SCHEDULE_DATA).find(k =>
    (categoryName || "").toUpperCase().includes(k.toUpperCase())
  ) || "SSC GD";

  const { rows } = SCHEDULE_DATA[key];

  const overlay = document.createElement("div");
  overlay.id = "schedInfoOverlay";
  overlay.style =
    "display:none;position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,.55);backdrop-filter:blur(4px);align-items:center;justify-content:center;padding:16px;";
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:20px;max-width:520px;width:100%;box-shadow:0 24px 64px rgba(15,23,42,.2);overflow:hidden;animation:fadeInUp .25s ease;max-height:90vh;overflow-y:auto;">
      <div style="background:linear-gradient(135deg,#1a56db,#1e3a8a);padding:18px 20px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:1">
        <div>
          <div style="font-size:.62rem;font-weight:700;color:#93c5fd;text-transform:uppercase;letter-spacing:.1em;margin-bottom:3px">${key} Daily Schedule</div>
          <div style="font-size:.98rem;font-weight:800;color:#fff">Weekly Mock Test Plan</div>
        </div>
        <button onclick="document.getElementById('schedInfoOverlay').style.display='none'" style="width:30px;height:30px;border-radius:8px;background:rgba(255,255,255,.15);border:none;color:#fff;cursor:pointer;font-size:.9rem;display:flex;align-items:center;justify-content:center">✕</button>
      </div>
      <div style="padding:18px 20px 20px;display:flex;flex-direction:column;gap:16px">
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
                ${rows.map(([day, subj, q, marks, time, highlight], i) => `
                  <tr style="background:${highlight ? "#fff7ed" : i % 2 === 0 ? "#fff" : "#f8faff"};border-bottom:1px solid #f1f5f9">
                    <td style="padding:7px 12px;font-weight:700;color:${highlight ? "#c2410c" : "#0f172a"}">${day}</td>
                    <td style="padding:7px 12px;color:#374151">${subj}</td>
                    <td style="padding:7px 12px;text-align:center;font-weight:700;color:#1d4ed8">${q}</td>
                    <td style="padding:7px 12px;text-align:center;font-weight:700;color:#059669">${marks}</td>
                    <td style="padding:7px 12px;text-align:center;color:#64748b">${time}</td>
                  </tr>`).join("")}
              </tbody>
            </table>
          </div>
        </div>
        <div style="background:#f8faff;border:1px solid #e8edf5;border-radius:12px;overflow:hidden">
          <div style="padding:10px 14px;background:#f0f6ff;border-bottom:1px solid #e2e8f4;font-size:.68rem;font-weight:800;color:#1a56db;text-transform:uppercase;letter-spacing:.08em"><i class="fas fa-shield-alt mr-1"></i> Rules</div>
          ${[
            ["fas fa-clock",        "#dbeafe", "#1d4ed8", "5:00 AM – 11:59 PM only",  "Tests lock outside this window every day."],
            ["fas fa-ban",          "#fee2e2", "#dc2626", "One attempt per day",       "No retakes. Missed = gone. Real exam discipline."],
            ["fas fa-minus-circle", "#fef3c7", "#d97706", "Negative marking −0.5",    "Wrong answer costs half a mark. Attempt wisely."],
          ].map(([icon, bg, color, title, desc], i, arr) => `
            <div style="display:flex;gap:10px;align-items:center;padding:10px 14px;${i < arr.length - 1 ? "border-bottom:1px solid #f1f5f9" : ""}">
              <span style="width:26px;height:26px;border-radius:7px;background:${bg};color:${color};display:flex;align-items:center;justify-content:center;font-size:.68rem;flex-shrink:0"><i class="${icon}"></i></span>
              <div style="flex:1"><span style="font-size:.78rem;font-weight:800;color:#0f172a">${title}</span><span style="font-size:.72rem;color:#64748b;margin-left:6px">${desc}</span></div>
            </div>`).join("")}
        </div>
      </div>
    </div>`;
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.style.display = "none";
  });
  document.body.appendChild(overlay);
}

window.openScheduleInfo = function (categoryName) {
  injectScheduleInfoPopup(categoryName);
  document.getElementById("schedInfoOverlay").style.display = "flex";
};

// ─── Countdown Helpers ───────────────────────────────────────────────────────

// Active interval IDs so we can clear them on re-render
const _countdownIntervals = [];

function clearAllCountdowns() {
  _countdownIntervals.forEach((id) => clearInterval(id));
  _countdownIntervals.length = 0;
}

function formatCountdown(ms) {
  if (ms <= 0) return "00:00:00";
  const totalSecs = Math.floor(ms / 1000);
  const days = Math.floor(totalSecs / 86400);
  const hrs = Math.floor((totalSecs % 86400) / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;
  if (days > 0)
    return `${days}d ${String(hrs).padStart(2, "0")}h ${String(mins).padStart(2, "0")}m`;
  return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function getClosingMs() {
  const now = new Date();
  const close = new Date();
  close.setHours(23, 59, 59, 0);
  return close - now;
}

function getOpeningMs(dayOfWeek) {
  // Returns ms until next occurrence of dayOfWeek at 5:00 AM
  const dayNames = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];
  const now = new Date();
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
    if (ms <= 0) {
      el.textContent = "00:00:00";
      return;
    }
    el.textContent = formatCountdown(ms);
    if (urgent && ms < 3600000) {
      // under 1 hour — red
      el.style.color = "#dc2626";
      el.style.background = "#fee2e2";
      el.style.borderColor = "#fca5a5";
    }
  }
  tick();
  const id = setInterval(tick, 1000);
  _countdownIntervals.push(id);
}

// ─── Explore More Series (pulse dot discovery) ────────────────────────────────
// Fetches unenrolled series and injects them at the bottom of the exam list
// with a pulsing orange dot + count pill on the section header.
// Also updates page <title> with "(N New)" when unenrolled series exist.
// Zero banners. Zero popups. Zero annoyance.
async function loadExploreSeries(enrolledCategoryIds, container) {
  const { data: allCategories } = await client
    .from("exam_categories")
    .select("id, name")
    .order("created_at", { ascending: false });

  const unenrolledSeries = (allCategories || []).filter(c =>
    !enrolledCategoryIds.includes(c.id) &&
    c.name !== "DEMO"
  );

  if (unenrolledSeries.length === 0) return;

  // ── 1. Update page title quietly ─────────────────────────────────────────
  const baseTitle = "Dashboard • Courage Library";
  document.title = `(${unenrolledSeries.length} New) ${baseTitle}`;

  // ── 2. Inject CSS for pulse dot (once) ───────────────────────────────────
  if (!document.getElementById("cl-pulse-style")) {
    const style = document.createElement("style");
    style.id = "cl-pulse-style";
    style.textContent = `
      @keyframes cl-pulse-ring {
        0%   { transform: scale(1);   opacity: .8; }
        70%  { transform: scale(2.4); opacity: 0;  }
        100% { transform: scale(2.4); opacity: 0;  }
      }
      .cl-pulse-dot {
        position: relative;
        width: 8px; height: 8px;
        border-radius: 50%;
        background: #f97316;
        flex-shrink: 0;
        display: inline-block;
      }
      .cl-pulse-dot::before {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: 50%;
        background: rgba(249,115,22,0.5);
        animation: cl-pulse-ring 1.6s ease-out infinite;
        pointer-events: none;
      }
    `;
    document.head.appendChild(style);
  }

  // ── 3. Section header — pulse dot inside pill ─────────────────────────
  const exploreHeader = document.createElement("div");
  exploreHeader.style = "grid-column:1/-1;margin-top:32px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;gap:8px;";
  exploreHeader.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;min-width:0">
      <span style="width:4px;height:20px;border-radius:99px;background:linear-gradient(180deg,#f59e0b,#f97316);display:inline-block;flex-shrink:0"></span>
      <span style="font-family:'Sora',sans-serif;font-size:1.05rem;font-weight:800;color:#0f172a;white-space:nowrap">Explore More Series</span>
      <span style="display:inline-flex;align-items:center;gap:5px;flex-shrink:0;background:#fff7ed;border:1px solid #fed7aa;border-radius:999px;padding:2px 8px 2px 6px;">
        <span class="cl-pulse-dot"></span>
        <span style="font-size:.68rem;font-weight:700;color:#c2410c;line-height:1">${unenrolledSeries.length} New</span>
      </span>
    </div>
    <a href="/mock-test-series.html" style="font-size:.72rem;font-weight:700;color:#1a56db;text-decoration:none;white-space:nowrap;flex-shrink:0">View All</a>`;
  container.appendChild(exploreHeader);

  // ── 4. Series page slug map — add new entries as new series pages are created ──
  const SERIES_SLUG = {
    "SSC GD":    "/mock/ssc-gd.html",
    "SSC CGL":   "/mock/ssc-cgl.html",
    "UP Police Constable": "/mock/up-police.html",
  };

  // ── 5. Explore cards — clicking opens the series info page ──────────────
  unenrolledSeries.forEach(series => {
    const seriesUrl = Object.entries(SERIES_SLUG).find(([key]) =>
      series.name.toUpperCase().includes(key.toUpperCase())
    )?.[1] || "/mock-test-series.html";

    const card = document.createElement("div");
    card.className = "exam-card";
    card.innerHTML = `
      <div class="exam-card-accent" style="background:linear-gradient(180deg,#f59e0b,#f97316)"></div>
      <div class="exam-card-body">
        <div class="exam-card-head">
          <div class="exam-card-title">${series.name}</div>
          <span class="exam-type-badge" style="background:#fff7ed;color:#c2410c;border:1px solid #fed7aa;">Not Enrolled</span>
        </div>
        <div class="exam-avail" style="color:#64748b;">
          <span class="avail-dot" style="background:#f59e0b"></span>
          Daily mock tests available — enroll to start
        </div>
        <div class="exam-meta-grid">
          <div class="meta-chip">
            <div class="meta-chip-icon"><i class="fas fa-calendar-alt"></i></div>
            <div><div class="meta-chip-label">Schedule</div><div class="meta-chip-value">Daily</div></div>
          </div>
          <div class="meta-chip">
            <div class="meta-chip-icon green"><i class="fas fa-infinity"></i></div>
            <div><div class="meta-chip-label">Cost</div><div class="meta-chip-value">Free</div></div>
          </div>
          <div class="meta-chip">
            <div class="meta-chip-icon amber"><i class="fas fa-trophy"></i></div>
            <div><div class="meta-chip-label">Leaderboard</div><div class="meta-chip-value">Live</div></div>
          </div>
          <div class="meta-chip">
            <div class="meta-chip-icon indigo"><i class="fas fa-coins"></i></div>
            <div><div class="meta-chip-label">Rewards</div><div class="meta-chip-value">CL Coins</div></div>
          </div>
        </div>
      </div>
      <div class="exam-card-footer">
        <a href="${seriesUrl}"
          class="btn-start-exam active"
          style="background:linear-gradient(135deg,#f59e0b,#f97316);text-decoration:none;display:flex;align-items:center;justify-content:center;gap:6px;">
          <i class="fas fa-arrow-right"></i> Know More & Enroll
        </a>
      </div>`;
    container.appendChild(card);
  });
}

// ─── Enroll from Dashboard (kept for legacy/future use) ──────────────────────
window.enrollFromDashboard = async function(categoryId, seriesName, btn) {
  if (!_currentUser) { showGuestAuthPrompt(); return; }
  btn.disabled = true;
  btn.innerHTML = `<i class="fas fa-spinner fa-spin mr-1"></i> Enrolling...`;
  const { error } = await client
    .from("user_exam_enrollments")
    .insert({ user_id: _currentUser.id, category_id: categoryId });
  if (error && error.code !== "23505") {
    btn.disabled = false;
    btn.innerHTML = `<i class="fas fa-plus mr-1"></i> Enroll Free`;
    showToast("Could not enroll. Try again.", "error");
    return;
  }
  showToast(`Enrolled in ${seriesName}! Reloading...`, "success");
  setTimeout(() => loadAvailableExams(), 1500);
};

// ─── Toggle Scheduled Cards ──────────────────────────────────────────────────

// ─── Load Available Exams ─────────────────────────────────────────────────────
async function loadAvailableExams() {
  const user = _currentUser;

  // Step 1 — fetch enrollments
  let enrolledCategoryIds = [];
  if (user) {
    const { data: enrollments } = await client
      .from("user_exam_enrollments")
      .select("category_id")
      .eq("user_id", user.id);
    enrolledCategoryIds = (enrollments || []).map(e => e.category_id);
  }

  // Step 2 — declare container FIRST before any usage
  clearAllCountdowns();
  const container = document.getElementById("examList");
  container.innerHTML = "";

  // Step 3 — now safe to use container for empty state
  // AFTER — show banner first, then show browse CTA below it
if (user && enrolledCategoryIds.length === 0) {
  await loadExploreSeries(enrolledCategoryIds, container);
  const emptyDiv = document.createElement("div");
  emptyDiv.style = "grid-column:1/-1";
  emptyDiv.innerHTML = `
    <div class="empty-box">
      <div class="empty-ico"><i class="fas fa-layer-group"></i></div>
      <h3>No Series Enrolled</h3>
      <p>Browse our mock test series and enroll to start practicing.</p>
      <a href="/mock-test-series.html" style="margin-top:1rem;display:inline-flex;align-items:center;gap:.5rem;padding:.65rem 1.5rem;background:linear-gradient(135deg,#3b82f6,#6366f1);color:#fff;border-radius:999px;font-weight:700;font-size:.875rem;text-decoration:none;">
        Browse Series →
      </a>
    </div>`;
  container.appendChild(emptyDiv);
  return;
}

  // Step 4 — real query with real select string + enrollment filter
  let query = client
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

  // Only filter by enrollment if user is logged in
  if (user && enrolledCategoryIds.length > 0) {
    query = query.in("category_id", enrolledCategoryIds);
  }

  // (Explore More Series injected at end of loadAvailableExams — see below)

  const { data, error } = await query;

  if (error) {
    console.error(error);
    return;
  }

  // rest of your existing code continues unchanged...

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
  const dailyExams = data.filter((e) => e.schedule_type === "daily_auto");
  const manualExams = data.filter((e) => e.schedule_type !== "daily_auto");

  // Fetch user attempts for all exams (guests get empty arrays)
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayISO = todayStart.toISOString();

  const dailyExamIds = data
    .filter((e) => e.schedule_type === "daily_auto")
    .map((e) => e.id);
  const manualExamIds = data
    .filter((e) => e.schedule_type !== "daily_auto")
    .map((e) => e.id);

  // Daily attempts: only today's — so last Monday never blocks this Monday
  const { data: dailyAttempts } =
    user && dailyExamIds.length > 0
      ? await client
          .from("attempts")
          .select(
            "id, scheduled_exam_id, submitted_at, started_at, total_score",
          )
          .eq("user_id", user.id)
          .in("scheduled_exam_id", dailyExamIds)
          .gte("started_at", todayISO)
      : { data: [] };

  // Manual attempts: fetch all (no date restriction — attempt_limit logic still applies)
  const { data: manualAttempts } =
    user && manualExamIds.length > 0
      ? await client
          .from("attempts")
          .select(
            "id, scheduled_exam_id, submitted_at, started_at, total_score",
          )
          .eq("user_id", user.id)
          .in("scheduled_exam_id", manualExamIds)
      : { data: [] };

  const userAttempts = [...(dailyAttempts || []), ...(manualAttempts || [])];

  const { data: streakProfile } = await client
    .from("user_profiles")
    .select("current_streak")
    .eq("id", user.id)
    .single();
  const currentStreak = streakProfile?.current_streak || 0;

  const attemptsByExam = {};
  (userAttempts || []).forEach((a) => {
    if (!attemptsByExam[a.scheduled_exam_id])
      attemptsByExam[a.scheduled_exam_id] = [];
    attemptsByExam[a.scheduled_exam_id].push(a);
  });

  const now = new Date();
  const todayName = DAY_INDEX_TO_NAME[now.getDay()]; // e.g. "monday"
  const windowOpen = isDailyWindowOpen();

  // ── Subject name map for daily sectional cards ──
  const SUBJECT_NAMES = {
    monday: "General Awareness",
    tuesday: "Reasoning",
    wednesday: "Quant Aptitude",
    thursday: "English Grammar",
    friday: "Hindi",
    saturday: "Mixed Sectional",
    sunday: "Full Mock Test",
  };

  const SUBJECT_ICONS = {
    monday: "fas fa-newspaper",
    tuesday: "fas fa-brain",
    wednesday: "fas fa-calculator",
    thursday: "fas fa-spell-check",
    friday: "fas fa-language",
    saturday: "fas fa-layer-group",
    sunday: "fas fa-file-alt",
  };

  // ── Build card HTML helper ──
  function buildDailyCard(exam, i) {
    const isToday = exam.day_of_week === todayName;
    const mockNumber = getMockNumber(exam.launch_date, exam.day_of_week);
    const myAttempts = attemptsByExam[exam.id] || [];
    const completedAttempts = myAttempts.filter((a) => a.submitted_at);
    const incompleteAttempt = myAttempts.find((a) => !a.submitted_at);

    let isAbandoned = false;
    const pattern = exam.exam_patterns || {};
    if (incompleteAttempt?.started_at) {
      const maxMs = (pattern.duration_minutes || 60) * 60 * 1000 * 1.5;
      const elapsed = now - new Date(incompleteAttempt.started_at);
      if (elapsed > maxMs) isAbandoned = true;
    }

    const alreadyDone = completedAttempts.length > 0;
    const isLive = isToday && windowOpen;
    const dayLabel = DAY_LABELS[exam.day_of_week] || exam.day_of_week;
    const subjectName = exam.active_section 
  || SUBJECT_NAMES[exam.day_of_week] 
  || pattern.pattern_name 
  || "Mock Test";
    const subjectIcon = SUBJECT_ICONS[exam.day_of_week] || "fas fa-file-alt";
    const categoryName = exam.exam_categories?.name || "";
    const mockLabel = mockNumber ? `${mockNumber}` : "";
    // Title = "SSC GD - Mixed Sectional" (no number — shown as badge)
    const cardTitle = categoryName
      ? `${categoryName} - ${subjectName}`
      : subjectName;
    const negVal =
      pattern.negative_marking != null
        ? `-${pattern.negative_marking}`
        : "None";
    const totalMarks = (pattern.total_questions || 0) * 2;
    const countdownId = `cd-${exam.id}`;

    let btnHtml = "",
      availHtml = "",
      accentClass = "";
    let badgeText = "",
      badgeStyle = "";

    if (!isToday) {
      accentClass = "locked";
      badgeText = mockLabel ? `${dayLabel} / T${mockLabel}` : dayLabel;
      badgeStyle = "background:#f1f5f9;color:#94a3b8;";
      availHtml = `<div class="exam-avail" style="justify-content:space-between;color:#64748b"><span style="display:flex;align-items:center;gap:6px"><span class="avail-dot" style="background:#cbd5e1"></span>Opens at 5:00 AM</span><span id="${countdownId}" style="font-size:.72rem;font-weight:800;background:#f1f5f9;color:#64748b;border:1px solid #e2e8f4;padding:2px 8px;border-radius:20px;font-variant-numeric:tabular-nums;letter-spacing:.02em">--:--:--</span></div>`;
      btnHtml = `<button class="btn-start-exam disabled-btn" disabled><i class="fas fa-lock mr-1"></i> Upcoming</button>`;
    } else if (!windowOpen) {
      accentClass = "locked";
      badgeText = mockLabel ? `Today / T${mockLabel}` : "Today";
      badgeStyle = "background:#fef3c7;color:#92400e;";
      const openingToday = new Date();
      openingToday.setHours(5, 0, 0, 0);
      const msTillOpen = openingToday - now;
      const hh = Math.floor(msTillOpen / 3600000);
      const mm = Math.floor((msTillOpen % 3600000) / 60000);
      const opensInText = hh > 0 ? `${hh}h ${mm}m` : `${mm}m`;
      availHtml = `<div class="exam-avail" style="justify-content:space-between;color:#d97706"><span style="display:flex;align-items:center;gap:6px"><span class="avail-dot" style="background:#f59e0b"></span>Opens today at 5:00 AM</span><span style="font-size:.72rem;font-weight:800;background:#fef3c7;color:#d97706;border:1px solid #fde68a;padding:2px 8px;border-radius:20px">in ${opensInText}</span></div>`;
      btnHtml = `<button class="btn-start-exam disabled-btn" disabled><i class="fas fa-clock mr-1"></i> Opens in ${opensInText}</button>`;
    } else if (alreadyDone) {
      accentClass = "done";
      badgeText = mockLabel ? `Done / T${mockLabel}` : "Done";
      badgeStyle = "background:#d1fae5;color:#065f46;";
      const lastAttempt = completedAttempts[completedAttempts.length - 1];
      const completedScore = lastAttempt?.total_score ?? null;
      const lastAttemptId = lastAttempt?.id ?? null;
      const totalPossible = (pattern.total_questions || 0) * 2;
      const scoreText =
        completedScore !== null
          ? ` · Score: ${completedScore}/${totalPossible}`
          : "";
      availHtml = `<div class="exam-avail ok"><span class="avail-dot" style="background:#10b981"></span>Completed today ✓${scoreText}</div>`;
      const viewResultBtn = lastAttemptId
        ? `<a href="/mock/result.html?attempt=${lastAttemptId}" class="btn-view-result"><i class="fas fa-chart-bar"></i> View Result & Explanations</a>`
        : "";
      btnHtml = `<div style="display:flex;flex-direction:column;gap:7px;width:100%">
        <button class="btn-start-exam disabled-btn" disabled style="background:#d1fae5;color:#065f46;border:1.5px solid #6ee7b7;"><i class="fas fa-check-circle mr-1"></i> Completed${completedScore !== null ? ` · ${completedScore}/${totalPossible}` : ""}</button>
        ${viewResultBtn}
      </div>`;
    } else if (incompleteAttempt && !isAbandoned) {
      badgeText = mockLabel ? `Today / T${mockLabel}` : "Today";
      badgeStyle = "background:#dcfce7;color:#166534;";
      availHtml = `<div class="exam-avail ok"><span class="avail-dot"></span>In progress — resume now</div>`;
      btnHtml = `<button class="btn-start-exam active" style="background:linear-gradient(135deg,#059669,#10b981)" onclick="resumeExam('${incompleteAttempt.id}', this)"><i class="fas fa-redo mr-1"></i> Resume Exam</button>`;
    } else {
      badgeText = mockLabel ? `Today / T${mockLabel}` : "Today";
      badgeStyle = "background:#dcfce7;color:#166534;";
      const streakBadge =
        currentStreak >= 2
          ? `<span style="font-size:.7rem;font-weight:800;background:#fff7ed;color:#c2410c;border:1px solid #fed7aa;padding:2px 9px;border-radius:20px;display:inline-flex;align-items:center;gap:4px"><i class="fas fa-fire" style="font-size:.65rem"></i> ${currentStreak} day streak</span>`
          : "";
      availHtml = `<div style="display:flex;flex-direction:column;gap:5px">
        <div class="exam-avail ok" style="justify-content:space-between"><span style="display:flex;align-items:center;gap:6px"><span class="avail-dot"></span>Live now · closes 11:59 PM</span><span id="${countdownId}" style="font-size:.72rem;font-weight:800;background:#dcfce7;color:#166534;border:1px solid #86efac;padding:2px 8px;border-radius:20px;font-variant-numeric:tabular-nums;letter-spacing:.02em">--:--:--</span></div>
        ${streakBadge ? `<div>${streakBadge}</div>` : ""}
      </div>`;
      const minsLeft = Math.floor(getClosingMs() / 60000);
      const warnAttr =
        minsLeft <= 30 && minsLeft > 0
          ? `onclick="if(!confirm('Only ${minsLeft} minutes left today and this exam is ${pattern.duration_minutes} minutes long. Start anyway?')) return; startExam('${exam.id}', this)"`
          : `onclick="startExam('${exam.id}', this)"`;
      // Guest users — gate on attempt button only
      if (!_currentUser) {
        btnHtml = `<button class="btn-start-exam active" onclick="showGuestAuthPrompt()"><i class="fas fa-play mr-1"></i> Start Exam</button>`;
      } else {
        btnHtml = `<button class="btn-start-exam active" ${warnAttr}><i class="fas fa-play mr-1"></i> Start Exam</button>`;
      }
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
          <button onclick="openScheduleInfo('${categoryName}')" title="View weekly schedule" style="width:22px;height:22px;border-radius:50%;background:#e0e7ff;border:none;color:#4338ca;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;font-size:.7rem;flex-shrink:0;transition:background .15s" onmouseover="this.style.background='#c7d2fe'" onmouseout="this.style.background='#e0e7ff'"><i class="fas fa-info"></i></button>
          <span class="exam-type-badge" style="${badgeStyle};margin-left:6px;flex-shrink:0">${badgeText}</span>
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
  const weekOrder = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
  ];
  const todayIdx = weekOrder.indexOf(todayName);
  dailyExams.sort((a, b) => {
    const ar = (weekOrder.indexOf(a.day_of_week) - todayIdx + 7) % 7;
    const br = (weekOrder.indexOf(b.day_of_week) - todayIdx + 7) % 7;
    return ar - br;
  });

  // FIND and REPLACE the entire today exams block with this:

const todayExams = dailyExams.filter((e) => e.day_of_week === todayName);
const scheduledExams = dailyExams.filter((e) => e.day_of_week !== todayName);

// ── SECTION 1: Today's Test ──
if (todayExams.length > 0) {
  const sec = document.createElement("div");
  sec.style = "grid-column:1/-1;";
  sec.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
      <div style="display:flex;align-items:center;gap:10px">
        <span style="width:4px;height:20px;border-radius:99px;background:linear-gradient(180deg,#1a56db,#60a5fa);display:inline-block;flex-shrink:0"></span>
        <span style="font-family:'Sora',sans-serif;font-size:1.05rem;font-weight:800;color:#0f172a">Today's Test</span>
      </div>
      <span style="font-size:.72rem;font-weight:600;color:#94a3b8">${windowOpen ? "✓ Open · 5:00 AM – 11:59 PM" : "Opens at 5:00 AM"}</span>
    </div>`;
  container.appendChild(sec);

  // ← No todayWrapper — cards go directly into container grid
  todayExams.forEach((exam, i) => {
    const card = buildDailyCard(exam, i);
    container.appendChild(card);
    setTimeout(() => startCountdown(`cd-${exam.id}`, getClosingMs, true), 50);
  });
}

  // ── SECTION 2: Scheduled Mock Tests ──
  if (scheduledExams.length > 0) {
    const sec = document.createElement("div");
    sec.style =
      "grid-column:1/-1;margin-top:32px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;";
    sec.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px">
        <span style="width:4px;height:20px;border-radius:99px;background:linear-gradient(180deg,#6366f1,#818cf8);display:inline-block;flex-shrink:0"></span>
        <span style="font-family:'Sora',sans-serif;font-size:1.05rem;font-weight:800;color:#0f172a">Scheduled Mock Tests</span>
      </div>
      <span style="font-size:.72rem;font-weight:600;color:#94a3b8">Available on their respective days</span>`;
    container.appendChild(sec);
    scheduledExams.forEach((exam, i) => {
      container.appendChild(buildDailyCard(exam, i));
      setTimeout(
        () =>
          startCountdown(
            `cd-${exam.id}`,
            () => getOpeningMs(exam.day_of_week),
            false,
          ),
        50,
      );
    });
  }

  // ── SECTION 3: Other Mock Tests ──
  if (manualExams.length > 0) {
    const sec = document.createElement("div");
    sec.style =
      "grid-column:1/-1;margin-top:32px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;";
    sec.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px">
        <span style="width:4px;height:20px;border-radius:99px;background:linear-gradient(180deg,#0891b2,#22d3ee);display:inline-block;flex-shrink:0"></span>
        <span style="font-family:'Sora',sans-serif;font-size:1.05rem;font-weight:800;color:#0f172a">Other Mock Tests</span>
      </div>
      <span style="font-size:.72rem;font-weight:600;color:#94a3b8">Practice anytime</span>`;
    container.appendChild(sec);

    manualExams.forEach((exam, i) => {
      const pattern = exam.exam_patterns || {};
      const myAttempts = attemptsByExam[exam.id] || [];
      const completedAttempts = myAttempts.filter((a) => a.submitted_at);
      const incompleteAttempt = myAttempts.find((a) => !a.submitted_at);

      let isAbandoned = false;
      if (incompleteAttempt?.started_at) {
        const maxMs = (pattern.duration_minutes || 60) * 60 * 1000 * 1.5;
        const elapsed = now - new Date(incompleteAttempt.started_at);
        if (elapsed > maxMs) isAbandoned = true;
      }

      const isExpired = exam.end_datetime && new Date(exam.end_datetime) < now;
      const notStarted =
        exam.start_datetime && new Date(exam.start_datetime) > now;
      const limitReached =
        exam.attempt_limit && completedAttempts.length >= exam.attempt_limit;
      const avType = (exam.availability_type || "practice").toLowerCase();
      const badgeClass = isExpired
        ? "badge-expired"
        : avType === "live"
          ? "badge-live"
          : avType === "weekly"
            ? "badge-weekly"
            : "badge-practice";
      const negVal =
        pattern.negative_marking != null
          ? `-${pattern.negative_marking}`
          : "None";

      let btnHtml = "";
      if (isExpired) {
        btnHtml = `<button class="btn-start-exam disabled-btn" disabled><i class="fas fa-lock"></i> Expired</button>`;
      } else if (notStarted) {
        const startStr = new Date(exam.start_datetime).toLocaleString("en-IN", {
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        });
        btnHtml = `<button class="btn-start-exam disabled-btn" disabled><i class="fas fa-clock"></i> Starts ${startStr}</button>`;
      } else if (limitReached) {
        btnHtml = `<button class="btn-start-exam disabled-btn" disabled><i class="fas fa-ban"></i> Limit Reached</button>`;
      } else if (incompleteAttempt && !isAbandoned) {
        btnHtml = `<button class="btn-start-exam active" style="background:linear-gradient(135deg,#059669,#10b981)" onclick="resumeExam('${incompleteAttempt.id}', this)"><i class="fas fa-redo"></i> Resume</button>`;
      } else {
        btnHtml = !_currentUser
          ? `<button class="btn-start-exam active" onclick="showGuestAuthPrompt()"><i class="fas fa-play"></i> Start Exam</button>`
          : `<button class="btn-start-exam active" onclick="startExam('${exam.id}', this)"><i class="fas fa-play"></i> Start Exam</button>`;
      }

      // View Result button — shown whenever at least one attempt is completed
      const lastCompletedAttempt =
        completedAttempts[completedAttempts.length - 1];
      const viewResultBtnManual = lastCompletedAttempt
        ? `<a href="/mock/result.html?attempt=${lastCompletedAttempt.id}" class="btn-view-result" style="margin-top:7px"><i class="fas fa-chart-bar"></i> View Result & Explanations</a>`
        : "";

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
        <div class="exam-card-footer" style="flex-direction:column;align-items:stretch;gap:7px">${btnHtml}${viewResultBtnManual}</div>`;
      container.appendChild(card);
    });
  }

  // ── SECTION: Explore More Series ──
  // Only for logged-in users who have at least one enrollment.
  // (Zero-enrollment case already handled above via early return.)
  if (user && enrolledCategoryIds.length > 0) {
    await loadExploreSeries(enrolledCategoryIds, container);
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

// Easy 40% · Medium 40% · Hard 20% — balanced difficulty for competitive exam prep
const DIFFICULTY_RATIO = { easy: 0.4, medium: 0.4, hard: 0.2 };

// ─── Smart Question Picker ────────────────────────────────────────────────────
// Picks N questions — shuffles within same total_served bucket so equal-served
// questions are randomized but lower-served ones always come first globally.
function smartPick(questions, needed) {
  if (questions.length <= needed) return shuffleArray(questions);

  const buckets = {};
  questions.forEach((q) => {
    const key = q.total_served || 0;
    if (!buckets[key]) buckets[key] = [];
    buckets[key].push(q);
  });

  const sorted = Object.keys(buckets).sort((a, b) => a - b);
  let result = [];
  for (const key of sorted) {
    if (result.length >= needed) break;
    const bucket = shuffleArray(buckets[key]);
    const take = Math.min(bucket.length, needed - result.length);
    result = result.concat(bucket.slice(0, take));
  }
  return result;
}

// ─── Pick Questions For Section ───────────────────────────────────────────────
// Priority: unseen questions first (sorted by least globally served),
// then seen questions (sorted by least times seen by this student).
function pickQuestionsForSection(allQuestions, section, seenMap) {
  const needed = section.question_count || 0;
  if (needed === 0) return [];

  const pool = allQuestions.filter((q) => q.pattern_section_id === section.id);
  if (pool.length === 0) {
    console.warn(`No questions for section: ${section.section_name}`);
    return [];
  }

  // Split into unseen and seen for this student
  const unseen = pool.filter((q) => !seenMap[q.id]);
  const seen = pool.filter((q) => seenMap[q.id]);

  // Sort seen by how many times this student has seen them (least first)
  seen.sort((a, b) => (seenMap[a.id] || 0) - (seenMap[b.id] || 0));

  let selected = [];
  if (unseen.length >= needed) {
    // Enough unseen — pick least globally served first
    selected = smartPick(unseen, needed);
  } else {
    // Take all unseen + fill remaining from least-repeated seen
    selected = unseen.concat(smartPick(seen, needed - unseen.length));
  }

  return applyDifficultyBalance(selected, pool, needed);
}

// ─── Difficulty Balance ───────────────────────────────────────────────────────
// Enforces DIFFICULTY_RATIO across final selection.
// If a difficulty tier has insufficient questions, fills deficit from leftovers.
function applyDifficultyBalance(currentSelection, fullPool, needed) {
  const targets = {
    easy: Math.round(needed * DIFFICULTY_RATIO.easy),
    medium: Math.round(needed * DIFFICULTY_RATIO.medium),
    hard: Math.floor(needed * DIFFICULTY_RATIO.hard),
  };
  // Fix rounding so targets always sum to needed
  const tSum = targets.easy + targets.medium + targets.hard;
  targets.easy += needed - tSum;

  const poolByDiff = { easy: [], medium: [], hard: [] };
  fullPool.forEach((q) => {
    const d = (q.difficulty || "easy").toLowerCase();
    if (poolByDiff[d]) poolByDiff[d].push(q);
  });
  Object.keys(poolByDiff).forEach((d) => {
    poolByDiff[d] = shuffleArray(poolByDiff[d]);
  });

  let result = [],
    deficit = 0;
  ["easy", "medium", "hard"].forEach((diff) => {
    const want = targets[diff];
    const available = poolByDiff[diff];
    const take = Math.min(want, available.length);
    result = result.concat(available.slice(0, take));
    deficit += want - take;
  });

  // Fill any deficit from questions not already selected
  if (deficit > 0) {
    const already = new Set(result.map((q) => q.id));
    const leftover = shuffleArray(fullPool.filter((q) => !already.has(q.id)));
    result = result.concat(leftover.slice(0, deficit));
  }

  return shuffleArray(result).slice(0, needed);
}

// ─── Resume Exam ──────────────────────────────────────────────────────────────
window.resumeExam = function (attemptId, btn) {
  btn.disabled = true;
  btn.innerHTML = `<span style="display:flex;align-items:center;justify-content:center;gap:8px">
    <svg style="width:16px;height:16px;animation:spin .75s linear infinite" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,.35)" stroke-width="3"/>
      <path d="M22 12a10 10 0 0 1-10 10" stroke="white" stroke-width="3" stroke-linecap="round"/>
    </svg>Loading...</span>`;
  window.location.href = `/mock/exam.html?attempt=${attemptId}`;
};

// ─── Start Exam ───────────────────────────────────────────────────────────────
window.startExam = async function (examId, btn, chosenLanguage = null) {
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
    const {
      data: { user },
    } = await client.auth.getUser();

    // Fetch exam details
    const { data: examCheck } = await client
      .from("scheduled_exams")
      .select(
        "is_active, start_datetime, end_datetime, is_premium, attempt_limit, language, schedule_type, day_of_week, active_section, exam_type, exam_patterns(id, duration_minutes, question_source_pattern_id)",
      )
      .eq("id", examId)
      .single();

    if (!examCheck || !examCheck.is_active)
      throw new Error("This exam is no longer available.");

    // For daily_auto — enforce time window + day check
    if (examCheck.schedule_type === "daily_auto") {
      const now = new Date();
      const todayName = DAY_INDEX_TO_NAME[now.getDay()];

      if (examCheck.day_of_week !== todayName)
        throw new Error(
          `This exam is only available on ${DAY_LABELS[examCheck.day_of_week]}. Come back then!`,
        );

      if (!isDailyWindowOpen())
        throw new Error("Today's exam window is closed. Come back at 5:00 AM.");
    } else {
      // Manual exam checks
      const now = new Date();
      if (examCheck.start_datetime && new Date(examCheck.start_datetime) > now)
        throw new Error("This exam has not started yet.");
      if (examCheck.end_datetime && new Date(examCheck.end_datetime) < now)
        throw new Error("This exam has expired.");
    }

    // Check existing attempts
    const isDaily = examCheck.schedule_type === "daily_auto";
    const todayMidnight = new Date();
    todayMidnight.setHours(0, 0, 0, 0);

    let attemptsQuery = client
      .from("attempts")
      .select("id, submitted_at, started_at")
      .eq("user_id", user.id)
      .eq("scheduled_exam_id", examId);

    if (isDaily) {
      attemptsQuery = attemptsQuery.gte(
        "started_at",
        todayMidnight.toISOString(),
      );
    }

    const { data: existingAttempts } = await attemptsQuery;

    const incomplete = (existingAttempts || []).find((a) => !a.submitted_at);

    if (incomplete) {
      const durMins = examCheck.exam_patterns?.duration_minutes || 60;
      const maxMs = durMins * 60 * 1000 * 1.5;
      const elapsed = incomplete.started_at
        ? Date.now() - new Date(incomplete.started_at).getTime()
        : Infinity;
      if (elapsed <= maxMs) {
        window.location.href = `/mock/exam.html?attempt=${incomplete.id}`;
        return;
      } else {
        await client
          .from("attempt_questions")
          .delete()
          .eq("attempt_id", incomplete.id);
        await client.from("answers").delete().eq("attempt_id", incomplete.id);
        await client.from("attempts").delete().eq("id", incomplete.id);
      }
    }

    // For daily_auto: check already completed today
    if (examCheck.schedule_type === "daily_auto") {
      const completed = (existingAttempts || []).filter((a) => a.submitted_at);
      if (completed.length > 0) {
        const lastAttempt = completed[completed.length - 1];
        const lastDate = new Date(lastAttempt.submitted_at);
        const today = new Date();
        if (lastDate.toDateString() === today.toDateString()) {
          throw new Error(
            "You have already completed today's test. Come back tomorrow at 5:00 AM!",
          );
        }
      }
    } else {
      if (examCheck.attempt_limit) {
        const completed = (existingAttempts || []).filter(
          (a) => a.submitted_at,
        ).length;
        if (completed >= examCheck.attempt_limit)
          throw new Error(
            `Attempt limit reached (${examCheck.attempt_limit}).`,
          );
      }
    }

    // Create attempt
    const { data: newAttempt, error: attemptError } = await client
      .from("attempts")
      .insert([
        { user_id: user.id, scheduled_exam_id: examId, started_at: new Date() },
      ])
      .select()
      .single();

    if (attemptError) throw new Error(attemptError.message);

    const patternId = examCheck.exam_patterns.id;

    // Use question_source_pattern_id if set — otherwise use own pattern
    // This allows any pattern to share a question pool without hardcoding
    const patternIdForSections =
      examCheck.exam_patterns.question_source_pattern_id || patternId;

    let sectionsQuery = client
      .from("pattern_sections")
      .select("id, section_name, question_count")
      .eq("pattern_id", patternIdForSections);

    // For daily sectional — only load the active section for today
    if (
      isDaily &&
      examCheck.exam_type === "daily_sectional" &&
      examCheck.active_section
    ) {
      sectionsQuery = sectionsQuery.eq(
        "section_name",
        examCheck.active_section,
      );
    }

    let { data: sections } = await sectionsQuery;

    if (!sections || sections.length === 0)
      throw new Error("No sections found for this exam pattern.");

    // question_count is taken directly from pattern_sections in DB
    // No overrides needed — each pattern defines its own counts

    const examLang = examCheck.language || "english";
    // Use student's chosen language for "both" exams
    const langToFetch =
      examLang === "both" ? chosenLanguage || "hindi" : examLang;
    const sectionIds = sections.map((s) => s.id);

    let qQuery = client
      .from("questions")
      .select(
        "id, pattern_section_id, topic, difficulty, language, question_stats(total_served)",
      )
      .in("pattern_section_id", sectionIds)
      .eq("is_active", true);

    if (langToFetch) qQuery = qQuery.eq("language", langToFetch);

    const { data: allQuestions } = await qQuery;

    if (!allQuestions || allQuestions.length === 0)
      throw new Error("No active questions found for this exam.");

    // Flatten nested question_stats into top-level total_served
    const questionsWithStats = allQuestions.map((q) => ({
      ...q,
      total_served: q.question_stats?.total_served || 0,
    }));

    // Fetch this student's seen questions from the pool
    const { data: seenData } = await client
      .from("user_question_seen")
      .select("question_id, times_seen")
      .eq("user_id", user.id)
      .in(
        "question_id",
        questionsWithStats.map((q) => q.id),
      );

    // Build seenMap: { question_id: times_seen }
    const seenMap = {};
    (seenData || []).forEach((s) => {
      seenMap[s.question_id] = s.times_seen;
    });

    let finalQuestions = [];
    sections.forEach((section) => {
      finalQuestions = finalQuestions.concat(
        pickQuestionsForSection(questionsWithStats, section, seenMap),
      );
    });

    if (finalQuestions.length === 0)
      throw new Error("Could not assign any questions. Contact admin.");

    const { error: insertError } = await client
      .from("attempt_questions")
      .insert(
        finalQuestions.map((q, index) => ({
          attempt_id: newAttempt.id,
          question_id: q.id,
          question_order: index + 1,
        })),
      );

    if (insertError) throw new Error(insertError.message);

    // Store chosen language so examEngine skips its own picker
    if (chosenLanguage)
      sessionStorage.setItem("chosenExamLanguage", chosenLanguage);
    window.location.href = `/mock/exam.html?attempt=${newAttempt.id}`;
  } catch (err) {
    console.error("startExam error:", err);
    btn.disabled = false;
    btn.innerHTML = `<i class="fas fa-play"></i> Start Exam`;
    alert(err.message);
  }
};

// ─── Render Recent Attempts ───────────────────────────────────────────────────
function renderRecentAttempts(attempts, isGuest = false) {
  const container = document.getElementById("recentAttempts");
  if (!container) return;

  if (isGuest) {
    container.innerHTML = `
      <div class="empty-box">
        <div class="empty-ico"><i class="fas fa-lock"></i></div>
        <h3>Sign In to See Your History</h3>
        <p>Your scores, accuracy, and streaks are saved here once you create a free account.</p>
        <div style="margin-top:14px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
          <a href="/index.html?action=signup" style="padding:9px 22px;background:linear-gradient(135deg,#1a56db,#2563eb);color:#fff;border-radius:100px;font-weight:800;font-size:.82rem;text-decoration:none;display:inline-flex;align-items:center;gap:6px;box-shadow:0 4px 14px rgba(26,86,219,.3)"><i class="fas fa-user-plus"></i> Create Free Account</a>
          <a href="/index.html?action=login" style="padding:9px 22px;background:#fff;color:#1d4ed8;border:1.5px solid #bfdbfe;border-radius:100px;font-weight:800;font-size:.82rem;text-decoration:none;display:inline-flex;align-items:center;gap:6px"><i class="fas fa-sign-in-alt"></i> Log In</a>
        </div>
      </div>`;
    return;
  }

  if (!attempts || attempts.length === 0) {
    container.innerHTML = `
      <div class="empty-box">
        <div class="empty-ico"><i class="fas fa-rocket"></i></div>
        <h3>No Attempts Yet</h3>
        <p>Start your first mock test — your performance history will appear here.</p>
      </div>`;
    return;
  }

  const accClass = (acc) =>
    acc >= 80 ? "p-green" : acc >= 60 ? "p-amber" : "p-red";
  const accMobClass = (acc) =>
    acc >= 80 ? "acc-green" : acc >= 60 ? "acc-amber" : "acc-red";

  // Show more logic — show 5, shadow 6th
  const ATTEMPTS_INITIAL = 5;
  const hasMore = attempts.length > ATTEMPTS_INITIAL;
  const visibleAttempts = attempts; // render all, CSS controls visibility

  const desktopRows = attempts
    .map((a, idx) => {
      const acc = Number(a.accuracy ?? 0);
      const se = a.scheduled_exams || {};
      const isDaily = se.schedule_type === "daily_auto";
      const catName = se.exam_categories?.name || "";
      const name =
        isDaily && se.active_section && catName
          ? `${catName} - ${se.active_section}`
          : se.exam_patterns?.pattern_name || "Mock";
      const date = a.submitted_at
        ? new Date(a.submitted_at).toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })
        : "—";
      return `<div class="attempt-row${idx >= ATTEMPTS_INITIAL ? " hidden-attempt" : ""}">
      <div><div class="attempt-name">${name}</div><div class="attempt-date">${date}</div></div>
      <div><span class="a-pill p-blue">${a.total_score ?? 0}</span></div>
      <div><span class="a-pill ${accClass(acc)}">${acc.toFixed(1)}%</span></div>
      <div class="attempt-time">${formatDuration(a.time_taken)}</div>
    </div>`;
    })
    .join("");

  const mobileCards = attempts
    .map((a, idx) => {
      const acc = Number(a.accuracy ?? 0);
      const se = a.scheduled_exams || {};
      const isDaily = se.schedule_type === "daily_auto";
      const catName = se.exam_categories?.name || "";
      const name =
        isDaily && se.active_section && catName
          ? `${catName} - ${se.active_section}`
          : se.exam_patterns?.pattern_name || "Mock";
      const date = a.submitted_at
        ? new Date(a.submitted_at).toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })
        : "—";
      return `<div class="attempt-mob${idx >= ATTEMPTS_INITIAL ? " hidden-attempt" : ""}">
      <div class="amb-top"><div class="amb-name">${name}</div><div class="amb-date">${date}</div></div>
      <div class="amb-chips">
        <div class="amb-chip score"><div class="amb-chip-val">${a.total_score ?? 0}</div><div class="amb-chip-lbl">Score</div></div>
        <div class="amb-chip ${accMobClass(acc)}"><div class="amb-chip-val">${acc.toFixed(1)}%</div><div class="amb-chip-lbl">Accuracy</div></div>
        <div class="amb-chip time"><div class="amb-chip-val">${formatDuration(a.time_taken)}</div><div class="amb-chip-lbl">Time</div></div>
      </div>
    </div>`;
    })
    .join("");

  const showMoreBtn = hasMore
    ? `
    <div id="attemptShowMoreWrap">
      <div id="attemptShadow" style="height:80px;background:linear-gradient(to bottom,transparent,#fff);pointer-events:none;margin-top:-80px;position:relative;z-index:2"></div>
      <div style="text-align:center;padding:8px 0 12px;position:relative;z-index:3">
        <button id="attemptShowMore" onclick="toggleAttempts()" style="background:#fff;border:1.5px solid #e2e8f4;color:#1a56db;font-weight:800;font-size:.82rem;padding:9px 24px;border-radius:100px;cursor:pointer;box-shadow:0 2px 8px rgba(15,23,42,.08);transition:all .18s" onmouseover="this.style.boxShadow='0 4px 16px rgba(26,86,219,.15)'" onmouseout="this.style.boxShadow='0 2px 8px rgba(15,23,42,.08)'">
          <i class="fas fa-chevron-down mr-1"></i> Show All (${attempts.length - ATTEMPTS_INITIAL} more)
        </button>
      </div>
    </div>`
    : "";

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
  overlay.style =
    "position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,.55);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:20px";
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

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });
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

window.toggleAttempts = function () {
  const hidden = document.querySelectorAll(".hidden-attempt");
  const btn = document.getElementById("attemptShowMore");
  const shadow = document.getElementById("attemptShadow");
  if (hidden.length > 0) {
    hidden.forEach((c) => (c.style.display = ""));
    if (btn) btn.innerHTML = '<i class="fas fa-chevron-up mr-1"></i> Show Less';
    if (shadow) shadow.style.display = "none";
  } else {
    document.querySelectorAll(".attempt-row, .attempt-mob").forEach((c, i) => {
      if (i >= 5) c.style.display = "none";
    });
    if (btn)
      btn.innerHTML = '<i class="fas fa-chevron-down mr-1"></i> Show All';
    if (shadow) shadow.style.display = "block";
  }
};

function formatDuration(time) {
  if (!time) return "—";
  let seconds = Number(time);
  if (seconds > 100000) seconds = Math.floor(seconds / 1000);
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hrs > 0) return `${hrs}h ${mins}m`;
  if (mins > 0) return `${mins}m`;
  return "<1m";
}

// ── 4-tier level system — thresholds match Edge Function ────────────────
function getLevelFromLifetimeCoins(coins) {
  if (coins >= 6000)
    return {
      label: "Legend",
      tagline: "The rarest rank",
      color: "#f59e0b",
      bg: "rgba(245,158,11,0.12)",
      border: "#b45309",
      icon: "legend",
    };
  if (coins >= 3000)
    return {
      label: "Luminary",
      tagline: "You illuminate the path",
      color: "#c084fc",
      bg: "rgba(168,85,247,0.12)",
      border: "#7c3aed",
      icon: "luminary",
    };
  if (coins >= 1000)
    return {
      label: "Scholar",
      tagline: "Knowledge accumulating",
      color: "#38bdf8",
      bg: "rgba(0,168,255,0.10)",
      border: "#0284c7",
      icon: "scholar",
    };
  return {
    label: "Seeker",
    tagline: "Every journey begins with curiosity",
    color: "#8080c0",
    bg: "rgba(80,80,180,0.10)",
    border: "#3030a0",
    icon: "seeker",
  };
}

function renderUserLevel(lifetimeCoins) {
  const el = document.getElementById("userLevel");
  if (!el) return;
  const { label, color, bg, border } = getLevelFromLifetimeCoins(lifetimeCoins);

  // Tier thresholds
  const TIERS = [
    { label: "Seeker", min: 0, max: 1000 },
    { label: "Scholar", min: 1000, max: 3000 },
    { label: "Luminary", min: 3000, max: 6000 },
    { label: "Legend", min: 6000, max: null },
  ];
  const currentTier = TIERS.find((t) => t.label === label);
  const nextTier = TIERS.find((t) => t.min === currentTier?.max);

  el.innerHTML = `
    <span style="display:inline-flex;align-items:center;gap:6px;flex-shrink:0;
                 background:${bg};border:1px solid ${border};color:${color};
                 padding:5px 14px 5px 8px;border-radius:100px;
                 font-family:'Syne',sans-serif;font-size:.82rem;font-weight:800;
                 letter-spacing:.04em">
      <svg width="22" height="22" viewBox="0 0 64 64"><use href="#badge-${label.toLowerCase()}"/></svg>
      ${label}
    </span>
    <span style="font-size:.72rem;color:#6b7280;font-weight:600;white-space:nowrap">
      ${lifetimeCoins.toLocaleString("en-IN")} lifetime CL
    </span>`;

  // Render progress bar toward next tier
  const wrap = document.getElementById("levelProgressWrap");
  const bar = document.getElementById("levelProgressBar");
  const lbl = document.getElementById("levelProgressLabel");
  const pct = document.getElementById("levelProgressPct");
  if (wrap && bar && lbl && pct) {
    if (nextTier) {
      const range = currentTier.max - currentTier.min;
      const progress = Math.min(lifetimeCoins - currentTier.min, range);
      const percent = Math.round((progress / range) * 100);
      const coinsLeft = (currentTier.max - lifetimeCoins).toLocaleString(
        "en-IN",
      );
      lbl.textContent = `${coinsLeft} CL to ${nextTier.label}`;
      pct.textContent = `${percent}%`;
      bar.style.background = color;
      wrap.style.display = "flex";
      // Animate after paint
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          bar.style.width = percent + "%";
        });
      });
    } else {
      // Legend — max tier reached
      lbl.textContent = "Maximum tier reached 🏆";
      pct.textContent = "100%";
      bar.style.background = color;
      bar.style.width = "100%";
      wrap.style.display = "flex";
    }
  }
}

const BADGE_META = {
  first_mock: { icon: "🎯", label: "First Mock" },
  accuracy_80: { icon: "🎯", label: "80% Accuracy" },
  streak_7: { icon: "🔥", label: "7-Day Streak" },
  streak_14: { icon: "🔥", label: "14-Day Streak" },
  streak_30: { icon: "🔥", label: "30-Day Streak" },
  coins_1000: { icon: "🪙", label: "1000 Coins" },
  coins_3000: { icon: "💎", label: "3000 Coins" },
  top_10_leaderboard: { icon: "🏆", label: "Top 10" },
};

function renderUserBadges(badges) {
  const el = document.getElementById("userBadges");
  if (!el) return;
  if (!badges || badges.length === 0) {
    el.innerHTML = `<span style="font-size:.72rem;color:#cbd5e1;font-style:italic">No badges yet — keep going!</span>`;
    return;
  }
  el.innerHTML = badges
    .map((b) => {
      const meta = BADGE_META[b.badge_type] || {
        icon: "⭐",
        label: b.badge_type,
      };
      return `<span title="${meta.label}" style="display:inline-flex;align-items:center;gap:4px;background:#f8faff;border:1px solid #e2e8f4;padding:3px 10px;border-radius:100px;font-size:.68rem;font-weight:700;color:#334155">
      ${meta.icon} ${meta.label}
    </span>`;
    })
    .join("");
}

async function loadCoinsAndProgress() {
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return;

  // ← fetch ALL needed fields in one query
  const { data: profile } = await client
    .from("user_profiles")
    .select(
      "total_coins, lifetime_coins, current_streak, max_streak, last_test_date, referral_code",
    )
    .eq("id", user.id)
    .single();

  // ✅ Null check immediately after fetch
  if (!profile) return;

  renderStreakMultiplierPill(profile.current_streak || 0);

  const coinsEl = document.getElementById("userCoins");
  const oldCoins = parseInt(coinsEl?.textContent?.replace(/[^0-9]/g, "")) || 0;
  animateCount(oldCoins, profile.total_coins || 0, 600, coinsEl);
  const earned = (profile.total_coins || 0) - oldCoins;
  if (earned > 0) showCoinBurst(earned, coinsEl);

  // Referral code & link
  if (profile.referral_code) {
    const link = `https://couragelibrary.in/?ref=${profile.referral_code}`;
    const codeEl = document.getElementById("userReferralCode");
    const linkEl = document.getElementById("referralLink");
    if (codeEl) codeEl.textContent = profile.referral_code;
    if (linkEl) {
      linkEl.href = link;
      linkEl.textContent = link;
    }
    loadReferralTrail(user.id);
  }

  // Level & badges
  const lifetimeCoins = profile.lifetime_coins || profile.total_coins || 0;
  renderUserLevel(lifetimeCoins);

  const { data: badges } = await client
    .from("user_badges")
    .select("badge_type, awarded_at")
    .eq("user_id", user.id)
    .order("awarded_at", { ascending: false });
  renderUserBadges(badges || []);

  // Nav coin pill
  const _navCoins = document.getElementById("navCoins");
  if (_navCoins) animateCount(0, profile.total_coins || 0, 700, _navCoins);

  // Nav level badge — intentionally NOT shown in header; level shown only on dashboard card
  // (navLevelBadge element kept as hidden placeholder for legacy compatibility)

  renderStreakCard({
    current: profile.current_streak || 0,
    best: profile.max_streak || 0,
    lastTestDate: profile.last_test_date || null,
  });

  updateRewardProgress(profile.total_coins || 0);
  checkTop10Badge(user.id, profile.total_coins || 0);
  startRewardUnlockListener(user.id);
}

// ─── Streak Card Renderer ──────────────────────────────────────────────
function renderStreakCard({ current, best, lastTestDate }) {
  const card = document.getElementById("streakCard");
  const countEl = document.getElementById("streakCount");
  const bestEl = document.getElementById("streakBest");
  const atRiskEl = document.getElementById("streakAtRisk");
  const flameWrap = document.getElementById("flameWrap");
  const msChips = document.querySelectorAll("#streakMilestones .smstone");

  if (!card) return;

  // Count & best
  countEl.innerHTML = `${current} <span>day${current !== 1 ? "s" : ""}</span>`;
  bestEl.textContent = best ? `${best} days` : "—";

  // Flame scales with milestone tier
  let flameScale = 1;
  if (current >= 50) flameScale = 1.45;
  else if (current >= 30) flameScale = 1.28;
  else if (current >= 14) flameScale = 1.14;
  else if (current >= 7) flameScale = 1.06;
  flameWrap.style.transform = `scale(${flameScale})`;
  flameWrap.style.transformOrigin = "bottom center";

  // Milestone chips
  msChips.forEach((chip) => {
    const ms = parseInt(chip.dataset.ms, 10);
    if (current >= ms) chip.classList.add("reached");
    else chip.classList.remove("reached");
  });

  // Pulse border on exact milestone day
  const milestones = [7, 14, 30, 50];
  if (milestones.includes(current)) card.classList.add("milestone");
  else card.classList.remove("milestone");

  // At-risk detection (IST-aware)
  // Fires when last_test_date was yesterday and user hasn’t tested today
  if (lastTestDate && current > 0) {
    const todayIST = new Date().toLocaleDateString("en-CA", {
      timeZone: "Asia/Kolkata",
    });
    const todayDate = new Date(todayIST + "T00:00:00+05:30");
    const lastDate = new Date(lastTestDate + "T00:00:00+05:30");
    const diffDays = Math.round((todayDate - lastDate) / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      // Last test was yesterday — streak breaks if they don’t test today
      atRiskEl.style.display = "flex";
      card.classList.add("at-risk");
    } else {
      atRiskEl.style.display = "none";
      card.classList.remove("at-risk");
    }
  } else {
    atRiskEl.style.display = "none";
  }
}

function updateRewardProgress(coins) {
  let nextReward = {
    name: "Bottle",
    target: 1800,
  };

  if (coins >= 1800 && coins < 2600) {
    nextReward = { name: "Diary", target: 2600 };
  } else if (coins >= 2600) {
    nextReward = { name: "T-shirt", target: 3500 };
  }

  const percent = Math.min((coins / nextReward.target) * 100, 100);

  const remaining = nextReward.target - coins;

  document.getElementById("rewardText").innerText =
    remaining > 0
      ? `${remaining} coins more for ${nextReward.name}`
      : `You can claim your ${nextReward.name} — visit the Rewards page`;

  document.getElementById("rewardBar").style.width = percent + "%";
}

// ── Notification helpers ───────────────────────────────────────────────────────

/** Map notification type → emoji + background tint */
function notifIcon(type) {
  const map = {
    coins: { emoji: "🪙", bg: "rgba(0,200,192,0.15)" },
    streak: { emoji: "🔥", bg: "rgba(251,146,60,0.15)" },
    reward_unlocked: { emoji: "🎁", bg: "rgba(245,158,11,0.15)" },
    reward_nudge: { emoji: "🎯", bg: "rgba(99,102,241,0.15)" },
    claim: { emoji: "📦", bg: "rgba(16,185,129,0.15)" },
    badge: { emoji: "🏅", bg: "rgba(168,85,247,0.15)" },
    level_up: { emoji: "⭐", bg: "rgba(253,224,71,0.12)" },
    referral: { emoji: "🎉", bg: "rgba(52,211,153,0.15)" },
  };
  return map[type] || { emoji: "📬", bg: "rgba(255,255,255,0.06)" };
}

/** Human-readable relative timestamp: "2 min ago", "Yesterday", etc. */
function relativeTime(isoString) {
  const diff = Date.now() - new Date(isoString).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const dy = Math.floor(hr / 24);
  if (dy === 1) return "Yesterday";
  if (dy < 7) return `${dy} days ago`;
  return new Date(isoString).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
}

async function loadNotifications() {
  if (!notificationUser) return;

  const { data } = await client
    .from("notifications")
    .select("*")
    .eq("user_id", notificationUser.id)
    .order("created_at", { ascending: false })
    .limit(10);

  const list = document.getElementById("notificationList");
  if (!list) return;
  list.innerHTML = "";

  if (!data || data.length === 0) {
    list.innerHTML = `
      <div style="padding:20px 16px;text-align:center;font-size:12px;
                  color:#4b5563;letter-spacing:.04em">
        No notifications yet
      </div>`;
    return;
  }

  data.forEach((n) => {
    const icon = notifIcon(n.type);
    list.innerHTML += `
      <div style="
        display:flex;align-items:flex-start;gap:10px;
        padding:11px 14px;
        border-bottom:0.5px solid rgba(255,255,255,0.05);
        transition:background .15s;
        cursor:default;
      "
      onmouseover="this.style.background='rgba(255,255,255,0.04)'"
      onmouseout="this.style.background=''"
      >
        <div style="
          flex-shrink:0;width:30px;height:30px;border-radius:50%;
          background:${icon.bg};
          display:flex;align-items:center;justify-content:center;
          font-size:14px;margin-top:1px;
        ">${icon.emoji}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:12.5px;font-weight:700;color:#0f172a;
                      line-height:1.35;margin-bottom:2px;
                      white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
            ${n.title}
          </div>
          <div style="font-size:11px;color:#6b7280;line-height:1.5;
                      display:-webkit-box;-webkit-line-clamp:2;
                      -webkit-box-orient:vertical;overflow:hidden">
            ${n.message}
          </div>
          <div style="font-size:10px;color:#374151;margin-top:3px;
                      font-family:'DM Mono',monospace">
            ${relativeTime(n.created_at)}
          </div>
        </div>
      </div>`;
  });
}

// ─── Notification System ─────────────────────────────────────

// ─── Referral Coins Trail ─────────────────────────────────────────────────
async function loadReferralTrail(userId) {
  const trail = document.getElementById("referralTrail");
  const textEl = document.getElementById("referralTrailText");
  const listEl = document.getElementById("referralTrailList");
  if (!trail || !textEl || !listEl) return;

  const { data: refs } = await client
    .from("referrals")
    .select(
      "referred_id, coins_awarded, created_at, user_profiles!referred_id(full_name)",
    )
    .eq("referrer_id", userId)
    .order("created_at", { ascending: false });

  if (!refs || refs.length === 0) return;

  const totalCoins = refs.reduce((s, r) => s + (r.coins_awarded || 0), 0);
  const count = refs.length;

  textEl.innerHTML = `
    You've helped <strong>${count}</strong> friend${count !== 1 ? "s" : ""} join
    &amp; earned <strong style="color:#059669">+${totalCoins.toLocaleString("en-IN")} CL</strong> from referrals.
  `;

  listEl.innerHTML =
    refs
      .slice(0, 5)
      .map((r) => {
        const name = r.user_profiles?.full_name || "Friend";
        const initials = name
          .split(" ")
          .map((w) => w[0])
          .join("")
          .slice(0, 2)
          .toUpperCase();
        return `
      <div title="${name}" style="
        display:inline-flex;align-items:center;gap:5px;
        background:rgba(255,255,255,0.8);border:0.5px solid rgba(52,211,153,.3);
        border-radius:100px;padding:3px 9px 3px 5px;font-size:.68rem;font-weight:700;color:#065f46
      ">
        <span style="width:18px;height:18px;border-radius:50%;background:#d1fae5;
                     display:inline-flex;align-items:center;justify-content:center;
                     font-size:.55rem;font-weight:900;color:#059669">${initials}</span>
        ${name.split(" ")[0]}
      </div>`;
      })
      .join("") +
    (refs.length > 5
      ? `<span style="font-size:.68rem;color:#94a3b8;padding:3px 0;align-self:center">+${refs.length - 5} more</span>`
      : "");

  trail.style.display = "block";
}

// ─── Top 10% Earner Badge ──────────────────────────────────────────────────
async function checkTop10Badge(userId, userCoins) {
  // Count users with more coins than current user
  const { count: above } = await client
    .from("user_profiles")
    .select("id", { count: "exact", head: true })
    .gt("total_coins", userCoins);

  const { count: total } = await client
    .from("user_profiles")
    .select("id", { count: "exact", head: true });

  if (!total || total < 10) return; // not enough users yet

  const isTop10 = above !== null && above / total <= 0.1;

  const badgesEl = document.getElementById("userBadges");
  if (!isTop10 || !badgesEl) return;

  // Check if badge already rendered
  if (document.getElementById("top10EarnerBadge")) return;

  const badge = document.createElement("span");
  badge.id = "top10EarnerBadge";
  badge.title = "Top 10% CL Earner on Courage Library";
  badge.innerHTML = `
    <span style="
      display:inline-flex;align-items:center;gap:4px;
      background:linear-gradient(135deg,#fef3c7,#fde68a);
      border:0.5px solid #f59e0b;color:#92400e;
      padding:3px 10px 3px 7px;border-radius:100px;
      font-size:.68rem;font-weight:800;
      font-family:'Syne','Sora',sans-serif;letter-spacing:.03em;
      box-shadow:0 2px 8px rgba(245,158,11,.2)
    ">
      🏅 Top 10% Earner
    </span>`;
  badgesEl.prepend(badge);

  // Top 10% badge shown only in dashboard badges card — NOT in nav header
}

async function initNotifications() {
  // ── Wire bell unconditionally (guests get login prompt) ──
  const bell = document.getElementById("notificationBell");
  const dropdown = document.getElementById("notificationDropdown");

  if (bell && dropdown) {
    bell.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!notificationUser) {
        if (typeof window.showGuestAuthPrompt === "function")
          window.showGuestAuthPrompt();
        return;
      }
      const isHidden =
        dropdown.style.display === "none" || !dropdown.style.display;
      if (isHidden) {
        dropdown.style.display = "block";
        dropdown.style.animation =
          "notifDrop .18s cubic-bezier(.34,1.56,.64,1) both";
        loadNotifications();
        // Auto mark all as read after a short delay
        setTimeout(() => {
          markAllRead();
        }, 1200);
      } else {
        dropdown.style.display = "none";
      }
    });

    document.addEventListener("click", (e) => {
      if (
        dropdown.style.display !== "none" &&
        !dropdown.contains(e.target) &&
        !bell.contains(e.target)
      ) {
        dropdown.style.display = "none";
      }
    });

    dropdown.addEventListener("click", (e) => e.stopPropagation());
  }

  const markBtn = document.getElementById("markAllReadBtn");
  if (markBtn) markBtn.addEventListener("click", markAllRead);

  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return;

  notificationUser = user;
  await loadNotificationCount();
  setupRealtimeNotifications();
  startRewardUnlockListener(user.id);
}

// Load unread count
async function loadNotificationCount() {
  if (!notificationUser) return;

  const { count } = await client
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("user_id", notificationUser.id)
    .eq("is_read", false);

  const badge = document.getElementById("notificationCount");
  const headerCount = document.getElementById("notifHeaderCount");
  const mobileBadge = document.getElementById("notificationCountMobile");

  if (badge) {
    if (count > 0) {
      badge.textContent = count > 99 ? "99+" : count;
      badge.style.display = "flex";
    } else {
      badge.style.display = "none";
    }
  }
  if (headerCount) {
    if (count > 0) {
      headerCount.textContent = `${count} unread`;
      headerCount.style.display = "inline";
    } else {
      headerCount.style.display = "none";
    }
  }
  if (mobileBadge) {
    if (count > 0) {
      mobileBadge.textContent = count > 99 ? "99+" : count;
      mobileBadge.style.display = "block";
    } else {
      mobileBadge.style.display = "none";
    }
  }
}

// 📥 Load notification list
async function loadNotifications() {
  if (!notificationUser) return;

  const { data } = await client
    .from("notifications")
    .select("*")
    .eq("user_id", notificationUser.id)
    .order("created_at", { ascending: false })
    .limit(10);

  const list = document.getElementById("notificationList");
  if (!list) return;

  list.innerHTML = "";

  if (!data || data.length === 0) {
    list.innerHTML = `
      <div style="padding:36px 16px;text-align:center">
        <div style="width:52px;height:52px;border-radius:14px;background:#eff6ff;display:flex;align-items:center;justify-content:center;font-size:1.4rem;margin:0 auto 10px">🔔</div>
        <div style="font-size:.8rem;font-weight:700;color:#1e293b;margin-bottom:4px">All caught up!</div>
        <div style="font-size:.72rem;color:#94a3b8;font-weight:500">No notifications yet — keep going!</div>
      </div>`;
    return;
  }

  const typeStyle = {
    coins: {
      bg: "rgba(251,191,36,0.08)",
      border: "rgba(251,191,36,0.2)",
      icon: "🪙",
      accent: "#d97706",
    },
    streak: {
      bg: "rgba(251,146,60,0.08)",
      border: "rgba(251,146,60,0.2)",
      icon: "🔥",
      accent: "#ea580c",
    },
    reward: {
      bg: "rgba(52,211,153,0.08)",
      border: "rgba(52,211,153,0.2)",
      icon: "🎁",
      accent: "#059669",
    },
    badge: {
      bg: "rgba(129,140,248,0.08)",
      border: "rgba(129,140,248,0.2)",
      icon: "🏅",
      accent: "#6d28d9",
    },
    referral: {
      bg: "rgba(52,211,153,0.08)",
      border: "rgba(52,211,153,0.2)",
      icon: "🎉",
      accent: "#059669",
    },
  };
  const fallback = {
    bg: "rgba(148,163,184,0.06)",
    border: "rgba(148,163,184,0.15)",
    icon: "📌",
    accent: "#64748b",
  };

  const unread = data.filter((n) => !n.is_read);
  const read = data.filter((n) => n.is_read);

  const renderItem = (n) => {
    const s = typeStyle[n.type] || fallback;
    const ago = _timeAgo(n.created_at);
    return `
      <div style="
        display:flex;align-items:flex-start;gap:10px;
        padding:12px 16px;
        background:${n.is_read ? "#fff" : s.bg};
        border-bottom:1px solid #f1f5f9;
        transition:background .15s;cursor:default;
        position:relative;
      "
      onmouseenter="this.style.background='#f8faff'"
      onmouseleave="this.style.background='${n.is_read ? "#fff" : s.bg}'">
        ${!n.is_read ? `<span style="position:absolute;left:0;top:0;bottom:0;width:3px;background:${s.accent};border-radius:0 2px 2px 0"></span>` : ""}
        <div style="
          width:36px;height:36px;border-radius:10px;flex-shrink:0;
          background:${n.is_read ? "#f1f5f9" : "rgba(255,255,255,0.9)"};
          border:1px solid ${n.is_read ? "#e2e8f0" : s.border};
          display:flex;align-items:center;justify-content:center;font-size:.95rem;
        ">${s.icon}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:.78rem;font-weight:${n.is_read ? 600 : 700};color:${n.is_read ? "#475569" : "#0f172a"};line-height:1.35;margin-bottom:2px">${n.title}</div>
          <div style="font-size:.69rem;color:#64748b;line-height:1.4">${n.message}</div>
          <div style="font-size:.62rem;color:#94a3b8;margin-top:5px;font-weight:500">${ago}</div>
        </div>
        ${!n.is_read ? `<span style="width:7px;height:7px;border-radius:50%;background:#3b82f6;flex-shrink:0;margin-top:5px;box-shadow:0 0 0 2px rgba(59,130,246,0.2)"></span>` : ""}
      </div>`;
  };

  if (unread.length > 0) {
    list.innerHTML += `<div style="padding:8px 16px 4px;font-size:.6rem;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8">Unread</div>`;
    unread.forEach((n) => {
      list.innerHTML += renderItem(n);
    });
  }
  if (read.length > 0) {
    list.innerHTML += `<div style="padding:8px 16px 4px;font-size:.6rem;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#cbd5e1">Earlier</div>`;
    read.forEach((n) => {
      list.innerHTML += renderItem(n);
    });
  }
}

function _timeAgo(iso) {
  if (!iso) return "";
  const diff = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// Mark all read
async function markAllRead() {
  if (!notificationUser) return;

  await client
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", notificationUser.id);

  loadNotificationCount();
  loadNotifications();
}

// Realtime listener
function setupRealtimeNotifications() {
  if (!notificationUser) return;

  client
    .channel("notifications-channel")
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${notificationUser.id}`,
      },
      (payload) => {
        loadNotificationCount();
        showToast(payload.new.title);
      },
    )
    .subscribe();
}

// Simple toast
function showToast(title, message = "", type = "coins") {
  document.getElementById("cl-toast")?.remove();

  const icon = notifIcon(type);
  const toast = document.createElement("div");
  toast.id = "cl-toast";
  toast.style.cssText = `
    position:fixed;top:72px;right:16px;
    display:flex;align-items:center;gap:10px;
    background:rgba(10,10,20,0.92);
    border:0.5px solid rgba(255,255,255,0.10);
    backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);
    border-radius:12px;
    padding:11px 14px;
    min-width:220px;max-width:320px;
    box-shadow:0 8px 32px rgba(0,0,0,0.5);
    z-index:9999;
    opacity:0;
    transform:translateX(18px);
    transition:opacity .22s ease, transform .22s cubic-bezier(.34,1.56,.64,1);
  `;

  toast.innerHTML = `
    <div style="width:32px;height:32px;border-radius:50%;background:${icon.bg};
                display:flex;align-items:center;justify-content:center;
                font-size:15px;flex-shrink:0">${icon.emoji}</div>
    <div style="min-width:0;flex:1">
      <div style="font-size:12.5px;font-weight:700;color:#0f172a;
                  white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
        ${title}
      </div>
      ${
        message
          ? `<div style="font-size:11px;color:#6b7280;margin-top:1px;
                               white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                    ${message}
                  </div>`
          : ""
      }
    </div>
  `;

  document.body.appendChild(toast);
  requestAnimationFrame(() => {
    toast.style.opacity = "1";
    toast.style.transform = "translateX(0)";
  });
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(18px)";
    setTimeout(() => toast.remove(), 250);
  }, 3500);
}

function openMobileNotifications() {
  const panel = document.getElementById("mobileNotificationPanel");
  const sheet = document.getElementById("mobileSheet");

  panel.style.display = "block";
  setTimeout(() => {
    sheet.style.transform = "translateY(0)";
  }, 10);

  loadNotificationsMobile();

  // Auto mark all as read after short delay
  setTimeout(() => {
    markAllRead();
  }, 1200);
}

function closeMobileNotifications() {
  const sheet = document.getElementById("mobileSheet");
  sheet.style.transform = "translateY(100%)";
  setTimeout(() => {
    document.getElementById("mobileNotificationPanel").style.display = "none";
  }, 300);
}

async function loadNotificationsMobile() {
  if (!notificationUser) return;

  const { data } = await client
    .from("notifications")
    .select("*")
    .eq("user_id", notificationUser.id)
    .order("created_at", { ascending: false })
    .limit(10);

  const list = document.getElementById("notificationListMobile");
  const subtitle = document.getElementById("mobileNotifSubtitle");
  list.innerHTML = "";

  if (!data || data.length === 0) {
    list.innerHTML = `
      <div style="padding:40px 16px;text-align:center">
        <div style="width:56px;height:56px;border-radius:16px;background:#eff6ff;display:flex;align-items:center;justify-content:center;font-size:1.5rem;margin:0 auto 12px">🔔</div>
        <div style="font-size:.88rem;font-weight:700;color:#1e293b;margin-bottom:5px">All caught up!</div>
        <div style="font-size:.75rem;color:#94a3b8;font-weight:500">No notifications yet — keep going!</div>
      </div>`;
    if (subtitle) subtitle.textContent = "Nothing new";
    return;
  }

  const unread = data.filter((n) => !n.is_read);
  if (subtitle)
    subtitle.textContent =
      unread.length > 0 ? `${unread.length} unread` : "All read";

  const typeStyle = {
    coins: {
      bg: "rgba(251,191,36,0.08)",
      border: "rgba(251,191,36,0.22)",
      icon: "🪙",
      accent: "#d97706",
    },
    streak: {
      bg: "rgba(251,146,60,0.08)",
      border: "rgba(251,146,60,0.22)",
      icon: "🔥",
      accent: "#ea580c",
    },
    reward: {
      bg: "rgba(52,211,153,0.08)",
      border: "rgba(52,211,153,0.22)",
      icon: "🎁",
      accent: "#059669",
    },
    badge: {
      bg: "rgba(129,140,248,0.08)",
      border: "rgba(129,140,248,0.22)",
      icon: "🏅",
      accent: "#6d28d9",
    },
    referral: {
      bg: "rgba(52,211,153,0.08)",
      border: "rgba(52,211,153,0.22)",
      icon: "🎉",
      accent: "#059669",
    },
  };
  const fallback = {
    bg: "rgba(148,163,184,0.06)",
    border: "rgba(148,163,184,0.18)",
    icon: "📌",
    accent: "#64748b",
  };

  const renderMobileItem = (n) => {
    const s = typeStyle[n.type] || fallback;
    const ago = _timeAgo(n.created_at);
    return `
      <div style="
        display:flex;align-items:flex-start;gap:12px;
        padding:13px 4px;
        border-bottom:1px solid #f1f5f9;
        position:relative;
      ">
        ${!n.is_read ? `<span style="position:absolute;left:-12px;top:0;bottom:0;width:3px;background:${s.accent};border-radius:0 2px 2px 0"></span>` : ""}
        <div style="
          width:40px;height:40px;border-radius:12px;flex-shrink:0;
          background:${n.is_read ? "#f8faff" : "rgba(255,255,255,0.9)"};
          border:1px solid ${n.is_read ? "#e2e8f0" : s.border};
          display:flex;align-items:center;justify-content:center;font-size:1.1rem;
          box-shadow:${n.is_read ? "none" : "0 2px 8px rgba(0,0,0,.06)"};
        ">${s.icon}</div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:6px;margin-bottom:3px">
            <div style="font-size:.84rem;font-weight:${n.is_read ? 600 : 700};color:${n.is_read ? "#475569" : "#0f172a"};line-height:1.3;flex:1">${n.title}</div>
            ${!n.is_read ? `<span style="width:8px;height:8px;border-radius:50%;background:#3b82f6;flex-shrink:0;margin-top:4px;box-shadow:0 0 0 2px rgba(59,130,246,0.2)"></span>` : ""}
          </div>
          <div style="font-size:.74rem;color:#64748b;line-height:1.45">${n.message}</div>
          <div style="font-size:.66rem;color:#94a3b8;margin-top:5px;font-weight:500">${ago}</div>
        </div>
      </div>`;
  };

  const read = data.filter((n) => n.is_read);

  if (unread.length > 0) {
    list.innerHTML += `<div style="padding:12px 4px 6px;font-size:.62rem;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8">Unread</div>`;
    unread.forEach((n) => {
      list.innerHTML += renderMobileItem(n);
    });
  }
  if (read.length > 0) {
    list.innerHTML += `<div style="padding:12px 4px 6px;font-size:.62rem;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#cbd5e1">Earlier</div>`;
    read.forEach((n) => {
      list.innerHTML += renderMobileItem(n);
    });
  }
}

function renderStreakMultiplierPill(currentStreak) {
  const pill = document.getElementById("streakMultiplierPill");
  const valEl = document.getElementById("streakMultiplierVal");
  if (!pill || !valEl) return;

  let label = null;
  if (currentStreak >= 50) label = "×3.0";
  else if (currentStreak >= 25) label = "×2.0";
  else if (currentStreak >= 10) label = "×1.5";
  else if (currentStreak >= 5) label = "×1.25";

  if (label) {
    valEl.textContent = label;
    pill.style.display = "block";
  } else {
    pill.style.display = "none";
  }
}