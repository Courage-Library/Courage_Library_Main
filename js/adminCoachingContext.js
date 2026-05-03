// adminCoachingContext.js
// Drop this into every admin page BEFORE the page's own JS.
// It injects a coaching context bar at the top of the page.
// All admin page JS then reads: getAdminCoachingId() to scope their queries.

(function () {
  const SUPABASE_URL = "https://sgagswxzsxlgcspwiuoh.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNnYWdzd3h6c3hsZ2NzcHdpdW9oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5NTA1NTIsImV4cCI6MjA2OTUyNjU1Mn0.ZNfk5WNDPkjKcFsRO48rEYk3dhbLYm_m21aZ-wfywo4";

  // ── Expose current coaching context globally ──
  window._adminCoachingId = null; // null = Courage Library (own platform)

  window.getAdminCoachingId = function () {
    return window._adminCoachingId;
  };

  // ── Inject context bar into DOM ──
  function injectContextBar() {
    const bar = document.createElement("div");
    bar.id = "adminCoachingContextBar";
    bar.style.cssText = `
      background: linear-gradient(135deg, #1e3a8a, #1a56db);
      color: white;
      padding: 10px 20px;
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 13px;
      font-weight: 600;
      position: sticky;
      top: 0;
      z-index: 100;
      flex-wrap: wrap;
    `;
    bar.innerHTML = `
      <span style="opacity:0.8;flex-shrink:0">
        <i class="fas fa-school" style="margin-right:6px"></i>Context:
      </span>
      <select id="coachingContextSelect"
        style="background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.25);
               color:white;border-radius:8px;padding:5px 12px;font-size:12px;font-weight:700;
               cursor:pointer;outline:none;min-width:200px">
        <option value="">Courage Library (Own Platform)</option>
      </select>
      <span id="contextBadge"
        style="font-size:11px;background:rgba(255,255,255,0.15);padding:3px 10px;border-radius:20px;
               border:1px solid rgba(255,255,255,0.2);opacity:0.9">
        Own platform — creating for Courage Library
      </span>
    `;

    // Insert after nav (first nav element) or at top of body
    const nav = document.querySelector("nav");
    if (nav && nav.nextSibling) {
      nav.parentNode.insertBefore(bar, nav.nextSibling);
    } else {
      document.body.prepend(bar);
    }

    loadCoachingsIntoSelector();
  }

  // ── Load coaching centers into dropdown ──
  async function loadCoachingsIntoSelector() {
    // Wait for supabase to be available
    if (typeof supabase === "undefined") {
      setTimeout(loadCoachingsIntoSelector, 200);
      return;
    }

    const { createClient } = supabase;
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    const { data } = await client
      .from("coaching_centers")
      .select("id, name, city")
      .eq("is_active", true)
      .order("name");

    const select = document.getElementById("coachingContextSelect");
    if (!select) return;

    (data || []).forEach(c => {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = c.name + (c.city ? ` (${c.city})` : "");
      select.appendChild(opt);
    });

    // Restore last selection from sessionStorage
    const saved = sessionStorage.getItem("adminCoachingContext");
    if (saved) {
      select.value = saved;
      applyContext(saved, data || []);
    }

    select.addEventListener("change", (e) => {
      const id = e.target.value;
      sessionStorage.setItem("adminCoachingContext", id);
      applyContext(id, data || []);
      // Trigger re-load on the page if it exposes a reload function
      if (typeof window.reloadPageData === "function") {
        window.reloadPageData();
      }
    });
  }

  // ── Apply chosen context ──
  function applyContext(id, coachings) {
    window._adminCoachingId = id || null;
    const badge = document.getElementById("contextBadge");
    if (!badge) return;

    if (!id) {
      badge.textContent = "Own platform — creating for Courage Library";
      badge.style.background = "rgba(255,255,255,0.15)";
    } else {
      const c = coachings.find(c => c.id === id);
      badge.textContent = c ? `Creating for: ${c.name}` : "Coaching selected";
      badge.style.background = "rgba(251,191,36,0.25)";
      badge.style.borderColor = "rgba(251,191,36,0.4)";
      badge.style.color = "#fef3c7";
    }
  }

  // ── Init on DOM ready ──
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectContextBar);
  } else {
    injectContextBar();
  }
})();