const SUPABASE_URL = "https://sgagswxzsxlgcspwiuoh.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNnYWdzd3h6c3hsZ2NzcHdpdW9oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5NTA1NTIsImV4cCI6MjA2OTUyNjU1Mn0.ZNfk5WNDPkjKcFsRO48rEYk3dhbLYm_m21aZ-wfywo4";

const { createClient } = supabase;
const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── State ──
let allSections = [];
let filteredSections = [];
let sectionPage = 1;
const PAGE_SIZE = 10;

// ── Admin auth guard ──
async function checkAdmin() {
  const { data: { user } } = await client.auth.getUser();
  if (!user) { window.location.href = "../index.html?checkAuth=1"; return false; }
  const { data: profile } = await client
    .from("user_profiles").select("is_admin, role").eq("id", user.id).single();
  const isAdmin = profile?.is_admin === true || profile?.role === "super_admin" || profile?.role === "admin";
  if (!isAdmin) { window.location.href = "/"; return false; }
  return true;
}

document.addEventListener("DOMContentLoaded", async () => {
  const ok = await checkAdmin();
  if (!ok) return;
  injectSectionSearchUI();
  loadPatterns();
  loadSections();
  document.getElementById("addSectionBtn")?.addEventListener("click", addSection);
});

// ── Toast ──
function showToast(message, type = "success") {
  let toast = document.getElementById("adminToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "adminToast";
    toast.style.cssText = "position:fixed;bottom:24px;right:24px;z-index:9999;padding:12px 20px;border-radius:12px;font-size:14px;font-weight:600;box-shadow:0 8px 24px rgba(0,0,0,.15);display:flex;align-items:center;gap:8px;transition:opacity .3s,transform .3s;opacity:0;transform:translateY(8px);";
    document.body.appendChild(toast);
  }
  const S = {
    success: { bg:"#ecfdf5", color:"#065f46", border:"#6ee7b7", icon:"✅" },
    error:   { bg:"#fef2f2", color:"#7f1d1d", border:"#fca5a5", icon:"❌" },
    warning: { bg:"#fffbeb", color:"#78350f", border:"#fcd34d", icon:"⚠️" },
  };
  const s = S[type] || S.success;
  Object.assign(toast.style, { background:s.bg, color:s.color, border:`1px solid ${s.border}` });
  toast.innerHTML = `${s.icon} ${message}`;
  toast.style.opacity = "1"; toast.style.transform = "translateY(0)";
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { toast.style.opacity="0"; toast.style.transform="translateY(8px)"; }, 3000);
}

// ── Inject search + filter UI ──
function injectSectionSearchUI() {
  const listParent = document.getElementById("sectionList")?.parentElement;
  if (!listParent) return;

  const wrapper = document.createElement("div");
  wrapper.innerHTML = `
    <div class="flex flex-col sm:flex-row gap-2 mb-3">
      <div class="relative flex-1">
        <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none"></i>
        <input id="sectionSearch" type="text" placeholder="Search sections..."
          class="w-full pl-9 pr-3 py-2.5 rounded-xl border border-blue-100 focus:ring-2 focus:ring-blue-400 outline-none text-sm bg-white">
      </div>
      <select id="sectionPatternFilter"
        class="px-3 py-2.5 rounded-xl border border-blue-100 focus:ring-2 focus:ring-blue-400 outline-none text-sm bg-white min-w-[180px]">
        <option value="">All Patterns</option>
      </select>
    </div>
    <div id="sectionResultInfo" class="text-xs text-gray-400 mb-2 h-4"></div>
  `;

  listParent.insertBefore(wrapper, document.getElementById("sectionList"));
  document.getElementById("sectionSearch").addEventListener("input",  () => { sectionPage = 1; applySectionFilter(); });
  document.getElementById("sectionPatternFilter").addEventListener("change", () => { sectionPage = 1; applySectionFilter(); });
}

// ── Load Patterns into both dropdowns ──
async function loadPatterns() {
  const { data, error } = await client
    .from("exam_patterns")
    .select("id, pattern_name, exam_categories(name)")
    .order("created_at", { ascending: false });

  if (error) { console.error(error); return; }

  const addSelect = document.getElementById("sectionPattern");
  const filterSel = document.getElementById("sectionPatternFilter");

  if (addSelect) addSelect.innerHTML = `<option value="">Select Pattern</option>`;

  (data || []).forEach(p => {
    const label = p.exam_categories?.name ? `${p.exam_categories.name} — ${p.pattern_name}` : p.pattern_name;
    if (addSelect) addSelect.innerHTML += `<option value="${p.id}">${label}</option>`;
    if (filterSel) filterSel.innerHTML += `<option value="${p.id}">${label}</option>`;
  });
}

// ── Add Section ──
async function addSection() {
  const pattern_id         = document.getElementById("sectionPattern").value;
  const section_name       = document.getElementById("sectionName").value.trim();
  const question_count     = parseInt(document.getElementById("questionCount").value);
  const marks_per_question = parseFloat(document.getElementById("marksPerQuestion").value);

  if (!pattern_id)   { showToast("Please select a pattern.", "error"); return; }
  if (!section_name) { showToast("Section name is required.", "error"); return; }
  if (!question_count || question_count < 1) { showToast("Question count must be at least 1.", "error"); return; }
  if (!marks_per_question || marks_per_question <= 0) { showToast("Marks per question must be > 0.", "error"); return; }

  const btn = document.getElementById("addSectionBtn");
  btn.disabled = true; btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Saving...`;

  // Duplicate check
  const { data: existing } = await client
    .from("pattern_sections").select("id")
    .eq("pattern_id", pattern_id).ilike("section_name", section_name).limit(1);

  if (existing && existing.length > 0) {
    showToast(`"${section_name}" already exists in this pattern.`, "warning");
    btn.disabled = false; btn.innerHTML = `Add Section`; return;
  }

  const { error } = await client.from("pattern_sections")
    .insert([{ pattern_id, section_name, question_count, marks_per_question }]);

  btn.disabled = false; btn.innerHTML = `Add Section`;

  if (error) { showToast(error.message, "error"); return; }
  showToast(`"${section_name}" added.`, "success");
  ["sectionPattern","sectionName","questionCount","marksPerQuestion"]
    .forEach(id => document.getElementById(id).value = "");
  loadSections();
}

// ── Load all sections into memory ──
async function loadSections() {
  const list = document.getElementById("sectionList");
  list.innerHTML = `<div class="text-center py-8 text-gray-400"><i class="fas fa-spinner fa-spin text-2xl"></i></div>`;

  const { data, error } = await client
    .from("pattern_sections")
    .select("id, section_name, question_count, marks_per_question, exam_patterns(id, pattern_name, exam_categories(name)), questions(count)")
    .order("created_at", { ascending: false });

  if (error) { list.innerHTML = `<p class="text-red-500 text-sm">${error.message}</p>`; return; }

  allSections = data || [];
  sectionPage = 1;
  applySectionFilter();
}

// ── Filter ──
function applySectionFilter() {
  const q      = (document.getElementById("sectionSearch")?.value || "").toLowerCase().trim();
  const patId  = document.getElementById("sectionPatternFilter")?.value || "";

  filteredSections = allSections.filter(s => {
    const matchQ   = !q    || s.section_name.toLowerCase().includes(q) ||
                              (s.exam_patterns?.pattern_name||"").toLowerCase().includes(q) ||
                              (s.exam_patterns?.exam_categories?.name||"").toLowerCase().includes(q);
    const matchPat = !patId || s.exam_patterns?.id === patId;
    return matchQ && matchPat;
  });

  renderSectionPage();
}

// ── Render page ──
function renderSectionPage() {
  const list  = document.getElementById("sectionList");
  const info  = document.getElementById("sectionResultInfo");
  const total = filteredSections.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (sectionPage > pages) sectionPage = pages;

  const start = (sectionPage - 1) * PAGE_SIZE;
  const slice = filteredSections.slice(start, start + PAGE_SIZE);

  if (info) info.textContent = total === 0 ? "No sections found." :
    `Showing ${start+1}–${Math.min(start+PAGE_SIZE, total)} of ${total} section${total!==1?"s":""}`;

  if (total === 0) {
    list.innerHTML = `<div class="text-center py-10 text-gray-400"><i class="fas fa-search text-3xl mb-2 block"></i><p>No sections match your search.</p></div>`;
    renderSectionPagination(pages);
    return;
  }

  list.innerHTML = "";
  slice.forEach(sec => {
    const qCount      = sec.questions?.[0]?.count || 0;
    const patternName = sec.exam_patterns?.pattern_name || "—";
    const catName     = sec.exam_patterns?.exam_categories?.name || "";
    const totalMarks  = (sec.question_count * sec.marks_per_question).toFixed(1);
    const hasEnough   = qCount >= sec.question_count;

    const div = document.createElement("div");
    div.className = `glass p-5 shadow border-l-4 hover:scale-[1.01] transition-transform duration-200 ${hasEnough ? "border-green-400" : "border-amber-400"}`;
    div.innerHTML = `
      <div class="flex items-start justify-between gap-3">
        <div class="flex-1">
          <p class="text-xs font-medium text-blue-400 mb-0.5">${catName}${catName?" — ":""}${patternName}</p>
          <h3 class="text-base font-bold text-blue-700">${sec.section_name}</h3>
          <div class="flex flex-wrap gap-2 mt-2">
            <span class="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-lg font-medium"><i class="fas fa-question-circle mr-1"></i>${sec.question_count} Required</span>
            <span class="text-xs bg-green-50 text-green-600 px-2 py-0.5 rounded-lg font-medium"><i class="fas fa-star mr-1"></i>${sec.marks_per_question} Marks each</span>
            <span class="text-xs bg-purple-50 text-purple-600 px-2 py-0.5 rounded-lg font-medium"><i class="fas fa-calculator mr-1"></i>${totalMarks} Total</span>
            <span class="text-xs px-2 py-0.5 rounded-lg font-medium ${hasEnough?"bg-green-50 text-green-600":"bg-amber-50 text-amber-600"}">
              ${hasEnough?"✓":"⚠"} ${qCount} in bank
            </span>
          </div>
        </div>
        <button onclick="deleteSection('${sec.id}','${sec.section_name.replace(/'/g,"\\'")}',${qCount})"
          class="text-red-400 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50 transition flex-shrink-0">
          <i class="fas fa-trash"></i>
        </button>
      </div>`;
    list.appendChild(div);
  });

  renderSectionPagination(pages);
}

// ── Pagination ──
function renderSectionPagination(pages) {
  let pg = document.getElementById("sectionPagination");
  if (!pg) {
    pg = document.createElement("div");
    pg.id = "sectionPagination";
    document.getElementById("sectionList").after(pg);
  }
  if (pages <= 1) { pg.innerHTML = ""; return; }

  const b = (label, page, disabled, active) =>
    `<button onclick="goSP(${page})" ${disabled?"disabled":""} class="px-3 py-1.5 rounded-lg text-sm font-medium transition ${active?"bg-blue-600 text-white":disabled?"bg-gray-100 text-gray-300 cursor-not-allowed":"bg-white border border-gray-200 text-gray-600 hover:bg-blue-50"}">${label}</button>`;

  let html = `<div class="flex items-center justify-center gap-1.5 mt-4 flex-wrap">`;
  html += b(`<i class="fas fa-chevron-left text-xs"></i>`, sectionPage-1, sectionPage===1, false);

  let s = Math.max(1, sectionPage-2), e = Math.min(pages, s+4);
  if (e-s < 4) s = Math.max(1, e-4);
  if (s > 1) { html += b("1", 1, false, false); if(s>2) html += `<span class="px-1 text-gray-400">…</span>`; }
  for (let i=s; i<=e; i++) html += b(i, i, false, i===sectionPage);
  if (e < pages) { if(e<pages-1) html += `<span class="px-1 text-gray-400">…</span>`; html += b(pages, pages, false, false); }

  html += b(`<i class="fas fa-chevron-right text-xs"></i>`, sectionPage+1, sectionPage===pages, false);
  html += `</div>`;
  pg.innerHTML = html;
}

window.goSP = function(p) {
  const pages = Math.ceil(filteredSections.length / PAGE_SIZE);
  if (p < 1 || p > pages) return;
  sectionPage = p;
  renderSectionPage();
  document.getElementById("sectionList").scrollIntoView({ behavior:"smooth", block:"start" });
};

// ── Delete Section ──
async function deleteSection(id, name, questionCount) {
  if (questionCount > 0) {
    if (!confirm(`⚠️ "${name}" has ${questionCount} question(s) linked.\n\nSection will be deleted but questions stay in the bank.\n\nAre you sure?`)) return;
  } else {
    if (!confirm(`Delete section "${name}"? This cannot be undone.`)) return;
  }
  const { error } = await client.from("pattern_sections").delete().eq("id", id);
  if (error) { showToast(error.message, "error"); return; }
  showToast(`"${name}" deleted.`, "success");
  loadSections();
}