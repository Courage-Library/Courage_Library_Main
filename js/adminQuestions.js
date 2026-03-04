const SUPABASE_URL = "https://sgagswxzsxlgcspwiuoh.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNnYWdzd3h6c3hsZ2NzcHdpdW9oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5NTA1NTIsImV4cCI6MjA2OTUyNjU1Mn0.ZNfk5WNDPkjKcFsRO48rEYk3dhbLYm_m21aZ-wfywo4";

const { createClient } = supabase;
const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

document.addEventListener("DOMContentLoaded", async () => {
  await loadCategories();
  setupCategoryListener(); // 👈 ADD THIS
  setupPatternListener(); // 👈 ADD THIS
  loadQuestions();
});

async function loadCategories() {
  const { data } = await client.from("exam_categories").select("id, name");

  const select = document.getElementById("questionCategory");
  select.innerHTML = `<option value="">Select Category</option>`;

  data.forEach((cat) => {
    select.innerHTML += `<option value="${cat.id}">${cat.name}</option>`;
  });
}

function setupCategoryListener() {
  document
    .getElementById("questionCategory")
    .addEventListener("change", async (e) => {
      const categoryId = e.target.value;

      const { data } = await client
        .from("exam_patterns")
        .select("id, pattern_name")
        .eq("category_id", categoryId);

      const patternSelect = document.getElementById("questionPattern");
      patternSelect.innerHTML = `<option value="">Select Pattern</option>`;

      data.forEach((pattern) => {
        patternSelect.innerHTML += `
          <option value="${pattern.id}">
            ${pattern.pattern_name}
          </option>
        `;
      });

      // Reset sections when category changes
      document.getElementById("questionSection").innerHTML =
        `<option value="">Select Section</option>`;
    });
}

function setupPatternListener() {
  document
    .getElementById("questionPattern")
    .addEventListener("change", async (e) => {
      const patternId = e.target.value;

      const { data } = await client
        .from("pattern_sections")
        .select("id, section_name")
        .eq("pattern_id", patternId);

      const sectionSelect = document.getElementById("questionSection");
      sectionSelect.innerHTML = `<option value="">Select Section</option>`;

      data.forEach((section) => {
        sectionSelect.innerHTML += `
          <option value="${section.id}">
            ${section.section_name}
          </option>
        `;
      });
    });
}

document
  .getElementById("addQuestionBtn")
  .addEventListener("click", addQuestion);

async function addQuestion() {
  const category_id = document.getElementById("questionCategory").value;
  const question_text = document.getElementById("questionText").value;

  const options = {
    A: document.getElementById("optionA").value,
    B: document.getElementById("optionB").value,
    C: document.getElementById("optionC").value,
    D: document.getElementById("optionD").value,
  };

  const correct_answer = document.getElementById("correctAnswer").value;
  const difficulty = document.getElementById("difficulty").value;
  const explanation = document.getElementById("explanation").value;

  if (!category_id || !question_text || !correct_answer) {
    alert("Required fields missing");
    return;
  }

  const pattern_section_id = document.getElementById("questionSection").value;

  if (
    !category_id ||
    !pattern_section_id ||
    !question_text ||
    !correct_answer
  ) {
    alert("Required fields missing");
    return;
  }

  const { error } = await client.from("questions").insert([
    {
      category_id,
      pattern_section_id,
      question_text,
      options,
      correct_answer,
      difficulty,
      explanation,
      is_active: true,
    },
  ]);

  if (error) alert(error.message);
  else {
    alert("Question added");
    loadQuestions();
  }
}

async function loadQuestions() {
  const { data } = await client
    .from("questions")
    .select("id, question_text, difficulty")
    .order("created_at", { ascending: false });

  const list = document.getElementById("questionList");
  list.innerHTML = "";

  data.forEach((q) => {
    const div = document.createElement("div");
    div.className = "glass p-6 shadow-xl border-l-4 border-blue-400";

    div.innerHTML = `
      <p class="font-semibold text-blue-700">${q.question_text}</p>
      <p class="text-sm text-gray-600">Difficulty: ${q.difficulty}</p>
    `;

    list.appendChild(div);
  });
}

function generatePrompt() {
  const categoryId = document.getElementById("questionCategory").value;
  const sectionId = document.getElementById("questionSection").value;
  const questions = document.getElementById("questionInput").value;

  if (!categoryId || !sectionId) {
    alert("Please select category and section first.");
    return;
  }

  const prompt = `Convert the following questions into CSV format for database upload.

CSV columns:
category_id,pattern_section_id,question_text,options,correct_answer,difficulty,explanation,is_active

Rules:
- Include the header row in the CSV
- options must be JSON like {"A":"Option A","B":"Option B","C":"Option C","D":"Option D"}
- correct_answer must be A/B/C/D
- difficulty must be one of: easy, medium, hard
- choose difficulty relative to the exam category level
- easier exam categories should mostly contain easy/medium questions
- more competitive exam categories should include medium/hard questions
- difficulty must be lowercase: easy, medium, hard
- explanation required
- is_active always true

Use these values:
category_id=${categoryId}
pattern_section_id=${sectionId}

Questions:
${questions}

Return CSV including the header row.
Do not include explanation or markdown.
`;

  document.getElementById("generatedPrompt").value = prompt;
}

function copyPrompt() {
  const textarea = document.getElementById("generatedPrompt");

  textarea.select();
  textarea.setSelectionRange(0, 99999);

  navigator.clipboard.writeText(textarea.value);

  alert("Prompt copied to clipboard.");
}
