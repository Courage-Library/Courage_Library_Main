// adminCoachings.js — Courage Library B2B Coaching Centers Manager

const SUPABASE_URL = "https://sgagswxzsxlgcspwiuoh.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNnYWdzd3h6c3hsZ2NzcHdpdW9oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5NTA1NTIsImV4cCI6MjA2OTUyNjU1Mn0.ZNfk5WNDPkjKcFsRO48rEYk3dhbLYm_m21aZ-wfywo4";

const { createClient } = supabase;
const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── State ──
let allCoachings = [];
const BASE_URL = "https://www.couragelibrary.in/c/";

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

  // Auto-generate slug from name
  document.getElementById("coachingName").addEventListener("input", (e) => {
    const slug = e.target.value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-");
    document.getElementById("coachingSlug").value = slug;
    updateLinkPreview(slug);
  });

  document.getElementById("coachingSlug").addEventListener("input", (e) => {
    updateLinkPreview(e.target.value.trim());
  });

  document.getElementById("createCoachingBtn").addEventListener("click", createCoaching);
  loadCoachings();
});

function updateLinkPreview(slug) {
  const el = document.getElementById("linkPreview");
  if (el) el.textContent = slug ? `${BASE_URL}${slug}` : `${BASE_URL}your-coaching-name`;
}

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
    success: { bg: "#ecfdf5", color: "#065f46", border: "#6ee7b7", icon: "✅" },
    error:   { bg: "#fef2f2", color: "#7f1d1d", border: "#fca5a5", icon: "❌" },
    warning: { bg: "#fffbeb", color: "#78350f", border: "#fcd34d", icon: "⚠️" },
  };
  const s = S[type] || S.success;
  Object.assign(toast.style, { background: s.bg, color: s.color, border: `1px solid ${s.border}` });
  toast.innerHTML = `${s.icon} ${message}`;
  toast.style.opacity = "1"; toast.style.transform = "translateY(0)";
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { toast.style.opacity = "0"; toast.style.transform = "translateY(8px)"; }, 3500);
}

// ── Create Coaching Center ──
async function createCoaching() {
  const name          = document.getElementById("coachingName").value.trim();
  const slug          = document.getElementById("coachingSlug").value.trim().toLowerCase();
  const city          = document.getElementById("coachingCity").value.trim();
  const contact_email = document.getElementById("coachingEmail").value.trim();
  const contact_phone = document.getElementById("coachingPhone").value.trim();
  const primary_color = document.getElementById("coachingColor").value || "#1a56db";

  if (!name) { showToast("Coaching center name is required.", "error"); return; }
  if (!slug) { showToast("Slug is required.", "error"); return; }
  if (!/^[a-z0-9\-]+$/.test(slug)) { showToast("Slug can only contain lowercase letters, numbers, and hyphens.", "error"); return; }

  const btn = document.getElementById("createCoachingBtn");
  btn.disabled = true;
  btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Creating...`;

  const { data, error } = await client
    .from("coaching_centers")
    .insert([{ name, slug, city, contact_email, contact_phone, primary_color }])
    .select()
    .single();

  btn.disabled = false;
  btn.innerHTML = `<i class="fas fa-plus-circle"></i> Create Coaching Center`;

  if (error) {
    if (error.code === "23505") {
      showToast(`Slug "${slug}" is already taken. Choose a different one.`, "error");
    } else {
      showToast(error.message, "error");
    }
    return;
  }

  showToast(`"${name}" created! Share this link with their students:`, "success");

  // Clear form
  ["coachingName","coachingSlug","coachingCity","coachingEmail","coachingPhone"].forEach(id => {
    document.getElementById(id).value = "";
  });
  document.getElementById("coachingColor").value = "#1a56db";
  updateLinkPreview("");
  loadCoachings();
}

// ── Load all coaching centers ──
async function loadCoachings() {
  const list = document.getElementById("coachingList");
  list.innerHTML = `<div class="text-center py-8 text-gray-400"><i class="fas fa-spinner fa-spin text-2xl"></i></div>`;

  const { data, error } = await client
    .from("coaching_centers")
    .select(`
      id, name, slug, city, contact_email, contact_phone,
      primary_color, is_active, created_at
    `)
    .order("created_at", { ascending: false });

  if (error) { list.innerHTML = `<p class="text-red-500 text-sm">${error.message}</p>`; return; }

  // Get student counts per coaching
  const { data: studentCounts } = await client
    .from("user_profiles")
    .select("coaching_id")
    .not("coaching_id", "is", null);

  const countMap = {};
  (studentCounts || []).forEach(p => {
    countMap[p.coaching_id] = (countMap[p.coaching_id] || 0) + 1;
  });

  allCoachings = (data || []).map(c => ({ ...c, student_count: countMap[c.id] || 0 }));
  renderCoachings(allCoachings);
}

// ── Render coaching cards ──
function renderCoachings(data) {
  const list = document.getElementById("coachingList");

  if (!data || data.length === 0) {
    list.innerHTML = `
      <div class="text-center py-10 text-gray-400">
        <i class="fas fa-school text-3xl mb-2 block"></i>
        <p>No coaching centers yet. Create your first one!</p>
      </div>`;
    return;
  }

  list.innerHTML = "";
  data.forEach(c => {
    const joinLink = `${BASE_URL}${c.slug}`;
    const div = document.createElement("div");
    div.className = "glass p-5 shadow border-l-4 hover:scale-[1.01] transition-transform duration-200";
    div.style.borderLeftColor = c.primary_color || "#1a56db";
    div.innerHTML = `
      <div class="flex items-start justify-between gap-3">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1">
            <h3 class="text-base font-bold text-blue-700">${c.name}</h3>
            <span class="text-xs px-2 py-0.5 rounded-full font-semibold ${c.is_active ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}">
              ${c.is_active ? "Active" : "Inactive"}
            </span>
          </div>
          ${c.city ? `<p class="text-xs text-gray-500 mb-1"><i class="fas fa-map-marker-alt mr-1"></i>${c.city}</p>` : ""}
          ${c.contact_email ? `<p class="text-xs text-gray-500 mb-1"><i class="fas fa-envelope mr-1"></i>${c.contact_email}</p>` : ""}

          <!-- Join Link -->
          <div class="mt-2 flex items-center gap-2">
            <div class="flex-1 bg-blue-50 border border-blue-100 rounded-lg px-3 py-1.5 text-xs text-blue-700 font-mono truncate">
              ${joinLink}
            </div>
            <button onclick="copyLink('${joinLink}')"
              class="text-blue-500 hover:text-blue-700 px-2 py-1.5 rounded-lg hover:bg-blue-50 transition text-xs font-semibold flex items-center gap-1">
              <i class="fas fa-copy"></i> Copy
            </button>
          </div>

          <!-- Stats row -->
          <div class="flex gap-3 mt-3">
            <span class="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-lg font-semibold">
              <i class="fas fa-users mr-1"></i>${c.student_count} students
            </span>
            <span class="text-xs bg-gray-50 text-gray-500 px-2 py-0.5 rounded-lg font-semibold">
              <i class="fas fa-link mr-1"></i>/c/${c.slug}
            </span>
          </div>
        </div>

        <!-- Actions -->
        <div class="flex flex-col gap-2 flex-shrink-0">
          <button onclick="toggleCoachingStatus('${c.id}', ${c.is_active}, '${c.name}')"
            class="text-xs px-3 py-1.5 rounded-lg font-semibold transition ${c.is_active ? 'text-amber-600 hover:bg-amber-50' : 'text-green-600 hover:bg-green-50'}">
            <i class="fas fa-${c.is_active ? 'pause' : 'play'} mr-1"></i>${c.is_active ? 'Deactivate' : 'Activate'}
          </button>
          <button onclick="deleteCoaching('${c.id}', '${c.name.replace(/'/g, "\\'")}', ${c.student_count})"
            class="text-red-400 hover:text-red-600 text-xs px-3 py-1.5 rounded-lg hover:bg-red-50 transition">
            <i class="fas fa-trash mr-1"></i>Delete
          </button>
        </div>
      </div>`;
    list.appendChild(div);
  });
}

// ── Copy join link ──
window.copyLink = function(link) {
  navigator.clipboard.writeText(link).then(() => {
    showToast("Join link copied to clipboard!", "success");
  }).catch(() => {
    showToast("Could not copy. Please copy manually.", "warning");
  });
};

// ── Toggle active status ──
window.toggleCoachingStatus = async function(id, currentStatus, name) {
  const newStatus = !currentStatus;
  const { error } = await client
    .from("coaching_centers")
    .update({ is_active: newStatus })
    .eq("id", id);

  if (error) { showToast(error.message, "error"); return; }
  showToast(`"${name}" ${newStatus ? "activated" : "deactivated"}.`, "success");
  loadCoachings();
};

// ── Delete coaching center ──
window.deleteCoaching = async function(id, name, studentCount) {
  if (studentCount > 0) {
    const confirmed = confirm(
      `⚠️ "${name}" has ${studentCount} student(s) linked to it.\n\n` +
      `Deleting will unlink all their accounts (coaching_id set to null).\n\n` +
      `Their exam data is preserved. Are you sure?`
    );
    if (!confirmed) return;
  } else {
    if (!confirm(`Delete coaching center "${name}"? This cannot be undone.`)) return;
  }

  const { error } = await client.from("coaching_centers").delete().eq("id", id);
  if (error) { showToast(error.message, "error"); return; }
  showToast(`"${name}" deleted.`, "success");
  loadCoachings();
};