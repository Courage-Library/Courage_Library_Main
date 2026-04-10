const SUPABASE_URL = "https://sgagswxzsxlgcspwiuoh.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNnYWdzd3h6c3hsZ2NzcHdpdW9oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5NTA1NTIsImV4cCI6MjA2OTUyNjU1Mn0.ZNfk5WNDPkjKcFsRO48rEYk3dhbLYm_m21aZ-wfywo4";

const { createClient } = window.supabase;
const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── Admin auth guard — verified against user_profiles table ──
async function checkAdminAuth() {
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    window.location.href = "/index.html?checkAuth=1";
    return false;
  }
  const { data: profile } = await client
    .from("user_profiles")
    .select("is_admin, role")
    .eq("id", user.id)
    .single();

  const isAdmin = profile?.is_admin === true || profile?.role === "super_admin";
  if (!isAdmin) {
    window.location.href = "/mock/dashboard.html";
    return false;
  }
  return true;
}

// ── Current options type ──
let currentOptionsType = "text";

document.addEventListener("DOMContentLoaded", async () => {
  const ok = await checkAdminAuth();
  if (!ok) return;
  await loadCategories();
  await loadSectionFilterOptions();
  setupCategoryListener();
  setupPatternListener();
  loadQuestions();
  switchOptionsType("text");
});

// Populate the section filter dropdown with all sections
async function loadSectionFilterOptions() {
  const { data } = await client
    .from("pattern_sections")
    .select("id, section_name")
    .order("section_name", { ascending: true });

  const select = document.getElementById("qSectionFilter");
  if (!select || !data) return;

  // Trim all names first, then deduplicate
  const seen = new Set();
  data.forEach((s) => {
    const name = (s.section_name || "").trim();
    if (!name || seen.has(name.toLowerCase())) return;
    seen.add(name.toLowerCase());
    select.innerHTML += `<option value="${name}">${name}</option>`;
  });
}

// ─────────────────────────────────────────────
//  DROPDOWNS
// ─────────────────────────────────────────────

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
      data.forEach((p) => {
        patternSelect.innerHTML += `<option value="${p.id}">${p.pattern_name}</option>`;
      });
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
      data.forEach((s) => {
        sectionSelect.innerHTML += `<option value="${s.id}">${s.section_name}</option>`;
      });
    });
}

// ─────────────────────────────────────────────
//  OPTIONS TYPE SWITCHER
// ─────────────────────────────────────────────

function switchOptionsType(type) {
  currentOptionsType = type;

  // Update radio button label styles
  ["Text", "Image", "Mixed"].forEach((t) => {
    const lbl = document.getElementById(`optType${t}Label`);
    if (!lbl) return;
    if (t.toLowerCase() === type) {
      lbl.classList.add("border-blue-500", "bg-blue-50", "text-blue-700");
      lbl.classList.remove("border-gray-200", "text-gray-500");
    } else {
      lbl.classList.remove("border-blue-500", "bg-blue-50", "text-blue-700");
      lbl.classList.add("border-gray-200", "text-gray-500");
    }
  });

  // Show/hide text inputs and image upload rows per option
  const showText = type === "text" || type === "mixed";
  const showImage = type === "image" || type === "mixed";

  ["A", "B", "C", "D"].forEach((key) => {
    const textInput = document.getElementById(`option${key}`);
    const imgRow = document.getElementById(`opt${key}ImgRow`);
    if (textInput) textInput.style.display = showText ? "block" : "none";
    if (imgRow) imgRow.classList.toggle("visible", showImage);
  });
}

// ─────────────────────────────────────────────
//  IMAGE UPLOAD HELPERS
// ─────────────────────────────────────────────

function showUploadStatus(text) {
  const el = document.getElementById("uploadStatus");
  document.getElementById("uploadStatusText").textContent = text;
  el.classList.remove("hidden");
}
function hideUploadStatus() {
  document.getElementById("uploadStatus").classList.add("hidden");
}

async function uploadImageToStorage(file, folder) {
  const ext = file.name.split(".").pop();
  const fileName = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

  const { data, error } = await client.storage
    .from("question-images")
    .upload(fileName, file, { cacheControl: "3600", upsert: false });

  if (error) throw error;

  const { data: urlData } = client.storage
    .from("question-images")
    .getPublicUrl(fileName);

  return urlData.publicUrl;
}

// ── Question figure image ──
async function handleQImgSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  const zone = document.getElementById("qImgZone");
  zone.classList.add("uploading");
  showUploadStatus("Uploading question image...");

  try {
    const url = await uploadImageToStorage(file, "questions");
    document.getElementById("questionImageUrl").value = url;

    // Preview
    const preview = document.getElementById("qImgPreview");
    document.getElementById("qImgPreviewImg").src = url;
    preview.classList.remove("hidden");

    document.getElementById("qImgLabel").textContent = "✓ Image uploaded";
    zone.classList.remove("uploading");
    zone.classList.add("done");
  } catch (err) {
    alert("Image upload failed: " + err.message);
    zone.classList.remove("uploading");
  } finally {
    hideUploadStatus();
  }
}

function clearQImg() {
  document.getElementById("questionImageUrl").value = "";
  document.getElementById("qImgPreviewImg").src = "";
  document.getElementById("qImgPreview").classList.add("hidden");
  document.getElementById("qImgLabel").textContent =
    "Click to upload question image";
  document.getElementById("qImgZone").classList.remove("done");
  document.getElementById("qImgInput").value = "";
}

// ── Option image ──
async function handleOptImgSelect(event, key) {
  const file = event.target.files[0];
  if (!file) return;

  showUploadStatus(`Uploading Option ${key} image...`);

  try {
    const url = await uploadImageToStorage(file, "options");
    document.getElementById(`opt${key}ImgUrl`).value = url;

    const preview = document.getElementById(`opt${key}ImgPreview`);
    preview.src = url;
    preview.classList.remove("hidden");

    document.getElementById(`opt${key}ImgLabel`).textContent =
      `✓ Option ${key} image uploaded`;
  } catch (err) {
    alert(`Option ${key} image upload failed: ` + err.message);
  } finally {
    hideUploadStatus();
  }
}

// ─────────────────────────────────────────────
//  ADD QUESTION
// ─────────────────────────────────────────────

document
  .getElementById("addQuestionBtn")
  .addEventListener("click", addQuestion);

async function addQuestion() {
  const category_id = document.getElementById("questionCategory").value;
  const pattern_section_id = document.getElementById("questionSection").value;
  const question_text = document.getElementById("questionText").value.trim();
  const correct_answer = document.getElementById("correctAnswer").value;
  const difficulty = document.getElementById("difficulty").value;
  const explanation = document.getElementById("explanation").value.trim();
  const question_image =
    document.getElementById("questionImageUrl").value || null;
  const pyq_source_raw = document.getElementById("pyqSource").value.trim();
  const pyq_year_raw = document.getElementById("pyqYear").value.trim();
  const options_type = currentOptionsType;

  // Validation
  if (
    !category_id ||
    !pattern_section_id ||
    !question_text ||
    !correct_answer
  ) {
    alert("Please fill: Category, Section, Question Text, and Correct Answer.");
    return;
  }

  // Build options object based on type
  let options = {};

  if (options_type === "text") {
    // Plain text options — original format
    options = {
      A: document.getElementById("optionA").value.trim(),
      B: document.getElementById("optionB").value.trim(),
      C: document.getElementById("optionC").value.trim(),
      D: document.getElementById("optionD").value.trim(),
    };
    if (!options.A || !options.B || !options.C || !options.D) {
      alert("Please fill all 4 option texts.");
      return;
    }
  } else if (options_type === "image") {
    // All options are images — store URLs as values
    const urlA = document.getElementById("optAImgUrl").value;
    const urlB = document.getElementById("optBImgUrl").value;
    const urlC = document.getElementById("optCImgUrl").value;
    const urlD = document.getElementById("optDImgUrl").value;
    if (!urlA || !urlB || !urlC || !urlD) {
      alert("Please upload images for all 4 options.");
      return;
    }
    options = { A: urlA, B: urlB, C: urlC, D: urlD };
  } else if (options_type === "mixed") {
    // Mixed — each option has text and/or image
    ["A", "B", "C", "D"].forEach((key) => {
      options[key] = {
        text: document.getElementById(`option${key}`).value.trim() || null,
        image: document.getElementById(`opt${key}ImgUrl`).value || null,
      };
    });
    // Validate at least one of text/image per option
    const incomplete = ["A", "B", "C", "D"].filter(
      (k) => !options[k].text && !options[k].image,
    );
    if (incomplete.length) {
      alert(`Options ${incomplete.join(", ")} need at least text or an image.`);
      return;
    }
  }

  // PYQ values
  const pyq_year = pyq_year_raw ? parseInt(pyq_year_raw) : null;
  const pyq_source = pyq_source_raw ? pyq_source_raw : null;

  // Disable button during save
  const btn = document.getElementById("addQuestionBtn");
  btn.disabled = true;
  btn.innerHTML = `<svg class="w-4 h-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path></svg> Saving...`;

  const { error } = await client.from("questions").insert([
    {
      category_id,
      pattern_section_id,
      question_text,
      options,
      options_type,
      question_image,
      correct_answer,
      difficulty,
      explanation,
      pyq_year,
      pyq_source,
      is_active: true,
      language: document.getElementById("questionLanguage")?.value || "english",
    },
  ]);

  btn.disabled = false;
  btn.innerHTML = `<i class="fas fa-plus-circle"></i> Add Question`;

  if (error) {
    alert("Error: " + error.message);
  } else {
    // Reset form
    resetForm();
    loadQuestions();
    alert("✓ Question added successfully!");
  }
}

function resetForm() {
  document.getElementById("questionText").value = "";
  document.getElementById("explanation").value = "";
  document.getElementById("optionA").value = "";
  document.getElementById("optionB").value = "";
  document.getElementById("optionC").value = "";
  document.getElementById("optionD").value = "";
  document.getElementById("correctAnswer").value = "";
  document.getElementById("pyqSource").value = "";
  document.getElementById("pyqYear").value = "";
  document.getElementById("questionImageUrl").value = "";
  document.getElementById("qImgPreview").classList.add("hidden");
  document.getElementById("qImgLabel").textContent =
    "Click to upload question image";
  document.getElementById("qImgZone").classList.remove("done");

  ["A", "B", "C", "D"].forEach((key) => {
    document.getElementById(`opt${key}ImgUrl`).value = "";
    const preview = document.getElementById(`opt${key}ImgPreview`);
    if (preview) {
      preview.src = "";
      preview.classList.add("hidden");
    }
    const label = document.getElementById(`opt${key}ImgLabel`);
    if (label) label.textContent = `Upload image for Option ${key}`;
  });

  // Reset to text type
  document.getElementById("optTypeText").checked = true;
  switchOptionsType("text");
}

// ─────────────────────────────────────────────
//  QUESTION LIST — SEARCH + FILTER + PAGINATION
// ─────────────────────────────────────────────

const PAGE_SIZE = 20;
let currentPage = 0;
let totalCount = 0;
let searchDebounceTimer;

// State
let filterState = {
  search: "",
  difficulty: "",
  pyq: "", // "pyq" | "" (all)
  section: "", // pattern_section_id
  language: "",
};

// Called on page load and after any filter change
async function loadQuestions(resetPage = true) {
  if (resetPage) currentPage = 0;

  const list = document.getElementById("questionList");
  list.innerHTML = `
    <div class="flex items-center justify-center py-10 text-gray-400 text-sm gap-2">
      <svg class="w-4 h-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
      </svg>
      Loading...
    </div>`;

  const from = currentPage * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = client
    .from("questions")
    .select(
      `
      id, question_text, difficulty, options_type,
      pyq_year, pyq_source, question_image, is_active, language,
      pattern_section_id,
      category_id,
      exam_categories(name)
    `,
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(from, to);

  // Search filter — Supabase ilike for partial match
  if (filterState.search.trim()) {
    query = query.ilike("question_text", `%${filterState.search.trim()}%`);
  }

  // Difficulty filter
  if (filterState.difficulty) {
    query = query.eq("difficulty", filterState.difficulty);
  }

  // PYQ filter
  if (filterState.pyq === "pyq") {
    query = query.not("pyq_year", "is", null);
  }

  // Section filter — get all section IDs matching the name, then filter
  if (filterState.section) {
    const { data: sectionIds } = await client
      .from("pattern_sections")
      .select("id")
      .ilike("section_name", filterState.section.trim());
    const ids = (sectionIds || []).map((s) => s.id);
    if (ids.length) {
      query = query.in("pattern_section_id", ids);
    }
  }

  // Language filter
  if (filterState.language) {
    query = query.eq("language", filterState.language);
  }

  const { data, count, error } = await query;

  if (error) {
    list.innerHTML = `<p class="text-red-500 text-sm p-4">Error loading questions: ${error.message}</p>`;
    return;
  }

  totalCount = count || 0;
  renderQuestionList(data || []);
  renderPagination();
}

function renderQuestionList(data) {
  const list = document.getElementById("questionList");

  // Show total count
  const countEl = document.getElementById("questionCount");
  if (countEl) {
    const start = currentPage * PAGE_SIZE + 1;
    const end = Math.min((currentPage + 1) * PAGE_SIZE, totalCount);
    countEl.textContent =
      totalCount === 0
        ? "No questions found"
        : `Showing ${start}–${end} of ${totalCount} questions`;
  }

  if (!data.length) {
    list.innerHTML = `
      <div class="text-center py-12 text-gray-400">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-10 h-10 mx-auto mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 15.803a7.5 7.5 0 0 0 10.607 0Z"/>
        </svg>
        <p class="text-sm font-medium">No questions match your filters</p>
        <button onclick="resetFilters()" class="mt-3 text-xs text-blue-600 hover:underline">Clear all filters</button>
      </div>`;
    return;
  }

  list.innerHTML = "";
  data.forEach((q) => {
    const div = document.createElement("div");
    div.className =
      "bg-white border border-gray-100 rounded-xl p-4 shadow-sm space-y-2";

    const categoryName = q.exam_categories?.name || "";
    const categoryHtml = categoryName
      ? `<span class="text-xs bg-gray-100 border border-gray-200 text-gray-600 px-2 py-0.5 rounded-lg font-medium">${categoryName}</span>`
      : "";

    const pyqHtml = q.pyq_year
      ? `<span class="text-xs bg-amber-50 border border-amber-200 text-amber-700 px-2 py-0.5 rounded-lg font-medium">PYQ ${q.pyq_source ? q.pyq_source + " · " : ""}${q.pyq_year}</span>`
      : "";

    const imgHtml = q.question_image
      ? `<img src="${q.question_image}" class="h-8 w-12 object-contain rounded border border-gray-200 inline-block ml-1 align-middle">`
      : "";

    const typeHtml =
      q.options_type && q.options_type !== "text"
        ? `<span class="text-xs bg-indigo-50 border border-indigo-200 text-indigo-600 px-2 py-0.5 rounded-lg font-medium">${q.options_type} options</span>`
        : "";

    const langBadge =
      q.language === "hindi"
        ? `<span class="text-xs bg-orange-50 border border-orange-200 text-orange-600 px-2 py-0.5 rounded-lg font-medium">🇮🇳 Hindi</span>`
        : "";

    const inactiveBadge = !q.is_active
      ? `<span class="text-xs bg-red-50 border border-red-200 text-red-500 px-2 py-0.5 rounded-lg font-medium">Inactive</span>`
      : "";

    div.innerHTML = `
      <div class="flex items-start justify-between gap-2">
        <p class="font-semibold text-gray-800 text-sm leading-snug flex-1 line-clamp-2">${q.question_text}${imgHtml}</p>
        <button onclick="openEditModal('${q.id}')"
          class="flex-shrink-0 flex items-center gap-1.5 text-xs bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-600 px-3 py-1.5 rounded-lg font-semibold transition">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z"/>
          </svg>
          Edit
        </button>
      </div>
      <div class="flex flex-wrap gap-1.5 items-center">
        ${categoryHtml}
        <span class="text-xs px-2 py-0.5 rounded-lg font-medium
          ${
            q.difficulty === "easy"
              ? "bg-green-50 text-green-700 border border-green-200"
              : q.difficulty === "medium"
                ? "bg-amber-50 text-amber-700 border border-amber-200"
                : "bg-red-50 text-red-700 border border-red-200"
          }">
          ${q.difficulty}
        </span>
        ${pyqHtml}
        ${typeHtml}
        ${langBadge}
        ${inactiveBadge}
      </div>
    `;
    list.appendChild(div);
  });
}

function renderPagination() {
  const container = document.getElementById("paginationContainer");
  if (!container) return;

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  if (totalPages <= 1) {
    container.innerHTML = "";
    return;
  }

  const prev = currentPage > 0;
  const next = currentPage < totalPages - 1;

  // Show up to 5 page buttons around current
  let pages = [];
  for (let i = 0; i < totalPages; i++) {
    if (i === 0 || i === totalPages - 1 || Math.abs(i - currentPage) <= 1) {
      pages.push(i);
    }
  }
  // Deduplicate and add ellipsis markers
  let pageButtons = "";
  let last = -1;
  pages.forEach((p) => {
    if (last !== -1 && p - last > 1) {
      pageButtons += `<span class="px-2 text-gray-400 text-xs self-center">…</span>`;
    }
    pageButtons += `
      <button onclick="goToPage(${p})"
        class="w-8 h-8 rounded-lg text-xs font-bold transition
          ${
            p === currentPage
              ? "bg-blue-600 text-white shadow-sm"
              : "bg-white border border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-600"
          }">
        ${p + 1}
      </button>`;
    last = p;
  });

  container.innerHTML = `
    <div class="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
      <button onclick="goToPage(${currentPage - 1})"
        ${!prev ? "disabled" : ""}
        class="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-600 transition disabled:opacity-30 disabled:pointer-events-none">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5"/>
        </svg>
        Prev
      </button>

      <div class="flex items-center gap-1">
        ${pageButtons}
      </div>

      <button onclick="goToPage(${currentPage + 1})"
        ${!next ? "disabled" : ""}
        class="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-600 transition disabled:opacity-30 disabled:pointer-events-none">
        Next
        <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5"/>
        </svg>
      </button>
    </div>`;
}

function goToPage(page) {
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  if (page < 0 || page >= totalPages) return;
  currentPage = page;
  loadQuestions(false);
  // Scroll to top of question list
  document
    .getElementById("questionList")
    .scrollIntoView({ behavior: "smooth", block: "start" });
}

// ── Filter handlers ──
function onSearchInput(val) {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    filterState.search = val;
    loadQuestions(true);
  }, 350); // debounce 350ms so it doesn't fire on every keystroke
}

function onDifficultyFilter(val) {
  filterState.difficulty = val;
  loadQuestions(true);
}

function onPyqFilter(val) {
  filterState.pyq = val;
  loadQuestions(true);
}

function onSectionFilter(val) {
  filterState.section = val;
  loadQuestions(true);
}

function resetFilters() {
  filterState = {
    search: "",
    difficulty: "",
    pyq: "",
    section: "",
    language: "",
  };
  document.getElementById("qSearchInput").value = "";
  document.getElementById("qDiffFilter").value = "";
  document.getElementById("qPyqFilter").value = "";
  document.getElementById("qSectionFilter").value = "";
  const qLangFilter = document.getElementById("qLangFilter");
  if (qLangFilter) qLangFilter.value = "";
  loadQuestions(true);
}

function onLanguageFilter(val) {
  filterState.language = val;
  loadQuestions(true);
}
// ─────────────────────────────────────────────
//  EDIT MODAL — OPEN
// ─────────────────────────────────────────────

async function openEditModal(questionId) {
  const { data: q, error } = await client
    .from("questions")
    .select(
      "id, question_text, options, options_type, question_image, correct_answer, difficulty, explanation, pyq_year, pyq_source, is_active, language",
    )
    .eq("id", questionId)
    .single();

  if (error || !q) {
    alert("Could not load question.");
    return;
  }

  // Populate fields
  document.getElementById("editQuestionId").value = q.id;
  document.getElementById("editQuestionText").value = q.question_text || "";
  document.getElementById("editExplanation").value = q.explanation || "";
  document.getElementById("editCorrectAnswer").value = q.correct_answer || "A";
  document.getElementById("editDifficulty").value = q.difficulty || "easy";
  document.getElementById("editPyqSource").value = q.pyq_source || "";
  document.getElementById("editPyqYear").value = q.pyq_year || "";
  document.getElementById("editIsActive").checked = q.is_active !== false;
  const editLang = document.getElementById("editLanguage");
  if (editLang) editLang.value = q.language || "english";

  // Options — only text type supported in edit for simplicity
  // (image/mixed options editing via re-upload is complex; show current values as text)
  const opts = q.options || {};
  const getOptText = (val) => {
    if (!val) return "";
    if (typeof val === "string") return val;
    if (typeof val === "object") return val.text || val.image || "";
    return String(val);
  };
  document.getElementById("editOptionA").value = getOptText(opts["A"]);
  document.getElementById("editOptionB").value = getOptText(opts["B"]);
  document.getElementById("editOptionC").value = getOptText(opts["C"]);
  document.getElementById("editOptionD").value = getOptText(opts["D"]);

  // Question image
  const imgUrl = q.question_image || "";
  document.getElementById("editQuestionImageUrl").value = imgUrl;
  if (imgUrl) {
    document.getElementById("editQImgPreviewImg").src = imgUrl;
    document.getElementById("editQImgPreview").classList.remove("hidden");
    document.getElementById("editQImgLabel").textContent =
      "✓ Image loaded — click to replace";
    document.getElementById("editQImgZone").classList.add("done");
  } else {
    document.getElementById("editQImgPreview").classList.add("hidden");
    document.getElementById("editQImgLabel").textContent =
      "Click to upload / replace image";
    document.getElementById("editQImgZone").classList.remove("done");
  }

  // Show modal
  const modal = document.getElementById("editModal");
  modal.classList.remove("hidden");
  modal.classList.add("flex");
  document.body.style.overflow = "hidden";
}

function closeEditModal() {
  document.getElementById("editModal").classList.add("hidden");
  document.getElementById("editModal").classList.remove("flex");
  document.body.style.overflow = "auto";
}

// Close on backdrop click
document.getElementById("editModal").addEventListener("click", function (e) {
  if (e.target === this) closeEditModal();
});

// ─────────────────────────────────────────────
//  EDIT MODAL — IMAGE UPLOAD
// ─────────────────────────────────────────────

async function handleEditQImgSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  const zone = document.getElementById("editQImgZone");
  const statusEl = document.getElementById("editUploadStatus");
  zone.classList.add("uploading");
  statusEl.classList.remove("hidden");

  try {
    const url = await uploadImageToStorage(file, "questions");
    document.getElementById("editQuestionImageUrl").value = url;
    document.getElementById("editQImgPreviewImg").src = url;
    document.getElementById("editQImgPreview").classList.remove("hidden");
    document.getElementById("editQImgLabel").textContent =
      "✓ New image uploaded";
    zone.classList.remove("uploading");
    zone.classList.add("done");
  } catch (err) {
    alert("Image upload failed: " + err.message);
    zone.classList.remove("uploading");
  } finally {
    statusEl.classList.add("hidden");
  }
}

function clearEditQImg() {
  document.getElementById("editQuestionImageUrl").value = "";
  document.getElementById("editQImgPreviewImg").src = "";
  document.getElementById("editQImgPreview").classList.add("hidden");
  document.getElementById("editQImgLabel").textContent =
    "Click to upload / replace image";
  document.getElementById("editQImgZone").classList.remove("done");
  document.getElementById("editQImgInput").value = "";
}

// ─────────────────────────────────────────────
//  EDIT MODAL — SAVE
// ─────────────────────────────────────────────

async function saveEditQuestion() {
  const questionId = document.getElementById("editQuestionId").value;
  const question_text = document
    .getElementById("editQuestionText")
    .value.trim();
  const explanation = document.getElementById("editExplanation").value.trim();
  const correct_answer = document.getElementById("editCorrectAnswer").value;
  const difficulty = document.getElementById("editDifficulty").value;
  const pyq_source =
    document.getElementById("editPyqSource").value.trim() || null;
  const pyq_year_raw = document.getElementById("editPyqYear").value.trim();
  const pyq_year = pyq_year_raw ? parseInt(pyq_year_raw) : null;
  const question_image =
    document.getElementById("editQuestionImageUrl").value || null;
  const is_active = document.getElementById("editIsActive").checked;

  if (!question_text || !correct_answer) {
    alert("Question text and correct answer are required.");
    return;
  }

  // Rebuild options as text (preserves text for image/mixed too)
  const options = {
    A: document.getElementById("editOptionA").value.trim(),
    B: document.getElementById("editOptionB").value.trim(),
    C: document.getElementById("editOptionC").value.trim(),
    D: document.getElementById("editOptionD").value.trim(),
  };

  if (!options.A || !options.B || !options.C || !options.D) {
    alert("All 4 option texts are required.");
    return;
  }

  // Disable save button
  const btn = document.getElementById("saveEditBtn");
  btn.disabled = true;
  btn.innerHTML = `<svg class="w-4 h-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path></svg> Saving...`;

  const { error } = await client
    .from("questions")
    .update({
      question_text,
      options,
      options_type: "text", // reset to text since we edited as text
      question_image,
      correct_answer,
      difficulty,
      explanation,
      pyq_year,
      pyq_source,
      is_active,
      language: document.getElementById("editLanguage")?.value || "english",
    })
    .eq("id", questionId);

  btn.disabled = false;
  btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg> Save Changes`;

  if (error) {
    alert("Save failed: " + error.message);
  } else {
    closeEditModal();
    loadQuestions();
    alert("✓ Question updated successfully!");
  }
}
