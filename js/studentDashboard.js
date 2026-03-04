const SUPABASE_URL = "https://sgagswxzsxlgcspwiuoh.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNnYWdzd3h6c3hsZ2NzcHdpdW9oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5NTA1NTIsImV4cCI6MjA2OTUyNjU1Mn0.ZNfk5WNDPkjKcFsRO48rEYk3dhbLYm_m21aZ-wfywo4";

const { createClient } = supabase;
const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

document.addEventListener("DOMContentLoaded", async () => {
  await checkAuth();
  await loadPerformanceAnalytics();
  loadAvailableExams();
});

async function loadPerformanceAnalytics() {
  const {
    data: { user },
  } = await client.auth.getUser();

  const { data } = await client
    .from("attempts")
    .select(
      `
      total_score,
      accuracy,
      time_taken,
      submitted_at,
      scheduled_exams (
        exam_patterns (
          pattern_name
        )
      )
    `,
    )
    .eq("user_id", user.id)
    .not("submitted_at", "is", null);

  if (!data || data.length === 0) {
    document.getElementById("recentAttempts").innerHTML = `
    <div class="p-6 text-center text-gray-500">
      No mock attempts yet. Start your first test 🚀
    </div>
  `;

    return;
  }

  // Total attempts
  document.getElementById("totalAttempts").innerText = data.length;

  // Average accuracy
  const avgAccuracy =
    data.reduce((sum, a) => sum + Number(a.accuracy || 0), 0) / data.length;

  document.getElementById("avgAccuracy").innerText =
    avgAccuracy.toFixed(1) + "%";

  // Best score
  const bestScore = Math.max(...data.map((a) => a.total_score || 0));
  document.getElementById("bestScore").innerText = bestScore;

  // Total time spent
  const totalSeconds = data.reduce((sum, a) => sum + (a.time_taken || 0), 0);

  const hours = (totalSeconds / 3600).toFixed(1);
  document.getElementById("totalTime").innerText = hours + " hrs";

  renderRecentAttempts(data.slice(-5).reverse());
}

async function checkAuth() {
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    window.location.href = "/login.html";
  }
}

async function loadAvailableExams() {
  const { data, error } = await client
    .from("scheduled_exams")
    .select(
      `
  id,
  mode,
  availability_type,
  end_datetime,
  exam_patterns (
    pattern_name,
    duration_minutes,
    negative_marking,
    total_questions
  )
`,
    )
    .eq("is_active", true);
  console.log("DATA:", data);
  console.log("ERROR:", error);
  if (error) {
    console.error(error);
    return;
  }

  const container = document.getElementById("examList");
  container.innerHTML = "";

  data.forEach((exam) => {
    const div = document.createElement("div");
    const isExpired =
      exam.end_datetime && new Date(exam.end_datetime) < new Date();
    div.className =
      "rounded-2xl shadow-md border p-6 hover:shadow-xl transition bg-white hover:-translate-y-1";

    div.innerHTML = `

    <!-- Header -->
    <div>

      <div class="flex justify-between items-start mb-3">

        <h3 class="text-lg font-semibold text-gray-800">
          ${exam.exam_patterns?.pattern_name}
        </h3>

        <span class="px-3 py-1 text-xs font-semibold rounded-full tracking-wide
          ${
            exam.availability_type === "live"
              ? "bg-green-100 text-green-700"
              : "bg-blue-100 text-blue-700"
          }">
          ${exam.availability_type}
        </span>

      </div>

      ${
        isExpired
          ? `
        <div class="text-xs text-red-500 font-medium mb-2">
          This mock is no longer available
        </div>
      `
          : `
        <div class="text-xs text-green-600 font-medium mb-2">
          Available Now
        </div>
      `
      }

      <!-- Details -->
      <div class="text-sm text-gray-600 space-y-2 mb-5">

        <div>
          <strong>Mode:</strong> ${exam.mode}
        </div>

        <div>
          <strong>Duration:</strong> 
          ${exam.exam_patterns?.duration_minutes} minutes
        </div>

        <div>
          <strong>Total Questions:</strong> 
          ${exam.exam_patterns?.total_questions || "—"}
        </div>

        <div>
          <strong>Negative Marking:</strong> 
          ${exam.exam_patterns?.negative_marking || 0}
        </div>

      </div>
    </div>

    <!-- Button -->
    ${
      isExpired
        ? `
          <button 
            class="w-full bg-gray-200 text-gray-400 py-2 rounded-lg cursor-not-allowed font-medium">
            Expired
          </button>
        `
        : `
          <button 
  onclick="startExam('${exam.id}', this)"
  class="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg font-medium transition">
  Start Exam
</button>
        `
    }
`;

    container.appendChild(div);
  });
}

window.startExam = async function (examId, btn) {
  // show loading animation
  btn.disabled = true;
  btn.innerHTML = `
    <span class="flex items-center justify-center gap-2">
      <svg class="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" stroke="white" stroke-width="3" fill="none" opacity="0.3"/>
        <path d="M22 12a10 10 0 0 1-10 10" stroke="white" stroke-width="3" fill="none"/>
      </svg>
      Preparing Exam...
    </span>
  `;

  const {
    data: { user },
  } = await client.auth.getUser();

  // Create attempt
  const { data: newAttempt, error } = await client
    .from("attempts")
    .insert([
      {
        user_id: user.id,
        scheduled_exam_id: examId,
        started_at: new Date(),
      },
    ])
    .select()
    .single();

  if (error) {
    btn.disabled = false;
    btn.innerHTML = "Start Exam";
    alert(error.message);
    return;
  }

  // Get exam pattern
  const { data: exam } = await client
    .from("scheduled_exams")
    .select(`mode, exam_patterns(id)`)
    .eq("id", examId)
    .single();

  const patternId = exam.exam_patterns.id;

  // Fetch sections
  const { data: sections } = await client
    .from("pattern_sections")
    .select("*")
    .eq("pattern_id", patternId);

  let finalQuestions = [];

  const sectionIds = sections.map((s) => s.id);

  const { data: allQuestions } = await client
    .from("questions")
    .select("id, pattern_section_id")
    .in("pattern_section_id", sectionIds);

  sections.forEach((section) => {
    const sectionQuestions = allQuestions
      .filter((q) => q.pattern_section_id === section.id)
      .slice(0, section.question_count);

    finalQuestions = finalQuestions.concat(sectionQuestions);
  });

  const questionRows = finalQuestions.map((q, index) => ({
    attempt_id: newAttempt.id,
    question_id: q.id,
    question_order: index + 1,
  }));

  await client.from("attempt_questions").insert(questionRows);

  window.location.href = `/mock/exam.html?attempt=${newAttempt.id}`;
};

function renderRecentAttempts(attempts) {
  const container = document.getElementById("recentAttempts");

  if (!container) return;

  if (!attempts || attempts.length === 0) {
    container.innerHTML = `
      <div class="p-6 text-center text-gray-500">
        No mock attempts yet. Start your first test 🚀
      </div>
    `;
    return;
  }

  const getAccuracyColor = (acc) => {
    if (acc >= 80) return "text-green-600";
    if (acc >= 60) return "text-amber-500";
    return "text-red-500";
  };
  container.innerHTML = `
    <div class="space-y-4 p-4">

      ${attempts
        .map(
          (a) => `
        <div class="border rounded-xl p-4 shadow-sm">

          <div class="flex justify-between items-center mb-2">
            <div class="font-semibold text-blue-700">
              ${a.scheduled_exams?.exam_patterns?.pattern_name || "Mock"}
            </div>
            <div class="text-xs text-gray-500">
              ${
                a.submitted_at
                  ? new Date(a.submitted_at).toLocaleDateString()
                  : "—"
              }
            </div>
          </div>

          <div class="grid grid-cols-3 text-center text-sm">

            <div>
              <div class="font-semibold">${a.total_score ?? 0}</div>
              <div class="text-gray-500 text-xs">Score</div>
            </div>

            <div>
              <div class="font-semibold ${getAccuracyColor(a.accuracy)}">
                ${a.accuracy ?? 0}%
              </div>
              <div class="text-gray-500 text-xs">Accuracy</div>
            </div>

            <div>
              <div class="font-semibold">
                ${formatDuration(a.time_taken)}
              </div>
              <div class="text-gray-500 text-xs">Time</div>
            </div>

          </div>

        </div>
      `,
        )
        .join("")}

    </div>
  `;
}

function formatDuration(time) {
  if (!time) return "—";

  let seconds = Number(time);

  // If value is too large, it is milliseconds
  if (seconds > 100000) {
    seconds = Math.floor(seconds / 1000);
  }

  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);

  if (hrs > 0) {
    return `${hrs}h ${mins}m`;
  }

  if (mins > 0) {
    return `${mins}m`;
  }

  return "<1m";
}
