const SUPABASE_URL = "https://sgagswxzsxlgcspwiuoh.supabase.co";
const SUPABASE_ANON_KEY =   "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNnYWdzd3h6c3hsZ2NzcHdpdW9oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5NTA1NTIsImV4cCI6MjA2OTUyNjU1Mn0.ZNfk5WNDPkjKcFsRO48rEYk3dhbLYm_m21aZ-wfywo4";

const { createClient } = supabase;
const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

document.addEventListener("DOMContentLoaded", async () => {
  await checkAdmin();
  loadCategories();
  loadPatterns();
});

async function checkAdmin() {
  const { data: { user } } = await client.auth.getUser();
  if (!user) window.location.href = "../index.html?checkAuth=1";
}

async function loadCategories() {
  const { data } = await client.from("exam_categories").select("*");

  const select = document.getElementById("patternCategory");
  select.innerHTML = `<option value="">Select Category</option>`;

  data.forEach(cat => {
    select.innerHTML += `<option value="${cat.id}">${cat.name}</option>`;
  });
}

document
  .getElementById("createPatternBtn")
  .addEventListener("click", createPattern);

async function createPattern() {
  const category_id = document.getElementById("patternCategory").value;
  const pattern_name = document.getElementById("patternName").value;
  const total_questions = parseInt(document.getElementById("totalQuestions").value);
  const total_marks = parseInt(document.getElementById("totalMarks").value);
  const duration_minutes = parseInt(document.getElementById("durationMinutes").value);
  const negative_marking = parseFloat(document.getElementById("negativeMarking").value) || 0;

  if (!category_id || !pattern_name) {
    alert("Category & Pattern name required");
    return;
  }

  const { error } = await client.from("exam_patterns").insert([{
    category_id,
    pattern_name,
    total_questions,
    total_marks,
    duration_minutes,
    negative_marking
  }]);

  if (error) alert(error.message);
  else {
    alert("Pattern created");
    loadPatterns();
  }
}

async function loadPatterns() {
  const { data } = await client
    .from("exam_patterns")
    .select(`
      id,
      pattern_name,
      total_questions,
      duration_minutes,
      exam_categories(name)
    `)
    .order("created_at", { ascending: false });

  const list = document.getElementById("patternList");
  list.innerHTML = "";

  data.forEach(p => {
    const div = document.createElement("div");
    div.className =
      "glass p-6 shadow-xl border-l-4 border-blue-400";

    div.innerHTML = `
      <h3 class="text-lg font-bold text-blue-700">
        ${p.exam_categories?.name} – ${p.pattern_name}
      </h3>
      <p class="text-sm text-gray-600">
        ${p.total_questions} Questions | ${p.duration_minutes} Minutes
      </p>
    `;

    list.appendChild(div);
  });
}