/* ─────────────────────────────────────────────────────────────
   leaderboardEngine.js  —  Courage Library
   My Performance page — hero ring, rank, scorecard, coins,
   dual-curve journey, personalized goal card
   Depends on: client (from supabaseClient.js)
───────────────────────────────────────────────────────────── */

if (typeof SUPABASE_URL === "undefined") {
  var SUPABASE_URL = "https://sgagswxzsxlgcspwiuoh.supabase.co";
}
if (typeof SUPABASE_ANON_KEY === "undefined") {
  var SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNnYWdzd3h6c3hsZ2NzcHdpdW9oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5NTA1NTIsImV4cCI6MjA2OTUyNjU1Mn0.ZNfk5WNDPkjKcFsRO48rEYk3dhbLYm_m21aZ-wfywo4";
}

const REWARD_MILESTONES = [
  { coins: 1800, name: "Water Bottle" },
  { coins: 2600, name: "Diary"        },
  { coins: 3500, name: "T-Shirt"      },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function getLevel(lifetime) {
  const c = lifetime || 0;
  if (c >= 6000) return { label:"Legend",   color:"#f59e0b", bg:"rgba(245,158,11,.12)", border:"#b45309" };
  if (c >= 3000) return { label:"Luminary", color:"#c084fc", bg:"rgba(168,85,247,.12)", border:"#7c3aed" };
  if (c >= 1000) return { label:"Scholar",  color:"#38bdf8", bg:"rgba(0,168,255,.10)",  border:"#0284c7" };
  return               { label:"Seeker",   color:"#8080c0", bg:"rgba(80,80,180,.10)",  border:"#3030a0" };
}
function fmtTime(secs) {
  if (!secs) return "—";
  const m = Math.floor(secs / 60), s = Math.floor(secs % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}
function fmtNum(n) {
  if (!n) return "0";
  if (n >= 100000) return (n / 1000).toFixed(0) + "K+";
  if (n >= 10000)  return (n / 1000).toFixed(1) + "K+";
  return n.toLocaleString("en-IN");
}
function ge(id)           { return document.getElementById(id); }
function setText(id, val) { const e = ge(id); if (e) e.textContent = val; }

// ── Toast ─────────────────────────────────────────────────────────────────────
function lbToast(msg) {
  const t = ge("lb-toast");
  if (!t) return;
  t.innerHTML = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 3000);
}

// ── Share ─────────────────────────────────────────────────────────────────────
window.perfShare = function() {
  const rank = ge("rankNum")?.textContent  || "?";
  const exam = ge("lb-subtitle")?.textContent || "an exam";
  const pct  = ge("pctVal")?.textContent   || "";
  const text = `🎯 I ranked ${rank} on Courage Library!\n${pct ? `Better than ${pct} of all attempts` : ""}\n"${exam}"\nFree mock tests → couragelibrary.in`;
  if (navigator.share) {
    navigator.share({ title:"My Exam Result — Courage Library", text, url:"https://couragelibrary.in" }).catch(()=>{});
  } else {
    navigator.clipboard.writeText(text).then(() =>
      lbToast('<i class="fas fa-clipboard-check" style="margin-right:5px;"></i>Copied to clipboard!')
    );
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  const params    = new URLSearchParams(window.location.search);
  const attemptId = params.get("attempt");
  if (!attemptId) { showFatalError("No attempt ID. Go back to dashboard."); return; }
  await loadPerformancePage(attemptId);
});

// ─────────────────────────────────────────────────────────────────────────────
// MAIN LOADER
// ─────────────────────────────────────────────────────────────────────────────
async function loadPerformancePage(attemptId) {
  try {
    const { data: { user } } = await client.auth.getUser();
    if (!user) {
      showFatalError("Please log in to view your performance.");
      setTimeout(() => { window.location.href = "/index.html?action=login"; }, 2000);
      return;
    }

    // Fetch attempt
    const { data: attempt, error: ae } = await client
      .from("attempts")
      .select(`
        id, user_id, started_at, submitted_at,
        total_score, accuracy, time_taken, coins_given,
        scheduled_exam_id,
        scheduled_exams(
          id, pattern_id, day_of_week, mock_number, exam_type,
          active_section, category_id,
          exam_categories( name ),
          exam_patterns( pattern_name, total_questions, total_marks, negative_marking )
        )
      `)
      .eq("id", attemptId).single();

    if (ae || !attempt) { showFatalError("Could not load your result."); return; }
    if (attempt.user_id !== user.id) { showFatalError("Access denied."); return; }
    if (!attempt.submitted_at) { window.location.href = `/mock/exam.html?attempt=${attemptId}`; return; }

    const se          = attempt.scheduled_exams;
    const pattern     = se?.exam_patterns;
    const examId      = attempt.scheduled_exam_id;
    const patternId   = se?.pattern_id;
    const catName     = se?.exam_categories?.name || "";
    const activeSection = se?.active_section || "";
    const isDaily     = se?.exam_type === "daily_sectional";

    // Smart label — mirrors studentDashboard.js logic
    let examLabel;
    if (isDaily && activeSection && catName) {
      examLabel = `${catName} — ${activeSection}`;
    } else if (catName && pattern?.pattern_name && pattern.pattern_name !== "Daily Sectional") {
      examLabel = `${catName} — ${pattern.pattern_name}`;
    } else if (catName) {
      examLabel = catName;
    } else if (activeSection) {
      examLabel = activeSection;
    } else {
      examLabel = pattern?.pattern_name || "Mock Exam";
    }
    if (se?.mock_number) examLabel += ` · Mock #${se.mock_number}`;

    setText("lb-subtitle", examLabel);

    // Profile
    const { data: profile } = await client
      .from("user_profiles")
      .select("id, full_name, total_coins, lifetime_coins, current_streak, max_streak, last_test_date")
      .eq("id", user.id).single();

    const firstName = profile?.full_name?.trim().split(" ")[0] || "Warrior";
    setText("heroTitle", `Well done, ${firstName}! Here's how you did.`);

    // Score math
    const totalQ     = Number(pattern?.total_questions) || 0;
    const totalMarks = Number(pattern?.total_marks) || totalQ;
    const negative   = Number(pattern?.negative_marking) || 0;
    const marksPerQ  = totalQ > 0 ? totalMarks / totalQ : 1;

    let score = attempt.total_score, accuracy = attempt.accuracy, timeTaken = attempt.time_taken;
    let correct = 0, wrong = 0, skipped = 0;

    const [{ data: answers }, { data: attemptQs }] = await Promise.all([
      client.from("answers").select("selected_option, question_id, questions(correct_answer)").eq("attempt_id", attemptId),
      client.from("attempt_questions").select("question_id").eq("attempt_id", attemptId),
    ]);

    const ansMap = {};
    (answers || []).forEach(a => { ansMap[a.question_id] = a; });
    (attemptQs || []).forEach(aq => {
      const a = ansMap[aq.question_id];
      if (!a?.selected_option) skipped++;
      else if (a.selected_option === a.questions?.correct_answer) correct++;
      else wrong++;
    });

    if (score == null) {
      score     = +(correct * marksPerQ - wrong * negative).toFixed(2);
      accuracy  = (correct + wrong) === 0 ? 0 : +((correct / (correct + wrong)) * 100).toFixed(2);
      timeTaken = attempt.submitted_at && attempt.started_at
        ? Math.floor((new Date(attempt.submitted_at) - new Date(attempt.started_at)) / 1000) : null;
    }

    // ── HERO ──
    renderHeroRing(score, totalMarks);
    setText("heroAccuracy", Math.round(accuracy) + "%");
    setText("heroTime", fmtTime(timeTaken));
    setText("heroStreak", profile?.current_streak ?? 0);

    const lvl = getLevel(profile?.lifetime_coins || 0);
    setText("heroLevelLabel", lvl.label);
    const chip = ge("heroLevelChip");
    if (chip) { chip.style.background = lvl.bg; chip.style.border = `1px solid ${lvl.border}`; chip.style.color = lvl.color; }

    // ── SCORECARD ──
    setText("detCorrect", correct);
    setText("detWrong",   wrong);
    setText("detSkipped", skipped);
    setText("detTime",    fmtTime(timeTaken));
    setText("accLabel",   Math.round(accuracy) + "%");
    setTimeout(() => { const b = ge("accBar"); if (b) b.style.width = Math.min(accuracy, 100) + "%"; }, 350);

    // Review link
    if (wrong > 0) {
      const rl = ge("reviewLink"); const wc = ge("wrongCount");
      if (rl) { rl.href = `/mock/result.html?attempt=${attemptId}#review`; rl.style.display = "inline-flex"; }
      if (wc) wc.textContent = wrong;
    }

    // Parallel loads
    loadRankCard(attemptId, examId, score, accuracy);
    loadPlatformStats();
    loadCoinsCard(profile);
    if (patternId) loadJourney(user.id, examId, patternId, examLabel, attemptId);
    loadGoalCard(score, accuracy, correct, wrong, skipped, totalQ, profile, attemptId);

  } catch (err) {
    console.error("Perf page error:", err);
    showFatalError("Something went wrong. Please refresh.");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HERO RING — animated SVG
// ─────────────────────────────────────────────────────────────────────────────
function renderHeroRing(score, totalMarks) {
  setText("heroScoreNum",   score);
  setText("heroScoreDenom", `/ ${totalMarks || "—"}`);
  const pct    = totalMarks > 0 ? Math.min((score / totalMarks) * 100, 100) : 0;
  const circum = 276.5; // 2π × 44
  const ring   = ge("heroRing");
  if (ring) setTimeout(() => { ring.style.strokeDashoffset = circum - (pct / 100) * circum; }, 250);
}

// ─────────────────────────────────────────────────────────────────────────────
// RANK CARD
// ─────────────────────────────────────────────────────────────────────────────
async function loadRankCard(attemptId, examId, myScore, myAccuracy) {
  const todayIST   = new Date().toLocaleDateString("en-CA", { timeZone:"Asia/Kolkata" });
  const todayStart = new Date(todayIST + "T00:00:00+05:30");
  const todayEnd   = new Date(todayIST + "T23:59:59+05:30");

  const { data: attempts } = await client
    .from("attempts")
    .select("id, total_score, accuracy, submitted_at")
    .eq("scheduled_exam_id", examId)
    .not("submitted_at", "is", null)
    .gte("submitted_at", todayStart.toISOString())
    .lte("submitted_at", todayEnd.toISOString());

  if (!attempts || attempts.length === 0) return;

  attempts.sort((a, b) => {
    if (b.total_score !== a.total_score) return b.total_score - a.total_score;
    if (b.accuracy    !== a.accuracy)    return b.accuracy - a.accuracy;
    return new Date(a.submitted_at) - new Date(b.submitted_at);
  });

  const scores   = attempts.map(a => a.total_score || 0);
  const total    = attempts.length;
  const topScore = scores[0] || 0;
  const avgScore = total ? Math.round(scores.reduce((s,v) => s+v, 0) / total) : 0;
  let myRank     = attempts.findIndex(a => a.id === attemptId) + 1;
  if (myRank === 0) myRank = total;

  const pct    = total > 1 ? Math.round(((total - myRank) / (total - 1)) * 100) : 100;
  const suffix = [11,12,13].includes(pct) ? "th" : pct%10===1?"st":pct%10===2?"nd":pct%10===3?"rd":"th";

  const vaDiff = Math.round(myScore - avgScore);
  const vaStr  = vaDiff >= 0 ? `+${vaDiff} above avg` : `${vaDiff} below avg`;
  const vaCol  = vaDiff >= 0 ? "#15803d" : "#dc2626";
  const vaBg   = vaDiff >= 0 ? "#f0fdf4" : "#fef2f2";
  const vaBrd  = vaDiff >= 0 ? "#bbf7d0" : "#fecaca";

  const vtDiff = Math.round(myScore - topScore);
  const vtStr  = vtDiff === 0 ? "🏆 You're #1!" : `${vtDiff} marks`;
  const vtCol  = vtDiff === 0 ? "#d97706" : "#dc2626";
  const vtBg   = vtDiff === 0 ? "#fef9ec" : "#fef2f2";
  const vtBrd  = vtDiff === 0 ? "#fde68a" : "#fecaca";

  // Rank badge color
  const rb = ge("rankBadge");
  if (rb) {
    rb.style.background = myRank===1 ? "linear-gradient(135deg,#f5a623,#e07b00)"
      : myRank===2 ? "linear-gradient(135deg,#94a3b8,#64748b)"
      : myRank===3 ? "linear-gradient(135deg,#cd7f32,#9a5e1e)"
      : "linear-gradient(135deg,#1a56db,#4f46e5)";
  }

  setText("rankNum", `#${myRank}`);
  setText("pctVal",  `${pct}${suffix}`);

  setTimeout(() => { const b = ge("pctBar"); if (b) b.style.width = pct + "%"; }, 450);

  const vaEl = ge("vsAvg"), vaBox = ge("vsAvgBox"), vaLbl = ge("vsAvgLbl");
  if (vaEl)  { vaEl.textContent = vaStr; vaEl.style.color = vaCol; }
  if (vaBox) { vaBox.style.background = vaBg; vaBox.style.border = `1px solid ${vaBrd}`; }
  if (vaLbl) vaLbl.style.color = vaCol;

  const vtEl = ge("vsTopper"), vtBox = ge("vsTopBox"), vtLbl = ge("vsTopLbl");
  if (vtEl)  { vtEl.textContent = vtStr; vtEl.style.color = vtCol; }
  if (vtBox) { vtBox.style.background = vtBg; vtBox.style.border = `1px solid ${vtBrd}`; }
  if (vtLbl) vtLbl.style.color = vtCol;

  const rc = ge("rankCard");
  if (rc) rc.style.display = "";

  if (myRank <= 3) lbConfetti();
}

// ─────────────────────────────────────────────────────────────────────────────
// PLATFORM STATS
// ─────────────────────────────────────────────────────────────────────────────
async function loadPlatformStats() {
  try {
    const [{ count: ta }, { count: tq }] = await Promise.all([
      client.from("attempts").select("*", { count:"exact", head:true }).not("submitted_at","is",null),
      client.from("answers").select("*", { count:"exact", head:true }),
    ]);
    setText("statAttempts",  fmtNum(ta ?? 0));
    setText("statQuestions", fmtNum(tq ?? 0));
    // Hero chip — all-time total
    const chip = ge("heroAttemptsChip"), txt = ge("heroAttemptsTxt");
    if (chip && txt) { txt.textContent = `${fmtNum(ta ?? 0)} total attempts`; chip.style.display = "inline-flex"; }
  } catch (_) {}
}

// ─────────────────────────────────────────────────────────────────────────────
// COINS CARD
// ─────────────────────────────────────────────────────────────────────────────
async function loadCoinsCard(profile) {
  let earned = 0;
  try {
    const { data: txn } = await client
      .from("coin_transactions").select("coins")
      .eq("user_id", profile.id).eq("type","test")
      .order("created_at", { ascending:false }).limit(1);
    if (txn?.[0]) earned = txn[0].coins || 0;
  } catch (_) {}

  const total = profile.total_coins || 0;
  setText("coinsEarned", earned.toLocaleString("en-IN"));
  setText("coinsTotal",  total.toLocaleString("en-IN"));

  const next = REWARD_MILESTONES.find(m => total < m.coins);
  if (next) {
    const pct = Math.min((total / next.coins) * 100, 100);
    setText("msLabel",  next.name);
    setText("msCoins",  total.toLocaleString("en-IN") + " CL");
    setText("msTarget", next.coins.toLocaleString("en-IN") + " CL needed");
    setTimeout(() => { const f = ge("msFill"); if (f) f.style.width = pct + "%"; }, 450);
  } else {
    setText("msLabel", "All rewards unlocked! 🎉");
    setTimeout(() => { const f = ge("msFill"); if (f) f.style.width = "100%"; }, 450);
  }
  const cc = ge("coinsCard"); if (cc) cc.style.display = "";
}

// ─────────────────────────────────────────────────────────────────────────────
// JOURNEY — dual-line smooth bezier
// ─────────────────────────────────────────────────────────────────────────────
async function loadJourney(userId, currentExamId, patternId, examLabel, attemptId) {
  const { data: sameExams } = await client
    .from("scheduled_exams").select("id").eq("pattern_id", patternId);
  if (!sameExams?.length) return;

  const examIds = sameExams.map(e => e.id);
  const { data: history } = await client
    .from("attempts")
    .select("id, total_score, accuracy, submitted_at, scheduled_exam_id")
    .eq("user_id", userId).in("scheduled_exam_id", examIds)
    .not("submitted_at","is",null)
    .order("submitted_at", { ascending:false }).limit(6);

  if (!history || history.length < 2) return;

  const sorted = [...history].reverse().slice(-5);

  // Improvement badge
  if (sorted.length >= 2) {
    const diff  = (sorted[sorted.length-1].total_score||0) - (sorted[0].total_score||0);
    const badge = ge("improveBadge");
    if (badge && diff !== 0) {
      badge.style.display    = "";
      badge.textContent      = diff > 0 ? `▲ +${diff}` : `▼ ${diff}`;
      badge.style.background = diff > 0 ? "#dcfce7" : "#fee2e2";
      badge.style.color      = diff > 0 ? "#15803d" : "#dc2626";
    }
  }

  renderDualCurve(sorted, currentExamId);
  setText("journeyNote", `Last ${sorted.length} ${examLabel} attempts`);
  const jc = ge("journeyCard"); if (jc) jc.style.display = "";
}

// ── Dual-line SVG bezier ──────────────────────────────────────────────────────
function renderDualCurve(data, currentExamId) {
  const wrap = ge("curveGraphWrap");
  if (!wrap) return;

  const VW = 480, GH = 110, PAD_L = 28, PAD_R = 10, PAD_T = 24, PAD_B = 28;
  const VH = PAD_T + GH + PAD_B;
  const n  = data.length;

  const scores = data.map(d => d.total_score || 0);
  const maxS   = Math.max(...scores, 1);
  const minS   = Math.min(...scores);
  const rangeS = maxS - minS || 1;

  function xPos(i)   { return PAD_L + (i / (n-1)) * (VW - PAD_L - PAD_R); }
  function yScore(s) { return PAD_T + GH - ((s - minS) / rangeS) * (GH * 0.78); }
  function yAcc(a)   { return PAD_T + GH - (a / 100) * (GH * 0.78); }

  function bezier(pts) {
    if (pts.length < 2) return `M${pts[0].x},${pts[0].y}`;
    let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(i-1,0)];
      const p1 = pts[i], p2 = pts[i+1];
      const p3 = pts[Math.min(i+2,pts.length-1)];
      const c1x = (p1.x + (p2.x-p0.x)/5).toFixed(1);
      const c1y = (p1.y + (p2.y-p0.y)/5).toFixed(1);
      const c2x = (p2.x - (p3.x-p1.x)/5).toFixed(1);
      const c2y = (p2.y - (p3.y-p1.y)/5).toFixed(1);
      d += ` C ${c1x} ${c1y},${c2x} ${c2y},${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }
    return d;
  }

  const sPts     = data.map((d,i) => ({ x:xPos(i), y:yScore(d.total_score||0) }));
  const aPts     = data.map((d,i) => ({ x:xPos(i), y:yAcc(Math.round(d.accuracy||0)) }));
  const sPath    = bezier(sPts);
  const aPath    = bezier(aPts);
  const baseline = PAD_T + GH;
  const areaPath = sPath + ` L${sPts[n-1].x.toFixed(1)},${baseline} L${sPts[0].x.toFixed(1)},${baseline}Z`;

  // Grid
  const grid = [0.33,0.66,1].map(f => {
    const y = PAD_T + GH - GH * 0.78 * f;
    return `<line x1="${PAD_L}" y1="${y.toFixed(1)}" x2="${VW-PAD_R}" y2="${y.toFixed(1)}" stroke="#f1f5f9" stroke-width="1"/>
            <text x="${PAD_L-3}" y="${(y+4).toFixed(1)}" font-size="8" fill="#e2e8f0" text-anchor="end">${Math.round(minS+rangeS*f)}</text>`;
  }).join("");

  // Dots
  const sDots = sPts.map((pt,i) => {
    const d = data[i], isCurr = d.scheduled_exam_id === currentExamId;
    const s = d.total_score||0, a = Math.round(d.accuracy||0);
    const dt = new Date(d.submitted_at).toLocaleDateString("en-IN",{day:"numeric",month:"short"});
    return `
      <circle cx="${pt.x.toFixed(1)}" cy="${pt.y.toFixed(1)}" r="${isCurr?5.5:4}"
        fill="${isCurr?"#1a56db":"#fff"}" stroke="#1a56db" stroke-width="2"
        style="cursor:pointer"
        onmouseenter="showGTip(event,'Score: ${s}','${dt}','Acc: ${a}%')"
        onmouseleave="hideGTip()"/>
      <text x="${pt.x.toFixed(1)}" y="${(pt.y-(isCurr?5.5:4)-4).toFixed(1)}"
        font-family="'Syne',sans-serif" font-size="${isCurr?10.5:9}" font-weight="${isCurr?800:400}"
        fill="${isCurr?"#1a56db":"#64748b"}" text-anchor="middle">${s}</text>
      <text x="${pt.x.toFixed(1)}" y="${(PAD_T+GH+19).toFixed(1)}"
        font-size="${isCurr?9.5:8.5}" font-weight="${isCurr?700:400}"
        fill="${isCurr?"#1a56db":"#94a3b8"}" text-anchor="middle">
        ${isCurr?"Today":dt}
      </text>`;
  }).join("");

  const aDots = aPts.map((pt,i) => {
    const a = Math.round(data[i].accuracy||0), s = data[i].total_score||0;
    const isCurr = data[i].scheduled_exam_id === currentExamId;
    const dt = new Date(data[i].submitted_at).toLocaleDateString("en-IN",{day:"numeric",month:"short"});
    return `<circle cx="${pt.x.toFixed(1)}" cy="${pt.y.toFixed(1)}" r="3"
      fill="${isCurr?"#f97316":"#fff"}" stroke="#f97316" stroke-width="1.8"
      style="cursor:pointer"
      onmouseenter="showGTip(event,'Accuracy: ${a}%','${dt}','Score: ${s}')"
      onmouseleave="hideGTip()"/>`;
  }).join("");

  wrap.innerHTML = `
    <div style="position:relative;width:100%;">
      <svg viewBox="0 0 ${VW} ${VH}" preserveAspectRatio="xMidYMid meet"
           style="width:100%;height:auto;display:block;overflow:visible;">
        <defs>
          <linearGradient id="cgS" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="#1a56db"/><stop offset="100%" stop-color="#6366f1"/>
          </linearGradient>
          <linearGradient id="cgA" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#1a56db" stop-opacity=".14"/>
            <stop offset="100%" stop-color="#1a56db" stop-opacity="0"/>
          </linearGradient>
        </defs>
        ${grid}
        <path d="${areaPath}" fill="url(#cgA)"/>
        <path d="${aPath}" fill="none" stroke="#f97316" stroke-width="1.8"
          stroke-dasharray="5 3" stroke-linecap="round" opacity=".8"/>
        <path id="scoreLine" d="${sPath}" fill="none" stroke="url(#cgS)"
          stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        ${sDots}${aDots}
      </svg>
      <div id="graphTooltip"
        style="position:absolute;background:#0f172a;color:#fff;
               font-size:.7rem;font-weight:600;padding:5px 10px;
               border-radius:8px;pointer-events:none;opacity:0;
               transition:opacity .15s;white-space:nowrap;z-index:10;"></div>
    </div>`;

  requestAnimationFrame(() => {
    const l = ge("scoreLine"); if (!l) return;
    try {
      const len = l.getTotalLength();
      l.style.strokeDasharray = len; l.style.strokeDashoffset = len;
      l.style.transition = "stroke-dashoffset 1.3s cubic-bezier(.4,0,.2,1)";
      requestAnimationFrame(() => { l.style.strokeDashoffset = "0"; });
    } catch(_) {}
  });
}

window.showGTip = function(e, l1, l2, l3) {
  const tip = ge("graphTooltip"); if (!tip) return;
  tip.innerHTML = `<strong>${l1}</strong>${l2?`<br><span style='opacity:.6;font-size:.65rem;'>${l2}</span>`:""}${l3?`<br><span style='opacity:.6;font-size:.65rem;'>${l3}</span>`:""}`;
  tip.style.opacity = "1";
  const rect = e.target.closest("div").getBoundingClientRect();
  tip.style.left = (e.clientX - rect.left + 10) + "px";
  tip.style.top  = (e.clientY - rect.top  - 52) + "px";
};
window.hideGTip = function() { const t = ge("graphTooltip"); if (t) t.style.opacity = "0"; };

// ─────────────────────────────────────────────────────────────────────────────
// GOAL CARD — top 3 most impactful only
// ─────────────────────────────────────────────────────────────────────────────
function loadGoalCard(score, accuracy, correct, wrong, skipped, totalQ, profile, attemptId) {
  const body = ge("goalBody"), card = ge("goalCard");
  if (!body || !card) return;

  const acc    = Math.round(accuracy);
  const streak = profile?.current_streak || 0;
  const all    = [];

  // Candidate 1 — score target
  all.push({ priority:3, dot:"#1a56db",
    text: `Beat today's score of <strong>${score}</strong> — aim for <strong>${Math.round(score*1.08)}+</strong>`,
    tag: null });

  // Candidate 2 — accuracy
  if (acc < 75) {
    all.push({ priority:10, dot:"#dc2626",
      text: `Accuracy is at ${acc}% — focus on <strong>attempting only sure questions</strong> tomorrow`,
      tag: { label:"⚠️ Needs work", bg:"#fef2f2", color:"#dc2626" } });
  } else if (acc < 85) {
    all.push({ priority:7, dot:"#16a34a",
      text: `Push accuracy from ${acc}% to <strong>85%+</strong> for the accuracy coin bonus`,
      tag: { label:"Focus area", bg:"#dcfce7", color:"#15803d" } });
  } else {
    all.push({ priority:4, dot:"#16a34a",
      text: `Maintain your strong ${acc}% accuracy — quality over quantity`,
      tag: null });
  }

  // Candidate 3 — wrong answers review
  if (wrong > 0) {
    all.push({ priority:9, dot:"#d97706",
      text: `Review <strong>${wrong} wrong answer${wrong>1?"s":""}</strong> before tomorrow — it compounds`,
      tag: { label:"Review now", bg:"#fef3c7", color:"#92400e" } });
  }

  // Candidate 4 — streak
  if (streak === 0) {
    all.push({ priority:8, dot:"#f97316",
      text: `Start a fresh streak tomorrow — <strong>3 days in a row</strong> unlocks the streak bonus`,
      tag: { label:"🔥 Restart", bg:"#fff7ed", color:"#c2410c" } });
  } else if (streak < 7) {
    all.push({ priority:6, dot:"#f97316",
      text: `<strong>${streak}-day streak</strong> — ${7-streak} more days to unlock the 7-day streak badge 🔥`,
      tag: null });
  } else {
    all.push({ priority:5, dot:"#f97316",
      text: `<strong>${streak}-day streak</strong> — you're in the top 5% of consistent students 🏆`,
      tag: null });
  }

  // Candidate 5 — skipped
  if (skipped > totalQ * 0.25) {
    all.push({ priority:7, dot:"#6366f1",
      text: `You skipped <strong>${skipped} questions</strong> — attempt more tomorrow, educated guesses help`,
      tag: { label:"Attempt more", bg:"#eef2ff", color:"#4f46e5" } });
  }

  // Top 3 by priority
  const top3 = all.sort((a,b) => b.priority - a.priority).slice(0, 3);

  body.innerHTML = top3.map(g => `
    <div class="goal-item">
      <span class="goal-dot" style="background:${g.dot};"></span>
      <div class="goal-text">
        ${g.text}
        ${g.tag ? `<span class="goal-tag" style="background:${g.tag.bg};color:${g.tag.color};">${g.tag.label}</span>` : ""}
      </div>
    </div>`).join("");

  card.style.display = "";
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFETTI (top 3 only)
// ─────────────────────────────────────────────────────────────────────────────
function lbConfetti() {
  const colors = ["#3B82F6","#6366F1","#F5A623","#10B981","#F97316","#EC4899"];
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999;";
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  canvas.width = window.innerWidth; canvas.height = window.innerHeight;
  const pieces = Array.from({length:90}, () => ({
    x:Math.random()*canvas.width, y:Math.random()*-canvas.height,
    r:Math.random()*5+3, color:colors[Math.floor(Math.random()*colors.length)],
    speed:Math.random()*3+2, spin:Math.random()*.16-.08,
    angle:0, drift:(Math.random()-.5)*.7,
  }));
  let frame = 0;
  (function draw() {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    pieces.forEach(p => {
      ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.angle);
      ctx.fillStyle=p.color; ctx.fillRect(-p.r/2,-p.r/2,p.r,p.r*2);
      ctx.restore(); p.y+=p.speed; p.angle+=p.spin; p.x+=p.drift;
    });
    if (++frame < 180) requestAnimationFrame(draw); else canvas.remove();
  })();
}

// ─────────────────────────────────────────────────────────────────────────────
// FATAL ERROR
// ─────────────────────────────────────────────────────────────────────────────
function showFatalError(msg) {
  document.body.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;
                padding:24px;background:#f1f5fb;">
      <div style="background:#fff;border-radius:20px;padding:32px;max-width:340px;
                  text-align:center;box-shadow:0 8px 32px rgba(15,23,42,.1);">
        <div style="font-size:2.2rem;margin-bottom:12px;">😕</div>
        <div style="font-family:'Syne',sans-serif;font-weight:800;font-size:1rem;margin-bottom:8px;">${msg}</div>
        <a href="/mock/dashboard.html"
           style="display:inline-flex;align-items:center;gap:6px;margin-top:16px;
                  background:#1a56db;color:#fff;padding:11px 24px;border-radius:12px;
                  text-decoration:none;font-weight:700;font-size:.86rem;font-family:'Syne',sans-serif;">
          <i class="fas fa-th-large"></i> Dashboard
        </a>
      </div>
    </div>`;
}