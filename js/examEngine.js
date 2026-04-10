const SUPABASE_URL = "https://sgagswxzsxlgcspwiuoh.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNnYWdzd3h6c3hsZ2NzcHdpdW9oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5NTA1NTIsImV4cCI6MjA2OTUyNjU1Mn0.ZNfk5WNDPkjKcFsRO48rEYk3dhbLYm_m21aZ-wfywo4";

const { createClient } = supabase;
const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let isSubmitting = false;

window.addEventListener("beforeunload", (e) => {
  if (!isSubmitting && durationSeconds && durationSeconds > 0) {
    e.preventDefault();
    e.returnValue = "";
  }
});

let attemptId;
let questions = [];
let currentIndex = 0;
let timerInterval;
let durationSeconds;
let savedAnswers = {};
let visitedQuestions = {};
let markedQuestions = {};
let examStartedAt;
let examDuration;
let examStarted = false;
let fullscreenLockActive = false;
let securityActive = false;

let submitCalled = false;
let examLanguage = "english";

document.addEventListener("DOMContentLoaded", async () => {
  const params = new URLSearchParams(window.location.search);
  attemptId = params.get("attempt");

  if (!attemptId) {
    showAlert("Invalid exam attempt detected. Redirecting to dashboard.", "error");
    setTimeout(() => { window.location.href = "/mock/dashboard.html"; }, 2000);
    return;
  }
});

async function loadExam() {
  // ── Auth + ownership guard ──────────────────────────────────────────────────
  // Verify the current user is logged in AND owns this attempt before loading
  const { data: { user } } = await client.auth.getUser();
  if (!user) {
    document.getElementById("examPageLoader")?.remove();
    showAlert("Please log in to access this exam.", "error");
    setTimeout(() => { window.location.href = "/index.html?action=login"; }, 2000);
    return;
  }

  const { data: attemptCheck, error: checkError } = await client
    .from("attempts")
    .select("submitted_at, user_id")
    .eq("id", attemptId)
    .single();

  if (checkError || !attemptCheck) {
    document.getElementById("examPageLoader")?.remove();
    showAlert("Exam not found. Redirecting to dashboard.", "error");
    setTimeout(() => { window.location.href = "/mock/dashboard.html"; }, 2000);
    return;
  }

  // Ownership check — prevent users from accessing other students' attempts
  if (attemptCheck.user_id !== user.id) {
    document.getElementById("examPageLoader")?.remove();
    showAlert("Access denied. This exam does not belong to your account.", "error");
    setTimeout(() => { window.location.href = "/mock/dashboard.html"; }, 2500);
    return;
  }

  if (attemptCheck.submitted_at) {
    showAlert("This exam is already submitted. Redirecting to your result…", "success");
    setTimeout(() => { window.location.href = "/mock/result.html?attempt=" + attemptId; }, 1800);
    return;
  }

  const { data: attempt, error } = await client
    .from("attempts")
    .select(`
      id,
      started_at,
      scheduled_exams(
        language,
        exam_patterns(
          pattern_name,
          duration_minutes
        )
      )
    `)
    .eq("id", attemptId)
    .single();

  if (error) { console.error("Exam load error:", error); return; }

  const pattern = attempt.scheduled_exams.exam_patterns;
  document.getElementById("examTitle").innerText = pattern.pattern_name;

  const examLangConfig = attempt.scheduled_exams.language || "english";

  // ── Check if language was already chosen on dashboard ──
  const preChosenLang = sessionStorage.getItem("chosenExamLanguage");
  if (preChosenLang) {
    examLanguage = preChosenLang;
    sessionStorage.removeItem("chosenExamLanguage"); // clear after use
  } else {
    examLanguage = examLangConfig === "both" ? null : examLangConfig;
  }

  const rulesTitleEl = document.getElementById("rulesExamTitle");
  if (rulesTitleEl) {
    rulesTitleEl.textContent = pattern.pattern_name + " \u2013 Instructions";
  }

  let startTime;
  if (!attempt.started_at) {
    startTime = Date.now();
    await client.from("attempts").update({ started_at: new Date(startTime) }).eq("id", attemptId);
  } else {
    startTime = new Date(attempt.started_at).getTime();
  }

  examStartedAt = startTime;
  examDuration = pattern.duration_minutes * 60;
  const elapsed = Math.floor((Date.now() - examStartedAt) / 1000);
  durationSeconds = examDuration - elapsed;
  if (durationSeconds <= 0 || isNaN(durationSeconds)) durationSeconds = examDuration;

  await loadSavedAnswers();

  // Language already chosen on dashboard via sessionStorage
  if (!examLanguage) examLanguage = examLangConfig === "both" ? "hindi" : examLangConfig;
  loadQuestionsAndStart();

  generateWatermark();
  setInterval(generateWatermark, 5000);
}

async function loadQuestionsAndStart() {
  // Show skeleton loader while questions load
  const container = document.getElementById("questionContainer");
  if (container) {
    container.innerHTML = `
      <div id="questionSkeleton" style="animation:pulse 1.5s ease-in-out infinite">
        <div style="height:12px;background:#e2e8f0;border-radius:6px;width:30%;margin-bottom:16px"></div>
        <div style="height:18px;background:#e2e8f0;border-radius:6px;width:90%;margin-bottom:8px"></div>
        <div style="height:18px;background:#e2e8f0;border-radius:6px;width:75%;margin-bottom:24px"></div>
        <div style="display:flex;flex-direction:column;gap:10px">
          ${[...Array(4)].map((_,i) => `<div style="height:52px;background:#e2e8f0;border-radius:12px"></div>`).join('')}
        </div>
      </div>
      <style>@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}</style>
    `;
  }
  await loadQuestions();
  showQuestion(0);
  setTimeout(() => { startTimer(); }, 100);
}

function generateWatermark() {
  const container = document.getElementById("examWatermark");
  if (!container || !attemptId) return;
  const sessionCode = attemptId.slice(-4);
  const now = new Date().toLocaleTimeString();
  const text = `Courage Library\nSession ${sessionCode}\n${now}`;
  container.innerHTML = "";
  for (let i = 0; i < 9; i++) {
    const item = document.createElement("div");
    item.className = "watermarkItem";
    item.innerText = text;
    container.appendChild(item);
  }
}

async function loadQuestions() {
  const { data } = await client
    .from("attempt_questions")
    .select(`
      question_order,
      questions(
        id,
        question_text,
        options,
        options_type,
        question_image,
        pyq_year,
        pyq_source,
        language,
        pattern_section_id,
        pattern_sections(
          id,
          section_name
        )
      )
    `)
    .eq("attempt_id", attemptId)
    .order("question_order", { ascending: true });

  const allQuestions = data.map((d) => ({
    ...d.questions,
    section: d.questions.pattern_sections.section_name,
  }));

  // Questions are already language-filtered by startExam when creating the attempt
  // We only filter here to ensure correct font rendering per language
  // Don't re-filter — trust the stored attempt_questions
  questions = allQuestions;

  const uniqueSections = [...new Set(questions.map((q) => q.section))];
  renderSections(uniqueSections);
}

function sanitizeText(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function showQuestion(index) {
  if (!questions[index]) return;
  currentIndex = index;

  const q = questions[index];
  visitedQuestions[q.id] = true;
  updatePalette();

  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");
  if (prevBtn) prevBtn.disabled = index === 0;
  if (nextBtn) nextBtn.disabled = index === questions.length - 1;

  const currentSection = q.section;
  document.querySelectorAll("#sectionTabs button").forEach((btn) => {
    btn.classList.toggle("section-tab-active", btn.innerText === currentSection);
  });

  const container = document.getElementById("questionContainer");

  // Apply Hindi font
  container.style.fontFamily = examLanguage === "hindi"
    ? "'Noto Sans Devanagari', 'Mangal', sans-serif"
    : "";

  // ── PYQ badge ──
  const pyqBadge = q.pyq_year
    ? `<span class="inline-flex items-center gap-1.5 text-xs bg-amber-50 border border-amber-200 text-amber-700 px-2.5 py-1 rounded-lg font-medium ml-auto flex-shrink-0">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/>
        </svg>
        PYQ${q.pyq_source ? " · " + q.pyq_source : ""} ${q.pyq_year}
      </span>`
    : `<span class="text-xs text-gray-400 ml-auto bg-gray-100 px-2.5 py-1 rounded-lg tabular-nums flex-shrink-0">${index + 1} / ${questions.length}</span>`;

  // ── Question image ──
  const questionImageHtml = q.question_image
    ? `<div class="my-4 flex justify-center">
        <img src="${q.question_image}" alt="Question ${index + 1} figure"
             class="max-w-full max-h-64 rounded-xl border border-gray-200 shadow-sm object-contain cursor-zoom-in"
             onclick="openImageZoom('${q.question_image}')" />
        <p class="text-xs text-gray-400 text-center mt-1">Click image to enlarge</p>
       </div>`
    : "";

  // ── Options ──
  const optionsType = q.options_type || "text";
  const optionsHtml = Object.entries(q.options).map(([key, value]) => {
    const isChecked = savedAnswers[q.id] === key;
    let optionContent = "";

    if (optionsType === "image") {
      optionContent = `
        <div class="flex-1 flex items-center justify-center py-1">
          <img src="${value}" alt="Option ${key} figure for Question ${index + 1}"
               class="max-h-20 max-w-full rounded-lg object-contain cursor-zoom-in"
               onclick="openImageZoom('${value}')" />
        </div>`;
    } else if (optionsType === "mixed") {
      const optText  = typeof value === "object" && value.text  ? value.text  : null;
      const optImage = typeof value === "object" && value.image ? value.image : null;
      optionContent = `
        <div class="flex-1 flex flex-col gap-1.5 justify-center">
          ${optImage ? `<img src="${optImage}" alt="Option ${key}" class="max-h-16 max-w-full rounded-lg object-contain cursor-zoom-in" onclick="openImageZoom('${optImage}')" />` : ""}
          ${optText  ? `<span class="text-gray-700 text-sm sm:text-base leading-snug">${optText}</span>` : ""}
        </div>`;
    } else {
      optionContent = `<span class="text-gray-700 text-sm sm:text-base leading-snug flex-1">${sanitizeText(value)}</span>`;
    }

    return `
      <label class="flex items-center gap-3 p-3.5 border-2 rounded-xl cursor-pointer transition-all select-none
        ${isChecked ? "bg-blue-50 border-blue-500 shadow-sm" : "border-gray-200 hover:border-blue-300 hover:bg-blue-50/40"}">
        <span class="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 transition-all
          ${isChecked ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600"}">
          ${key}
        </span>
        <input type="radio" name="option" value="${key}" class="hidden"
          ${isChecked ? "checked" : ""}
          onchange="saveAnswer('${q.id}', '${key}')">
        ${optionContent}
      </label>`;
  }).join("");

  // ── FIXED: Q number small + gray, question text large + prominent ──
  container.innerHTML = `
    <div class="mb-5">
      <div class="flex items-center gap-2 mb-3 flex-wrap">
        <span class="text-xs font-medium text-blue-600 bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-lg">${q.section}</span>
        ${pyqBadge}
      </div>
      <div class="flex items-start gap-2">
        <span style="font-size:.72rem;font-weight:700;color:#94a3b8;background:#f1f5f9;padding:2px 7px;border-radius:6px;flex-shrink:0;margin-top:3px;letter-spacing:.02em">Q${index + 1}</span>
        <p style="font-size:1rem;font-weight:500;color:#1e293b;line-height:1.65;flex:1;margin:0">${sanitizeText(q.question_text)}</p>
        <button id="reportBtn" title="Report Issue"
          style="flex-shrink:0;width:26px;height:26px;border-radius:7px;background:#fff5f5;border:1px solid #fecaca;color:#dc2626;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:.65rem;margin-top:2px;transition:all .15s"
          onmouseover="this.style.background='#fee2e2'" onmouseout="this.style.background='#fff5f5'">
          <i class="fas fa-flag"></i>
        </button>
      </div>
      ${questionImageHtml}
    </div>
    <div class="space-y-2.5">
      ${optionsHtml}
    </div>
  `;

  // Attach report button listener after DOM is updated
  const reportBtn = document.getElementById("reportBtn");
  if (reportBtn) {
    reportBtn.addEventListener("click", () => window.openReportIssue());
  }
}

function debounce(fn, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

// ── Offline Queue Helpers ─────────────────────────────────────────────────────
// Every answer is stored in localStorage under a key specific to this attempt.
// If Supabase save fails (offline), the answer stays in the queue.
// When internet returns, the queue is flushed automatically.

function _offlineQueueKey() {
  return `cl_answer_queue_${attemptId}`;
}

function _addToOfflineQueue(questionId, selected) {
  try {
    const raw = localStorage.getItem(_offlineQueueKey());
    const queue = raw ? JSON.parse(raw) : {};
    queue[questionId] = selected;
    localStorage.setItem(_offlineQueueKey(), JSON.stringify(queue));
  } catch (e) {
    // localStorage full or unavailable — silently ignore, memory still has it
  }
}

function _removeFromOfflineQueue(questionId) {
  try {
    const raw = localStorage.getItem(_offlineQueueKey());
    if (!raw) return;
    const queue = JSON.parse(raw);
    delete queue[questionId];
    if (Object.keys(queue).length === 0) {
      localStorage.removeItem(_offlineQueueKey());
    } else {
      localStorage.setItem(_offlineQueueKey(), JSON.stringify(queue));
    }
  } catch (e) {}
}

function _getOfflineQueue() {
  try {
    const raw = localStorage.getItem(_offlineQueueKey());
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function _clearOfflineQueue() {
  try {
    localStorage.removeItem(_offlineQueueKey());
  } catch (e) {}
}

// Flush all pending offline answers to Supabase
// Called when internet comes back OR before submit
async function flushOfflineQueue() {
  const queue = _getOfflineQueue();
  const entries = Object.entries(queue);
  if (entries.length === 0) return;

  const rows = entries.map(([questionId, selected]) => ({
    attempt_id: attemptId,
    question_id: questionId,
    selected_option: selected,
  }));

  try {
    const { error } = await client.from("answers").upsert(rows, {
      onConflict: ["attempt_id", "question_id"],
    });
    if (error) throw error;
    _clearOfflineQueue();
    // Sync savedAnswers in memory too (already there, but just in case)
    entries.forEach(([qId, sel]) => { savedAnswers[qId] = sel; });
    showSavedToast();
  } catch (err) {
    // Still offline — queue stays, will retry next time
  }
}

// ── Answer Save (online-first, queue fallback) ────────────────────────────────
const debouncedUpsertAnswer = debounce(async (attemptId, questionId, selected) => {
  // Always write to offline queue first as safety net
  _addToOfflineQueue(questionId, selected);

  try {
    const { error } = await client.from("answers").upsert(
      [{ attempt_id: attemptId, question_id: questionId, selected_option: selected }],
      { onConflict: ["attempt_id", "question_id"] }
    );
    if (error) throw error;
    // Success — remove from pending queue
    _removeFromOfflineQueue(questionId);
    showSavedToast();
  } catch (err) {
    // Failed (offline) — answer already in queue, will sync when internet returns
    // Show a subtle indicator instead of a loud error alert
    _showOfflineBadge();
  }
}, 300);

window.saveAnswer = async function (questionId, selected) {
  savedAnswers[questionId] = selected;

  const q = questions[currentIndex];
  if (q && q.id === questionId) {
    document.querySelectorAll("#questionContainer label").forEach((label) => {
      const input = label.querySelector("input[type=radio]");
      const badge = label.querySelector("span:first-child");
      if (!input || !badge) return;
      const isSelected = input.value === selected;
      if (isSelected) {
        label.classList.add("bg-blue-50", "border-blue-500", "shadow-sm");
        label.classList.remove("border-gray-200", "hover:border-blue-300", "hover:bg-blue-50/40");
        badge.classList.add("bg-blue-600", "text-white");
        badge.classList.remove("bg-gray-100", "text-gray-600");
        input.checked = true;
      } else {
        label.classList.remove("bg-blue-50", "border-blue-500", "shadow-sm");
        label.classList.add("border-gray-200", "hover:border-blue-300", "hover:bg-blue-50/40");
        badge.classList.remove("bg-blue-600", "text-white");
        badge.classList.add("bg-gray-100", "text-gray-600");
        input.checked = false;
      }
    });
  }

  debouncedUpsertAnswer(attemptId, questionId, selected);
  updatePalette();
};

// ── Offline / Online badge UI ─────────────────────────────────────────────────
let _offlineBadgeTimer;
function _showOfflineBadge() {
  let badge = document.getElementById("_offlineBadge");
  if (!badge) {
    badge = document.createElement("div");
    badge.id = "_offlineBadge";
    badge.style.cssText = `
      position:fixed;bottom:70px;left:50%;transform:translateX(-50%);
      z-index:9990;background:#1e293b;color:#f8fafc;
      font-size:.75rem;font-weight:700;font-family:inherit;
      padding:7px 14px;border-radius:20px;
      display:flex;align-items:center;gap:6px;
      box-shadow:0 4px 16px rgba(0,0,0,.25);
      pointer-events:none;
    `;
    badge.innerHTML = `
      <span style="width:7px;height:7px;border-radius:50%;background:#f59e0b;flex-shrink:0"></span>
      Offline — answers saved locally
    `;
    document.body.appendChild(badge);
  }
  clearTimeout(_offlineBadgeTimer);
  _offlineBadgeTimer = setTimeout(() => badge?.remove(), 4000);
}

function _hideOfflineBadge() {
  document.getElementById("_offlineBadge")?.remove();
}

// ── Online event — flush queue when internet returns ─────────────────────────
window.addEventListener("online", async () => {
  _hideOfflineBadge();
  const queue = _getOfflineQueue();
  const pendingCount = Object.keys(queue).length;
  if (pendingCount > 0) {
    showAlert(`Back online — syncing ${pendingCount} saved answer${pendingCount > 1 ? "s" : ""}…`, "warning");
    await flushOfflineQueue();
    showAlert("All answers synced successfully!", "success");
    updatePalette();
  }
});

function startTimer() {
  const timerEl = document.getElementById("timer");
  let beepedAt5  = false;
  let beepedAt1  = false;
  timerInterval = setInterval(() => {
    durationSeconds--;
    const minutes = Math.floor(durationSeconds / 60);
    const seconds = durationSeconds % 60;
    timerEl.innerText = `${minutes.toString().padStart(2,"0")}:${seconds.toString().padStart(2,"0")}`;

    // Audio beep at 5 minutes remaining
    if (durationSeconds === 300 && !beepedAt5) {
      beepedAt5 = true;
      try { CL_AUDIO.beep(0.3); } catch(e) { CL_AUDIO.clink(); }
      showAlert("5 minutes remaining!", "warning");
    }
    // Audio beep at 1 minute remaining — muted flag already present
    if (durationSeconds === 60 && !beepedAt1) {
      beepedAt1 = true;
      try { CL_AUDIO.beep(0.5); } catch(e) { CL_AUDIO.clink(); }
      showAlert("1 minute remaining — wrap up!", "warning");
    }

    if (durationSeconds <= 0) { clearInterval(timerInterval); submitExam(); }
  }, 1000);
}

document.getElementById("submitExamBtn").addEventListener("click", () => {
  // Disable button immediately to prevent double-fire
  document.getElementById("submitExamBtn").disabled = true;
  setTimeout(() => { document.getElementById("submitExamBtn").disabled = false; }, 3000);
  const total = questions.length;
  const answered = Object.keys(savedAnswers).length;
  const marked = Object.keys(markedQuestions).filter(k => markedQuestions[k]).length;
  const notAnswered = total - answered;

  // Unanswered warning — prominent when > 0
  const unansweredWarning = notAnswered > 0 ? `
    <div style="display:flex;align-items:flex-start;gap:10px;padding:11px 14px;background:#fff7ed;border:1.5px solid #fb923c;border-radius:12px;margin-bottom:8px">
      <svg xmlns="http://www.w3.org/2000/svg" style="width:18px;height:18px;flex-shrink:0;color:#c2410c;margin-top:1px" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/>
      </svg>
      <div>
        <div style="font-weight:800;font-size:.85rem;color:#c2410c">${notAnswered} question${notAnswered > 1 ? 's' : ''} left unanswered</div>
        <div style="font-size:.75rem;color:#92400e;margin-top:2px">Unanswered questions score zero. Go back to attempt them.</div>
      </div>
    </div>` : `
    <div style="display:flex;align-items:center;gap:10px;padding:11px 14px;background:#f0fdf4;border:1.5px solid #86efac;border-radius:12px;margin-bottom:8px">
      <svg xmlns="http://www.w3.org/2000/svg" style="width:18px;height:18px;flex-shrink:0;color:#16a34a" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"/>
      </svg>
      <div style="font-weight:800;font-size:.85rem;color:#15803d">All ${total} questions answered — great job!</div>
    </div>`;

  document.getElementById("summaryStats").innerHTML = unansweredWarning + `
    <div class="grid grid-cols-2 gap-2">
      <div class="bg-gray-50 border border-gray-200 rounded-xl p-3 text-center">
        <div class="text-xl font-bold text-gray-700">${total}</div>
        <div class="text-xs text-gray-500 mt-0.5">Total</div>
      </div>
      <div class="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
        <div class="text-xl font-bold text-green-600">${answered}</div>
        <div class="text-xs text-green-600 mt-0.5">Answered</div>
      </div>
      <div style="background:${notAnswered > 0 ? '#fff7ed' : '#f9fafb'};border:1px solid ${notAnswered > 0 ? '#fed7aa' : '#e5e7eb'}" class="rounded-xl p-3 text-center">
        <div style="font-size:1.25rem;font-weight:700;color:${notAnswered > 0 ? '#c2410c' : '#6b7280'}">${notAnswered}</div>
        <div style="font-size:.75rem;color:${notAnswered > 0 ? '#c2410c' : '#6b7280'}" class="mt-0.5">Not Answered</div>
      </div>
      <div class="bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-center">
        <div class="text-xl font-bold text-indigo-600">${marked}</div>
        <div class="text-xs text-indigo-500 mt-0.5">Marked</div>
      </div>
    </div>`;

  document.getElementById("submitModal").classList.remove("hidden");
  document.getElementById("submitModal").classList.add("flex");
});

document.getElementById("cancelSubmit").onclick = () => {
  document.getElementById("submitModal").classList.add("hidden");
};

document.getElementById("confirmSubmit").onclick = () => { submitExam(); };

document.getElementById("nextBtn").addEventListener("click", () => {
  if (currentIndex < questions.length - 1) showQuestion(currentIndex + 1);
});

document.getElementById("prevBtn").addEventListener("click", () => {
  if (currentIndex > 0) showQuestion(currentIndex - 1);
});

let tabSwitchCount = 0;

// Single unified visibilitychange handler — handles tab-switch violations
// AND timer re-sync when the student returns to the tab
document.addEventListener("visibilitychange", () => {
  if (!securityActive) return;

  if (document.hidden) {
    // Tab/app hidden — count as violation after 800ms grace period
    if (!isSubmitting) {
      setTimeout(() => {
        if (document.hidden) {
          tabSwitchCount++;
          showAlert("App switching detected.");
          if (tabSwitchCount >= 3) {
            showAlert("Multiple violations detected. Test will be submitted.", "error");
            submitExam();
          }
        }
      }, 800);
    }
  } else {
    // Tab returned — re-sync timer from server clock to prevent cheating via suspension
    const now = Date.now();
    const elapsed = Math.floor((now - examStartedAt) / 1000);
    durationSeconds = examDuration - elapsed;
    if (durationSeconds <= 0) submitExam();
  }
});

document.addEventListener("contextmenu", (e) => e.preventDefault());
document.addEventListener("copy",        (e) => e.preventDefault());
document.addEventListener("cut",         (e) => e.preventDefault());
document.addEventListener("paste",       (e) => e.preventDefault());

document.addEventListener("keydown", function(e) {
  if (e.key === "F12" || e.key === "PrintScreen" ||
      (e.ctrlKey && e.key === "u") ||
      (e.ctrlKey && e.key === "s") ||
      (e.ctrlKey && e.shiftKey && e.key === "I")) {
    e.preventDefault();
  }

  // Keyboard shortcuts — only when exam has started and no modal is open
  if (!examStarted || document.getElementById("submitModal")?.classList.contains("flex")) return;

  // Don't fire if user is typing in an input/textarea
  if (["INPUT","TEXTAREA","SELECT"].includes(document.activeElement?.tagName)) return;

  const optionKeys = ["A","B","C","D"];
  const q = questions[currentIndex];
  if (!q) return;

  // 1-4 / A-D → select option
  if (!e.ctrlKey && !e.altKey) {
    const numToOpt = {"1":"A","2":"B","3":"C","4":"D"};
    const selected = numToOpt[e.key] || (optionKeys.includes(e.key.toUpperCase()) ? e.key.toUpperCase() : null);
    if (selected && q.options?.[selected] !== undefined) {
      saveAnswer(q.id, selected);
      return;
    }
  }

  // → or + → next question
  if (e.key === "ArrowRight" || e.key === "+") {
    if (currentIndex < questions.length - 1) showQuestion(currentIndex + 1);
    return;
  }
  // ← or - → previous question
  if (e.key === "ArrowLeft" || e.key === "-") {
    if (currentIndex > 0) showQuestion(currentIndex - 1);
    return;
  }
  // M → mark for review
  if (e.key.toLowerCase() === "m") {
    document.getElementById("markBtn")?.click();
    return;
  }
  // C → clear response
  if (e.key.toLowerCase() === "c") {
    document.getElementById("clearBtn")?.click();
    return;
  }
});

window.openImageZoom = function(src) {
  const overlay = document.getElementById("imageZoomOverlay");
  const img     = document.getElementById("imageZoomImg");
  if (!overlay || !img) return;
  img.src = src;
  overlay.classList.remove("hidden");
  overlay.classList.add("flex");
};

window.closeImageZoom = function() {
  const overlay = document.getElementById("imageZoomOverlay");
  if (!overlay) return;
  overlay.classList.add("hidden");
  overlay.classList.remove("flex");
};

let savedToastTimer;
function showSavedToast() {
  let toast = document.getElementById("savedToast");
  if (!toast) return;
  toast.classList.remove("opacity-0", "translate-y-1");
  toast.classList.add("opacity-100", "translate-y-0");
  clearTimeout(savedToastTimer);
  savedToastTimer = setTimeout(() => {
    toast.classList.add("opacity-0", "translate-y-1");
    toast.classList.remove("opacity-100", "translate-y-0");
  }, 1200);
}

document.getElementById("clearBtn").addEventListener("click", async () => {
  const q = questions[currentIndex];
  if (!q || !savedAnswers[q.id]) return;

  const prevAnswer = savedAnswers[q.id];
  delete savedAnswers[q.id];

  document.querySelectorAll("#questionContainer label").forEach((label) => {
    const input = label.querySelector("input[type=radio]");
    const badge = label.querySelector("span:first-child");
    if (!input || !badge) return;
    label.classList.remove("bg-blue-50", "border-blue-500", "shadow-sm");
    label.classList.add("border-gray-200", "hover:border-blue-300", "hover:bg-blue-50/40");
    badge.classList.remove("bg-blue-600", "text-white");
    badge.classList.add("bg-gray-100", "text-gray-600");
    input.checked = false;
  });

  updatePalette();

  // 2-second undo toast
  _showUndoClearToast(q.id, prevAnswer);

  // Delayed DB delete — wait for potential undo
  const deleteTimer = setTimeout(async () => {
    try {
      await client.from("answers").delete()
        .eq("attempt_id", attemptId)
        .eq("question_id", q.id);
    } catch (err) {
      showAlert("Could not clear answer — check your connection.", "error");
      // Restore in memory
      savedAnswers[q.id] = prevAnswer;
      updatePalette();
    }
  }, 2200);

  window._clearUndoTimer = deleteTimer;
  window._clearUndoData  = { qId: q.id, answer: prevAnswer };
});

function _showUndoClearToast(qId, prevAnswer) {
  document.getElementById("_undoClearToast")?.remove();
  const t = document.createElement("div");
  t.id = "_undoClearToast";
  t.style.cssText = "position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:9995;background:#1e293b;color:#fff;font-size:.78rem;font-weight:700;padding:9px 16px;border-radius:20px;display:flex;align-items:center;gap:10px;box-shadow:0 4px 20px rgba(0,0,0,.3);white-space:nowrap";
  t.innerHTML = `Cleared — <button style="background:#3b82f6;border:none;color:#fff;padding:3px 10px;border-radius:10px;cursor:pointer;font-weight:800;font-size:.75rem" onclick="_undoClear('${qId}','${prevAnswer}')">Undo</button>`;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

window._undoClear = function(qId, answer) {
  clearTimeout(window._clearUndoTimer);
  document.getElementById("_undoClearToast")?.remove();
  // Restore answer
  saveAnswer(qId, answer);
};

document.getElementById("markBtn").addEventListener("click", () => {
  const q = questions[currentIndex];
  if (!q) return;
  markedQuestions[q.id] = !markedQuestions[q.id];
  updatePalette();
});

async function submitExam() {
  if (submitCalled) return;
  submitCalled = true;
  isSubmitting = true;

  clearInterval(timerInterval);
  clearInterval(heartbeatInterval);

  // Show a submitting overlay so the student knows something is happening
  _showSubmittingOverlay();

  // Flush any offline-queued answers before marking as submitted
  await flushOfflineQueue().catch(() => {});

  const now = new Date();

  // Retry helper — retries up to maxAttempts times with exponential backoff
  async function withRetry(fn, maxAttempts = 3) {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const result = await fn();
        if (result.error) throw result.error;
        return result;
      } catch (err) {
        if (i === maxAttempts - 1) throw err;
        await new Promise(r => setTimeout(r, 800 * Math.pow(2, i)));
      }
    }
  }

  try {
    // Step 1 — fetch started_at (with retry)
    const { data: attemptData } = await withRetry(() =>
      client.from("attempts").select("started_at").eq("id", attemptId).single()
    );

    const timeTaken = Math.floor((Date.now() - Date.parse(attemptData.started_at)) / 1000);

    // Step 2 — mark submitted (with retry)
    await withRetry(() =>
      client.from("attempts")
        .update({ submitted_at: now, time_taken: timeTaken })
        .eq("id", attemptId)
        .select()
    );

    window.location.href = `/mock/result.html?attempt=${attemptId}`;

  } catch (err) {
    console.error("Submit failed after retries:", err);
    _hideSubmittingOverlay();
    // Reset flags so student can try again
    submitCalled = false;
    isSubmitting = false;
    _showSubmitErrorModal();
  }
}

function _showSubmittingOverlay() {
  const existing = document.getElementById("_submitOverlay");
  if (existing) return;
  const el = document.createElement("div");
  el.id = "_submitOverlay";
  el.style.cssText = "position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,.75);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;";
  el.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation:spin .8s linear infinite">
      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
    </svg>
    <div style="color:#fff;font-size:.95rem;font-weight:700;font-family:inherit">Submitting your test…</div>
    <div style="color:#94a3b8;font-size:.78rem;font-family:inherit">Please don't close this page</div>
  `;
  document.body.appendChild(el);
}

function _hideSubmittingOverlay() {
  document.getElementById("_submitOverlay")?.remove();
}

function _showSubmitErrorModal() {
  const existing = document.getElementById("_submitErrorModal");
  if (existing) return;
  const el = document.createElement("div");
  el.id = "_submitErrorModal";
  el.style.cssText = "position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,.8);display:flex;align-items:center;justify-content:center;padding:20px;";
  el.innerHTML = `
    <div style="background:#fff;border-radius:20px;max-width:380px;width:100%;overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,.3)">
      <div style="background:linear-gradient(135deg,#dc2626,#b91c1c);padding:20px 24px;text-align:center">
        <div style="width:48px;height:48px;background:rgba(255,255,255,.2);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 10px">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008z"/></svg>
        </div>
        <div style="color:#fff;font-size:1rem;font-weight:800;font-family:inherit">Submission Failed</div>
        <div style="color:#fca5a5;font-size:.78rem;margin-top:4px;font-family:inherit">Your answers are safe — please try again</div>
      </div>
      <div style="padding:20px 24px">
        <p style="font-size:.82rem;color:#475569;line-height:1.55;margin-bottom:18px;font-family:inherit">
          We couldn't submit your test due to a network issue. Your answers have been saved. Please check your internet connection and tap <strong>Try Again</strong>.
        </p>
        <div style="display:flex;flex-direction:column;gap:10px">
          <button id="_retrySubmitBtn" style="width:100%;padding:12px;border-radius:12px;border:none;background:linear-gradient(135deg,#dc2626,#b91c1c);color:#fff;font-weight:800;font-size:.88rem;cursor:pointer;font-family:inherit">
            Try Again
          </button>
          <a href="/mock/dashboard.html" style="display:block;text-align:center;padding:10px;border-radius:12px;border:1.5px solid #e2e8f4;color:#64748b;font-size:.82rem;font-weight:600;text-decoration:none;font-family:inherit">
            Back to Dashboard (answers saved)
          </a>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(el);
  document.getElementById("_retrySubmitBtn").addEventListener("click", () => {
    el.remove();
    submitExam();
  });
}

async function loadSavedAnswers() {
  const { data } = await client.from("answers")
    .select("question_id, selected_option")
    .eq("attempt_id", attemptId);

  savedAnswers = {};
  (data || []).forEach((a) => {
    savedAnswers[a.question_id] = a.selected_option;
    visitedQuestions[a.question_id] = true;
  });

  // Restore any answers that were saved locally but never reached Supabase
  // (e.g. from a previous offline session on this attempt)
  const queue = _getOfflineQueue();
  const queueEntries = Object.entries(queue);
  if (queueEntries.length > 0) {
    queueEntries.forEach(([qId, sel]) => {
      savedAnswers[qId] = sel;
      visitedQuestions[qId] = true;
    });
    // Try to flush them now while we have connection
    flushOfflineQueue().catch(() => {});
  }
}

function updatePalette() {
  const nav = document.getElementById("questionNav");
  nav.innerHTML = "";

  const isLarge = questions.length > 60;
  // Keep minimum 40×40px (touch-friendly) even for large exams.
  // Palette container is already max-h-[260px] with overflow-y-auto, so it scrolls.
  const btnSize = isLarge ? "h-10 w-10 rounded-lg" : "h-10 w-10 rounded-lg";

  questions.forEach((q, index) => {
    let baseClass = `${btnSize} text-xs font-semibold flex items-center justify-center transition border cursor-pointer `;
    if      (markedQuestions[q.id])  baseClass += "bg-indigo-500 text-white border-indigo-500";
    else if (savedAnswers[q.id])     baseClass += "bg-green-500 text-white border-green-500";
    else if (visitedQuestions[q.id]) baseClass += "bg-amber-400 text-white border-amber-400";
    else                             baseClass += "bg-gray-100 border-gray-200 text-gray-600";
    if (index === currentIndex) baseClass += " ring-2 ring-blue-500 ring-offset-1";

    const btn = document.createElement("button");
    btn.innerText = index + 1;
    btn.className = baseClass;
    btn.onclick = () => showQuestion(index);
    nav.appendChild(btn);
  });

  const answered = Object.keys(savedAnswers).length;
  const marked   = Object.keys(markedQuestions).filter(k => markedQuestions[k]).length;

  document.getElementById("statTotal").innerText     = questions.length;
  document.getElementById("statAnswered").innerText  = answered;
  document.getElementById("statMarked").innerText    = marked;
  document.getElementById("statRemaining").innerText = questions.length - answered;

  // "Jump to question" input — only shows on small screens when > 60 questions
  const existingJump = document.getElementById("jumpToQInput");
  if (questions.length > 60) {
    if (!existingJump) {
      const jumpWrap = document.createElement("div");
      jumpWrap.id = "jumpToQWrap";
      jumpWrap.style.cssText = "display:flex;align-items:center;gap:8px;margin-top:8px;";
      jumpWrap.innerHTML = `
        <label style="font-size:.72rem;color:#64748b;font-weight:600;white-space:nowrap">Jump to Q:</label>
        <input id="jumpToQInput" type="number" min="1" max="${questions.length}"
          placeholder="1-${questions.length}"
          style="width:80px;padding:5px 8px;border:1.5px solid #e2e8f4;border-radius:8px;font-size:.8rem;outline:none"
          onkeydown="if(event.key==='Enter'){const v=parseInt(this.value);if(v>=1&&v<=${questions.length})showQuestion(v-1);}"
        >
        <button onclick="const v=parseInt(document.getElementById('jumpToQInput').value);if(v>=1&&v<=${questions.length})showQuestion(v-1);"
          style="padding:5px 10px;background:#1a56db;color:#fff;border:none;border-radius:8px;font-size:.75rem;font-weight:700;cursor:pointer">Go</button>
      `;
      const nav = document.getElementById("questionNav");
      if (nav && nav.parentNode) nav.parentNode.insertBefore(jumpWrap, nav);
    }
  } else if (existingJump) {
    document.getElementById("jumpToQWrap")?.remove();
  }

  const q       = questions[currentIndex];
  const markBtn  = document.getElementById("markBtn");
  const markLabel = document.getElementById("markBtnLabel");
  const markIcon  = document.getElementById("markBtnIcon");
  if (markBtn && q) {
    const isMarked = !!markedQuestions[q.id];
    markBtn.classList.toggle("mark-btn-marked",   isMarked);
    markBtn.classList.toggle("mark-btn-unmarked", !isMarked);
    if (markIcon) {
      markIcon.setAttribute("fill",   isMarked ? "currentColor" : "none");
      markIcon.setAttribute("stroke", isMarked ? "none" : "currentColor");
    }
    if (markLabel) markLabel.textContent = isMarked ? "Marked for Review" : "Mark for Review";
  }
}

function renderSections(sections) {
  const container = document.getElementById("sectionTabs");
  container.innerHTML = "";
  sections.forEach((section) => {
    const btn = document.createElement("button");
    btn.className = "px-3 py-2 rounded-lg bg-gray-100 hover:bg-blue-100 text-gray-700 font-medium transition text-xs sm:text-sm text-center leading-tight w-full sm:w-auto";
    btn.innerText = section;
    btn.onclick = () => {
      const index = questions.findIndex((q) => q.section === section);
      if (index !== -1) showQuestion(index);
    };
    container.appendChild(btn);
  });
}



document.addEventListener("DOMContentLoaded", () => {
  const rulesModal    = document.getElementById("rulesModal");
  const acceptCheckbox = document.getElementById("acceptRules");
  const startBtn      = document.getElementById("startTestBtn");
  const examTitle     = document.getElementById("examTitle");
  const rulesExamTitle = document.getElementById("rulesExamTitle");
  const openRulesBtn  = document.getElementById("openRulesBtn");

  if (examTitle && rulesExamTitle) {
    rulesExamTitle.textContent = examTitle.textContent + " \u2013 Instructions";
  }

  rulesModal.classList.remove("hidden");
  rulesModal.classList.add("flex");
  document.body.style.overflow = "hidden";

  // Dismiss the page loading overlay now that auth resolved and modal is ready
  const pageLoader = document.getElementById("examPageLoader");
  if (pageLoader) {
    pageLoader.style.transition = "opacity .25s";
    pageLoader.style.opacity = "0";
    setTimeout(() => pageLoader.remove(), 280);
  }

  acceptCheckbox.addEventListener("change", () => {
    startBtn.disabled = !acceptCheckbox.checked;
  });

  if (openRulesBtn) {
    openRulesBtn.addEventListener("click", () => {
      if (examStarted) {
        const acceptRow = document.getElementById("acceptRulesRow");
        if (acceptRow) acceptRow.style.display = "none";
        startBtn.disabled = false;
        startBtn.innerHTML = `Close <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12"/></svg>`;
      }
      rulesModal.classList.remove("hidden");
      rulesModal.classList.add("flex");
      document.body.style.overflow = "hidden";
    });
  }

  startBtn.addEventListener("click", () => {
    rulesModal.classList.add("hidden");
    rulesModal.classList.remove("flex");
    document.body.style.overflow = "auto";

    if (examStarted) return;

    if (window.innerWidth > 768 && !document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    }

    loadExam();
    examStarted = true;

    setTimeout(() => {
      securityActive = true;
      fullscreenLockActive = true;
    }, 3000);
  });
});

history.pushState(null, null, location.href);
window.onpopstate = function() { history.go(1); };

setInterval(() => {
  if (!securityActive) return;
  const widthDiff  = window.outerWidth  - window.innerWidth;
  const heightDiff = window.outerHeight - window.innerHeight;
  if (widthDiff > 220 || heightDiff > 220) showAlert("Developer tools detected.", "warning");
}, 3000);

window.addEventListener("offline", () => { showAlert("Internet lost — your answers are being saved locally.", "warning"); });

document.addEventListener("visibilitychange", () => {
  document.body.style.filter = document.hidden ? "blur(20px)" : "none";
});

// ── Local audio shim for exam page (beep at timer milestones) ────────────────
const CL_AUDIO = window.CL_AUDIO || {
  muted: sessionStorage.getItem("cl-mute") === "1",
  ctx: null,
  _ensure() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === "suspended") this.ctx.resume();
  },
  clink(vol = 0.25) {
    if (this.muted) return;
    try {
      this._ensure();
      const now = this.ctx.currentTime;
      [[1320, 0], [1760, 0.018]].forEach(([freq, delay]) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now + delay);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.85, now + delay + 0.12);
        gain.gain.setValueAtTime(vol, now + delay);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.15);
        osc.connect(gain); gain.connect(this.ctx.destination);
        osc.start(now + delay); osc.stop(now + delay + 0.16);
      });
    } catch(e) {}
  },
  beep(vol = 0.4) {
    if (this.muted) return;
    try {
      this._ensure();
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "square";
      osc.frequency.setValueAtTime(880, now);
      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
      osc.connect(gain); gain.connect(this.ctx.destination);
      osc.start(now); osc.stop(now + 0.32);
    } catch(e) {}
  }
};

const heartbeatInterval = setInterval(async () => {
  if (isSubmitting) return;
  await client.from("attempts").update({ last_active: new Date() }).eq("id", attemptId);
}, 10000);

function showAlert(message, type = "warning") {
  const container = document.getElementById("examAlertContainer");
  const alertBox  = document.getElementById("examAlert");
  container.classList.remove("hidden");

  const styles = {
    warning: { cls: "bg-amber-50 text-amber-800 border border-amber-300", icon: `<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 flex-shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/></svg>` },
    error:   { cls: "bg-red-50 text-red-800 border border-red-300",       icon: `<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 flex-shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/></svg>` },
    success: { cls: "bg-green-50 text-green-800 border border-green-300", icon: `<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 flex-shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>` },
  };
  const s = styles[type] || styles.warning;
  alertBox.className = "flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium shadow " + s.cls;
  alertBox.innerHTML = `${s.icon}<span>${message}</span>`;
  setTimeout(() => { container.classList.add("hidden"); }, 4000);
}

const navEntry = performance.getEntriesByType("navigation")[0];
if (navEntry?.type === "reload" && document.referrer === window.location.href) {
  showAlert("Page refreshed. Your answers have been restored.", "warning");
}

// ── Report Issue ─────────────────────────────────────────────────────────────
window.openReportIssue = function() {
  const q = questions[currentIndex];
  if (!q) return;

  const existing = document.getElementById("reportIssueOverlay");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "reportIssueOverlay";
  overlay.style.cssText = "position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,.55);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:16px";

  const issues = [
    {val:"wrong_answer",  icon:"fas fa-times-circle", bg:"#fee2e2", color:"#dc2626", label:"Wrong Answer Key",        desc:"The correct answer marked is incorrect"},
    {val:"typo_question", icon:"fas fa-spell-check",  bg:"#fef3c7", color:"#d97706", label:"Typo / Error in Question", desc:"Spelling mistake or unclear question text"},
    {val:"image_issue",   icon:"fas fa-image",        bg:"#ede9fe", color:"#7c3aed", label:"Image Not Loading",        desc:"Question image is broken or missing"},
    {val:"wrong_options", icon:"fas fa-list",         bg:"#dbeafe", color:"#1d4ed8", label:"Wrong Options",            desc:"Options are incorrect or repeated"},
    {val:"other",         icon:"fas fa-comment-alt",  bg:"#f0fdf4", color:"#15803d", label:"Other Issue",              desc:"Something else is wrong"},
  ];

  const optionsHtml = issues.map(it =>
    '<div class="report-opt" data-val="' + it.val + '" data-bg="' + it.bg + '" data-color="' + it.color + '" ' +
    'style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;border:2px solid #f1f5f9;cursor:pointer;transition:all .15s;background:#fff">' +
    '<span style="width:32px;height:32px;border-radius:8px;background:' + it.bg + ';color:' + it.color + ';display:flex;align-items:center;justify-content:center;font-size:.75rem;flex-shrink:0"><i class="' + it.icon + '"></i></span>' +
    '<div><div style="font-size:.8rem;font-weight:700;color:#0f172a">' + it.label + '</div><div style="font-size:.7rem;color:#94a3b8;margin-top:1px">' + it.desc + '</div></div>' +
    '</div>'
  ).join('');

  overlay.innerHTML =
    '<div style="background:#fff;border-radius:20px;max-width:400px;width:100%;box-shadow:0 24px 64px rgba(15,23,42,.2);overflow:hidden">' +
      '<div style="background:linear-gradient(135deg,#dc2626,#b91c1c);padding:16px 20px;display:flex;align-items:center;justify-content:space-between">' +
        '<div>' +
          '<div style="font-size:.62rem;font-weight:700;color:#fca5a5;text-transform:uppercase;letter-spacing:.08em;margin-bottom:2px">Question ' + (currentIndex + 1) + '</div>' +
          '<div style="font-size:.92rem;font-weight:800;color:#fff">Report an Issue</div>' +
        '</div>' +
        '<button id="closeReportBtn" style="width:28px;height:28px;border-radius:8px;background:rgba(255,255,255,.15);border:none;color:#fff;cursor:pointer;font-size:.85rem;display:flex;align-items:center;justify-content:center">✕</button>' +
      '</div>' +
      '<div style="padding:16px 20px 20px">' +
        '<div style="font-size:.75rem;font-weight:700;color:#64748b;margin-bottom:10px;text-transform:uppercase;letter-spacing:.05em">Select Issue Type</div>' +
        '<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px" id="reportOptions">' + optionsHtml + '</div>' +
        '<div id="otherIssueBox" style="display:none;margin-bottom:12px">' +
          '<textarea id="otherIssueText" placeholder="Describe the issue..." ' +
          'style="width:100%;padding:10px 12px;border-radius:10px;border:1.5px solid #e2e8f4;font-size:.82rem;color:#0f172a;resize:none;outline:none;font-family:inherit" ' +
          'rows="3" maxlength="300"></textarea>' +
          '<div style="font-size:.68rem;color:#94a3b8;margin-top:4px;text-align:right">Max 300 characters</div>' +
        '</div>' +
        '<button id="submitReportBtn" disabled ' +
          'style="width:100%;padding:12px;border-radius:12px;border:none;background:linear-gradient(135deg,#dc2626,#b91c1c);color:#fff;font-weight:800;font-size:.88rem;cursor:pointer;opacity:.4;transition:opacity .15s">' +
          '<i class="fas fa-paper-plane" style="margin-right:8px"></i>Submit Report' +
        '</button>' +
      '</div>' +
    '</div>';

  overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);

  document.getElementById("closeReportBtn").addEventListener("click", () => overlay.remove());

  let selectedVal = null;
  document.querySelectorAll(".report-opt").forEach(opt => {
    opt.addEventListener("click", () => {
      document.querySelectorAll(".report-opt").forEach(o => {
        o.style.borderColor = "#f1f5f9";
        o.style.background = "#fff";
      });
      opt.style.borderColor = opt.dataset.color;
      opt.style.background = opt.dataset.bg;
      selectedVal = opt.dataset.val;
      const btn = document.getElementById("submitReportBtn");
      btn.disabled = false;
      btn.style.opacity = "1";
    });
  });

  // Show text box when "other" is selected
  document.querySelectorAll(".report-opt").forEach(opt => {
    opt.addEventListener("click", () => {
      const otherBox = document.getElementById("otherIssueBox");
      if (opt.dataset.val === "other") {
        if (otherBox) otherBox.style.display = "block";
      } else {
        if (otherBox) otherBox.style.display = "none";
      }
    });
  });

  document.getElementById("submitReportBtn").addEventListener("click", () => {
    if (selectedVal) window.submitReport(q.id, currentIndex + 1, selectedVal);
  });
};

// ── Submit Report ─────────────────────────────────────────────────────────────
window.submitReport = async function(questionId, qNumber, selectedVal) {
  if (!selectedVal) return;

  // Get "other" text if applicable
  const otherText = selectedVal === "other"
    ? (document.getElementById("otherIssueText")?.value?.trim() || "")
    : "";

  const btn = document.getElementById("submitReportBtn");
  btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Submitting...';
  btn.disabled = true;

  try {
    const { data: { user } } = await client.auth.getUser();

    // Fetch profile — use full_name only, email from auth
    const { data: profile } = await client
      .from("user_profiles")
      .select("full_name")
      .eq("id", user.id)
      .single();

    const issueLabels = {
      wrong_answer:  "Wrong Answer Key",
      typo_question: "Typo / Error in Question",
      image_issue:   "Image Not Loading",
      wrong_options: "Wrong Options",
      other:         "Other Issue",
    };

    const priority = selectedVal === "wrong_answer" ? "high" : "medium";
    const issueText = issueLabels[selectedVal] + (otherText ? ": " + otherText : "");
    const message = "Q" + qNumber + " | " + issueText + " | Question ID: " + questionId + " | Attempt ID: " + attemptId;

    const { error: insertError } = await client.from("support_tickets").insert([{
      user_id:    user.id,
      user_email: user.email || "",
      full_name:  profile?.full_name || "Student",
      category:   "question_report",
      message:    message,
      status:     "open",
      priority:   priority,
      user_type:  "registered",
    }]);

    if (insertError) {
      console.error("Insert error:", insertError);
      throw new Error(insertError.message);
    }

    document.getElementById("reportIssueOverlay").remove();
    showAlert("Report submitted. Thank you!", "success");

  } catch (err) {
    console.error("Report error:", err);
    showAlert("Could not submit: " + err.message, "error");
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-paper-plane mr-2"></i>Submit Report';
  }
};