const SUPABASE_URL = "https://sgagswxzsxlgcspwiuoh.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNnYWdzd3h6c3hsZ2NzcHdpdW9oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5NTA1NTIsImV4cCI6MjA2OTUyNjU1Mn0.ZNfk5WNDPkjKcFsRO48rEYk3dhbLYm_m21aZ-wfywo4";

const { createClient } = supabase;
const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let isSubmitting = false;

window.addEventListener("beforeunload", (e) => {
  if (!isSubmitting && durationSeconds > 0) {
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

document.addEventListener("DOMContentLoaded", async () => {
  const params = new URLSearchParams(window.location.search);
  attemptId = params.get("attempt");

  if (!attemptId) {
    showAlert(
      "Invalid exam attempt detected. Redirecting to dashboard.",
      "error",
    );
    setTimeout(() => {
      window.location.href = "/mock/dashboard.html";
    }, 2000);
    return;
  }

  await loadExam();
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

  const { data: attempt } = await client
    .from("attempts")
    .select(
      `
      id,
      scheduled_exams(
        exam_patterns(
          pattern_name,
          duration_minutes
        )
      )
    `,
    )
    .eq("id", attemptId)
    .single();

  const pattern = attempt.scheduled_exams.exam_patterns;
  if (window.innerWidth > 768) {
  document.documentElement.requestFullscreen();
}

  document.getElementById("examTitle").innerText = pattern.pattern_name;
  durationSeconds = pattern.duration_minutes * 60;

  await loadQuestions();
  await loadSavedAnswers();
  showQuestion(0);
  startTimer();
  generateWatermark();
  setInterval(generateWatermark, 5000);
}

function generateWatermark() {
  const container = document.getElementById("examWatermark");

  if (!container || !attemptId) return;

  const maskedUser = "CL***" + attemptId.slice(-2);
  const sessionCode = attemptId.slice(-4);

  const now = new Date().toLocaleTimeString();

  const text = `Courage Library
Session ${sessionCode}
${now}`;

  container.innerHTML = "";

  for (let i = 0; i < 12; i++) {
    const item = document.createElement("div");

    item.className = "watermarkItem";

    item.innerText = text;

    container.appendChild(item);
  }
}

document.addEventListener("fullscreenchange", () => {
  if (!document.fullscreenElement && window.innerWidth > 768) {
    document.documentElement.requestFullscreen();
  }
});

async function loadQuestions() {
  const { data } = await client
    .from("attempt_questions")
    .select(
      `
      question_order,
      questions(
        id,
        question_text,
        options,
        correct_answer,
        pattern_section_id,
        pattern_sections(
          id,
          section_name
        )
      )
    `,
    )
    .eq("attempt_id", attemptId)
    .order("question_order", { ascending: true });

  questions = data.map((d) => ({
    ...d.questions,
    section: d.questions.pattern_sections.section_name,
  }));

  const uniqueSections = [...new Set(questions.map((q) => q.section))];

  renderSections(uniqueSections);
}

function showQuestion(index) {
  currentIndex = index;

  const q = questions[index];

  // mark visited
  visitedQuestions[q.id] = true;

  updatePalette();

  const container = document.getElementById("questionContainer");

  container.innerHTML = `
    <div class="mb-6 flex justify-between items-center">
      <h2 class="text-lg font-semibold text-gray-800">
        Q${index + 1}. ${q.question_text}
      </h2>

      <span class="text-sm text-gray-500">
        Question ${index + 1} of ${questions.length}
      </span>
    </div>

    <div class="space-y-4">
      ${Object.entries(q.options)
        .map(([key, value]) => {
          const isChecked = savedAnswers[q.id] === key;

          return `
            <label 
              class="flex items-center p-4 border rounded-xl cursor-pointer transition
              ${isChecked ? "bg-blue-50 border-blue-500 shadow-md" : "hover:border-blue-300 hover:shadow-sm"}
              ">
              
              <input 
                type="radio"
                name="option"
                value="${key}"
                class="mr-4 accent-blue-600 w-4 h-4"
                ${isChecked ? "checked" : ""}
                onchange="saveAnswer('${q.id}', '${key}')"
              >

              <span class="text-gray-700">
                <strong class="mr-2">${key}.</strong> ${value}
              </span>

            </label>
          `;
        })
        .join("")}
    </div>
  `;
}

window.saveAnswer = async function (questionId, selected) {
  savedAnswers[questionId] = selected;

  await client.from("answers").upsert(
    [
      {
        attempt_id: attemptId,
        question_id: questionId,
        selected_option: selected,
      },
    ],
    { onConflict: ["attempt_id", "question_id"] },
  );

  updatePalette();
};

function startTimer() {
  const timerEl = document.getElementById("timer");

  timerInterval = setInterval(() => {
    durationSeconds--;

    const minutes = Math.floor(durationSeconds / 60);
    const seconds = durationSeconds % 60;

    timerEl.innerText = `${minutes}:${seconds.toString().padStart(2, "0")}`;

    if (durationSeconds <= 0) {
      clearInterval(timerInterval);
      submitExam();
    }
  }, 1000);
}

document.getElementById("submitExamBtn").addEventListener("click", () => {
  const total = questions.length;
  const answered = Object.keys(savedAnswers).length;
  const marked = Object.keys(markedQuestions).length;
  const notAnswered = total - answered;

  document.getElementById("summaryStats").innerHTML = `
    <div>Total Questions: ${total}</div>
    <div>Answered: ${answered}</div>
    <div>Not Answered: ${notAnswered}</div>
    <div>Marked for Review: ${marked}</div>
  `;

  document.getElementById("submitModal").classList.remove("hidden");
  document.getElementById("submitModal").classList.add("flex");
});

document.getElementById("cancelSubmit").onclick = () => {
  document.getElementById("submitModal").classList.add("hidden");
};

document.getElementById("confirmSubmit").onclick = () => {
  submitExam();
};

document.getElementById("nextBtn").addEventListener("click", () => {
  if (currentIndex < questions.length - 1) {
    showQuestion(currentIndex + 1);
  }
});

document.getElementById("prevBtn").addEventListener("click", () => {
  if (currentIndex > 0) {
    showQuestion(currentIndex - 1);
  }
});

let tabSwitchCount = 0;

document.addEventListener("visibilitychange", () => {
  if (isSubmitting) return;

  if (document.hidden) {
    tabSwitchCount++;

    showAlert("Tab switching detected.");

    if (tabSwitchCount >= 3) {
      showAlert(
        "Multiple violations detected. Test will be submitted.",
        "error",
      );

      submitExam();
    }
  }
});

document.addEventListener("contextmenu", (e) => e.preventDefault());
document.addEventListener("copy", (e) => e.preventDefault());
document.addEventListener("cut", (e) => e.preventDefault());
document.addEventListener("paste", (e) => e.preventDefault());

document.addEventListener("keydown", function (e) {
  if (
    e.key === "F12" ||
    e.key === "PrintScreen" ||
    (e.ctrlKey && e.key === "u") ||
    (e.ctrlKey && e.key === "s") ||
    (e.ctrlKey && e.shiftKey && e.key === "I")
  ) {
    e.preventDefault();
  }
});

document.getElementById("markBtn").addEventListener("click", () => {
  const q = questions[currentIndex];

  markedQuestions[q.id] = !markedQuestions[q.id];

  updatePalette();
});

async function submitExam() {
  isSubmitting = true;

  clearInterval(timerInterval);

  const now = new Date();

  const { data: attemptData, error: fetchError } = await client
    .from("attempts")
    .select("started_at")
    .eq("id", attemptId)
    .single();

  if (fetchError) {
    console.error("Fetch attempt failed:", fetchError);
    return;
  }

  const nowTime = Date.now();

  const started = Date.parse(attemptData.started_at);

  const timeTaken = Math.floor((nowTime - started) / 1000);

  const { data, error } = await client
    .from("attempts")
    .update({
      submitted_at: now,
      time_taken: timeTaken,
    })
    .eq("id", attemptId)
    .select();

  if (error) {
    console.error("Update failed:", error);
    return;
  }

  console.log("Update success:", data);

  window.location.href = `/mock/result.html?attempt=${attemptId}`;
}

async function loadSavedAnswers() {
  const { data } = await client
    .from("answers")
    .select("question_id, selected_option")
    .eq("attempt_id", attemptId);

  savedAnswers = {};

  data.forEach((a) => {
    savedAnswers[a.question_id] = a.selected_option;
  });

  console.log("Saved answers:", savedAnswers);
}

function updatePalette() {
  const nav = document.getElementById("questionNav");
  nav.innerHTML = "";

  questions.forEach((q, index) => {
    let baseClass =
      "h-11 w-11 rounded-md text-sm font-semibold flex items-center justify-center transition border ";

    if (markedQuestions[q.id]) {
      baseClass += "bg-indigo-500 text-white border-indigo-500";
    } else if (savedAnswers[q.id]) {
      baseClass += "bg-green-500 text-white border-green-500";
    } else if (visitedQuestions[q.id]) {
      baseClass += "bg-amber-400 text-white border-amber-400";
    } else {
      baseClass += "bg-gray-200 border-gray-300";
    }

    if (index === currentIndex) {
      baseClass += " ring-2 ring-blue-600";
    }

    const btn = document.createElement("button");
    btn.innerText = index + 1;
    btn.className = baseClass;
    btn.onclick = () => showQuestion(index);

    nav.appendChild(btn);
  });

  document.getElementById("statTotal").innerText = questions.length;
  document.getElementById("statAnswered").innerText =
    Object.keys(savedAnswers).length;
  document.getElementById("statMarked").innerText =
    Object.keys(markedQuestions).length;
  document.getElementById("statRemaining").innerText =
    questions.length - Object.keys(savedAnswers).length;
}

function renderSections(sections) {
  const container = document.getElementById("sectionTabs");
  container.innerHTML = "";

  sections.forEach((section) => {
    const btn = document.createElement("button");

    btn.className =
      "px-4 py-2 rounded-lg bg-gray-100 hover:bg-blue-100 text-gray-700 font-medium transition";

    btn.innerText = section;

    btn.onclick = () => {
      const index = questions.findIndex((q) => q.section === section);
      if (index !== -1) showQuestion(index);
    };

    container.appendChild(btn);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const rulesModal = document.getElementById("rulesModal");
  const acceptCheckbox = document.getElementById("acceptRules");
  const startBtn = document.getElementById("startTestBtn");
  const examTitle = document.getElementById("examTitle");
  const rulesExamTitle = document.getElementById("rulesExamTitle");
  const openRulesBtn = document.getElementById("openRulesBtn");

  // Dynamically set exam title
  if (examTitle && rulesExamTitle) {
    rulesExamTitle.textContent = examTitle.textContent + " – Instructions";
  }

  // Show modal on load
  rulesModal.classList.remove("hidden");
  rulesModal.classList.add("flex");

  // Lock background scroll (important for mobile)
  document.body.style.overflow = "hidden";

  // Enable button when checkbox checked
  acceptCheckbox.addEventListener("change", () => {
    startBtn.disabled = !acceptCheckbox.checked;
  });

  if (openRulesBtn) {
    openRulesBtn.addEventListener("click", () => {
      rulesModal.classList.remove("hidden");
      rulesModal.classList.add("flex");
      document.body.style.overflow = "hidden";
    });
  }

  // Start Test
  startBtn.addEventListener("click", () => {
    rulesModal.classList.add("hidden");
    document.body.style.overflow = "auto";

    if (typeof startExam === "function") {
      startExam();
    }
  });
});

history.pushState(null, null, location.href);

window.onpopstate = function () {
  history.go(1);
};

setInterval(() => {
  const devtools = window.outerWidth - window.innerWidth > 160;

  if (devtools) {
    showAlert("Developer tools detected. Test will be submitted.", "error");

    submitExam();
  }
}, 2000);

window.addEventListener("offline", () => {
  showAlert("Internet connection lost.", "warning");
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    document.body.style.filter = "blur(20px)";
  } else {
    document.body.style.filter = "none";
  }
});

setInterval(async () => {
  await client
    .from("attempts")
    .update({ last_active: new Date() })
    .eq("id", attemptId);
}, 10000);

function showAlert(message, type = "warning") {
  const container = document.getElementById("examAlertContainer");
  const alertBox = document.getElementById("examAlert");

  container.classList.remove("hidden");

  let colorClass = "";

  if (type === "warning") {
    colorClass = "bg-yellow-100 text-yellow-800 border border-yellow-300";
  }

  if (type === "error") {
    colorClass = "bg-red-100 text-red-800 border border-red-300";
  }

  if (type === "success") {
    colorClass = "bg-green-100 text-green-800 border border-green-300";
  }

  alertBox.className =
    "flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium shadow " +
    colorClass;

  alertBox.innerHTML = `⚠ ${message}`;

  setTimeout(() => {
    container.classList.add("hidden");
  }, 4000);
}
