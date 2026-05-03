// coachingRouter.js
// Drop this script into your index.html / login page.
// After any successful login/signup, it checks coaching_id and routes the user.

(async function initCoachingRouter() {
  const SUPABASE_URL = "https://sgagswxzsxlgcspwiuoh.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNnYWdzd3h6c3hsZ2NzcHdpdW9oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5NTA1NTIsImV4cCI6MjA2OTUyNjU1Mn0.ZNfk5WNDPkjKcFsRO48rEYk3dhbLYm_m21aZ-wfywo4";

  const { createClient } = supabase;
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // ── Listen for auth state changes ──
  client.auth.onAuthStateChange(async (event, session) => {
    if (event !== "SIGNED_IN" || !session?.user) return;

    const user = session.user;

    // ── 1. Check if arriving from a coaching join link ──
    const joinCoachingId = sessionStorage.getItem("join_coaching_id");
    if (joinCoachingId) {
      // Link user to coaching center
      await client
        .from("user_profiles")
        .update({ coaching_id: joinCoachingId })
        .eq("id", user.id);

      sessionStorage.removeItem("join_coaching_id");
      sessionStorage.removeItem("join_coaching_name");
      sessionStorage.removeItem("join_coaching_slug");

      window.location.href = "/coaching/dashboard.html";
      return;
    }

    // ── 2. Check URL param ?coaching=slug (from signup/login links on join page) ──
    const params = new URLSearchParams(window.location.search);
    const coachingSlug = params.get("coaching");

    if (coachingSlug) {
      // Resolve slug to coaching_id and link user
      const { data: coaching } = await client
        .from("coaching_centers")
        .select("id")
        .eq("slug", coachingSlug)
        .eq("is_active", true)
        .single();

      if (coaching) {
        await client
          .from("user_profiles")
          .update({ coaching_id: coaching.id })
          .eq("id", user.id);

        window.location.href = "/coaching/dashboard.html";
        return;
      }
    }

    // ── 3. Check existing coaching_id on profile ──
    const { data: profile } = await client
      .from("user_profiles")
      .select("coaching_id, is_admin, role")
      .eq("id", user.id)
      .single();

    if (!profile) return;

    // Admin → stay on current page
    const isAdmin = profile.is_admin || profile.role === "admin" || profile.role === "super_admin";
    if (isAdmin) return;

    // Coaching student → coaching dashboard
    if (profile.coaching_id) {
      window.location.href = "/coaching/dashboard.html";
      return;
    }

    // Regular student → main dashboard
    window.location.href = "/mock/dashboard.html";
  });
})();