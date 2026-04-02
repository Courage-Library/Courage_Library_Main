// supabase/functions/send-daily-reminder/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY")!;
const FROM_EMAIL = "team@couragelibrary.in";
const FROM_NAME = "Courage Library";
const MOCK_URL = "https://couragelibrary.in/mock/dashboard.html";

// ─── Day config ────────────────────────────────────────────────
const DAY_DATA: Record<string, {
  icon: string; sub: string; q: number; m: number; d: string;
  tip: string; motive: string; week: string;
}> = {
  Monday:    { icon:"📰", sub:"General Awareness",       q:20,  m:40,  d:"20 min", tip:"Focus on current affairs from last 3 months — schemes, awards &amp; sports are high-frequency topics.", motive:"Every day you show up, you move ahead of those who didn't.", week:"Monday" },
  Tuesday:   { icon:"🧠", sub:"Reasoning",               q:20,  m:40,  d:"20 min", tip:"Don't spend more than 1 min per question. Puzzles &amp; number series are the highest-scoring areas today.", motive:"A sharp mind is built one problem at a time. Start now.", week:"Tuesday" },
  Wednesday: { icon:"🔢", sub:"Quantitative Aptitude",   q:20,  m:40,  d:"20 min", tip:"Percentages, ratio &amp; time-work appear most. Skip tough questions and return — don't get stuck.", motive:"Numbers don't lie. Neither does consistent practice.", week:"Wednesday" },
  Thursday:  { icon:"📝", sub:"English Grammar",         q:20,  m:40,  d:"20 min", tip:"Error spotting &amp; fill-in-the-blanks carry most marks. Read every option carefully before selecting.", motive:"Precision in language builds confidence in the exam hall.", week:"Thursday" },
  Friday:    { icon:"🇮🇳", sub:"Hindi",                  q:20,  m:40,  d:"20 min", tip:"संधि, समास और मुहावरों पर ध्यान दें। हर विकल्प ध्यान से पढ़ें — एक अंक का फर्क बड़ा होता है।", motive:"आज का प्रयास कल की सफलता की नींव है।", week:"Friday" },
  Saturday:  { icon:"⚡", sub:"Mixed Sectional (All 5)", q:50,  m:100, d:"30 min", tip:"Mixed bag today — all 5 subjects. Allocate ~6 min per section. Don't spend too long on any single area.", motive:"Saturday is where the serious ones separate from the rest.", week:"Saturday" },
  Sunday:    { icon:"🏆", sub:"Full Mock Test",          q:100, m:200, d:"60 min", tip:"Treat this exactly like the real SSC GD exam. Sit down, full focus, no phone. You've prepared for this.", motive:"The full mock is the closest thing to the real exam. Own it.", week:"Sunday" },
};

const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

// ─── Email builder ──────────────────────────────────────────────
function buildEmailHTML(name: string, day: string): string {
  const d = DAY_DATA[day];
  const safeName = name || "Student";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Today's Mock is Live — ${d.sub}</title>
</head>
<body style="margin:0;padding:0;background:#dde6f5;font-family:Arial,Helvetica,sans-serif;">

<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#dde6f5;padding:28px 0;">
<tr><td align="center">

<table width="520" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;width:100%;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #bfdbfe;">

  <!-- Top bar -->
  <tr><td style="background:#1d4ed8;height:5px;font-size:0;line-height:0;">&nbsp;</td></tr>

  <!-- HEADER -->
  <tr>
    <td style="background:#1e3a8a;padding:24px 28px 0 28px;">

      <!-- Nav row -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="vertical-align:middle;">
            <table cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="vertical-align:middle;width:42px;height:42px;background:#1d4ed8;border-radius:10px;border:2px solid rgba(255,255,255,0.25);text-align:center;">
                  <img src="https://couragelibrary.in/images/logo.png" width="38" height="38" alt="CL" style="display:block;border-radius:8px;">
                </td>
                <td style="padding-left:12px;vertical-align:middle;">
                  <span style="display:block;font-size:15px;font-weight:800;color:#ffffff;line-height:1.2;letter-spacing:0.01em;">Courage Library</span>
                  <span style="display:block;font-size:8px;color:rgba(255,255,255,0.5);letter-spacing:0.1em;text-transform:uppercase;margin-top:3px;">Self-Paced Learning Platform</span>
                </td>
              </tr>
            </table>
          </td>
          <td align="right" style="vertical-align:middle;">
            <span style="display:inline-block;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:100px;padding:5px 12px;font-size:9px;font-weight:700;color:rgba(255,255,255,0.85);letter-spacing:0.08em;text-transform:uppercase;">&#9200; 5:00 AM</span>
          </td>
        </tr>
      </table>

      <!-- Separator -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px;">
        <tr><td style="border-top:1px solid rgba(255,255,255,0.08);font-size:0;line-height:0;">&nbsp;</td></tr>
      </table>

      <!-- Hero -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td align="center" style="padding:28px 0 0;">

            <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 18px;">
              <tr>
                <td style="width:70px;height:70px;background:rgba(255,255,255,0.08);border:2px solid rgba(255,255,255,0.18);border-radius:50%;text-align:center;vertical-align:middle;font-size:32px;line-height:70px;">
                  ${d.icon}
                </td>
              </tr>
            </table>

            <p style="margin:0 0 8px;font-size:12px;color:rgba(255,255,255,0.55);letter-spacing:0.04em;font-family:Arial,sans-serif;">Good Morning, ${safeName} &#9728;&#65039;</p>
            <h1 style="margin:0 0 8px;font-size:30px;font-weight:900;color:#ffffff;letter-spacing:-0.03em;line-height:1.05;font-family:Arial,sans-serif;">Your Mock is Live!</h1>
            <p style="margin:0 0 16px;font-size:16px;font-weight:700;color:rgba(255,255,255,0.82);letter-spacing:0.01em;font-family:Arial,sans-serif;">${d.sub}</p>

            <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 28px;">
              <tr>
                <td style="background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.2);border-radius:100px;padding:5px 18px;">
                  <span style="font-size:10px;font-weight:700;color:rgba(255,255,255,0.8);letter-spacing:0.08em;text-transform:uppercase;font-family:Arial,sans-serif;">${d.week}</span>
                </td>
              </tr>
            </table>

          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Wave -->
  <tr>
    <td style="background:#1e3a8a;font-size:0;line-height:0;padding:0;">
      <div style="overflow:hidden;height:36px;">
        <div style="background:#f0f5ff;border-radius:50% 50% 0 0/100% 100% 0 0;height:68px;margin-top:-32px;"></div>
      </div>
    </td>
  </tr>

  <!-- STATS -->
  <tr>
    <td style="background:#f0f5ff;padding:4px 22px 18px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td width="25%" style="padding:3px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr><td align="center" style="background:#ffffff;border:1px solid #bfdbfe;border-radius:12px;padding:14px 6px;">
                <span style="display:block;font-size:24px;font-weight:900;color:#1d4ed8;line-height:1;font-family:Arial,sans-serif;">${d.q}</span>
                <span style="display:block;font-size:8px;font-weight:700;color:#94a3b8;letter-spacing:0.1em;text-transform:uppercase;margin-top:5px;font-family:Arial,sans-serif;">Questions</span>
              </td></tr>
            </table>
          </td>
          <td width="25%" style="padding:3px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr><td align="center" style="background:#ffffff;border:1px solid #bfdbfe;border-radius:12px;padding:14px 6px;">
                <span style="display:block;font-size:24px;font-weight:900;color:#1d4ed8;line-height:1;font-family:Arial,sans-serif;">${d.m}</span>
                <span style="display:block;font-size:8px;font-weight:700;color:#94a3b8;letter-spacing:0.1em;text-transform:uppercase;margin-top:5px;font-family:Arial,sans-serif;">Marks</span>
              </td></tr>
            </table>
          </td>
          <td width="25%" style="padding:3px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr><td align="center" style="background:#ffffff;border:1px solid #bfdbfe;border-radius:12px;padding:14px 6px;">
                <span style="display:block;font-size:14px;font-weight:900;color:#1d4ed8;line-height:1;padding-top:5px;font-family:Arial,sans-serif;">${d.d}</span>
                <span style="display:block;font-size:8px;font-weight:700;color:#94a3b8;letter-spacing:0.1em;text-transform:uppercase;margin-top:5px;font-family:Arial,sans-serif;">Duration</span>
              </td></tr>
            </table>
          </td>
          <td width="25%" style="padding:3px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr><td align="center" style="background:#ffffff;border:1px solid #bfdbfe;border-radius:12px;padding:14px 6px;">
                <span style="display:block;font-size:20px;font-weight:900;color:#1d4ed8;line-height:1;padding-top:3px;font-family:Arial,sans-serif;">&minus;0.5</span>
                <span style="display:block;font-size:8px;font-weight:700;color:#94a3b8;letter-spacing:0.1em;text-transform:uppercase;margin-top:5px;font-family:Arial,sans-serif;">Negative</span>
              </td></tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- WHITE BODY -->
  <tr>
    <td style="background:#ffffff;padding:0 22px;">

      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:18px;">
        <tr><td style="border-top:1px solid #e2e8f0;font-size:0;line-height:0;">&nbsp;</td></tr>
      </table>

      <!-- STRATEGY TIP -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:14px;">
        <tr>
          <td style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:14px 16px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td width="22" style="vertical-align:top;font-size:15px;line-height:1.5;padding-top:1px;">&#128161;</td>
                <td style="vertical-align:top;padding-left:10px;">
                  <span style="display:block;font-size:8px;font-weight:700;color:#92400e;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:5px;font-family:Arial,sans-serif;">Today's Strategy</span>
                  <span style="font-size:12px;color:#78350f;line-height:1.7;font-family:Arial,sans-serif;">${d.tip}</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <!-- RULES -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;">
        <tr>
          <td style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:12px 16px;text-align:center;">
            <span style="font-size:10px;font-weight:700;color:#1d4ed8;letter-spacing:0.04em;font-family:Arial,sans-serif;">One attempt only &nbsp;&nbsp;|&nbsp;&nbsp; 5 AM &ndash; 11:59 PM &nbsp;&nbsp;|&nbsp;&nbsp; Missed = Real exam discipline</span>
          </td>
        </tr>
      </table>

      <!-- CTA -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:6px;">
        <tr>
          <td align="center">
            <table cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="background:#1d4ed8;border-radius:100px;">
                  <a href="${MOCK_URL}" style="display:inline-block;padding:17px 64px;font-size:15px;font-weight:800;color:#ffffff;text-decoration:none;letter-spacing:0.04em;border-radius:100px;font-family:Arial,sans-serif;">Attempt Now &nbsp;&rarr;</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;">
        <tr><td align="center"><span style="font-size:10px;color:#94a3b8;font-family:Arial,sans-serif;">Opens in browser &nbsp;&middot;&nbsp; Free &nbsp;&middot;&nbsp; No app needed</span></td></tr>
      </table>

      <!-- MOTIVATION -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:26px;">
        <tr>
          <td style="border-left:3px solid #1d4ed8;border-radius:0 12px 12px 0;background:#eff6ff;padding:14px 16px;">
            <p style="margin:0 0 5px;font-size:13px;font-weight:800;color:#1e3a8a;line-height:1.4;font-family:Arial,sans-serif;">&#10024; ${d.motive}</p>
            <p style="margin:0;font-size:11px;color:#64748b;line-height:1.6;font-family:Arial,sans-serif;">Every attempt builds your rank. Start before the day slips away.</p>
          </td>
        </tr>
      </table>

      <!-- Divider -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td style="border-top:1px solid #e2e8f0;font-size:0;line-height:0;">&nbsp;</td></tr>
      </table>

    </td>
  </tr>

  <!-- FOOTER -->
  <tr>
    <td align="center" style="background:#ffffff;padding:20px 22px 24px;">
      <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:14px;">
        <tr>
          <td style="padding:0 4px;">
            <a href="https://www.facebook.com/profile.php?id=61576489404761" style="display:inline-block;width:34px;height:34px;background:#1877f2;border-radius:8px;text-align:center;line-height:34px;font-size:14px;font-weight:900;color:#ffffff;text-decoration:none;">f</a>
          </td>
          <td style="padding:0 4px;">
            <a href="https://www.instagram.com/couragelibrarymock/" style="display:inline-block;width:34px;height:34px;background:#e1306c;border-radius:8px;text-align:center;line-height:34px;font-size:10px;font-weight:900;color:#ffffff;text-decoration:none;">IG</a>
          </td>
        </tr>
      </table>
      <p style="margin:0 0 3px;font-size:11px;color:#94a3b8;font-family:Arial,sans-serif;">Follow us for daily updates &amp; results</p>
      <p style="margin:0 0 8px;font-size:12px;font-weight:800;color:#1e3a8a;letter-spacing:0.06em;text-transform:uppercase;font-family:Arial,sans-serif;">Courage Library</p>
      <p style="margin:0 0 10px;font-size:10px;font-family:Arial,sans-serif;">
        <a href="https://couragelibrary.in" style="color:#1d4ed8;text-decoration:none;font-weight:600;">couragelibrary.in</a>
        &nbsp;&middot;&nbsp;
        <a href="mailto:team@couragelibrary.in" style="color:#1d4ed8;text-decoration:none;font-weight:600;">team@couragelibrary.in</a>
      </p>
      <p style="margin:0;font-size:9px;color:#cbd5e1;line-height:1.6;font-family:Arial,sans-serif;">You're receiving this because you registered on Courage Library.<br>&copy; 2025 Courage Library. All rights reserved.</p>
    </td>
  </tr>

  <!-- Bottom 2-tone bar -->
  <tr>
    <td style="font-size:0;line-height:0;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td width="50%" style="background:#1d4ed8;height:5px;font-size:0;">&nbsp;</td>
          <td width="50%" style="background:#1e3a8a;height:5px;font-size:0;">&nbsp;</td>
        </tr>
      </table>
    </td>
  </tr>

</table>

</td></tr>
</table>

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