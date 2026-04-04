import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClaimRequest {
  reward_name: string;
  delivery_name: string;
  delivery_phone: string;
  delivery_address: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Mirrors the reward thresholds in your frontend REWARDS array
const REWARD_COSTS: Record<string, number> = {
  "Bottle": 1800,
  "Diary": 2600,
  "T-shirt": 3500,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function error(message: string, status = 400) {
  return json({ error: message }, status);
}

// ─── Main handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return error("Method not allowed", 405);
  }

  // ── 1. Verify JWT — user_id comes from token, never from body ─────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return error("Missing or invalid Authorization header", 401);
  }

  const supabaseUser = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user }, error: authErr } = await supabaseUser.auth.getUser();
  if (authErr || !user) {
    return error("Unauthorized", 401);
  }

  const user_id = user.id;

  // ── 2. Parse request body ─────────────────────────────────────────────────
  let body: ClaimRequest;
  try {
    body = await req.json();
  } catch {
    return error("Invalid JSON body");
  }

  const { reward_name, delivery_name, delivery_phone, delivery_address } = body;

  if (!reward_name) return error("reward_name is required");
  if (!delivery_name) return error("delivery_name is required");
  if (!delivery_phone) return error("delivery_phone is required");
  if (!delivery_address) return error("delivery_address is required");

  if (!/^\d{10}$/.test(delivery_phone)) {
    return error("delivery_phone must be a 10-digit number");
  }

  // ── 3. Validate reward name & resolve cost ────────────────────────────────
  const coins_required = REWARD_COSTS[reward_name];
  if (!coins_required) {
    return error(`Unknown reward: ${reward_name}`);
  }

  // ── 4. Service-role client for all DB writes ──────────────────────────────
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // ── 5. Load user profile — check balance ─────────────────────────────────
  const { data: profile, error: profileErr } = await supabase
    .from("user_profiles")
    .select("id, total_coins")
    .eq("id", user_id)
    .single();

  if (profileErr || !profile) {
    return error("User profile not found", 404);
  }

  if ((profile.total_coins ?? 0) < coins_required) {
    return error(
      `Insufficient coins. You need ${coins_required} but have ${profile.total_coins ?? 0}.`,
      402
    );
  }

  // ── 6. FIX (Step 02): One active claim per user at a time ─────────────────
  //    Blocks claiming a higher-tier reward while a pending/approved one exists
  const { data: activeClaim } = await supabase
    .from("reward_claims")
    .select("id, reward_name, status")
    .eq("user_id", user_id)
    .in("status", ["pending", "approved"])
    .limit(1);

  if (activeClaim && activeClaim.length > 0) {
    return error(
      `You already have an active claim for "${activeClaim[0].reward_name}" (${activeClaim[0].status}). ` +
      `Please wait for it to be processed before claiming another reward.`,
      409
    );
  }

  // ── 7. Lookup reward_id from rewards table ────────────────────────────────
  const { data: rewardRow } = await supabase
    .from("rewards")
    .select("id")
    .eq("name", reward_name)
    .single();

  // reward_id is optional — we store reward_name as primary identifier
  const reward_id = rewardRow?.id ?? null;

  // ── 8. FIX (Step 01 + Step 04): Atomic claim insert + coin deduction + tx log ──
  const { data: rpcData, error: rpcErr } = await supabase.rpc("claim_reward_atomic", {
    p_user_id: user_id,
    p_reward_name: reward_name,
    p_reward_id: reward_id,
    p_coins_req: coins_required,
    p_delivery_name: delivery_name,
    p_delivery_phone: delivery_phone,
    p_delivery_addr: delivery_address,
  });

  if (rpcErr) {
    if (rpcErr.message.includes("insufficient_coins")) return error("Insufficient coins.", 402);
    if (rpcErr.message.includes("active_claim_exists")) return error("Active claim already exists.", 409);
    return error("Claim failed. Please retry.", 500);
  }

  const claim_id = rpcData?.claim_id;

  // ── 9. Send a confirmation notification ──────────────────────────────────
  await supabase.from("notifications").insert({
    user_id,
    title: `🎁 ${reward_name} claim submitted!`,
    message: `Your claim is under review. Admin will dispatch within 7–10 working days. ${coins_required} coins deducted.`,
    type: "claim",
  });

  // ── 10. Return ────────────────────────────────────────────────────────────
  const coins_remaining = (profile.total_coins ?? 0) - coins_required;

  return json({
    success:         true,
    claim_id:        claim_id,           // from rpcData.claim_id (step 8)
    reward_name,
    coins_used:      coins_required,
    coins_remaining: Math.max(0, coins_remaining),
  });
});

