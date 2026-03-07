const SUPABASE_URL = "https://sgagswxzsxlgcspwiuoh.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNnYWdzd3h6c3hsZ2NzcHdpdW9oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5NTA1NTIsImV4cCI6MjA2OTUyNjU1Mn0.ZNfk5WNDPkjKcFsRO48rEYk3dhbLYm_m21aZ-wfywo4";

const { createClient } = supabase;
const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let attemptId;
let allReviewItems = [];

document.addEventListener("DOMContentLoaded", async () => {
  const params = new URLSearchParams(window.location.search);
  attemptId = params.get("attempt");
  if (!attemptId) {
    showFatalError("No attempt ID found. Please go back to the dashboard.");
    return;
  }

  document.getElementById("leaderboardBtn").href =
    `/mock/leaderboard.html?attempt=${attemptId}`;

  await calculateResult();
});

/* ─────────────────────────────────────────
   STEP 1 — CALCULATE & SAVE RESULT
───────────────────────────────────────── */
async function calculateResult() {
  const { data: attempt, error: attemptErr } = await client
    .from("attempts")
    .select(`
      id,
      started_at,
      submitted_at,
      total_score,
      accuracy,
      scheduled_exams(
        exam_patterns(
          negative_marking,
          total_questions
        )
      )
    `)
    .eq("id", attemptId)
    .single();

  if (attemptErr || !attempt) {
    showFatalError("Could not load attempt. Please try again.");
    return;
  }

  const negative = Number(attempt.scheduled_exams?.exam_patterns?.negative_marking) || 0;
  const totalQ   = Number(attempt.scheduled_exams?.exam_patterns?.total_questions)   || 0;

  // Time taken in seconds
  const timeTaken = attempt.submitted_at && attempt.started_at
    ? Math.floor((new Date(attempt.submitted_at) - new Date(attempt.started_at)) / 1000)
    : null;

  // Fetch all answers for this attempt
  const { data: answers } = await client
    .from("answers")
    .select(`
      selected_option,
      question_id,
      questions(correct_answer, pattern_section_id)
    `)
    .eq("attempt_id", attemptId);

  // Fetch all questions assigned to this attempt
  const { data: attemptQs } = await client
    .from("attempt_questions")
    .select("question_id")
    .eq("attempt_id", attemptId);

  // Build lookup: question_id -> answer row
  const answerMap = {};
  (answers || []).forEach(a => { answerMap[a.question_id] = a; });

  let correct = 0, wrong = 0, skipped = 0;

  (attemptQs || []).forEach(aq => {
    const a = answerMap[aq.question_id];
    if (!a || !a.selected_option) {
      skipped++;
    } else if (a.selected_option === a.questions?.correct_answer) {
      correct++;
    } else {
      wrong++;
    }
  });

  const score          = +(correct - wrong * negative).toFixed(2);
  const totalAttempted = correct + wrong;
  const accuracy       = totalAttempted === 0
    ? 0
    : +((correct / totalAttempted) * 100).toFixed(2);

  // Persist to DB only if not already saved (prevents overwrite on refresh)
  if (attempt.total_score == null) {
    await client
      .from("attempts")
      .update({ total_score: score, accuracy, time_taken: timeTaken })
      .eq("id", attemptId);
  }

  displayResult({ score, correct, wrong, skipped, accuracy, timeTaken, totalQ });
  await loadReview(answerMap);
}

/* ─────────────────────────────────────────
   STEP 2 — DISPLAY SUMMARY HERO
───────────────────────────────────────── */
function displayResult({ score, correct, wrong, skipped, accuracy, timeTaken, totalQ }) {
  animateCount("score", score, 900);

  document.getElementById("scoreDenom").textContent =
    totalQ ? `out of ${totalQ} marks` : "";

  document.getElementById("correctCount").textContent = correct;
  document.getElementById("wrongCount").textContent   = wrong;
  document.getElementById("skippedCount").textContent = skipped;
  document.getElementById("accuracy").textContent     = accuracy + "%";
  document.getElementById("timeTaken").textContent    = formatDuration(timeTaken);

  // Verdict badge — FA icons instead of emojis
  const badge = document.getElementById("verdictBadge");
  badge.style.display = "inline-flex";

  if (accuracy >= 80) {
    badge.className = "verdict-badge verdict-excellent";
    badge.innerHTML = `<i class="fas fa-trophy"></i> Excellent Performance`;
  } else if (accuracy >= 65) {
    badge.className = "verdict-badge verdict-good";
    badge.innerHTML = `<i class="fas fa-thumbs-up"></i> Good Performance`;
  } else if (accuracy >= 50) {
    badge.className = "verdict-badge verdict-average";
    badge.innerHTML = `<i class="fas fa-chart-line"></i> Average — Keep Improving`;
  } else {
    badge.className = "verdict-badge verdict-poor";
    badge.innerHTML = `<i class="fas fa-dumbbell"></i> Needs More Practice`;
  }
}

/* ─────────────────────────────────────────
   STEP 3 — LOAD FULL REVIEW
───────────────────────────────────────── */
async function loadReview(answerMap) {
  const { data: aqData, error } = await client
    .from("attempt_questions")
    .select(`
      question_order,
      questions(
        id,
        question_text,
        options,
        correct_answer,
        explanation,
        pattern_section_id,
        pattern_sections(section_name)
      )
    `)
    .eq("attempt_id", attemptId)
    .order("question_order", { ascending: true });

  if (error || !aqData) return;

  // Build review items array
  allReviewItems = aqData.map((item, index) => {
    const q        = item.questions;
    const selected = answerMap[q.id]?.selected_option || null;
    const correct  = q.correct_answer;
    const status   = !selected
      ? "skipped"
      : selected === correct
        ? "correct"
        : "wrong";
    return { q, selected, correct, status, index };
  });

  // Update filter tab counts
  const counts = { all: allReviewItems.length, correct: 0, wrong: 0, skipped: 0 };
  allReviewItems.forEach(i => counts[i.status]++);
  document.getElementById("cnt-all").textContent     = counts.all;
  document.getElementById("cnt-correct").textContent = counts.correct;
  document.getElementById("cnt-wrong").textContent   = counts.wrong;
  document.getElementById("cnt-skipped").textContent = counts.skipped;

  document.getElementById("reviewSubtitle").textContent =
    `${counts.all} questions`;

  // Section accuracy bars
  renderSectionAccuracy(aqData, answerMap);

  renderReviewList(allReviewItems);
}

/* ─────────────────────────────────────────
   RENDER REVIEW LIST
───────────────────────────────────────── */
function renderReviewList(items) {
  const container = document.getElementById("reviewSection");

  if (!items.length) {
    container.innerHTML = `
      <div class="empty-filter">
        <div class="ef-icon"><i class="fas fa-filter"></i></div>
        <p>No questions in this category</p>
      </div>`;
    return;
  }

  container.innerHTML = items.map(({ q, selected, correct, status, index }) => {
    const opts   = q.options || {};
    const isSkip = status === "skipped";
    const isOk   = status === "correct";

    const chipClass = isSkip ? "chip-skipped" : isOk ? "chip-correct" : "chip-wrong";
    const chipIcon  = isSkip
      ? `<i class="fas fa-minus"></i>`
      : isOk
        ? `<i class="fas fa-check"></i>`
        : `<i class="fas fa-times"></i>`;
    const chipLabel = isSkip ? "Skipped" : isOk ? "Correct" : "Wrong";

    const sectionName = q.pattern_sections?.section_name || "";

    const optionKeys = Object.keys(opts).sort();
    const optionsHTML = optionKeys.map(key => {
      const isCorrectOpt  = key === correct;
      const isSelectedOpt = key === selected;
      const isWrongSel    = isSelectedOpt && !isCorrectOpt;

      // For skipped: show no highlights — student never answered
      // For answered: highlight correct green, wrong red
      let optClass = "", keyClass = "", trailIcon = "";

      if (!isSkip) {
        if (isCorrectOpt)  { optClass = "opt-correct"; keyClass = "key-correct"; }
        if (isWrongSel)    { optClass = "opt-wrong";   keyClass = "key-wrong";   }
        if (isCorrectOpt)  trailIcon = `<i class="fas fa-check"  style="color:#16a34a;margin-left:auto;flex-shrink:0;font-size:.75rem"></i>`;
        if (isWrongSel)    trailIcon = `<i class="fas fa-times"  style="color:#dc2626;margin-left:auto;flex-shrink:0;font-size:.75rem"></i>`;
      }

      return `
        <div class="q-option ${optClass}">
          <span class="opt-key ${keyClass}">${key}</span>
          <span style="flex:1;line-height:1.45">${opts[key]}</span>
          ${trailIcon}
        </div>`;
    }).join("");

    const explanationHTML = q.explanation
      ? `<div class="q-explanation">
           <i class="fas fa-lightbulb exp-icon"></i>
           <span><strong>Explanation:</strong> ${q.explanation}</span>
         </div>`
      : "";

    return `
      <div class="q-card ${status}" data-status="${status}">
        <div class="q-card-head">
          <div class="q-meta">
            <span class="q-num">Q${index + 1}</span>
            ${sectionName ? `<span class="q-section-tag">${sectionName}</span>` : ""}
          </div>
          <span class="q-status-chip ${chipClass}">
            ${chipIcon} ${chipLabel}
          </span>
        </div>
        <div class="q-text">${q.question_text}</div>
        <div class="q-options">${optionsHTML}</div>
        <div class="q-footer">
          ${isSkip
            ? `<div class="qa-item"><i class="fas fa-info-circle" style="color:#1a56db;margin-right:4px"></i>Not attempted &nbsp;·&nbsp; Correct answer: <span class="qa-correct-ans">${correct}</span></div>`
            : `<div class="qa-item">Your answer: <strong>${selected}</strong></div>
               <div class="qa-item">Correct answer: <span class="qa-correct-ans">${correct}</span></div>`
          }
        </div>
        ${explanationHTML}
      </div>`;
  }).join("");
}

/* ─────────────────────────────────────────
   FILTER (client-side, instant)
───────────────────────────────────────── */
window.filterReview = function(type, btn) {
  document.querySelectorAll(".ftab").forEach(t => { t.className = "ftab"; });
  const map = { all: "active-all", correct: "active-correct", wrong: "active-wrong", skipped: "active-skipped" };
  btn.classList.add(map[type]);

  const filtered = type === "all"
    ? allReviewItems
    : allReviewItems.filter(i => i.status === type);

  renderReviewList(filtered);
};

/* ─────────────────────────────────────────
   SECTION ACCURACY BARS
───────────────────────────────────────── */
function renderSectionAccuracy(aqData, answerMap) {
  const sectionMap = {};

  aqData.forEach(item => {
    const q           = item.questions;
    const name        = q.pattern_sections?.section_name || "General";
    const selected    = answerMap[q.id]?.selected_option;
    const isCorrect   = selected && selected === q.correct_answer;

    if (!sectionMap[name]) sectionMap[name] = { correct: 0, total: 0 };
    sectionMap[name].total++;
    if (isCorrect) sectionMap[name].correct++;
  });

  const sections = Object.entries(sectionMap);
  if (sections.length < 2) return; // only show for multi-section papers

  const COLORS = [
    "#1a56db",   // 1 — brand blue (dark)
    "#0284c7",   // 2 — deep sky (clearly distinct from #1)
    "#0d9488",   // 3 — teal (warm direction, very different from blues)
    "#6366f1",   // 4 — indigo/violet (different hue entirely)
    "#7dd3fc",   // 5 — light sky (bright, airy — completes the spread)
  ];

  document.getElementById("sectionAccuracyCard").style.display = "block";
  document.getElementById("sectionBars").innerHTML = sections.map(([name, s], i) => {
    const pct   = s.total ? Math.round((s.correct / s.total) * 100) : 0;
    const color = COLORS[i % COLORS.length];
    const tagClass = pct >= 75 ? "tag-strong" : pct >= 50 ? "tag-average" : "tag-weak";
    const tagLabel = pct >= 75 ? "Strong"     : pct >= 50 ? "Average"     : "Weak";

    return `
      <div class="sub-bar">
        <div class="sub-bar-head">
          <span>${name}</span>
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:.75rem;color:#64748b">${s.correct}/${s.total}</span>
            <span class="sub-bar-tag ${tagClass}">${tagLabel} · ${pct}%</span>
          </div>
        </div>
        <div class="bar-track">
          <div class="bar-fill" style="width:${pct}%;background:${color}"></div>
        </div>
      </div>`;
  }).join("");
}

/* ─────────────────────────────────────────
   WHATSAPP SHARE
───────────────────────────────────────── */
window.shareResult = function() {
  const score   = document.getElementById("score").textContent;
  const acc     = document.getElementById("accuracy").textContent;
  const correct = document.getElementById("correctCount").textContent;
  const text    = encodeURIComponent(
    `I just completed a Mock Test on Courage Library!\n\n` +
    `Score: ${score}  |  Correct: ${correct}  |  Accuracy: ${acc}\n\n` +
    `Prepare with me: https://couragelibrary.in`
  );
  window.open(`https://wa.me/?text=${text}`, "_blank");
};

/* ─────────────────────────────────────────
   FATAL ERROR STATE
───────────────────────────────────────── */
function showFatalError(msg) {
  document.getElementById("reviewSection").innerHTML = `
    <div style="text-align:center;padding:48px 20px;color:#64748b">
      <i class="fas fa-exclamation-circle" style="font-size:2rem;color:#dc2626;margin-bottom:12px;display:block"></i>
      <p style="font-weight:600;margin-bottom:8px">${msg}</p>
      <a href="/mock/dashboard.html"
        style="display:inline-flex;align-items:center;gap:8px;margin-top:12px;background:#1a56db;color:#fff;padding:9px 20px;border-radius:9px;font-weight:700;text-decoration:none;font-size:.85rem">
        <i class="fas fa-arrow-left"></i> Back to Dashboard
      </a>
    </div>`;
}

/* ─────────────────────────────────────────
   HELPERS
───────────────────────────────────────── */
function formatDuration(seconds) {
  if (!seconds && seconds !== 0) return "—";
  let s = Number(seconds);
  if (s > 100000) s = Math.floor(s / 1000); // handle ms
  const hrs  = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (hrs > 0)  return `${hrs}h ${mins}m`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

function animateCount(id, target, duration) {
  const el  = document.getElementById(id);
  const to  = Number(target);
  const t0  = performance.now();

  function step(now) {
    const p     = Math.min((now - t0) / duration, 1);
    const ease  = 1 - Math.pow(1 - p, 3); // ease-out cubic
    const value = to * ease;
    el.textContent = Number.isInteger(to) ? Math.round(value) : value.toFixed(2);
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/* Prevent back navigation to exam page */
history.pushState(null, null, location.href);
window.onpopstate = () => { window.location.href = "/mock/dashboard.html"; };