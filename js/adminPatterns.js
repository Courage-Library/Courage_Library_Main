const SUPABASE_URL = "https://sgagswxzsxlgcspwiuoh.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNnYWdzd3h6c3hsZ2NzcHdpdW9oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5NTA1NTIsImV4cCI6MjA2OTUyNjU1Mn0.ZNfk5WNDPkjKcFsRO48rEYk3dhbLYm_m21aZ-wfywo4";

const { createClient } = supabase;
const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── State ──
let allPatterns = [];
let filteredPatterns = [];
let patternPage = 1;
const PAGE_SIZE = 8;

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
  injectPatternSearchUI();
  loadCategories();
  loadPatterns();
  document.getElementById("createPatternBtn").addEventListener("click", createPattern);
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

// ── Inject search UI ──
function injectPatternSearchUI() {
  const listParent = document.getElementById("patternList")?.parentElement;
  if (!listParent) return;

  const wrapper = document.createElement("div");
  wrapper.innerHTML = `
    <div class="flex flex-col sm:flex-row gap-2 mb-3">
      <div class="relative flex-1">
        <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none"></i>
        <input id="patternSearch" type="text" placeholder="Search by name or category..."
          class="w-full pl-9 pr-3 py-2.5 rounded-xl border border-blue-100 focus:ring-2 focus:ring-blue-400 outline-none text-sm bg-white">
      </div>
      <select id="patternCatFilter"
        class="px-3 py-2.5 rounded-xl border border-blue-100 focus:ring-2 focus:ring-blue-400 outline-none text-sm bg-white min-w-[150px]">
        <option value="">All Categories</option>
      </select>
    </div>
    <div id="patternResultInfo" class="text-xs text-gray-400 mb-2 h-4"></div>
  `;

  listParent.insertBefore(wrapper, document.getElementById("patternList"));
  document.getElementById("patternSearch").addEventListener("input",  () => { patternPage = 1; applyPatternFilter(); });
  document.getElementById("patternCatFilter").addEventListener("change", () => { patternPage = 1; applyPatternFilter(); });
}

// ── Load Categories ──
async function loadCategories() {
  const { data } = await client.from("exam_categories").select("id, name").order("name");
  const sel = document.getElementById("patternCategory");
  sel.innerHTML = `<option value="">Select Category</option>`;
  (data || []).forEach(c => {
    sel.innerHTML += `<option value="${c.id}">${c.name}</option>`;
    const filter = document.getElementById("patternCatFilter");
    if (filter) filter.innerHTML += `<option value="${c.id}">${c.name}</option>`;
  });
}

// ── Create Pattern ──
async function createPattern() {
  const category_id      = document.getElementById("patternCategory").value;
  const pattern_name     = document.getElementById("patternName").value.trim();
  const total_questions  = parseInt(document.getElementById("totalQuestions").value);
  const total_marks      = parseInt(document.getElementById("totalMarks").value);
  const duration_minutes = parseInt(document.getElementById("durationMinutes").value);
  const negative_marking = parseFloat(document.getElementById("negativeMarking").value) || 0;

  if (!category_id)   { showToast("Please select a category.", "error"); return; }
  if (!pattern_name)  { showToast("Pattern name is required.", "error"); return; }
  if (!total_questions || total_questions < 1) { showToast("Total questions must be at least 1.", "error"); return; }
  if (!duration_minutes || duration_minutes < 1) { showToast("Duration must be at least 1 minute.", "error"); return; }

  const btn = document.getElementById("createPatternBtn");
  btn.disabled = true; btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Saving...`;

  const { error } = await client.from("exam_patterns").insert([{
    category_id, pattern_name, total_questions, total_marks, duration_minutes, negative_marking
  }]);

  btn.disabled = false; btn.innerHTML = `<i class="fas fa-plus-circle"></i> Create Pattern`;

  if (error) { showToast(error.message, "error"); return; }
  showToast(`"${pattern_name}" created.`, "success");
  ["patternCategory","patternName","totalQuestions","totalMarks","durationMinutes","negativeMarking"]
    .forEach(id => document.getElementById(id).value = "");
  loadPatterns();
}

// ── Load all patterns into memory ──
async function loadPatterns() {
  const list = document.getElementById("patternList");
  list.innerHTML = `<div class="text-center py-8 text-gray-400"><i class="fas fa-spinner fa-spin text-2xl"></i></div>`;

  const { data, error } = await client
    .from("exam_patterns")
    .select("id, pattern_name, total_questions, total_marks, duration_minutes, negative_marking, exam_categories(id, name), pattern_sections(count)")
    .order("created_at", { ascending: false });

  if (error) { list.innerHTML = `<p class="text-red-500 text-sm">${error.message}</p>`; return; }

  allPatterns = data || [];
  patternPage = 1;
  applyPatternFilter();
}

// ── Filter ──
function applyPatternFilter() {
  const q   = (document.getElementById("patternSearch")?.value || "").toLowerCase().trim();
  const cat = document.getElementById("patternCatFilter")?.value || "";

  filteredPatterns = allPatterns.filter(p => {
    const matchQ   = !q   || p.pattern_name.toLowerCase().includes(q) || (p.exam_categories?.name||"").toLowerCase().includes(q);
    const matchCat = !cat || p.exam_categories?.id === cat;
    return matchQ && matchCat;
  });

  renderPatternPage();
}

// ── Render page ──
function renderPatternPage() {
  const list  = document.getElementById("patternList");
  const info  = document.getElementById("patternResultInfo");
  const total = filteredPatterns.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (patternPage > pages) patternPage = pages;

  const start = (patternPage - 1) * PAGE_SIZE;
  const slice = filteredPatterns.slice(start, start + PAGE_SIZE);

  if (info) info.textContent = total === 0 ? "No patterns found." :
    `Showing ${start+1}–${Math.min(start+PAGE_SIZE, total)} of ${total} pattern${total!==1?"s":""}`;

  if (total === 0) {
    list.innerHTML = `<div class="text-center py-10 text-gray-400"><i class="fas fa-search text-3xl mb-2 block"></i><p>No patterns match your search.</p></div>`;
    renderPatternPagination(pages);
    return;
  }

  list.innerHTML = "";
  slice.forEach(p => {
    const sc = p.pattern_sections?.[0]?.count || 0;
    const neg = p.negative_marking > 0 ? `-${p.negative_marking}` : "None";
    const div = document.createElement("div");
    div.className = "glass p-5 shadow border-l-4 border-blue-400 hover:scale-[1.01] transition-transform duration-200";
    div.innerHTML = `
      <div class="flex items-start justify-between gap-3">
        <div class="flex-1">
          <p class="text-xs font-medium text-blue-400 mb-0.5">${p.exam_categories?.name||"—"}</p>
          <h3 class="text-base font-bold text-blue-700">${p.pattern_name}</h3>
          <div class="flex flex-wrap gap-2 mt-2">
            <span class="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-lg font-medium"><i class="fas fa-question-circle mr-1"></i>${p.total_questions}Q</span>
            <span class="text-xs bg-green-50 text-green-600 px-2 py-0.5 rounded-lg font-medium"><i class="fas fa-star mr-1"></i>${p.total_marks} Marks</span>
            <span class="text-xs bg-amber-50 text-amber-600 px-2 py-0.5 rounded-lg font-medium"><i class="fas fa-clock mr-1"></i>${p.duration_minutes} Min</span>
            <span class="text-xs bg-red-50 text-red-500 px-2 py-0.5 rounded-lg font-medium"><i class="fas fa-minus-circle mr-1"></i>${neg}</span>
            <span class="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-lg font-medium"><i class="fas fa-layer-group mr-1"></i>${sc} Sections</span>
          </div>
        </div>
        <button onclick="deletePattern('${p.id}','${p.pattern_name.replace(/'/g,"\\'")}',${sc})"
          class="text-red-400 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50 transition flex-shrink-0">
          <i class="fas fa-trash"></i>
        </button>
      </div>`;
    list.appendChild(div);
  });

  renderPatternPagination(pages);
}

// ── Pagination ──
function renderPatternPagination(pages) {
  let pg = document.getElementById("patternPagination");
  if (!pg) {
    pg = document.createElement("div");
    pg.id = "patternPagination";
    document.getElementById("patternList").after(pg);
  }
  if (pages <= 1) { pg.innerHTML = ""; return; }

  const b = (label, page, disabled, active) =>
    `<button onclick="goPP(${page})" ${disabled?"disabled":""} class="px-3 py-1.5 rounded-lg text-sm font-medium transition ${active?"bg-blue-600 text-white":disabled?"bg-gray-100 text-gray-300 cursor-not-allowed":"bg-white border border-gray-200 text-gray-600 hover:bg-blue-50"}">${label}</button>`;

  let html = `<div class="flex items-center justify-center gap-1.5 mt-4 flex-wrap">`;
  html += b(`<i class="fas fa-chevron-left text-xs"></i>`, patternPage-1, patternPage===1, false);

  let s = Math.max(1, patternPage-2), e = Math.min(pages, s+4);
  if (e-s < 4) s = Math.max(1, e-4);
  if (s > 1) { html += b("1", 1, false, false); if(s>2) html += `<span class="px-1 text-gray-400">…</span>`; }
  for (let i=s; i<=e; i++) html += b(i, i, false, i===patternPage);
  if (e < pages) { if(e<pages-1) html += `<span class="px-1 text-gray-400">…</span>`; html += b(pages, pages, false, false); }

  html += b(`<i class="fas fa-chevron-right text-xs"></i>`, patternPage+1, patternPage===pages, false);
  html += `</div>`;
  pg.innerHTML = html;
}

window.goPP = function(p) {
  const pages = Math.ceil(filteredPatterns.length / PAGE_SIZE);
  if (p < 1 || p > pages) return;
  patternPage = p;
  renderPatternPage();
  document.getElementById("patternList").scrollIntoView({ behavior:"smooth", block:"start" });
};

// ── Delete Pattern ──
async function deletePattern(id, name, sectionCount) {
  if (sectionCount > 0) {
    if (!confirm(`⚠️ "${name}" has ${sectionCount} section(s).\n\nDeleting removes all sections and any scheduled exams.\n\nAre you sure?`)) return;
  } else {
    if (!confirm(`Delete pattern "${name}"? This cannot be undone.`)) return;
  }
  const { data: sc } = await client.from("scheduled_exams").select("id").eq("pattern_id", id).limit(1);
  if (sc && sc.length > 0) {
    if (!confirm(`🚨 Active scheduled exams exist for this pattern.\n\nThis will affect students. Continue?`)) return;
  }
  const { error } = await client.from("exam_patterns").delete().eq("id", id);
  if (error) { showToast(error.message, "error"); return; }
  showToast(`"${name}" deleted.`, "success");
  loadPatterns();
}