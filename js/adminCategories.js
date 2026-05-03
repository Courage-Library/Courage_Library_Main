// adminCategories.js — Updated with B2B coaching context support

const SUPABASE_URL = "https://sgagswxzsxlgcspwiuoh.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNnYWdzd3h6c3hsZ2NzcHdpdW9oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5NTA1NTIsImV4cCI6MjA2OTUyNjU1Mn0.ZNfk5WNDPkjKcFsRO48rEYk3dhbLYm_m21aZ-wfywo4";

const { createClient } = supabase;
const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let allCategories = [];

// ── Expose reload function for coaching context switcher ──
window.reloadPageData = function () {
  loadCategories();
};

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
  injectCategorySearchUI();
  loadCategories();
});

// ── Toast ──
function showToast(message, type = "success") {
  let toast = document.getElementById("adminToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "adminToast";
    toast.style.cssText = `position:fixed;bottom:24px;right:24px;z-index:9999;padding:12px 20px;border-radius:12px;font-size:14px;font-weight:600;box-shadow:0 8px 24px rgba(0,0,0,.15);display:flex;align-items:center;gap:8px;transition:opacity .3s,transform .3s;opacity:0;transform:translateY(8px);`;
    document.body.appendChild(toast);
  }
  const styles = {
    success: { bg: "#ecfdf5", color: "#065f46", border: "#6ee7b7", icon: "✅" },
    error:   { bg: "#fef2f2", color: "#7f1d1d", border: "#fca5a5", icon: "❌" },
    warning: { bg: "#fffbeb", color: "#78350f", border: "#fcd34d", icon: "⚠️" },
  };
  const s = styles[type] || styles.success;
  toast.style.background = s.bg; toast.style.color = s.color; toast.style.border = `1px solid ${s.border}`;
  toast.innerHTML = `${s.icon} ${message}`;
  toast.style.opacity = "1"; toast.style.transform = "translateY(0)";
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.style.opacity = "0"; toast.style.transform = "translateY(8px)"; }, 3000);
}

// ── Inject search UI ──
function injectCategorySearchUI() {
  const listParent = document.getElementById("categoryList")?.parentElement;
  if (!listParent) return;
  const wrapper = document.createElement("div");
  wrapper.innerHTML = `
    <div class="relative mb-3">
      <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none"></i>
      <input id="categorySearch" type="text" placeholder="Search categories..."
        class="w-full pl-9 pr-3 py-2.5 rounded-xl border border-blue-100 focus:ring-2 focus:ring-blue-400 outline-none text-sm bg-white">
    </div>
    <div id="categoryResultInfo" class="text-xs text-gray-400 mb-2 h-4"></div>
  `;
  listParent.insertBefore(wrapper, document.getElementById("categoryList"));
  document.getElementById("categorySearch").addEventListener("input", applyCategoryFilter);
}

function applyCategoryFilter() {
  const q = (document.getElementById("categorySearch")?.value || "").toLowerCase().trim();
  const filtered = q ? allCategories.filter(c =>
    c.name.toLowerCase().includes(q) || (c.description || "").toLowerCase().includes(q)
  ) : allCategories;
  const info = document.getElementById("categoryResultInfo");
  if (info) info.textContent = filtered.length === 0 ? "No categories found." :
    `${filtered.length} of ${allCategories.length} categor${filtered.length !== 1 ? "ies" : "y"}`;
  renderCategories(filtered);
}

// ── Add Category — now coaching-context aware ──
async function addCategory() {
  const name        = document.getElementById("categoryName").value.trim();
  const description = document.getElementById("categoryDescription").value.trim();
  // Get current coaching context (null = Courage Library own platform)
  const coaching_id = window.getAdminCoachingId ? window.getAdminCoachingId() : null;

  if (!name) { showToast("Category name is required.", "error"); return; }

  const btn = document.querySelector("button[onclick='addCategory()']");
  if (btn) { btn.disabled = true; btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Saving...`; }

  const insertData = { name, description };
  // Only add coaching_id if one is selected — null means own platform
  if (coaching_id) insertData.coaching_id = coaching_id;

  const { error } = await client.from("exam_categories").insert([insertData]);

  if (btn) { btn.disabled = false; btn.innerHTML = `<i class="fas fa-plus-circle"></i> Create Category`; }

  if (error) { showToast(error.message, "error"); return; }

  const contextLabel = coaching_id ? ` (for coaching)` : "";
  showToast(`"${name}" category created successfully${contextLabel}.`, "success");
  document.getElementById("categoryName").value = "";
  document.getElementById("categoryDescription").value = "";
  loadCategories();
}

// ── Load Categories — scoped to current context ──
async function loadCategories() {
  const list = document.getElementById("categoryList");
  list.innerHTML = `<div class="text-center py-8 text-gray-400"><i class="fas fa-spinner fa-spin text-2xl"></i></div>`;

  const coaching_id = window.getAdminCoachingId ? window.getAdminCoachingId() : null;

  let query = client
    .from("exam_categories")
    .select(`id, name, description, created_at, coaching_id, questions(count)`)
    .order("created_at", { ascending: false });

  // Filter by coaching context
  if (coaching_id) {
    query = query.eq("coaching_id", coaching_id);
  } else {
    query = query.is("coaching_id", null);
  }

  const { data, error } = await query;
  if (error) { list.innerHTML = `<p class="text-red-500 text-sm">${error.message}</p>`; return; }

  allCategories = data || [];
  applyCategoryFilter();
}

// ── Render category cards ──
function renderCategories(data) {
  const list = document.getElementById("categoryList");
  if (!data || data.length === 0) {
    list.innerHTML = `
      <div class="text-center py-10 text-gray-400">
        <i class="fas fa-folder-open text-3xl mb-2 block"></i>
        <p>No categories found for this context.</p>
      </div>`;
    return;
  }
  list.innerHTML = "";
  data.forEach(cat => {
    const questionCount = cat.questions?.[0]?.count || 0;
    const isCoaching = !!cat.coaching_id;
    const div = document.createElement("div");
    div.className = "glass p-5 shadow border-l-4 flex items-center justify-between hover:scale-[1.01] transition-transform duration-200 group";
    div.style.borderLeftColor = isCoaching ? "#6366f1" : "#3b82f6";
    div.innerHTML = `
      <div class="flex items-center gap-4">
        <div class="w-10 h-10 rounded-xl flex items-center justify-center" style="background:${isCoaching ? "#eef2ff" : "#eff6ff"}">
          <i class="fas fa-book text-lg" style="color:${isCoaching ? "#6366f1" : "#3b82f6"}"></i>
        </div>
        <div>
          <div class="flex items-center gap-2">
            <h3 class="text-base font-bold text-blue-700">${cat.name}</h3>
            ${isCoaching ? `<span class="text-xs bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded font-semibold">B2B</span>` : ""}
          </div>
          <p class="text-xs text-gray-500 mt-0.5">${cat.description || "No description"}</p>
          <p class="text-xs text-gray-400 mt-1"><span class="font-semibold text-blue-600">${questionCount}</span> questions</p>
        </div>
      </div>
      <button onclick="deleteCategory('${cat.id}','${cat.name.replace(/'/g, "\\'")}',${questionCount})"
        class="text-red-400 hover:text-red-600 text-base px-2 py-1 rounded-lg hover:bg-red-50 transition" title="Delete">
        <i class="fas fa-trash"></i>
      </button>`;
    list.appendChild(div);
  });
}

// ── Delete Category ──
async function deleteCategory(id, name, questionCount) {
  if (questionCount > 0) {
    if (!confirm(`⚠️ "${name}" has ${questionCount} question(s).\n\nDeleting this will also delete all those questions.\n\nAre you absolutely sure?`)) return;
  } else {
    if (!confirm(`Delete category "${name}"? This cannot be undone.`)) return;
  }
  const { error } = await client.from("exam_categories").delete().eq("id", id);
  if (error) { showToast(error.message, "error"); return; }
  showToast(`"${name}" deleted.`, "success");
  loadCategories();
}