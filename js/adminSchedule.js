const SUPABASE_URL = "https://sgagswxzsxlgcspwiuoh.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNnYWdzd3h6c3hsZ2NzcHdpdW9oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5NTA1NTIsImV4cCI6MjA2OTUyNjU1Mn0.ZNfk5WNDPkjKcFsRO48rEYk3dhbLYm_m21aZ-wfywo4";

const { createClient } = supabase;
const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── Daily Schedule Config ───────────────────────────────────────────────────
const PATTERN_IDS = {
  daily:     'aaaaaaaa-0001-0001-0001-000000000001', // SSC GD - Daily Sectional (20Q)
  mixed:     'aaaaaaaa-0002-0002-0002-000000000002', // SSC GD - Mixed Sectional (10Q×5=50Q)
  full_mock: 'aaaaaaaa-0003-0003-0003-000000000003', // SSC GD - Full Mock Test (20Q×5=100Q)
};

const DAILY_SCHEDULE = [
  { day: "monday",    label: "Monday",    subject: "General Awareness",    exam_type: "daily_sectional", pattern_key: "daily",     active_section: "General Awareness",    questions: 20,  duration: 20, language: "both" },
  { day: "tuesday",   label: "Tuesday",   subject: "Reasoning",            exam_type: "daily_sectional", pattern_key: "daily",     active_section: "Reasoning",            questions: 20,  duration: 20, language: "both" },
  { day: "wednesday", label: "Wednesday", subject: "Quantitative Aptitude",exam_type: "daily_sectional", pattern_key: "daily",     active_section: "Quantitative Aptitude",questions: 20,  duration: 20, language: "both" },
  { day: "thursday",  label: "Thursday",  subject: "Grammar",              exam_type: "daily_sectional", pattern_key: "daily",     active_section: "Grammar",              questions: 20,  duration: 20, language: "english" },
  { day: "friday",    label: "Friday",    subject: "Hindi",                exam_type: "daily_sectional", pattern_key: "daily",     active_section: "Hindi",                questions: 20,  duration: 20, language: "hindi" },
  { day: "saturday",  label: "Saturday",  subject: "Mixed Sectional",      exam_type: "mixed",           pattern_key: "mixed",     active_section: null,                   questions: 50,  duration: 30, language: "both" },
  { day: "sunday",    label: "Sunday",    subject: "Full Mock Test",       exam_type: "full_mock",       pattern_key: "full_mock", active_section: null,                   questions: 100, duration: 60, language: "both" },
];

// ─── Admin auth check ────────────────────────────────────────────────────────
async function checkAdminAuth() {
  const { data: { user } } = await client.auth.getUser();
  if (!user) {
    window.location.href = "/index.html?checkAuth=1";
    return false;
  }
  const { data: profile } = await client
    .from("user_profiles")
    .select("is_admin, role")
    .eq("id", user.id)
    .single();

  const isAdmin = profile?.is_admin === true || profile?.role === "super_admin";
  if (!isAdmin) {
    window.location.href = "/mock/dashboard.html";
    return false;
  }
  return true;
}

document.addEventListener("DOMContentLoaded", async () => {
  const ok = await checkAdminAuth();
  if (!ok) return;

  await loadPatterns();
  await loadCategories();
  await loadSchedules();
  initUI();
});

// ─── UI init ─────────────────────────────────────────────────────────────────
function initUI() {
  const availSelect  = document.getElementById("availabilityType");
  const datetimeRow  = document.getElementById("datetimeRow");

  function toggleDatetime() {
    if (availSelect.value === "scheduled") {
      datetimeRow.classList.remove("hidden");
    } else {
      datetimeRow.classList.add("hidden");
      document.getElementById("startDatetime").value = "";
      document.getElementById("endDatetime").value   = "";
    }
  }
  availSelect.addEventListener("change", toggleDatetime);
  toggleDatetime();

  document.getElementById("scheduleExamBtn").addEventListener("click", createSchedule);
  document.getElementById("schedulePattern").addEventListener("change", loadExamPreview);

  // Daily auto-schedule button
  document.getElementById("setupDailyBtn")?.addEventListener("click", setupDailySchedule);
  document.getElementById("dailyCategory")?.addEventListener("change", loadDailyPreview);
}

// ─── Load categories dropdown (for daily schedule) ───────────────────────────
async function loadCategories() {
  const { data, error } = await client
    .from("exam_categories")
    .select("id, name")
    .order("name");

  if (error || !data) return;

  const select = document.getElementById("dailyCategory");
  if (!select) return;
  select.innerHTML = `<option value="">— Select Exam Category —</option>`;
  data.forEach(c => {
    select.innerHTML += `<option value="${c.id}">${c.name}</option>`;
  });
}

// ─── Load daily schedule preview ─────────────────────────────────────────────
async function loadDailyPreview() {
  const categoryId = document.getElementById("dailyCategory")?.value;
  const preview    = document.getElementById("dailyPreview");
  if (!preview) return;

  if (!categoryId) {
    preview.classList.add("hidden");
    return;
  }

  // Check if daily schedule already exists for this category
  const { data: existing } = await client
    .from("scheduled_exams")
    .select("id, day_of_week, exam_type, is_active")
    .eq("category_id", categoryId)
    .eq("schedule_type", "daily_auto");

  const existingMap = {};
  (existing || []).forEach(e => { existingMap[e.day_of_week] = e; });

  let rows = "";
  DAILY_SCHEDULE.forEach(d => {
    const exists  = existingMap[d.day];
    const status  = exists
      ? `<span class="text-xs font-bold ${exists.is_active ? "text-green-600" : "text-gray-400"}">${exists.is_active ? "✓ Active" : "⏸ Inactive"}</span>`
      : `<span class="text-xs text-gray-400">Not created</span>`;

    rows += `
      <div class="flex items-center justify-between py-1.5 border-b border-gray-100 text-xs">
        <span class="font-semibold text-gray-700 w-24">${d.label}</span>
        <span class="text-gray-500 flex-1">${d.subject}</span>
        <span class="text-gray-400 w-16 text-center">${d.questions}Q / ${d.duration}m</span>
        <span class="w-20 text-right">${status}</span>
      </div>`;
  });

  document.getElementById("dailyPreviewRows").innerHTML = rows;

  const alreadySetup = existing && existing.length === 7;
  const setupBtn = document.getElementById("setupDailyBtn");
  if (setupBtn) {
    setupBtn.textContent = alreadySetup ? "Re-create Daily Schedule" : "Create Daily Schedule";
    setupBtn.classList.toggle("bg-amber-600", alreadySetup);
    setupBtn.classList.toggle("bg-indigo-600", !alreadySetup);
  }

  preview.classList.remove("hidden");
}

// ─── Setup Daily Auto-Schedule ────────────────────────────────────────────────
// Creates 7 rows in scheduled_exams — one per day of week
// Each row uses pattern_section lookup by section_name + category
async function setupDailySchedule() {
  const categoryId  = document.getElementById("dailyCategory")?.value;
  const launchDate  = document.getElementById("dailyLaunchDate")?.value;
  const btn         = document.getElementById("setupDailyBtn");

  if (!categoryId) { showToast("Select a category first.", "error"); return; }
  if (!launchDate) { showToast("Set a launch date.", "error"); return; }

  // Confirm re-create if already exists
  const { data: existing } = await client
    .from("scheduled_exams")
    .select("id")
    .eq("category_id", categoryId)
    .eq("schedule_type", "daily_auto");

  if (existing && existing.length > 0) {
    const ok = confirm(
      `A daily schedule already exists for this category (${existing.length} entries).\n\nThis will DELETE the old entries and create fresh ones. Student attempt history will NOT be affected.\n\nContinue?`
    );
    if (!ok) return;

    // Delete old daily_auto entries for this category
    await client
      .from("scheduled_exams")
      .delete()
      .eq("category_id", categoryId)
      .eq("schedule_type", "daily_auto");
  }

  btn.disabled = true;
  btn.innerHTML = `<i class="fas fa-spinner fa-spin mr-2"></i> Creating...`;

  try {
    // Build insert rows — each day uses its own pattern_id
    // daily → Daily Sectional pattern, mixed → Mixed pattern, full_mock → Full Mock pattern
    const rows = DAILY_SCHEDULE.map(d => ({
      pattern_id:         PATTERN_IDS[d.pattern_key],
      category_id:        categoryId,
      schedule_type:      "daily_auto",
      day_of_week:        d.day,
      exam_type:          d.exam_type,
      active_section:     d.active_section,  // e.g. "General Awareness" for Mon, null for Sat/Sun
      launch_date:        launchDate,
      mode:               "balanced",
      availability_type:  "scheduled",
      language:           d.language,
      is_active:          true,
      is_premium:         false,
      enable_leaderboard: true,
      attempt_limit:      null,
      start_datetime:     null,
      end_datetime:       null,
    }));

    const { error } = await client.from("scheduled_exams").insert(rows);
    if (error) throw new Error(error.message);

    showToast("Daily schedule created! 7 days, runs forever. ✓", "success");
    await loadDailyPreview();
    await loadSchedules();

  } catch (err) {
    showToast("Error: " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i class="fas fa-calendar-check mr-2"></i> Create Daily Schedule`;
  }
}

// ─── Fuzzy section name matcher ───────────────────────────────────────────────
function findSectionId(sectionMap, subjectName) {
  const lower = subjectName.toLowerCase();

  // Direct match
  if (sectionMap[lower]) return sectionMap[lower];

  // Partial match — e.g. "general awareness" matches "general awareness & gk"
  for (const [key, id] of Object.entries(sectionMap)) {
    if (key.includes(lower) || lower.includes(key)) return id;
  }

  // Keyword match
  const keywords = {
    "general awareness": ["ga", "gk", "general", "awareness", "knowledge"],
    "reasoning":         ["reasoning", "intelligence", "logical"],
    "quantitative aptitude": ["maths", "math", "quantitative", "aptitude", "numerical"],
    "grammar":           ["english", "grammar", "language"],
    "hindi":             ["hindi", "हिंदी"],
    "mixed sectional":   ["mixed", "sectional"],
    "full mock test":    ["full", "mock", "complete"],
  };

  const kws = keywords[lower] || [];
  for (const kw of kws) {
    for (const [key, id] of Object.entries(sectionMap)) {
      if (key.includes(kw)) return id;
    }
  }

  // Fallback — return first section
  return Object.values(sectionMap)[0];
}

// ─── Load patterns dropdown ───────────────────────────────────────────────────
async function loadPatterns() {
  const { data, error } = await client
    .from("exam_patterns")
    .select("id, pattern_name, total_questions, duration_minutes")
    .order("pattern_name");

  if (error) { console.error(error); return; }

  const select = document.getElementById("schedulePattern");
  select.innerHTML = `<option value="">— Select Exam Pattern —</option>`;
  data.forEach((p) => {
    select.innerHTML += `<option value="${p.id}" data-questions="${p.total_questions}" data-duration="${p.duration_minutes}">${p.pattern_name}</option>`;
  });
}

// ─── Exam preview on pattern select ──────────────────────────────────────────
async function loadExamPreview() {
  const patternId = document.getElementById("schedulePattern").value;
  const preview   = document.getElementById("examPreview");

  if (!patternId) { preview.classList.add("hidden"); return; }

  const { data: pattern } = await client
    .from("exam_patterns")
    .select("pattern_name, total_questions, total_marks, duration_minutes, negative_marking")
    .eq("id", patternId)
    .single();

  const { data: sectionsWithId } = await client
    .from("pattern_sections")
    .select("id, section_name, question_count, marks_per_question")
    .eq("pattern_id", patternId);

  const { data: qCounts } = await client
    .from("questions")
    .select("pattern_section_id")
    .eq("is_active", true)
    .in("pattern_section_id", (sectionsWithId || []).map(s => s.id));

  const questionCounts = {};
  (qCounts || []).forEach(q => {
    questionCounts[q.pattern_section_id] = (questionCounts[q.pattern_section_id] || 0) + 1;
  });

  document.getElementById("examSummaryStats").innerHTML = `
    <div class="preview-stat"><div class="preview-stat-val text-blue-700">${pattern.total_questions}</div><div class="preview-stat-lbl">Questions</div></div>
    <div class="preview-stat"><div class="preview-stat-val text-green-700">${pattern.total_marks}</div><div class="preview-stat-lbl">Marks</div></div>
    <div class="preview-stat"><div class="preview-stat-val text-amber-700">${pattern.duration_minutes}</div><div class="preview-stat-lbl">Minutes</div></div>
    <div class="preview-stat"><div class="preview-stat-val text-red-700">${pattern.negative_marking ?? "—"}</div><div class="preview-stat-lbl">Negative</div></div>`;

  let sectionsHtml = `<div class="font-semibold text-gray-700 mt-3 mb-2 text-xs uppercase tracking-wider">Sections</div>`;
  (sectionsWithId || []).forEach(sec => {
    const available  = questionCounts[sec.id] || 0;
    const needed     = sec.question_count;
    const isOk       = available >= needed;
    sectionsHtml += `
      <div class="flex justify-between items-center py-1 border-b border-blue-50 text-xs">
        <span class="text-gray-700">${sec.section_name}</span>
        <span class="${isOk ? "text-green-600" : "text-red-500"} font-semibold">${isOk ? "✓" : "⚠"} ${available}/${needed}</span>
      </div>`;
  });

  document.getElementById("sectionListPreview").innerHTML = sectionsHtml;
  preview.classList.remove("hidden");
}

// ─── Create manual schedule ───────────────────────────────────────────────────
async function createSchedule() {
  const btn                = document.getElementById("scheduleExamBtn");
  const pattern_id         = document.getElementById("schedulePattern").value;
  const mode               = document.getElementById("scheduleMode").value;
  const availability_type  = document.getElementById("availabilityType").value;
  const start_datetime     = document.getElementById("startDatetime").value || null;
  const end_datetime       = document.getElementById("endDatetime").value   || null;
  const attempt_limit_raw  = document.getElementById("attemptLimit").value;
  const attempt_limit      = attempt_limit_raw ? Math.max(1, parseInt(attempt_limit_raw)) : null;
  const enable_leaderboard = document.getElementById("enableLeaderboard").checked;
  const is_premium         = document.getElementById("isPremium").checked;
  const language           = document.getElementById("scheduleLanguage")?.value || "english";

  if (!pattern_id) { showToast("Please select an exam pattern.", "error"); return; }
  if (availability_type === "scheduled") {
    if (!start_datetime || !end_datetime) { showToast("Please set both start and end date/time.", "error"); return; }
    if (new Date(end_datetime) <= new Date(start_datetime)) { showToast("End date must be after start date.", "error"); return; }
  }

  const { data: existing } = await client
    .from("scheduled_exams")
    .select("id")
    .eq("pattern_id", pattern_id)
    .eq("is_active", true)
    .eq("schedule_type", "manual");

  if (existing && existing.length > 0) {
    if (!confirm("An active manual schedule already exists for this pattern. Create another?")) return;
  }

  btn.disabled = true;
  btn.innerHTML = `<i class="fas fa-spinner fa-spin mr-2"></i> Publishing...`;

  const { error } = await client.from("scheduled_exams").insert([{
    pattern_id, mode, availability_type, start_datetime, end_datetime,
    attempt_limit, enable_leaderboard, is_premium, is_active: true,
    language, schedule_type: "manual",
  }]);

  btn.disabled = false;
  btn.innerHTML = `<i class="fas fa-calendar-check mr-2"></i> Publish Mock Test`;

  if (error) {
    showToast("Error: " + error.message, "error");
  } else {
    showToast("Exam published successfully!", "success");
    resetForm();
    await loadSchedules();
  }
}

// ─── Load scheduled exams list ────────────────────────────────────────────────
async function loadSchedules() {
  const { data, error } = await client
    .from("scheduled_exams")
    .select(`
      id, mode, availability_type, is_active, schedule_type,
      day_of_week, exam_type, launch_date, category_id,
      start_datetime, end_datetime, attempt_limit,
      enable_leaderboard, is_premium, created_at, language,
      exam_patterns ( pattern_name, total_questions, duration_minutes )
    `)
    .order("created_at", { ascending: false });

  const skeleton = document.getElementById("scheduleSkeleton");
  const list     = document.getElementById("scheduleList");
  const countEl  = document.getElementById("scheduleCount");

  skeleton.classList.add("hidden");
  list.classList.remove("hidden");

  if (error) { console.error(error); return; }

  countEl.textContent = data ? `${data.length} total` : "0 total";

  if (!data || data.length === 0) {
    list.innerHTML = `<div class="empty-sched"><i class="fas fa-calendar-times"></i><p>No exams scheduled yet.</p></div>`;
    return;
  }

  // Group daily_auto schedules together
  const dailyAuto = data.filter(s => s.schedule_type === "daily_auto");
  const manual    = data.filter(s => s.schedule_type !== "daily_auto");

  let html = "";

  // Daily auto group header
  if (dailyAuto.length > 0) {
    html += `<div class="text-xs font-bold text-indigo-600 uppercase tracking-wider px-1 mb-2 mt-1">
      <i class="fas fa-calendar-alt mr-1"></i> Daily Auto-Schedule (${dailyAuto.length} days)
    </div>`;
    html += dailyAuto.map(s => renderScheduleCard(s)).join("");
    if (manual.length > 0) {
      html += `<div class="text-xs font-bold text-gray-400 uppercase tracking-wider px-1 mb-2 mt-4">
        <i class="fas fa-calendar mr-1"></i> Manual Schedules
      </div>`;
    }
  }

  html += manual.map(s => renderScheduleCard(s)).join("");
  list.innerHTML = html;
}

function renderScheduleCard(s) {
  const pattern    = s.exam_patterns || {};
  const now        = new Date();
  const isExpired  = s.end_datetime && new Date(s.end_datetime) < now;
  const isDaily    = s.schedule_type === "daily_auto";

  let cardClass  = "inactive-card";
  let dotClass   = "dot-gray";
  let statusText = "Inactive";
  if (s.is_active && !isExpired) { cardClass = "active-card";  dotClass = "dot-green"; statusText = isDaily ? "Daily Live" : "Live"; }
  if (s.is_active && isExpired)  { cardClass = "expired-card"; dotClass = "dot-red";   statusText = "Expired"; }

  const dayLabel = s.day_of_week
    ? s.day_of_week.charAt(0).toUpperCase() + s.day_of_week.slice(1)
    : null;

  const chips = [
    `<span class="info-chip"><i class="fas fa-list-ol"></i> ${pattern.total_questions || "—"} Qs</span>`,
    `<span class="info-chip"><i class="far fa-clock"></i> ${pattern.duration_minutes || "—"} min</span>`,
  ];
  if (isDaily && dayLabel) chips.push(`<span class="info-chip" style="background:#eef2ff;color:#4338ca;border-color:#c7d2fe;"><i class="fas fa-calendar-day mr-1"></i>${dayLabel}</span>`);
  if (s.language === "hindi") chips.push(`<span class="info-chip" style="background:#fff7ed;color:#c2410c;border-color:#fed7aa;">🇮🇳 Hindi</span>`);
  if (s.language === "both")  chips.push(`<span class="info-chip" style="background:#f0fdf4;color:#15803d;border-color:#bbf7d0;">🌐 Bilingual</span>`);
  if (s.is_premium)           chips.push(`<span class="info-chip chip-premium"><i class="fas fa-crown"></i> Premium</span>`);
  if (s.enable_leaderboard)   chips.push(`<span class="info-chip chip-leaderboard"><i class="fas fa-trophy"></i> Leaderboard</span>`);
  if (isDaily && s.launch_date) chips.push(`<span class="info-chip"><i class="fas fa-rocket mr-1"></i>Launch: ${s.launch_date}</span>`);

  return `
    <div class="sched-card ${cardClass}" id="schedule-${s.id}">
      <div class="flex justify-between items-start gap-2 mb-2">
        <div class="flex-1 min-w-0">
          <div class="font-bold text-sm text-gray-800 truncate">
            ${isDaily ? `<span class="text-indigo-500 mr-1"><i class="fas fa-sync-alt text-xs"></i></span>` : ""}
            ${pattern.pattern_name || "—"}
            ${dayLabel ? `<span class="text-xs text-gray-400 font-normal ml-1">· ${dayLabel}</span>` : ""}
          </div>
          <div class="flex items-center gap-2 mt-1">
            <span class="status-dot ${dotClass}"></span>
            <span class="text-xs font-bold text-gray-500">${statusText}</span>
            <span class="text-gray-300">·</span>
            <span class="text-xs text-gray-400 capitalize">${isDaily ? "daily-auto" : s.availability_type}</span>
          </div>
        </div>
        <div class="flex gap-1.5 flex-shrink-0">
          <button onclick="toggleActive('${s.id}', ${s.is_active})"
            class="btn-sm ${s.is_active ? "btn-deactivate" : "btn-activate"}">
            <i class="fas ${s.is_active ? "fa-pause" : "fa-play"}"></i>
            ${s.is_active ? "Deactivate" : "Activate"}
          </button>
          <button onclick="deleteSchedule('${s.id}')" class="btn-sm btn-delete">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
      <div class="flex flex-wrap gap-1.5 mt-2">${chips.join("")}</div>
    </div>`;
}

// ─── Toggle active/inactive ────────────────────────────────────────────────────
window.toggleActive = async function(id, currentState) {
  const { error } = await client.from("scheduled_exams").update({ is_active: !currentState }).eq("id", id);
  if (error) { showToast("Error: " + error.message, "error"); }
  else { showToast(currentState ? "Deactivated." : "Activated!", "success"); await loadSchedules(); }
};

// ─── Delete schedule ──────────────────────────────────────────────────────────
window.deleteSchedule = async function(id) {
  const { data: existingAttempts } = await client.from("attempts").select("id").eq("scheduled_exam_id", id).limit(1);
  const msg = existingAttempts?.length > 0
    ? "⚠️ Students have already attempted this exam.\n\nDeleting will orphan their records. Continue?"
    : "Delete this scheduled exam? Cannot be undone.";
  if (!confirm(msg)) return;

  const { error } = await client.from("scheduled_exams").delete().eq("id", id);
  if (error) { showToast("Error: " + error.message, "error"); }
  else { showToast("Deleted.", "success"); await loadSchedules(); }
};

// ─── Reset form ───────────────────────────────────────────────────────────────
function resetForm() {
  document.getElementById("schedulePattern").value      = "";
  document.getElementById("scheduleMode").value         = "balanced";
  document.getElementById("availabilityType").value     = "practice";
  document.getElementById("startDatetime").value        = "";
  document.getElementById("endDatetime").value          = "";
  document.getElementById("attemptLimit").value         = "";
  document.getElementById("enableLeaderboard").checked  = false;
  document.getElementById("isPremium").checked          = false;
  const schedLang = document.getElementById("scheduleLanguage");
  if (schedLang) schedLang.value = "english";
  document.getElementById("examPreview").classList.add("hidden");
  document.getElementById("datetimeRow").classList.add("hidden");
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function showToast(message, type = "success") {
  const existing = document.getElementById("adminToast");
  if (existing) existing.remove();
  const colors = { success: "bg-green-600", error: "bg-red-600", info: "bg-blue-600" };
  const toast = document.createElement("div");
  toast.id = "adminToast";
  toast.className = `fixed bottom-6 left-1/2 -translate-x-1/2 z-50 ${colors[type] || colors.info} text-white text-sm font-semibold px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-2 transition-all`;
  toast.innerHTML = `<i class="fas ${type === "success" ? "fa-check-circle" : "fa-exclamation-circle"}"></i> ${message}`;
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = "0"; setTimeout(() => toast.remove(), 400); }, 3000);
}