const SUPABASE_URL = "https://sgagswxzsxlgcspwiuoh.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNnYWdzd3h6c3hsZ2NzcHdpdW9oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5NTA1NTIsImV4cCI6MjA2OTUyNjU1Mn0.ZNfk5WNDPkjKcFsRO48rEYk3dhbLYm_m21aZ-wfywo4";

const { createClient } = supabase;
const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── Admin auth check ───────────────────────────────────────────────────────
// ── Admin auth guard — verified against user_profiles table ──
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
  await loadSchedules();
  initUI();
});

// ─── UI init ────────────────────────────────────────────────────────────────
function initUI() {
  // Show/hide datetime fields based on availability type
  const availSelect = document.getElementById("availabilityType");
  const datetimeRow = document.getElementById("datetimeRow");

  function toggleDatetime() {
    if (availSelect.value === "scheduled") {
      datetimeRow.classList.remove("hidden");
    } else {
      datetimeRow.classList.add("hidden");
      document.getElementById("startDatetime").value = "";
      document.getElementById("endDatetime").value = "";
    }
  }
  availSelect.addEventListener("change", toggleDatetime);
  toggleDatetime(); // run on load

  document.getElementById("scheduleExamBtn").addEventListener("click", createSchedule);
  document.getElementById("schedulePattern").addEventListener("change", loadExamPreview);
}

// ─── Load patterns dropdown ─────────────────────────────────────────────────
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

// ─── Exam preview on pattern select ────────────────────────────────────────
async function loadExamPreview() {
  const patternId = document.getElementById("schedulePattern").value;
  const preview   = document.getElementById("examPreview");

  if (!patternId) {
    preview.classList.add("hidden");
    return;
  }

  const { data: pattern } = await client
    .from("exam_patterns")
    .select("pattern_name, total_questions, total_marks, duration_minutes, negative_marking")
    .eq("id", patternId)
    .single();

  const { data: sections } = await client
    .from("pattern_sections")
    .select("section_name, question_count, marks_per_question")
    .eq("pattern_id", patternId);

  // Count available questions per section
  const sectionIds = sections.map(s => s.id);
  let questionCounts = {};
  if (sections.length > 0) {
    const { data: qCounts } = await client
      .from("questions")
      .select("pattern_section_id")
      .eq("is_active", true)
      .in("pattern_section_id", sections.map(s => s.id));

    (qCounts || []).forEach(q => {
      questionCounts[q.pattern_section_id] = (questionCounts[q.pattern_section_id] || 0) + 1;
    });
  }

  // Re-fetch sections with IDs for count lookup
  const { data: sectionsWithId } = await client
    .from("pattern_sections")
    .select("id, section_name, question_count, marks_per_question")
    .eq("pattern_id", patternId);

  document.getElementById("examSummaryStats").innerHTML = `
    <div class="preview-stat">
      <div class="preview-stat-val text-blue-700">${pattern.total_questions}</div>
      <div class="preview-stat-lbl">Questions</div>
    </div>
    <div class="preview-stat">
      <div class="preview-stat-val text-green-700">${pattern.total_marks}</div>
      <div class="preview-stat-lbl">Marks</div>
    </div>
    <div class="preview-stat">
      <div class="preview-stat-val text-amber-700">${pattern.duration_minutes}</div>
      <div class="preview-stat-lbl">Minutes</div>
    </div>
    <div class="preview-stat">
      <div class="preview-stat-val text-red-700">${pattern.negative_marking ?? "—"}</div>
      <div class="preview-stat-lbl">Negative</div>
    </div>
  `;

  let sectionsHtml = `<div class="font-semibold text-gray-700 mt-3 mb-2 text-xs uppercase tracking-wider">Sections</div>`;
  (sectionsWithId || []).forEach(sec => {
    const available  = questionCounts[sec.id] || 0;
    const needed     = sec.question_count;
    const isOk       = available >= needed;
    const statusColor = isOk ? "text-green-600" : "text-red-500";
    const statusIcon  = isOk ? "✓" : "⚠";
    sectionsHtml += `
      <div class="flex justify-between items-center py-1 border-b border-blue-50 text-xs">
        <span class="text-gray-700">${sec.section_name}</span>
        <span class="${statusColor} font-semibold">${statusIcon} ${available}/${needed} questions</span>
      </div>`;
  });

  document.getElementById("sectionListPreview").innerHTML = sectionsHtml;
  preview.classList.remove("hidden");
}

// ─── Create schedule ────────────────────────────────────────────────────────
async function createSchedule() {
  const btn            = document.getElementById("scheduleExamBtn");
  const pattern_id     = document.getElementById("schedulePattern").value;
  const mode           = document.getElementById("scheduleMode").value;
  const availability_type = document.getElementById("availabilityType").value;
  const start_datetime = document.getElementById("startDatetime").value || null;
  const end_datetime   = document.getElementById("endDatetime").value   || null;
  const attempt_limit_raw = document.getElementById("attemptLimit").value;
  const attempt_limit = attempt_limit_raw ? Math.max(1, parseInt(attempt_limit_raw)) : null;
  const enable_leaderboard = document.getElementById("enableLeaderboard").checked;
  const is_premium     = document.getElementById("isPremium").checked;
  const language       = document.getElementById("scheduleLanguage")?.value || "english";

  // ── Validation ──
  if (!pattern_id) {
    showToast("Please select an exam pattern.", "error");
    return;
  }
  if (availability_type === "scheduled") {
    if (!start_datetime || !end_datetime) {
      showToast("Please set both start and end date/time for scheduled exams.", "error");
      return;
    }
    if (new Date(end_datetime) <= new Date(start_datetime)) {
      showToast("End date must be after start date.", "error");
      return;
    }
  }

  // ── Check for duplicate active schedule ──
  const { data: existing } = await client
    .from("scheduled_exams")
    .select("id")
    .eq("pattern_id", pattern_id)
    .eq("is_active", true);

  if (existing && existing.length > 0) {
    const confirm = window.confirm("An active schedule already exists for this pattern. Create another one anyway?");
    if (!confirm) return;
  }

  // ── Loading state ──
  btn.disabled = true;
  btn.innerHTML = `<i class="fas fa-spinner fa-spin mr-2"></i> Publishing...`;

  const { error } = await client.from("scheduled_exams").insert([{
    pattern_id,
    mode,
    availability_type,
    start_datetime,
    end_datetime,
    attempt_limit: attempt_limit,
    enable_leaderboard,
    is_premium,
    is_active: true,
    language,
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

// ─── Load scheduled exams list ───────────────────────────────────────────────
async function loadSchedules() {
  const { data, error } = await client
    .from("scheduled_exams")
    .select(`
      id, mode, availability_type, is_active,
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
    list.innerHTML = `
      <div class="empty-sched">
        <i class="fas fa-calendar-times"></i>
        <p>No exams scheduled yet.<br>Create one using the form.</p>
      </div>`;
    return;
  }

  list.innerHTML = data.map(s => {
    const pattern   = s.exam_patterns || {};
    const now       = new Date();
    const isExpired = s.end_datetime && new Date(s.end_datetime) < now;

    let cardClass   = "inactive-card";
    let dotClass    = "dot-gray";
    let statusText  = "Inactive";
    if (s.is_active && !isExpired) { cardClass = "active-card"; dotClass = "dot-green"; statusText = "Live"; }
    if (s.is_active && isExpired)  { cardClass = "expired-card"; dotClass = "dot-red";  statusText = "Expired"; }

    const startStr = s.start_datetime ? new Date(s.start_datetime).toLocaleString("en-IN", { day:"numeric", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" }) : null;
    const endStr   = s.end_datetime   ? new Date(s.end_datetime).toLocaleString("en-IN",   { day:"numeric", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" }) : null;

    const chips = [
      `<span class="info-chip"><i class="fas fa-list-ol"></i> ${pattern.total_questions || "—"} Qs</span>`,
      `<span class="info-chip"><i class="far fa-clock"></i> ${pattern.duration_minutes || "—"} min</span>`,
      `<span class="info-chip capitalize">${s.mode}</span>`,
    ];
    if (s.language === "hindi") chips.push(`<span class="info-chip" style="background:#fff7ed;color:#c2410c;border-color:#fed7aa;">🇮🇳 Hindi</span>`);
    if (s.language === "both")  chips.push(`<span class="info-chip" style="background:#f0fdf4;color:#15803d;border-color:#bbf7d0;">🌐 Bilingual</span>`);
    if (s.is_premium)         chips.push(`<span class="info-chip chip-premium"><i class="fas fa-crown"></i> Premium</span>`);
    if (s.enable_leaderboard) chips.push(`<span class="info-chip chip-leaderboard"><i class="fas fa-trophy"></i> Leaderboard</span>`);
    if (s.attempt_limit)      chips.push(`<span class="info-chip">Max ${s.attempt_limit} attempts</span>`);

    return `
      <div class="sched-card ${cardClass}" id="schedule-${s.id}">
        <div class="flex justify-between items-start gap-2 mb-2">
          <div class="flex-1 min-w-0">
            <div class="font-bold text-sm text-gray-800 truncate">${pattern.pattern_name || "—"}</div>
            <div class="flex items-center gap-2 mt-1">
              <span class="status-dot ${dotClass}"></span>
              <span class="text-xs font-bold text-gray-500">${statusText}</span>
              <span class="text-gray-300">·</span>
              <span class="text-xs text-gray-400 capitalize">${s.availability_type}</span>
            </div>
          </div>
          <div class="flex gap-1.5 flex-shrink-0">
            <button onclick="toggleActive('${s.id}', ${s.is_active})"
              class="btn-sm ${s.is_active ? 'btn-deactivate' : 'btn-activate'}">
              <i class="fas ${s.is_active ? 'fa-pause' : 'fa-play'}"></i>
              ${s.is_active ? 'Deactivate' : 'Activate'}
            </button>
            <button onclick="deleteSchedule('${s.id}')" class="btn-sm btn-delete">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>

        ${startStr || endStr ? `
        <div class="text-xs text-gray-400 grid grid-cols-2 gap-2 mb-2 bg-gray-50 rounded-lg p-2">
          ${startStr ? `<div><i class="fas fa-play-circle text-green-400 mr-1"></i>${startStr}</div>` : ""}
          ${endStr   ? `<div><i class="fas fa-stop-circle text-red-400 mr-1"></i>${endStr}</div>`   : ""}
        </div>` : ""}

        <div class="flex flex-wrap gap-1.5 mt-2">${chips.join("")}</div>
      </div>`;
  }).join("");
}

// ─── Toggle active/inactive ──────────────────────────────────────────────────
window.toggleActive = async function(id, currentState) {
  const { error } = await client
    .from("scheduled_exams")
    .update({ is_active: !currentState })
    .eq("id", id);

  if (error) {
    showToast("Error: " + error.message, "error");
  } else {
    showToast(currentState ? "Exam deactivated." : "Exam activated!", "success");
    await loadSchedules();
  }
};

// ─── Delete schedule ─────────────────────────────────────────────────────────
window.deleteSchedule = async function(id) {
  // Check if any attempts exist for this scheduled exam
  const { data: existingAttempts } = await client
    .from("attempts")
    .select("id")
    .eq("scheduled_exam_id", id)
    .limit(1);

  if (existingAttempts && existingAttempts.length > 0) {
    const confirmed = confirm(
      "⚠️ Students have already attempted this exam.\n\n" +
      "Deleting it will orphan their attempt records (results will still exist but exam info will be lost).\n\n" +
      "Are you sure you want to delete it?"
    );
    if (!confirmed) return;
  } else {
    if (!confirm("Delete this scheduled exam? This cannot be undone.")) return;
  }

  const { error } = await client
    .from("scheduled_exams")
    .delete()
    .eq("id", id);

  if (error) {
    showToast("Error: " + error.message, "error");
  } else {
    showToast("Schedule deleted.", "success");
    await loadSchedules();
  }
};

// ─── Reset form ──────────────────────────────────────────────────────────────
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

// ─── Toast notification ──────────────────────────────────────────────────────
function showToast(message, type = "success") {
  const existing = document.getElementById("adminToast");
  if (existing) existing.remove();

  const colors = {
    success: "bg-green-600",
    error:   "bg-red-600",
    info:    "bg-blue-600",
  };

  const toast = document.createElement("div");
  toast.id = "adminToast";
  toast.className = `fixed bottom-6 left-1/2 -translate-x-1/2 z-50 ${colors[type] || colors.info} text-white text-sm font-semibold px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-2 transition-all`;
  toast.innerHTML = `<i class="fas ${type === "success" ? "fa-check-circle" : "fa-exclamation-circle"}"></i> ${message}`;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 400);
  }, 3000);
}