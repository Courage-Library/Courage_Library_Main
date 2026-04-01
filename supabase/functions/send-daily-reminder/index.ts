// supabase/functions/send-daily-reminder/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY")!;
const FROM_EMAIL = "team@couragelibrary.in";
const FROM_NAME = "Courage Library";
const MOCK_URL = "https://couragelibrary.in/mock/dashboard.html";

// ─── Day config ────────────────────────────────────────────────
const DAY_DATA: Record<string, {
  icon: string; sub: string; q: number; m: number; d: string;
  c1: string; c2: string; c3: string; tip: string; motive: string;
}> = {
  Monday:    { icon:"📰", sub:"General Awareness",       q:20,  m:40,  d:"20 min", c1:"#1a56db", c2:"#3b82f6", c3:"#1e3a8a", tip:"Brush up on current affairs from the last 3 months. Focus on schemes, awards & sports.", motive:"🔥 SSC GD toppers never skip a day. Will you?" },
  Tuesday:   { icon:"🧠", sub:"Reasoning",               q:20,  m:40,  d:"20 min", c1:"#4f46e5", c2:"#818cf8", c3:"#312e81", tip:"Don't spend more than 1 min per question. Puzzles & series are high scorers today.", motive:"💪 Sharp mind wins. Warm up and dive in!" },
  Wednesday: { icon:"🔢", sub:"Quant Aptitude",          q:20,  m:40,  d:"20 min", c1:"#0891b2", c2:"#22d3ee", c3:"#164e63", tip:"Percentages, ratio & time-work are most common. Skip and come back if stuck.", motive:"📈 Numbers are your weapon today. Use them!" },
  Thursday:  { icon:"📝", sub:"English Grammar",         q:20,  m:40,  d:"20 min", c1:"#059669", c2:"#34d399", c3:"#064e3b", tip:"Error spotting & fill-in-the-blanks carry most weight. Read each option carefully.", motive:"✨ Grammar today. Precision wins marks!" },
  Friday:    { icon:"🇮🇳", sub:"Hindi",                  q:20,  m:40,  d:"20 min", c1:"#dc2626", c2:"#f87171", c3:"#7f1d1d", tip:"संधि, समास और मुहावरे पर ध्यान दें। आज का पेपर अच्छा जाएगा!", motive:"🏅 हिंदी में आज धमाका करो! All the best!" },
  Saturday:  { icon:"⚡", sub:"Mixed Sectional (All 5)", q:50,  m:100, d:"30 min", c1:"#d97706", c2:"#fbbf24", c3:"#78350f", tip:"Mixed bag today — divide your time wisely. 30 sec per question on average.", motive:"⚡ Big test day! Give it everything you have." },
  Sunday:    { icon:"🏆", sub:"Full Mock Test",          q:100, m:200, d:"60 min", c1:"#7c3aed", c2:"#a78bfa", c3:"#3b0764", tip:"Treat this like the real SSC GD exam. No distractions. Full focus. You've got this!", motive:"🏆 Full mock Sunday! This is your moment." },
};

const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

// ─── HTML email builder ─────────────────────────────────────────
function buildEmailHTML(name: string, day: string): string {
  const d = DAY_DATA[day];
  const safeName = name || "Student";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Today's Mock is Live — ${d.sub}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #e2e8f0; font-family: 'Segoe UI', Arial, sans-serif; }
  .email { max-width: 500px; margin: 0 auto; background: #fff; border-radius: 20px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,.18); }
  .accent-bar { height: 5px; background: linear-gradient(90deg,${d.c1},${d.c2},${d.c1}); }
  .hero-bg { padding: 30px 28px 0; background: linear-gradient(160deg,${d.c1} 0%,${d.c3} 100%); }
  .hero-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
  .logo-area { display: flex; align-items: center; gap: 10px; }
  .logo-circle { width: 42px; height: 42px; border-radius: 11px; background: #fff; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 14px rgba(0,0,0,.15); overflow: hidden; flex-shrink: 0; }
  .logo-circle img { width: 36px; height: 36px; object-fit: contain; display: block; }
  .logo-brand { font-size: 13px; font-weight: 800; color: #fff; line-height: 1.1; display: block; }
  .logo-tagline { font-size: 9px; font-weight: 600; color: rgba(255,255,255,.6); text-transform: uppercase; letter-spacing: .08em; display: block; }
  .morning-badge { background: rgba(255,255,255,.18); border: 1px solid rgba(255,255,255,.3); border-radius: 100px; padding: 4px 11px; }
  .badge-text { font-size: 9px; font-weight: 800; color: #fff; text-transform: uppercase; letter-spacing: .08em; }
  .hero-center { text-align: center; padding-bottom: 10px; }
  .sun-inner { width: 68px; height: 68px; border-radius: 50%; background: rgba(255,255,255,.15); border: 2px solid rgba(255,255,255,.3); display: flex; align-items: center; justify-content: center; font-size: 34px; margin: 0 auto 14px; }
  .greet { font-size: 13px; color: rgba(255,255,255,.75); margin-bottom: 6px; font-weight: 500; }
  .main-title { font-size: 26px; font-weight: 900; color: #fff; margin-bottom: 4px; letter-spacing: -.03em; line-height: 1.1; }
  .subject-name { font-size: 15px; font-weight: 700; color: rgba(255,255,255,.85); }
  .wave { display: block; margin-top: -2px; }
  .stats-section { padding: 20px 20px 16px; }
  .stats-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 10px; margin-bottom: 14px; }
  .stat-box { background: #f8faff; border: 1px solid #e8edf5; border-radius: 12px; padding: 12px 8px; text-align: center; }
  .stat-num { font-size: 22px; font-weight: 900; line-height: 1; margin-bottom: 3px; }
  .stat-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: #94a3b8; }
  .tip-box { background: linear-gradient(135deg,#fefce8,#fef3c7); border: 1px solid #fde68a; border-radius: 12px; padding: 12px 14px; display: flex; gap: 10px; align-items: flex-start; }
  .tip-label { font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; color: #92400e; margin-bottom: 3px; }
  .tip-text { font-size: 12px; color: #78350f; line-height: 1.5; font-weight: 500; }
  .rules-section { padding: 0 20px 16px; }
  .rules-strip { background: #fff5f5; border: 1px solid #fecaca; border-radius: 12px; padding: 12px 16px; }
  .rules-title { font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: .1em; color: #dc2626; margin-bottom: 10px; }
  .rules-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
  .rule-item { text-align: center; }
  .rule-icon { font-size: 16px; display: block; margin-bottom: 2px; }
  .rule-name { font-size: 10px; font-weight: 700; color: #dc2626; display: block; }
  .rule-val { font-size: 10px; color: #9ca3af; display: block; margin-top: 1px; }
  .cta-section { padding: 4px 20px 20px; text-align: center; }
  .cta-btn { display: inline-block; color: #fff !important; text-decoration: none; font-size: 15px; font-weight: 800; padding: 15px 50px; border-radius: 100px; background: linear-gradient(135deg,${d.c1},${d.c2}); box-shadow: 0 8px 28px ${d.c1}55; letter-spacing: .02em; }
  .cta-note { font-size: 10px; color: #94a3b8; margin: 8px 0 0; }
  .motive-section { padding: 0 20px 18px; }
  .motive-box { border-radius: 12px; padding: 14px 16px; text-align: center; background: linear-gradient(135deg,${d.c1}12,${d.c2}18); }
  .motive-text { font-size: 13px; font-weight: 800; color: ${d.c3}; margin-bottom: 3px; }
  .motive-sub { font-size: 11px; color: #6b7280; }
  .footer { padding: 18px 28px 22px; text-align: center; border-top: 1px solid #f1f5f9; }
  .social-row { display: flex; gap: 10px; justify-content: center; margin-bottom: 12px; }
  .soc-btn { width: 36px; height: 36px; border-radius: 10px; display: inline-flex; align-items: center; justify-content: center; color: #fff !important; font-weight: 900; font-size: 14px; text-decoration: none; }
  .fb { background: #1877f2; }
  .ig { background: linear-gradient(135deg,#f58529,#dd2a7b,#8134af); }
  .footer-brand { font-size: 12px; font-weight: 800; color: #374151; text-transform: uppercase; letter-spacing: .06em; margin-bottom: 3px; }
  .footer-links { font-size: 10px; color: #9ca3af; margin-bottom: 10px; }
  .footer-links a { color: #3b82f6; text-decoration: none; }
  .unsub { font-size: 9px; color: #d1d5db; }
  .bottom-bar { height: 4px; background: linear-gradient(90deg,${d.c1},${d.c2},${d.c1}); }
</style>
</head>
<body>
<div class="email">

  <div class="accent-bar"></div>

  <div class="hero-bg">
    <div class="hero-top">
      <div class="logo-area">
        <div class="logo-circle">
          <img src="https://couragelibrary.in/images/logo.png" alt="CL">
        </div>
        <div>
          <span class="logo-brand">Courage Library</span>
          <span class="logo-tagline">Mock Test Platform</span>
        </div>
      </div>
      <div class="morning-badge">
        <span class="badge-text">⏰ 4:45 AM</span>
      </div>
    </div>

    <div class="hero-center">
      <div class="sun-inner">${d.icon}</div>
      <p class="greet">Good Morning, ${safeName}! ☀️</p>
      <h1 class="main-title">Your Mock is Live!</h1>
      <p class="subject-name">${d.sub}</p>
    </div>
  </div>

  <svg class="wave" viewBox="0 0 500 40" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" width="100%" height="40">
    <path d="M0,20 C125,40 375,0 500,20 L500,40 L0,40 Z" fill="#ffffff"/>
  </svg>

  <div class="stats-section">
    <div class="stats-grid">
      <div class="stat-box">
        <div class="stat-num" style="color:#1d4ed8">${d.q}</div>
        <div class="stat-label">Questions</div>
      </div>
      <div class="stat-box">
        <div class="stat-num" style="color:#059669">${d.m}</div>
        <div class="stat-label">Marks</div>
      </div>
      <div class="stat-box">
        <div class="stat-num" style="color:#d97706;font-size:15px;padding-top:4px">${d.d}</div>
        <div class="stat-label">Duration</div>
      </div>
      <div class="stat-box">
        <div class="stat-num" style="color:#dc2626;font-size:18px;padding-top:2px">−0.5</div>
        <div class="stat-label">Negative</div>
      </div>
    </div>

    <div class="tip-box">
      <div style="font-size:18px;flex-shrink:0;margin-top:1px">💡</div>
      <div>
        <div class="tip-label">Today's Strategy</div>
        <p class="tip-text">${d.tip}</p>
      </div>
    </div>
  </div>

  <div class="rules-section">
    <div class="rules-strip">
      <div class="rules-title">⚠ Important Rules</div>
      <div class="rules-row">
        <div class="rule-item">
          <span class="rule-icon">⏰</span>
          <span class="rule-name">Window</span>
          <span class="rule-val">5 AM – 11:59 PM</span>
        </div>
        <div class="rule-item">
          <span class="rule-icon">🚫</span>
          <span class="rule-name">One Attempt</span>
          <span class="rule-val">No retakes allowed</span>
        </div>
        <div class="rule-item">
          <span class="rule-icon">📵</span>
          <span class="rule-name">Missed = Gone</span>
          <span class="rule-val">Real exam discipline</span>
        </div>
      </div>
    </div>
  </div>

  <div class="cta-section">
    <a class="cta-btn" href="${MOCK_URL}">Attempt Now &nbsp;→</a>
    <p class="cta-note">Opens in browser · Free · No app needed</p>
  </div>

  <div class="motive-section">
    <div class="motive-box">
      <p class="motive-text">${d.motive}</p>
      <p class="motive-sub">Every attempt builds your rank. Start now before the day slips away.</p>
    </div>
  </div>

  <div class="footer">
    <div class="social-row">
      <a class="soc-btn fb" href="https://www.facebook.com/profile.php?id=61576489404761">f</a>
      <a class="soc-btn ig" href="https://www.instagram.com/couragelibrarymock/">◯</a>
    </div>
    <p style="font-size:11px;color:#9ca3af;margin-bottom:12px">Follow us for daily updates &amp; results</p>
    <p class="footer-brand">Courage Library</p>
    <p class="footer-links">
      <a href="https://couragelibrary.in">couragelibrary.in</a> &nbsp;·&nbsp;
      <a href="mailto:team@couragelibrary.in">team@couragelibrary.in</a>
    </p>
    <p class="unsub">You're receiving this because you registered on Courage Library. © 2025</p>
  </div>

  <div class="bottom-bar"></div>
</div>
</body>
</html>`;
}

// ─── Main handler ───────────────────────────────────────────────
Deno.serve(async (_req) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get today's day name (IST = UTC+5:30)
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const ist = new Date(now.getTime() + istOffset);
    const dayName = DAYS[ist.getDay()];
    const d = DAY_DATA[dayName];

    // Fetch all users
    const { data: { users }, error } = await supabase.auth.admin.listUsers();
    if (error) throw error;

    const validUsers = users.filter(u => u.email);
    console.log(`Sending to ${validUsers.length} users — Day: ${dayName}`);

    // Send emails via Brevo
    const results = await Promise.allSettled(
      validUsers.map(async (user) => {
        const name = user.user_metadata?.full_name || user.user_metadata?.name || "Student";
        const htmlContent = buildEmailHTML(name, dayName);

        const res = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: {
            "api-key": BREVO_API_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sender: { name: FROM_NAME, email: FROM_EMAIL },
            to: [{ email: user.email, name }],
            subject: `🔔 Today's Mock is Live — ${d.sub}!`,
            htmlContent,
          }),
        });

        if (!res.ok) {
          const err = await res.text();
          throw new Error(`Failed for ${user.email}: ${err}`);
        }

        return user.email;
      })
    );

    const sent = results.filter(r => r.status === "fulfilled").length;
    const failed = results
      .filter(r => r.status === "rejected")
      .map(r => (r as PromiseRejectedResult).reason?.message);

    console.log(`✅ Sent: ${sent} | ❌ Failed: ${failed.length}`);
    if (failed.length) console.error("Failures:", failed);

    return new Response(
      JSON.stringify({ day: dayName, subject: d.sub, sent, failed: failed.length, errors: failed }),
      { headers: { "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("Fatal error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});