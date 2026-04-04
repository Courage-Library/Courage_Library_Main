import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VALID_BADGE_TYPES = new Set([
  "first_mock", "accuracy_80", "streak_7", "streak_14", "streak_30",
  "coins_1000", "coins_3000", "top_10_leaderboard",
]);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: CORS_HEADERS });
  }

  const supabaseUser = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user } } = await supabaseUser.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: CORS_HEADERS });

  const { badge_type } = await req.json();
  if (!VALID_BADGE_TYPES.has(badge_type)) {
    return new Response(JSON.stringify({ error: "Invalid badge_type" }), { status: 400, headers: CORS_HEADERS });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { error } = await supabase.from("user_badges").insert({
    user_id:   user.id,
    badge_type,
    earned_at: new Date().toISOString(),
  });

  if (error?.code === "23505") {
    return new Response(JSON.stringify({ already_had: true }), { headers: CORS_HEADERS });
  }

  if (error) {
    return new Response(JSON.stringify({ error: "Insert failed" }), { status: 500, headers: CORS_HEADERS });
  }

  await supabase.from("notifications").insert({
    user_id: user.id,
    title:   `🏅 Badge unlocked: ${badge_type.replace(/_/g, " ")}`,
    message: `You earned the "${badge_type.replace(/_/g, " ")}" badge. Check your profile!`,
    type:    "badge",
  });

  return new Response(JSON.stringify({ success: true, badge_type }), { headers: CORS_HEADERS });
});