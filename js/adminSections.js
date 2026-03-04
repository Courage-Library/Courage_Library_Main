const SUPABASE_URL = "https://sgagswxzsxlgcspwiuoh.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNnYWdzd3h6c3hsZ2NzcHdpdW9oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5NTA1NTIsImV4cCI6MjA2OTUyNjU1Mn0.ZNfk5WNDPkjKcFsRO48rEYk3dhbLYm_m21aZ-wfywo4";

const { createClient } = supabase;
const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function checkAdmin() {
  const { data: { user } } = await client.auth.getUser();
  if (!user) window.location.href = "../index.html?checkAuth=1";
}

async function loadPatterns() {
  const { data, error } = await client
    .from("exam_patterns")
    .select("id, pattern_name");

  if (error) {
    console.error("Pattern load error:", error);
    return;
  }

  console.log("Patterns fetched:", data);

  const select = document.getElementById("sectionPattern");
  if (!select) return;

  select.innerHTML = `<option value="">Select Pattern</option>`;

  if (!data || data.length === 0) {
    select.innerHTML += `<option disabled>No patterns found</option>`;
    return;
  }

  data.forEach(p => {
    const option = document.createElement("option");
    option.value = p.id;
    option.textContent = p.pattern_name;
    select.appendChild(option);
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  await checkAdmin();
  loadPatterns();
  loadSections();

  document
    .getElementById("addSectionBtn")
    ?.addEventListener("click", addSection);
});

async function addSection() {
  const pattern_id = document.getElementById("sectionPattern").value;
  const section_name = document.getElementById("sectionName").value;
  const question_count = parseInt(document.getElementById("questionCount").value);
  const marks_per_question = parseFloat(document.getElementById("marksPerQuestion").value);

  if (!pattern_id || !section_name) {
    alert("Pattern & Section name required");
    return;
  }

  const { error } = await client
    .from("pattern_sections")
    .insert([{
      pattern_id,
      section_name,
      question_count,
      marks_per_question
    }]);

  if (error) alert(error.message);
  else {
    alert("Section added");
    loadSections();
  }
}

async function loadSections() {
  const { data } = await client
    .from("pattern_sections")
    .select(`
      id,
      section_name,
      question_count,
      marks_per_question,
      exam_patterns(pattern_name)
    `)
    .order("created_at", { ascending: false });

  const list = document.getElementById("sectionList");
  list.innerHTML = "";

  data.forEach(sec => {
    const div = document.createElement("div");
    div.className = "glass p-6 shadow-xl border-l-4 border-blue-400";

    div.innerHTML = `
      <h3 class="text-lg font-bold text-blue-700">
        ${sec.exam_patterns?.pattern_name}
      </h3>
      <p class="text-sm text-gray-600">
        ${sec.section_name} — ${sec.question_count} Questions × ${sec.marks_per_question} Marks
      </p>
    `;

    list.appendChild(div);
  });
}