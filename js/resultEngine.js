const SUPABASE_URL = "https://sgagswxzsxlgcspwiuoh.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNnYWdzd3h6c3hsZ2NzcHdpdW9oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5NTA1NTIsImV4cCI6MjA2OTUyNjU1Mn0.ZNfk5WNDPkjKcFsRO48rEYk3dhbLYm_m21aZ-wfywo4";

const { createClient } = supabase;
const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let attemptId;

document.addEventListener("DOMContentLoaded", async () => {
  const params = new URLSearchParams(window.location.search);
  attemptId = params.get("attempt");

  if (!attemptId) return;

  await calculateResult();
});

async function calculateResult() {
  // Get attempt + pattern info
  const { data: attempt } = await client
    .from("attempts")
    .select(
      `
      id,
      scheduled_exams(
        exam_patterns(
          negative_marking
        )
      )
    `,
    )
    .eq("id", attemptId)
    .single();

  const negative = attempt.scheduled_exams.exam_patterns.negative_marking || 0;

  // Get answers + correct answers
  const { data: answers } = await client
    .from("answers")
    .select(
      `
      selected_option,
      questions(
        correct_answer
      )
    `,
    )
    .eq("attempt_id", attemptId);

  let correct = 0;
  let wrong = 0;

  answers.forEach((a) => {
    if (!a.selected_option) return;

    if (a.selected_option === a.questions.correct_answer) {
      correct++;
    } else {
      wrong++;
    }
  });

  const score = correct - wrong * negative;
  const totalAttempted = correct + wrong;
  const accuracy =
    totalAttempted === 0 ? 0 : ((correct / totalAttempted) * 100).toFixed(2);

  // Save result to attempt
  await client
    .from("attempts")
    .update({
      total_score: score,
      accuracy: accuracy,
    })
    .eq("id", attemptId);

  displayResult(score, correct, wrong, accuracy);

  await loadReview();
}

function displayResult(score, correct, wrong, accuracy) {
  document.getElementById("score").innerText = score;
  document.getElementById("correctCount").innerText = correct;
  document.getElementById("wrongCount").innerText = wrong;
  document.getElementById("accuracy").innerText = accuracy + "%";

  // 🔥 Create Leaderboard Button dynamically
  const container = document.querySelector(".glass");

  const link = document.createElement("a");
  link.href = `/mock/leaderboard.html?attempt=${attemptId}`;
  link.innerText = "View Leaderboard";
  link.className =
    "mt-8 inline-block bg-blue-600 text-white px-6 py-2 rounded hover:scale-105 transition";

  container.appendChild(link);
}

async function loadReview() {
  const { data } = await client
    .from("attempt_questions")
    .select(
      `
      question_order,
      questions(*)
    `,
    )
    .eq("attempt_id", attemptId)
    .order("question_order", { ascending: true });

  const { data: answerData } = await client
    .from("answers")
    .select("question_id, selected_option")
    .eq("attempt_id", attemptId);

  const answerMap = {};
  answerData.forEach((a) => {
    answerMap[a.question_id] = a.selected_option;
  });

  const container = document.getElementById("reviewSection");
  container.innerHTML = "";

  data.forEach((item, index) => {
    const q = item.questions;
    const selected = answerMap[q.id];
    const correct = q.correct_answer;

    let statusClass = "";
    if (!selected) statusClass = "bg-gray-100";
    else if (selected === correct)
      statusClass = "bg-green-100 border border-green-400";
    else statusClass = "bg-red-100 border border-red-400";

    const div = document.createElement("div");
    div.className = `p-6 rounded shadow ${statusClass}`;

    div.innerHTML = `
      <h3 class="font-bold mb-3">
        Q${index + 1}. ${q.question_text}
      </h3>

      ${Object.entries(q.options)
        .map(
          ([key, value]) => `
        <div class="mb-1 ${
          key === correct
            ? "text-green-700 font-semibold"
            : key === selected && key !== correct
              ? "text-red-700 font-semibold"
              : ""
        }">
          ${key}. ${value}
        </div>
      `,
        )
        .join("")}

      <div class="mt-3 text-sm">
        Your Answer: ${selected || "Not Attempted"}
        <br>
        Correct Answer: ${correct}
      </div>
    `;

    container.appendChild(div);
  });
}

// Prevent going back to exam page
history.pushState(null, null, location.href);

window.onpopstate = function () {
  window.location.href = "/mock/dashboard.html";
};
