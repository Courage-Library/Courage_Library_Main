const SUPABASE_URL = "https://sgagswxzsxlgcspwiuoh.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNnYWdzd3h6c3hsZ2NzcHdpdW9oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5NTA1NTIsImV4cCI6MjA2OTUyNjU1Mn0.ZNfk5WNDPkjKcFsRO48rEYk3dhbLYm_m21aZ-wfywo4";

const { createClient } = supabase;
const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── Daily Schedule Config ───────────────────────────────────────────────────
const PATTERN_IDS = {
  daily:     'aaaaaaaa-0001-0001-0001-000000000001',
  mixed:     'aaaaaaaa-0002-0002-0002-000000000002',
  full_mock: 'aaaaaaaa-0003-0003-0003-000000000003',

  upp_daily_hindi:     '8f5a2ab1-e495-48c4-9bed-b2d6017666f2',
  upp_daily_gk:        '03e5999a-0ab6-4b7c-9062-8371f8cac94c',
  upp_daily_numerical: 'f58821b2-603d-4b90-af86-0b729e845080',
  upp_daily_mental:    '53ecd881-bca5-49b3-ad11-fb094454cbea',
  upp_friday:          '6e3f3071-f907-433b-92f2-2fff7103fe43',
  upp_mixed:           'b1d79e0e-1604-468f-b4b4-46c73c0f079b',
  upp_mock:            'c6a53484-9bdc-4144-a00f-9492ce0b16ea',

  agni_daily:   '528e5f5b-1478-4f36-ad63-cd370de07f7a',
  agni_friday:  'a99448c3-be67-47e9-ab47-ff2663f8ded7',
  agni_mixed:   '27cf51e8-a9a7-42b2-bbeb-aab7aeadf84b',
  agni_mock:    'f1b63d19-ea80-4687-a659-f2855357c310',

  cgl_daily:   "2f436036-dbc7-46e7-80b7-1053a90ffb9d",
  cgl_friday:  "f8593b82-34ee-4490-9a26-1acf91a0e450",
  cgl_mixed:   "8288f372-e72a-4165-85f7-597b138f6859",
  cgl_mock:    "81c617a0-de2c-4e77-9f41-837565e44b1b",
};

const DAILY_SCHEDULE = [
  { day: "monday",    label: "Monday",    subject: "General Awareness",     exam_type: "daily_sectional", pattern_key: "daily",     active_section: "General Awareness",     questions: 20,  duration: 20, language: "both" },
  { day: "tuesday",   label: "Tuesday",   subject: "Reasoning",             exam_type: "daily_sectional", pattern_key: "daily",     active_section: "Reasoning",             questions: 20,  duration: 20, language: "both" },
  { day: "wednesday", label: "Wednesday", subject: "Quantitative Aptitude", exam_type: "daily_sectional", pattern_key: "daily",     active_section: "Quantitative Aptitude", questions: 20,  duration: 20, language: "both" },
  { day: "thursday",  label: "Thursday",  subject: "Grammar",               exam_type: "daily_sectional", pattern_key: "daily",     active_section: "Grammar",               questions: 20,  duration: 20, language: "english" },
  { day: "friday",    label: "Friday",    subject: "Hindi",                 exam_type: "daily_sectional", pattern_key: "daily",     active_section: "Hindi",                 questions: 20,  duration: 20, language: "hindi" },
  { day: "saturday",  label: "Saturday",  subject: "Mixed Sectional",       exam_type: "mixed",           pattern_key: "mixed",     active_section: null,                    questions: 50,  duration: 30, language: "both" },
  { day: "sunday",    label: "Sunday",    subject: "Full Mock Test",        exam_type: "full_mock",       pattern_key: "full_mock", active_section: null,                    questions: 100, duration: 60, language: "both" },
];

const UPP_DAILY_SCHEDULE = [
  { day: "monday",    label: "Monday",    subject: "Hindi",                       exam_type: "daily_sectional", pattern_key: "upp_daily_hindi",     active_section: "Hindi",             questions: 37,  duration: 30,  language: "hindi" },
  { day: "tuesday",   label: "Tuesday",   subject: "General Knowledge",           exam_type: "daily_sectional", pattern_key: "upp_daily_gk",        active_section: "General Knowledge", questions: 38,  duration: 30,  language: "both"  },
  { day: "wednesday", label: "Wednesday", subject: "Numerical Ability",           exam_type: "daily_sectional", pattern_key: "upp_daily_numerical", active_section: "Numerical Ability", questions: 25,  duration: 25,  language: "both"  },
  { day: "thursday",  label: "Thursday",  subject: "Mental Aptitude",             exam_type: "daily_sectional", pattern_key: "upp_daily_mental",    active_section: "Mental Aptitude",   questions: 50,  duration: 40,  language: "both"  },
  { day: "friday",    label: "Friday",    subject: "Mental Aptitude + Numerical", exam_type: "mixed",           pattern_key: "upp_friday",          active_section: null,                questions: 50,  duration: 40,  language: "both"  },
  { day: "saturday",  label: "Saturday",  subject: "Mixed — All 4 Subjects",      exam_type: "mixed",           pattern_key: "upp_mixed",           active_section: null,                questions: 75,  duration: 60,  language: "both"  },
  { day: "sunday",    label: "Sunday",    subject: "Full Mock Test",              exam_type: "full_mock",       pattern_key: "upp_mock",            active_section: null,                questions: 150, duration: 120, language: "both"  },
];

const AGNIVEER_DAILY_SCHEDULE = [
  { day: "monday",    label: "Monday",    subject: "General Knowledge", exam_type: "daily_sectional", pattern_key: "agni_daily",  active_section: "General Knowledge", questions: 15, duration: 15, language: "both" },
  { day: "tuesday",   label: "Tuesday",   subject: "General Science",   exam_type: "daily_sectional", pattern_key: "agni_daily",  active_section: "General Science",   questions: 15, duration: 15, language: "both" },
  { day: "wednesday", label: "Wednesday", subject: "Maths",             exam_type: "daily_sectional", pattern_key: "agni_daily",  active_section: "Maths",             questions: 15, duration: 15, language: "both" },
  { day: "thursday",  label: "Thursday",  subject: "Reasoning",         exam_type: "daily_sectional", pattern_key: "agni_daily",  active_section: "Reasoning",         questions: 5,  duration: 10, language: "both" },
  { day: "friday",    label: "Friday",    subject: "Maths + Reasoning", exam_type: "mixed",           pattern_key: "agni_friday", active_section: null,                questions: 25, duration: 25, language: "both" },
  { day: "saturday",  label: "Saturday",  subject: "Mixed — All 4",     exam_type: "mixed",           pattern_key: "agni_mixed",  active_section: null,                questions: 35, duration: 35, language: "both" },
  { day: "sunday",    label: "Sunday",    subject: "Full Mock Test",    exam_type: "full_mock",       pattern_key: "agni_mock",   active_section: null,                questions: 50, duration: 60, language: "both" },
];

const CGL_DAILY_SCHEDULE = [
  {
    day: "monday",
    label: "Monday",
    subject: "Quantitative Aptitude",
    exam_type: "daily_sectional",
    pattern_key: "cgl_daily",
    active_section: "Quantitative Aptitude",
    questions: 25,
    duration: 15,
    language: "both"
  },
  {
    day: "tuesday",
    label: "Tuesday",
    subject: "Reasoning",
    exam_type: "daily_sectional",
    pattern_key: "cgl_daily",
    active_section: "Reasoning",
    questions: 25,
    duration: 15,
    language: "both"
  },
  {
    day: "wednesday",
    label: "Wednesday",
    subject: "English",
    exam_type: "daily_sectional",
    pattern_key: "cgl_daily",
    active_section: "English",
    questions: 25,
    duration: 15,
    language: "both"
  },
  {
    day: "thursday",
    label: "Thursday",
    subject: "General Awareness",
    exam_type: "daily_sectional",
    pattern_key: "cgl_daily",
    active_section: "General Awareness",
    questions: 25,
    duration: 15,
    language: "both"
  },
  {
    day: "friday",
    label: "Friday",
    subject: "Quant + Reasoning",
    exam_type: "mixed",
    pattern_key: "cgl_friday",
    active_section: null,
    questions: 40,
    duration: 25,
    language: "both"
  },
  {
    day: "saturday",
    label: "Saturday",
    subject: "English + General Awareness",
    exam_type: "mixed",
    pattern_key: "cgl_mixed",
    active_section: null,
    questions: 40,
    duration: 25,
    language: "both"
  },
  {
    day: "sunday",
    label: "Sunday",
    subject: "Full Mock Test",
    exam_type: "full_mock",
    pattern_key: "cgl_mock",
    active_section: null,
    questions: 100,
    duration: 60,
    language: "both"
  }
];

// Returns the correct schedule config based on selected category name
async function getScheduleConfig(categoryId) {
  const { data } = await client.from("exam_categories").select("name").eq("id", categoryId).single();
  const name = (data?.name || "").toLowerCase();
  if (name.includes("ssc cgl")) return CGL_DAILY_SCHEDULE;
  if (name.includes("up police") || name.includes("upp")) return UPP_DAILY_SCHEDULE;
  if (name.includes("agniveer") || name.includes("army")) return AGNIVEER_DAILY_SCHEDULE;
  return DAILY_SCHEDULE;
}

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

// ── Expose reload for coaching context switcher ──────────────────────────────
// When admin switches coaching context, this re-fetches the exam list
window.reloadPageData = function () {
  loadSchedules();
};

// ─── UI init ─────────────────────────────────────────────────────────────────
function initUI() {
  const availSelect = document.getElementById("availabilityType");
  const datetimeRow = document.getElementById("datetimeRow");

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

  document.getElementById("setupDailyBtn")?.addEventListener("click", setupDailySchedule);
  document.getElementById("dailyCategory")?.addEventListener("change", loadDailyPreview);
}

// ─── Load categories dropdown (for daily schedule) ───────────────────────────
// NOTE: Daily schedule categories are NOT coaching-scoped intentionally —
// daily schedules are only for Courage Library's own platform.
// Coaching exams use the manual schedule section below.
async function loadCategories() {
  const { data, error } = await client
    .from("exam_categories")
    .select("id, name")
    .is("coaching_id", null)        // ← only own platform categories
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

  const { data: existing } = await client
    .from("scheduled_exams")
    .select("id, day_of_week, exam_type, is_active")
    .eq("category_id", categoryId)
    .eq("schedule_type", "daily_auto");

  const existingMap = {};
  (existing || []).forEach(e => { existingMap[e.day_of_week] = e; });

  let rows = "";
  const scheduleConfig = await getScheduleConfig(categoryId);
  scheduleConfig.forEach(d => {
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
async function setupDailySchedule() {
  const categoryId = document.getElementById("dailyCategory")?.value;
  const launchDate = document.getElementById("dailyLaunchDate")?.value;
  const btn        = document.getElementById("setupDailyBtn");

  if (!categoryId) { showToast("Select a category first.", "error"); return; }
  if (!launchDate) { showToast("Set a launch date.", "error"); return; }

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

    await client
      .from("scheduled_exams")
      .delete()
      .eq("category_id", categoryId)
      .eq("schedule_type", "daily_auto");
  }

  btn.disabled = true;
  btn.innerHTML = `<i class="fas fa-spinner fa-spin mr-2"></i> Creating...`;

  try {
    const scheduleConfig = await getScheduleConfig(categoryId);
    const rows = scheduleConfig.map(d => ({
      pattern_id:         PATTERN_IDS[d.pattern_key],
      category_id:        categoryId,
      schedule_type:      "daily_auto",
      day_of_week:        d.day,
      exam_type:          d.exam_type,
      active_section:     d.active_section,
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
      // Daily auto schedules are always for own platform — no coaching_id
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

  if (sectionMap[lower]) return sectionMap[lower];

  for (const [key, id] of Object.entries(sectionMap)) {
    if (key.includes(lower) || lower.includes(key)) return id;
  }

  const keywords = {
    "general awareness":     ["ga", "gk", "general", "awareness", "knowledge"],
    "reasoning":             ["reasoning", "intelligence", "logical"],
    "quantitative aptitude": ["maths", "math", "quantitative", "aptitude", "numerical"],
    "grammar":               ["english", "grammar", "language"],
    "hindi":                 ["hindi", "हिंदी"],
    "mixed sectional":       ["mixed", "sectional"],
    "full mock test":        ["full", "mock", "complete"],
  };

  const kws = keywords[lower] || [];
  for (const kw of kws) {
    for (const [key, id] of Object.entries(sectionMap)) {
      if (key.includes(kw)) return id;
    }
  }

  return Object.values(sectionMap)[0];
}

// ─── Load patterns dropdown ───────────────────────────────────────────────────
// For the manual schedule form — shows patterns scoped to coaching context
async function loadPatterns() {
  const coaching_id = window.getAdminCoachingId ? window.getAdminCoachingId() : null;

  let query = client
    .from("exam_patterns")
    .select("id, pattern_name, total_questions, duration_minutes, exam_categories(name)")
    .order("pattern_name");

  if (coaching_id) {
    query = query.eq("coaching_id", coaching_id);
  } else {
    query = query.is("coaching_id", null);
  }

  const { data, error } = await query;
  if (error) { console.error(error); return; }

  const select = document.getElementById("schedulePattern");
  select.innerHTML = `<option value="">— Select Exam Pattern —</option>`;
  (data || []).forEach(p => {
    const label = p.exam_categories?.name
      ? `${p.exam_categories.name} — ${p.pattern_name}`
      : p.pattern_name;
    select.innerHTML += `<option value="${p.id}" data-questions="${p.total_questions}" data-duration="${p.duration_minutes}">${label}</option>`;
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
    const available = questionCounts[sec.id] || 0;
    const needed    = sec.question_count;
    const isOk      = available >= needed;
    sectionsHtml += `
      <div class="flex justify-between items-center py-1 border-b border-blue-50 text-xs">
        <span class="text-gray-700">${sec.section_name}</span>
        <span class="${isOk ? "text-green-600" : "text-red-500"} font-semibold">${isOk ? "✓" : "⚠"} ${available}/${needed}</span>
      </div>`;
  });

  document.getElementById("sectionListPreview").innerHTML = sectionsHtml;
  preview.classList.remove("hidden");
}

// ─── Create manual schedule — UPDATED with coaching context ──────────────────
async function createSchedule() {
  const btn               = document.getElementById("scheduleExamBtn");
  const pattern_id        = document.getElementById("schedulePattern").value;
  const mode              = document.getElementById("scheduleMode").value;
  const availability_type = document.getElementById("availabilityType").value;
  const start_datetime    = document.getElementById("startDatetime").value || null;
  const end_datetime      = document.getElementById("endDatetime").value   || null;
  const attempt_limit_raw = document.getElementById("attemptLimit").value;
  const attempt_limit     = attempt_limit_raw ? Math.max(1, parseInt(attempt_limit_raw)) : null;
  const enable_leaderboard = document.getElementById("enableLeaderboard").checked;
  const is_premium        = document.getElementById("isPremium").checked;
  const language          = document.getElementById("scheduleLanguage")?.value || "english";

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

  // ── Read coaching context ──────────────────────────────────────────────────
  const coaching_id = window.getAdminCoachingId ? window.getAdminCoachingId() : null;

  const insertPayload = {
    pattern_id, mode, availability_type, start_datetime, end_datetime,
    attempt_limit, enable_leaderboard, is_premium, is_active: true,
    language, schedule_type: "manual",
  };

  // Only attach coaching_id if a coaching center is selected
  if (coaching_id) insertPayload.coaching_id = coaching_id;

  const { error } = await client.from("scheduled_exams").insert([insertPayload]);

  btn.disabled = false;
  btn.innerHTML = `<i class="fas fa-calendar-check mr-2"></i> Publish Mock Test`;

  if (error) {
    showToast("Error: " + error.message, "error");
  } else {
    const contextLabel = coaching_id ? " (for coaching)" : "";
    showToast(`Exam published successfully${contextLabel}!`, "success");
    resetForm();
    await loadSchedules();
  }
}

// ─── Load scheduled exams list — UPDATED with coaching context ───────────────
async function loadSchedules() {
  const coaching_id = window.getAdminCoachingId ? window.getAdminCoachingId() : null;

  let query = client
    .from("scheduled_exams")
    .select(`
      id, mode, availability_type, is_active, schedule_type,
      day_of_week, exam_type, launch_date, category_id,
      start_datetime, end_datetime, attempt_limit,
      enable_leaderboard, is_premium, created_at, language, coaching_id,
      exam_patterns ( pattern_name, total_questions, duration_minutes )
    `)
    .order("created_at", { ascending: false });

  // ── Scope by coaching context ──────────────────────────────────────────────
  if (coaching_id) {
    // Coaching selected — show only that coaching's exams
    query = query.eq("coaching_id", coaching_id);
  } else {
    // No coaching selected — show only own platform exams (coaching_id IS NULL)
    query = query.is("coaching_id", null);
  }

  const { data, error } = await query;

  const skeleton = document.getElementById("scheduleSkeleton");
  const list     = document.getElementById("scheduleList");
  const countEl  = document.getElementById("scheduleCount");

  skeleton.classList.add("hidden");
  list.classList.remove("hidden");

  if (error) { console.error(error); return; }

  countEl.textContent = data ? `${data.length} total` : "0 total";

  if (!data || data.length === 0) {
    const contextLabel = coaching_id ? "this coaching center" : "Courage Library platform";
    list.innerHTML = `<div class="empty-sched"><i class="fas fa-calendar-times"></i><p>No exams scheduled for ${contextLabel} yet.</p></div>`;
    return;
  }

  // Group daily_auto schedules together
  const dailyAuto = data.filter(s => s.schedule_type === "daily_auto");
  const manual    = data.filter(s => s.schedule_type !== "daily_auto");

  let html = "";

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
  const pattern   = s.exam_patterns || {};
  const now       = new Date();
  const isExpired = s.end_datetime && new Date(s.end_datetime) < now;
  const isDaily   = s.schedule_type === "daily_auto";
  const isB2B     = !!s.coaching_id;

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
  if (isB2B)               chips.push(`<span class="info-chip" style="background:#eef2ff;color:#6366f1;border-color:#c7d2fe;"><i class="fas fa-school mr-1"></i>B2B</span>`);
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

// ─── Toggle active/inactive ───────────────────────────────────────────────────
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
  document.getElementById("schedulePattern").value     = "";
  document.getElementById("scheduleMode").value        = "balanced";
  document.getElementById("availabilityType").value    = "practice";
  document.getElementById("startDatetime").value       = "";
  document.getElementById("endDatetime").value         = "";
  document.getElementById("attemptLimit").value        = "";
  document.getElementById("enableLeaderboard").checked = false;
  document.getElementById("isPremium").checked         = false;
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