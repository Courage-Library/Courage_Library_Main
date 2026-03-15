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
  const { data: attemptCheck } = await client
    .from("attempts")
    .select("submitted_at")
    .eq("id", attemptId)
    .single();

  if (attemptCheck.submitted_at) {
    window.location.href = "/mock/result.html?attempt=" + attemptId;
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

  questions = examLanguage
    ? allQuestions.filter((q) => (q.language || "english") === examLanguage)
    : allQuestions;

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
        <img src="${q.question_image}" alt="Question figure"
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
          <img src="${value}" alt="Option ${key}"
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
      </div>
      ${questionImageHtml}
    </div>
    <div class="space-y-2.5">
      ${optionsHtml}
    </div>
  `;
}

function debounce(fn, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

const debouncedUpsertAnswer = debounce(async (attemptId, questionId, selected) => {
  try {
    const { error } = await client.from("answers").upsert(
      [{ attempt_id: attemptId, question_id: questionId, selected_option: selected }],
      { onConflict: ["attempt_id", "question_id"] }
    );
    if (error) throw error;
    showSavedToast();
  } catch (err) {
    showAlert("Answer not saved — check your internet connection.", "error");
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

function startTimer() {
  const timerEl = document.getElementById("timer");
  timerInterval = setInterval(() => {
    durationSeconds--;
    const minutes = Math.floor(durationSeconds / 60);
    const seconds = durationSeconds % 60;
    timerEl.innerText = `${minutes.toString().padStart(2,"0")}:${seconds.toString().padStart(2,"0")}`;
    if (durationSeconds <= 0) { clearInterval(timerInterval); submitExam(); }
  }, 1000);
}

document.getElementById("submitExamBtn").addEventListener("click", () => {
  const total = questions.length;
  const answered = Object.keys(savedAnswers).length;
  const marked = Object.keys(markedQuestions).filter(k => markedQuestions[k]).length;
  const notAnswered = total - answered;

  document.getElementById("summaryStats").innerHTML = `
    <div class="grid grid-cols-2 gap-2">
      <div class="bg-gray-50 border border-gray-200 rounded-xl p-3 text-center">
        <div class="text-xl font-bold text-gray-700">${total}</div>
        <div class="text-xs text-gray-500 mt-0.5">Total</div>
      </div>
      <div class="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
        <div class="text-xl font-bold text-green-600">${answered}</div>
        <div class="text-xs text-green-600 mt-0.5">Answered</div>
      </div>
      <div class="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
        <div class="text-xl font-bold text-amber-600">${notAnswered}</div>
        <div class="text-xs text-amber-600 mt-0.5">Not Answered</div>
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

document.addEventListener("visibilitychange", () => {
  if (isSubmitting || !securityActive) return;
  if (document.hidden) {
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
});

document.addEventListener("visibilitychange", () => {
  if (!securityActive) return;
  if (!document.hidden) {
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

  try {
    await client.from("answers").delete()
      .eq("attempt_id", attemptId)
      .eq("question_id", q.id);
  } catch (err) {
    showAlert("Could not clear answer — check your connection.", "error");
  }

  updatePalette();
});

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

  const now = new Date();
  const { data: attemptData, error: fetchError } = await client
    .from("attempts").select("started_at").eq("id", attemptId).single();

  if (fetchError) { console.error("Fetch attempt failed:", fetchError); return; }

  const timeTaken = Math.floor((Date.now() - Date.parse(attemptData.started_at)) / 1000);

  const { error } = await client.from("attempts")
    .update({ submitted_at: now, time_taken: timeTaken })
    .eq("id", attemptId)
    .select();

  if (error) { console.error("Update failed:", error); return; }

  window.location.href = `/mock/result.html?attempt=${attemptId}`;
}

async function loadSavedAnswers() {
  const { data } = await client.from("answers")
    .select("question_id, selected_option")
    .eq("attempt_id", attemptId);

  savedAnswers = {};
  data.forEach((a) => {
    savedAnswers[a.question_id] = a.selected_option;
    visitedQuestions[a.question_id] = true;
  });
}

function updatePalette() {
  const nav = document.getElementById("questionNav");
  nav.innerHTML = "";

  const isLarge = questions.length > 60;
  const btnSize = isLarge ? "h-8 w-8 rounded-md" : "h-10 w-10 rounded-lg";

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

window.addEventListener("offline", () => { showAlert("Internet connection lost.", "warning"); });

document.addEventListener("visibilitychange", () => {
  document.body.style.filter = document.hidden ? "blur(20px)" : "none";
});

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