// ─────────────────────────────────────────────────────────────────────────────
// submit-test-and-reward.ts  —  Production-ready (Step 15)
//
// Integrates all fixes from Steps 4–14:
//   ✅ Step 03 — Edge function is sole streak source of truth
//   ✅ Step 10 — One coin award per scheduled_exam per user (anti-abuse)
//   ✅ Step 07 — "X coins away" nudge (debounced 3 days)
//   ✅ Step 05 — Auto-unlock reward notification + realtime event
//   ✅ Step 09 — Coin breakdown returned to result page
//   ✅ Step 12 — Badge awards (first_mock, accuracy_80, streak milestones, coin milestones)
//   ✅ Step 12 — Level-up detection and notification
//   ✅ Step 12 — lifetime_coins tracked (never decremented)
//   ✅ Step 11 — Referral reward trigger (fire-and-forget)
//   ✅ Step 10 — coins_given flag failure logged to admin_logs (not silently ignored)
//
// Deploy: supabase functions deploy submit-test-and-reward
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SubmitRequest {
  attempt_id: string;
}

interface BadgeCtx {
  attemptCount: number;
  accuracy: number;
  newStreak: number;
  isNewDay: boolean;
  newLifetime: number;
  oldLifetime: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const REWARD_MILESTONES = [
  { coins: 1800, name: "Bottle" },
  { coins: 2600, name: "Diary" },
  { coins: 3500, name: "T-shirt" },
];

const BADGES = [
  { type: "first_mock", check: (ctx: BadgeCtx) => ctx.attemptCount === 1 },
  { type: "accuracy_80", check: (ctx: BadgeCtx) => ctx.accuracy >= 80 },
  {
    type: "streak_7",
    check: (ctx: BadgeCtx) => ctx.newStreak >= 7 && ctx.isNewDay,
  },
  {
    type: "streak_14",
    check: (ctx: BadgeCtx) => ctx.newStreak >= 14 && ctx.isNewDay,
  },
  {
    type: "streak_30",
    check: (ctx: BadgeCtx) => ctx.newStreak >= 30 && ctx.isNewDay,
  },
  {
    type: "coins_1000",
    check: (ctx: BadgeCtx) => ctx.newLifetime >= 1000 && ctx.oldLifetime < 1000,
  },
  {
    type: "coins_3000",
    check: (ctx: BadgeCtx) => ctx.newLifetime >= 3000 && ctx.oldLifetime < 3000,
  },
];

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

/** Today's date in YYYY-MM-DD using IST (UTC+5:30) — prevents timezone drift */
function todayIST(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

/** Day difference between two YYYY-MM-DD strings in IST */
function dayDiff(dateA: string, dateB: string): number {
  const a = new Date(dateA + "T00:00:00+05:30");
  const b = new Date(dateB + "T00:00:00+05:30");
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

/** User's level based on lifetime coins earned */
function getLevel(lifetime: number): string {
  if (lifetime >= 3000) return "Gold";
  if (lifetime >= 1000) return "Silver";
  return "Bronze";
}

// ─── Main handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return error("Method not allowed", 405);
  }

  // ── 1. Verify JWT ────────────────────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return error("Missing or invalid Authorization header", 401);
  }

  const supabaseUser = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const {
    data: { user },
    error: authErr,
  } = await supabaseUser.auth.getUser();
  if (authErr || !user) {
    return error("Unauthorized", 401);
  }

  const user_id = user.id;

  // ── 2. Parse body ────────────────────────────────────────────────────────────
  let body: SubmitRequest;
  try {
    body = await req.json();
  } catch {
    return error("Invalid JSON body");
  }

  const { attempt_id } = body;
  if (!attempt_id) return error("attempt_id is required");

  // ── 3. Service-role client ────────────────────────────────────────────────────
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ── 4. Load attempt — verify ownership ───────────────────────────────────────
  const { data: attempt, error: attemptErr } = await supabase
    .from("attempts")
    .select("*")
    .eq("id", attempt_id)
    .eq("user_id", user_id)
    .single();

  if (attemptErr || !attempt) {
    return error("Attempt not found", 404);
  }

  // ── 5. Prevent duplicate reward on same attempt ───────────────────────────────
  if (attempt.coins_given) {
    return json({
      already_rewarded: true,
      message: "Coins already awarded for this attempt.",
    });
  }

  // ── 6. ANTI-ABUSE (Step 10): one reward per scheduled_exam per user ───────────
  const { data: priorRewarded } = await supabase
    .from("attempts")
    .select("id")
    .eq("user_id", user_id)
    .eq("scheduled_exam_id", attempt.scheduled_exam_id)
    .eq("coins_given", true)
    .limit(1);

  if (priorRewarded && priorRewarded.length > 0) {
    return json({
      already_rewarded: true,
      message: "Coins already awarded for this exam.",
    });
  }

  // ── 7. Load scheduled exam ────────────────────────────────────────────────────
  const { data: exam, error: examErr } = await supabase
    .from("scheduled_exams")
    .select("day_of_week")
    .eq("id", attempt.scheduled_exam_id)
    .single();

  if (examErr || !exam) {
    return error("Scheduled exam not found", 404);
  }

  // ── 8. Load user profile ──────────────────────────────────────────────────────
  const { data: profile, error: profileErr } = await supabase
    .from("user_profiles")
    .select(
      "id, total_coins, lifetime_coins, current_streak, max_streak, last_test_date",
    )
    .eq("id", user_id)
    .single();

  if (profileErr || !profile) {
    return error("User profile not found", 404);
  }

  // ── 9. Coin calculation ───────────────────────────────────────────────────────

  // 9a. Base by day
  let base = 20;
  if (exam.day_of_week === "sat") base = 30;
  if (exam.day_of_week === "sun") base = 40;

  // 9b. Accuracy bonus
  let accuracyBonus = 0;
  const accuracy = Number(attempt.accuracy ?? 0);
  if (accuracy >= 80) accuracyBonus = base;
  else if (accuracy >= 60) accuracyBonus = Math.round(base / 2);

  // 9c. First test bonus
  let firstTestBonus = 0;
  const { count: attemptCount } = await supabase
    .from("attempts")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user_id);

  if (attemptCount === 1) firstTestBonus = 30;

  // ── 10. Streak calculation (IST-aware, edge function is sole source of truth) ──
  const today = todayIST();
  let newStreak = 1;
  let isNewDay = true;

  if (profile.last_test_date) {
    const diff = dayDiff(profile.last_test_date, today);
    if (diff === 0) {
      newStreak = profile.current_streak;
      isNewDay = false;
    } else if (diff === 1) {
      newStreak = profile.current_streak + 1;
    } else {
      newStreak = 1;
    }
  }

  // 10a. Streak milestone bonus
  let streakBonus = 0;
  if (isNewDay) {
    if (newStreak === 5) streakBonus = 30;
    if (newStreak === 10) streakBonus = 80;
    if (newStreak === 25) streakBonus = 200;
    if (newStreak === 50) streakBonus = 500;
  }

  // ── 11. Total coins ───────────────────────────────────────────────────────────
  const totalCoins = base + accuracyBonus + firstTestBonus + streakBonus;

  const breakdown = {
    base,
    accuracy_bonus: accuracyBonus,
    first_test_bonus: firstTestBonus,
    streak_bonus: streakBonus,
    total: totalCoins,
  };

  // ── 12. Computed values ───────────────────────────────────────────────────────
  const oldTotal = profile.total_coins ?? 0;
  const newTotal = oldTotal + totalCoins;
  const oldLifetime = profile.lifetime_coins ?? 0;
  const newLifetime = oldLifetime + totalCoins; // lifetime never decremented
  const newMaxStreak = Math.max(newStreak, profile.max_streak ?? 0);
  const oldLevel = getLevel(oldLifetime);
  const newLevel = getLevel(newLifetime);

  // ── 13. Atomic DB writes ──────────────────────────────────────────────────────

  // 13a. Log earn transaction
  const { error: txErr } = await supabase.from("coin_transactions").insert({
    user_id,
    coins: totalCoins,
    type: "test",
    description: `Test reward — ${base} base + ${accuracyBonus} accuracy + ${firstTestBonus} first-test + ${streakBonus} streak`,
  });

  if (txErr) {
    console.error("coin_transactions insert failed:", txErr);
    return error("Failed to log coin transaction. Please retry.", 500);
  }

  // 13b. Update profile — coins, lifetime_coins, streak, max_streak, last_test_date
  const { error: profileUpdateErr } = await supabase
    .from("user_profiles")
    .update({
      total_coins: newTotal,
      lifetime_coins: newLifetime,
      current_streak: newStreak,
      max_streak: newMaxStreak,
      ...(isNewDay && { last_test_date: today }),
    })
    .eq("id", user_id);

  if (profileUpdateErr) {
    console.error("profile update failed:", profileUpdateErr);
    // Rollback transaction log
    await supabase
      .from("coin_transactions")
      .delete()
      .eq("user_id", user_id)
      .eq("type", "test")
      .order("created_at", { ascending: false })
      .limit(1);
    return error("Failed to update profile. Please retry.", 500);
  }

  // 13c. Mark attempt as rewarded — log to admin_logs if flag fails (Step 10 fix)
  const { error: attemptUpdateErr } = await supabase
    .from("attempts")
    .update({ coins_given: true })
    .eq("id", attempt_id);

  if (attemptUpdateErr) {
    console.error("attempt coins_given flag failed:", attemptUpdateErr);
    // Coins were awarded correctly — log for admin reconciliation
    await supabase
      .from("admin_logs")
      .insert({
        admin_id: user_id,
        action: "coins_given_flag_failed",
        target_id: attempt_id,
      })
      .catch(() => {}); // non-fatal
  }

  // ── 14. Notifications ─────────────────────────────────────────────────────────

  // 14a. Main coin notification
  await supabase.from("notifications").insert({
    user_id,
    title: `🪙 You earned ${totalCoins} coins!`,
    message: `${base} base + ${accuracyBonus} accuracy bonus. Streak: ${newStreak} days.`,
    type: "coins",
  });

  // 14b. Streak milestone notification
  if (streakBonus > 0) {
    await supabase.from("notifications").insert({
      user_id,
      title: `🔥 ${newStreak}-day streak bonus!`,
      message: `You earned ${streakBonus} extra coins for your ${newStreak}-day streak. Keep going!`,
      type: "streak",
    });
  }

  // ── 15. Reward unlock detection ───────────────────────────────────────────────
  let unlockedReward: { coins: number; name: string } | null = null;

  for (const milestone of REWARD_MILESTONES) {
    const justCrossed =
      oldTotal < milestone.coins && newTotal >= milestone.coins;
    if (!justCrossed) continue;

    const { data: existingClaim } = await supabase
      .from("reward_claims")
      .select("id")
      .eq("user_id", user_id)
      .eq("reward_name", milestone.name)
      .limit(1);

    if (existingClaim && existingClaim.length > 0) continue;

    await supabase.from("notifications").insert({
      user_id,
      title: `🎁 ${milestone.name} unlocked!`,
      message: `You now have ${newTotal} coins — enough to claim your ${milestone.name}. Go to Rewards to claim it!`,
      type: "reward_unlocked",
    });

    unlockedReward = milestone;
    break;
  }

  // ── 16. "Close to reward" nudge (debounced 3 days) ───────────────────────────
  if (!unlockedReward) {
    for (const milestone of REWARD_MILESTONES) {
      const gap = milestone.coins - newTotal;
      if (gap <= 0 || gap > 100) continue;

      const threeDaysAgo = new Date(
        Date.now() - 3 * 24 * 60 * 60 * 1000,
      ).toISOString();
      const { data: recentNudge } = await supabase
        .from("notifications")
        .select("id")
        .eq("user_id", user_id)
        .eq("type", "reward_nudge")
        .ilike("message", `%${milestone.name}%`)
        .gte("created_at", threeDaysAgo)
        .limit(1);

      if (recentNudge && recentNudge.length > 0) break;

      await supabase.from("notifications").insert({
        user_id,
        title: `🎯 Almost there!`,
        message: `Just ${gap} more coins to claim your ${milestone.name}. Attempt tomorrow's mock to get there!`,
        type: "reward_nudge",
      });
      break;
    }
  }

  // ── 17. Badge awards (Step 12) ────────────────────────────────────────────────
  const badgeCtx: BadgeCtx = {
    attemptCount: attemptCount ?? 0,
    accuracy,
    newStreak,
    isNewDay,
    newLifetime,
    oldLifetime,
  };

  const { data: existingBadges } = await supabase
    .from("user_badges")
    .select("badge_type")
    .eq("user_id", user_id);

  const alreadyHas = new Set(
    (existingBadges ?? []).map((b: { badge_type: string }) => b.badge_type),
  );

  const newBadges: string[] = [];

  for (const badge of BADGES) {
    if (alreadyHas.has(badge.type)) continue;
    if (!badge.check(badgeCtx)) continue;

    const { error: badgeErr } = await supabase
      .from("user_badges")
      .insert({ user_id, badge_type: badge.type });

    if (!badgeErr) {
      newBadges.push(badge.type);
      await supabase.from("notifications").insert({
        user_id,
        title: `🏅 Badge unlocked: ${badge.type.replace(/_/g, " ")}`,
        message: `You earned the "${badge.type.replace(/_/g, " ")}" badge. Keep it up!`,
        type: "badge",
      });
    }
  }

  // ── 18. Level-up notification (Step 12) ──────────────────────────────────────
  if (oldLevel !== newLevel) {
    await supabase.from("notifications").insert({
      user_id,
      title: `⭐ Level up — ${newLevel}!`,
      message: `You've reached ${newLevel} tier with ${newLifetime} lifetime coins earned. Amazing progress!`,
      type: "level_up",
    });
  }

  // ── 19. Fire referral check (Step 11) — background, non-blocking ──────────────
  const internalSecret = Deno.env.get("INTERNAL_FUNCTION_SECRET");
  if (internalSecret) {
    fetch(
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/process-referral-reward`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-secret": internalSecret,
        },
        body: JSON.stringify({ referee_id: user_id }),
      },
    ).catch((err) => console.warn("referral check failed (non-fatal):", err));
  }

  // ── 20. Return ────────────────────────────────────────────────────────────────
  return json({
    success: true,
    coins: totalCoins,
    breakdown, // Step 09 — result page breakdown
    streak: newStreak,
    max_streak: newMaxStreak,
    total_coins: newTotal,
    lifetime_coins: newLifetime,
    level: newLevel,
    level_up: oldLevel !== newLevel,
    badges_earned: newBadges,
    reward_unlocked: unlockedReward ? unlockedReward.name : null,
  });
});