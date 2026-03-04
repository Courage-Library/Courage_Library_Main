const SUPABASE_URL = "https://sgagswxzsxlgcspwiuoh.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNnYWdzd3h6c3hsZ2NzcHdpdW9oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5NTA1NTIsImV4cCI6MjA2OTUyNjU1Mn0.ZNfk5WNDPkjKcFsRO48rEYk3dhbLYm_m21aZ-wfywo4";

const { createClient } = supabase;
const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

document.addEventListener("DOMContentLoaded", async () => {
  await loadPatterns();
  loadSchedules();
});

async function loadPatterns() {
  const { data } = await client
    .from("exam_patterns")
    .select("id, pattern_name");

  const select = document.getElementById("schedulePattern");
  select.innerHTML = `<option value="">Select Pattern</option>`;

  data.forEach((p) => {
    select.innerHTML += `<option value="${p.id}">${p.pattern_name}</option>`;
  });
}

document
  .getElementById("scheduleExamBtn")
  .addEventListener("click", createSchedule);

async function createSchedule() {
  const pattern_id = document.getElementById("schedulePattern").value;
  const mode = document.getElementById("scheduleMode").value;
  const availability_type = document.getElementById("availabilityType").value;
  const start_datetime = document.getElementById("startDatetime").value || null;
  const end_datetime = document.getElementById("endDatetime").value || null;
  const attempt_limit = document.getElementById("attemptLimit").value || null;
  const enable_leaderboard =
    document.getElementById("enableLeaderboard").checked;
  const is_premium = document.getElementById("isPremium").checked;

  if (!pattern_id) {
    alert("Pattern required");
    return;
  }

  const { error } = await client.from("scheduled_exams").insert([
    {
      pattern_id,
      mode,
      availability_type,
      start_datetime,
      end_datetime,
      attempt_limit,
      enable_leaderboard,
      is_premium,
      is_active: true,
    },
  ]);

  if (error) alert(error.message);
  else {
    alert("Exam scheduled");
    loadSchedules();
  }
}

async function loadSchedules() {
  const { data } = await client
    .from("scheduled_exams")
    .select(
      `
      id,
      mode,
      availability_type,
      is_active,
      exam_patterns(pattern_name)
    `,
    )
    .order("created_at", { ascending: false });

  const list = document.getElementById("scheduleList");
  list.innerHTML = "";

  data.forEach((s) => {
    const div = document.createElement("div");
    div.className = "glass p-6 shadow-xl border-l-4 border-blue-400";

    div.innerHTML = `
<h3 class="font-bold text-blue-700">
${s.exam_patterns?.pattern_name}
</h3>

<p class="text-sm text-gray-600 mt-1">
<strong>Test Format:</strong> ${s.mode}
</p>

<p class="text-sm text-gray-600">
<strong>Access Type:</strong> ${s.availability_type}
</p>
`;

    list.appendChild(div);
  });
}

document
  .getElementById("schedulePattern")
  .addEventListener("change", loadExamPreview);

async function loadExamPreview() {
  const patternId = document.getElementById("schedulePattern").value;
  if (!patternId) return;

  // Fetch pattern details
  const { data: pattern } = await client
    .from("exam_patterns")
    .select(
      "pattern_name,total_questions,total_marks,duration_minutes,negative_marking",
    )
    .eq("id", patternId)
    .single();

  // Fetch sections
  const { data: sections } = await client
    .from("pattern_sections")
    .select("section_name,question_count,marks_per_question")
    .eq("pattern_id", patternId);

  const preview = document.getElementById("examPreview");
  const summaryText = document.getElementById("examSummaryText");
  const sectionList = document.getElementById("sectionListPreview");

  preview.classList.remove("hidden");

  summaryText.innerHTML = `
    <strong>${pattern.pattern_name}</strong><br>
    Total Questions: ${pattern.total_questions}<br>
    Total Marks: ${pattern.total_marks}<br>
    Duration: ${pattern.duration_minutes} minutes<br>
    Negative Marking: ${pattern.negative_marking}
  `;

  sectionList.innerHTML = "<div class='font-semibold text-gray-700 mb-1'>Sections</div>";

  sections.forEach((sec) => {
    const div = document.createElement("div");

    div.innerHTML = `
      • ${sec.section_name} — 
      ${sec.question_count} Questions × 
      ${sec.marks_per_question} Marks
    `;

    sectionList.appendChild(div);
  });
}
