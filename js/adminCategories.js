const SUPABASE_URL = "https://sgagswxzsxlgcspwiuoh.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNnYWdzd3h6c3hsZ2NzcHdpdW9oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5NTA1NTIsImV4cCI6MjA2OTUyNjU1Mn0.ZNfk5WNDPkjKcFsRO48rEYk3dhbLYm_m21aZ-wfywo4";

const { createClient } = supabase;
const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

document.addEventListener("DOMContentLoaded", async () => {
  await checkAdmin();
  loadCategories();
});

async function checkAdmin() {
  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    window.location.href = "../index.html?checkAuth=1";
    return;
  }

  const { data, error } = await client
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (
    error ||
    !data ||
    (data.role !== "admin" && data.role !== "super_admin")
  ) {
    alert("Access denied");
    window.location.href = "/";
  }
}

async function addCategory() {
  const name = document.getElementById("categoryName").value.trim();
  const description = document
    .getElementById("categoryDescription")
    .value.trim();

  if (!name) {
    alert("Category name required");
    return;
  }

  const { error } = await client
    .from("exam_categories")
    .insert([{ name, description }]);

  if (error) {
    alert(error.message);
  } else {
    alert("Category added successfully");
    loadCategories();
  }
}

async function loadCategories() {
  const { data, error } = await client
    .from("exam_categories")
    .select(`
      id,
      name,
      description,
      questions(count)
    `)
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    return;
  }

  const list = document.getElementById("categoryList");
  list.innerHTML = "";

  data.forEach((cat) => {
    const questionCount = cat.questions?.length || 0;

    const div = document.createElement("div");
    div.className =
      "glass p-6 shadow-xl border-l-4 border-blue-400 flex items-center justify-between hover:scale-[1.01] transition-transform duration-200 group";

    div.innerHTML = `
      <div class="flex items-center gap-4">
        <i class="fas fa-book text-blue-500 text-2xl group-hover:text-blue-700"></i>
        <div>
          <h3 class="text-lg font-bold text-blue-700 group-hover:underline">
            ${cat.name}
          </h3>
          <p class="text-sm text-gray-600">
            ${cat.description || "No description provided"}
          </p>
          <p class="text-xs text-gray-500 mt-1">
            ${questionCount} Questions Added
          </p>
        </div>
      </div>

      <div class="flex items-center gap-4">
        <button onclick="deleteCategory('${cat.id}')"
          class="text-red-500 hover:text-red-700 text-lg">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    `;

    list.appendChild(div);
  });
}

async function deleteCategory(id) {
  if (!confirm("Are you sure you want to delete this category?")) return;

  const { error } = await client
    .from("exam_categories")
    .delete()
    .eq("id", id);

  if (error) {
    alert(error.message);
  } else {
    loadCategories();
  }
}