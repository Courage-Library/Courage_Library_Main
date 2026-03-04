let attemptId;

document.addEventListener("DOMContentLoaded", async () => {
  const params = new URLSearchParams(window.location.search);
  attemptId = params.get("attempt");

  if (!attemptId) return;

  await loadLeaderboard();
});

async function loadLeaderboard() {
  // Get exam ID from attempt
  const { data: attempt } = await client
    .from("attempts")
    .select("scheduled_exam_id")
    .eq("id", attemptId)
    .single();

  const examId = attempt.scheduled_exam_id;

  // Get all attempts for this exam
  const { data: attempts } = await client
    .from("attempts")
    .select(
      `
      id,
      user_id,
      total_score,
      accuracy,
      submitted_at,
      user_profiles(full_name)
    `,
    )
    .eq("scheduled_exam_id", examId)
    .not("submitted_at", "is", null);

  // Sort manually
  attempts.sort((a, b) => {
    if (b.total_score !== a.total_score) return b.total_score - a.total_score;

    if (b.accuracy !== a.accuracy) return b.accuracy - a.accuracy;

    return new Date(a.submitted_at) - new Date(b.submitted_at);
  });

  renderLeaderboard(attempts);
}

async function renderLeaderboard(attempts) {

  const container = document.getElementById("topRanks");
  container.innerHTML = "";

  let yourRankPosition = 0;

  const totalParticipants = attempts.length;

  attempts.forEach((a, index) => {

    const rank = index + 1;

    if (a.id === attemptId)
      yourRankPosition = rank;

    let medal = "";
    if (rank === 1) medal = "🥇";
    else if (rank === 2) medal = "🥈";
    else if (rank === 3) medal = "🥉";

    const isCurrentUser = a.id === attemptId;

    if (rank <= 10) {

      const div = document.createElement("div");

      div.className =
        `flex justify-between items-center p-4 rounded shadow 
        ${isCurrentUser ? "bg-blue-100 border border-blue-400" : "bg-gray-100"}`;

      div.innerHTML = `
        <div>
          <span class="font-bold text-lg">
            ${medal} #${rank}
          </span>
          <span class="ml-2">
            ${a.user_profiles?.full_name || "Student"}
          </span>
        </div>

        <div class="text-right">
          <div class="font-semibold">
            ${a.total_score} Marks
          </div>
          <div class="text-sm text-gray-600">
            ${a.accuracy}% | ${Math.floor(a.time_taken || 0)} sec
          </div>
        </div>
      `;

      container.appendChild(div);
    }

  });

  document.getElementById("yourRank").innerText =
    yourRankPosition || "Not Ranked";

  // Show participant count
  const countDiv = document.createElement("div");
  countDiv.className = "mt-6 text-center text-gray-600";
  countDiv.innerText = `Total Participants: ${totalParticipants}`;
  container.appendChild(countDiv);
}
