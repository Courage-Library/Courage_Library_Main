const SUPABASE_URL = "https://sgagswxzsxlgcspwiuoh.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNnYWdzd3h6c3hsZ2NzcHdpdW9oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5NTA1NTIsImV4cCI6MjA2OTUyNjU1Mn0.ZNfk5WNDPkjKcFsRO48rEYk3dhbLYm_m21aZ-wfywo4";

const { createClient } = supabase;
const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── Intercept browser back button → go to dashboard, not exam ──
history.pushState(null, null, location.href);
window.addEventListener("popstate", () => {
  window.location.href = "/mock/dashboard.html";
});

// ── FIX #4: Inject missing keyframes for coin animations ──────────────────────
(function injectAnimations() {
  if (document.getElementById("_resultAnimStyles")) return;
  const style = document.createElement("style");
  style.id = "_resultAnimStyles";
  style.textContent = `
    @keyframes floatUp {
      0%   { opacity: 1; transform: translateY(0) scale(1); }
      100% { opacity: 0; transform: translateY(-130px) scale(0.5); }
    }
    @keyframes floatCoin {
      0%   { opacity: 1; transform: translateY(0); }
      100% { opacity: 0; transform: translateY(-110px); }
    }
    @keyframes slideUp {
      from { opacity: 0; transform: translateX(-50%) translateY(20px); }
      to   { opacity: 1; transform: translateX(-50%) translateY(0); }
    }
  `;
  document.head.appendChild(style);
})();

let attemptId;
let allReviewItems = [];

// ── Loading Overlay ───────────────────────────────────────────────────────────
function rlStep(n) {
  for (let i = 1; i <= 3; i++) {
    const el = document.getElementById("rlStep" + i);
    if (!el) continue;
    if (i < n) {
      // Save text content before overwriting innerHTML
      const label = el.textContent.trim();
      el.className = "rl-step done";
      el.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" style="flex-shrink:0"><circle cx="6" cy="6" r="6" fill="#86efac" opacity=".25"/><path d="M3.5 6l1.8 1.8 3-3.6" stroke="#86efac" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>${label}`;
    } else if (i === n) {
      el.className = "rl-step active";
    } else {
      el.className = "rl-step";
    }
  }
}

function rlDismiss() {
  const overlay = document.getElementById("resultLoadingOverlay");
  if (!overlay) return;
  overlay.style.transition = "opacity .5s ease";
  overlay.style.opacity = "0";
  overlay.style.pointerEvents = "none";
  setTimeout(() => overlay.remove(), 520);
}

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
function showRewardUnlockPopup(title, message) {
  document.getElementById('rewardUnlockPopup')?.remove();
  const popup = document.createElement('div');
  popup.id = 'rewardUnlockPopup';
  popup.style.cssText = `
    position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
    background:#1a1a2e;color:#fff;padding:16px 24px;
    border-radius:14px;text-align:center;z-index:9999;
    min-width:280px;max-width:360px;
    box-shadow:0 8px 32px rgba(0,0,0,.4);
    animation:slideUp .3s ease-out;
  `;
  popup.innerHTML = `
    <div style="font-size:18px;margin-bottom:6px">${title}</div>
    <div style="font-size:13px;opacity:.85;line-height:1.4">${message}</div>
    <button
      onclick="this.closest('#rewardUnlockPopup').remove();window.location.href='/mock/reward.html';"
      style="margin-top:12px;background:#f59e0b;color:#1a1a2e;border:none;padding:8px 20px;
             border-radius:8px;font-weight:700;cursor:pointer;font-size:13px;"
    >Claim Now &rarr;</button>
  `;
  document.body.appendChild(popup);
  setTimeout(() => popup.remove(), 8000);
}

async function calculateResult() {
  // ── Auth + ownership guard — mirror examEngine.js ──────────────────────────
  const { data: { user } } = await client.auth.getUser();
  if (!user) {
    rlDismiss();
    showFatalError("Please log in to view your result.");
    setTimeout(() => { window.location.href = "/index.html?action=login"; }, 2000);
    return;
  }

  // Fetch attempt first to decide if overlay should show
  const { data: attempt, error: attemptErr } = await client
    .from("attempts")
    .select(
      `
      id,
      user_id,
      started_at,
      submitted_at,
      total_score,
      accuracy,
      coins_given,
      scheduled_exams(
        exam_patterns(
          negative_marking,
          total_questions,
          total_marks
        )
      )
    `,
    )
    .eq("id", attemptId)
    .single();

  if (attemptErr || !attempt) {
    rlDismiss();
    showFatalError("Could not load attempt. Please try again.");
    return;
  }

  // Ownership check — prevent viewing another student's result
  if (attempt.user_id !== user.id) {
    rlDismiss();
    showFatalError("Access denied. This result belongs to another account.");
    setTimeout(() => { window.location.href = "/mock/dashboard.html"; }, 2500);
    return;
  }

  // Security: block access to results if exam not yet submitted
  if (!attempt.submitted_at) {
    window.location.href = `/mock/exam.html?attempt=${attemptId}`;
    return;
  }

  // Revisit (coins already given) — skip "Calculating" overlay entirely
  const isFirstVisit = !attempt.coins_given;
  if (!isFirstVisit) {
    rlDismiss();
  }

  const negative =
    Number(attempt.scheduled_exams?.exam_patterns?.negative_marking) || 0;
  const totalQ =
    Number(attempt.scheduled_exams?.exam_patterns?.total_questions) || 0;
  const totalMarks =
    Number(attempt.scheduled_exams?.exam_patterns?.total_marks) || totalQ;
  const marksPerQ = totalQ > 0 ? totalMarks / totalQ : 1;

  const timeTaken =
    attempt.submitted_at && attempt.started_at
      ? Math.floor(
          (new Date(attempt.submitted_at) - new Date(attempt.started_at)) /
            1000,
        )
      : null;

  if (isFirstVisit) rlStep(2); // Step 2: Scoring

  const { data: answers } = await client
    .from("answers")
    .select(
      `
      selected_option,
      question_id,
      questions(correct_answer, pattern_section_id)
    `,
    )
    .eq("attempt_id", attemptId);

  const { data: attemptQs } = await client
    .from("attempt_questions")
    .select("question_id")
    .eq("attempt_id", attemptId);

  const answerMap = {};
  (answers || []).forEach((a) => {
    answerMap[a.question_id] = a;
  });

  let correct = 0,
    wrong = 0,
    skipped = 0;

  (attemptQs || []).forEach((aq) => {
    const a = answerMap[aq.question_id];
    if (!a || !a.selected_option) {
      skipped++;
    } else if (a.selected_option === a.questions?.correct_answer) {
      correct++;
    } else {
      wrong++;
    }
  });

  const score = +(correct * marksPerQ - wrong * negative).toFixed(2);
  const totalAttempted = correct + wrong;
  const accuracy =
    totalAttempted === 0 ? 0 : +((correct / totalAttempted) * 100).toFixed(2);

  if (attempt.total_score == null) {
    await client
      .from("attempts")
      .update({ total_score: score, accuracy, time_taken: timeTaken })
      .eq("id", attemptId);
  }

  if (isFirstVisit) rlStep(3); // Step 3: Coins & rank

  if (!attempt.coins_given) {
    await giveCoins(attemptId);
  } else {
    try {
      const { data: { session } } = await client.auth.getSession();
      if (session) {
        const { data: prof } = await client
          .from("user_profiles")
          .select("lifetime_coins, total_coins")
          .eq("id", session.user.id)
          .single();
        const lifetime = prof?.lifetime_coins || prof?.total_coins || 0;
        renderResultLevelPill(lifetime);
      }
    } catch (_) {}
  }

  // Dismiss overlay (only relevant on first visit; revisit already dismissed above)
  if (isFirstVisit) rlDismiss();

  displayResult({
    score,
    correct,
    wrong,
    skipped,
    accuracy,
    timeTaken,
    totalQ,
    totalMarks,
  });
  await loadReview(answerMap);
}

/* ─────────────────────────────────────────
   STEP 2 — DISPLAY SUMMARY HERO
───────────────────────────────────────── */
function displayResult({
  score,
  correct,
  wrong,
  skipped,
  accuracy,
  timeTaken,
  totalQ,
  totalMarks,
}) {
  animateCount("score", score, 900);

  document.getElementById("scoreDenom").textContent = totalMarks
    ? `out of ${totalMarks} marks`
    : "";

  document.getElementById("correctCount").textContent = correct;
  document.getElementById("wrongCount").textContent = wrong;
  document.getElementById("skippedCount").textContent = skipped;
  document.getElementById("accuracy").textContent = accuracy + "%";
  document.getElementById("timeTaken").textContent = formatDuration(timeTaken);

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
    .select(
      `
      question_order,
      questions(
        id,
        question_text,
        options,
        options_type,
        question_image,
        pyq_year,
        pyq_source,
        correct_answer,
        explanation,
        pattern_section_id,
        pattern_sections(section_name)
      )
    `,
    )
    .eq("attempt_id", attemptId)
    .order("question_order", { ascending: true });

  if (error || !aqData) return;

  allReviewItems = aqData.map((item, index) => {
    const q = item.questions;
    const selected = answerMap[q.id]?.selected_option || null;
    const correct = q.correct_answer;
    const status = !selected
      ? "skipped"
      : selected === correct
        ? "correct"
        : "wrong";
    return { q, selected, correct, status, index };
  });

  const counts = {
    all: allReviewItems.length,
    correct: 0,
    wrong: 0,
    skipped: 0,
  };
  allReviewItems.forEach((i) => counts[i.status]++);
  document.getElementById("cnt-all").textContent = counts.all;
  document.getElementById("cnt-correct").textContent = counts.correct;
  document.getElementById("cnt-wrong").textContent = counts.wrong;
  document.getElementById("cnt-skipped").textContent = counts.skipped;

  document.getElementById("reviewSubtitle").textContent =
    `${counts.all} questions`;

  renderSectionAccuracy(aqData, answerMap);
  renderReviewList(allReviewItems);
}

/* ─────────────────────────────────────────
   RENDER QUESTION TEXT — handles [[u]] underline markers + newlines
───────────────────────────────────────── */
function renderQuestionText(text) {
  if (!text) return "";
  // Step 1: Escape HTML to prevent XSS
  const div = document.createElement("div");
  div.textContent = text;
  let escaped = div.innerHTML;
  // Step 2: Convert [[u]]...[[/u]] markers → <u> tags (underline support)
  escaped = escaped.replace(/\[\[u\]\](.*?)\[\[\/u\]\]/gs, "<u>$1</u>");
  // Step 3: Convert newlines → <br> so multi-line questions render correctly
  escaped = escaped.replace(/\n/g, "<br>");
  return escaped;
}

/* ─────────────────────────────────────────
   RENDER OPTION VALUE — handles text / image / mixed
───────────────────────────────────────── */
function renderOptionValue(value, optionsType) {
  if (!value) return "";

  if (optionsType === "image") {
    return `<img src="${value}" alt="Option" class="h-14 max-w-full object-contain rounded-lg border border-gray-200 my-0.5">`;
  }

  if (optionsType === "mixed") {
    const parts = [];
    if (value.image) {
      parts.push(
        `<img src="${value.image}" alt="Option" class="h-14 max-w-full object-contain rounded-lg border border-gray-200 my-0.5">`,
      );
    }
    if (value.text) {
      parts.push(`<span style="line-height:1.45">${value.text}</span>`);
    }
    return parts.join("");
  }

  return `<span style="flex:1;line-height:1.45">${renderQuestionText(value)}</span>`;
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

  container.innerHTML = items
    .map(({ q, selected, correct, status, index }) => {
      const opts = q.options || {};
      const optionsType = q.options_type || "text";
      const isSkip = status === "skipped";
      const isOk = status === "correct";

      const chipClass = isSkip
        ? "chip-skipped"
        : isOk
          ? "chip-correct"
          : "chip-wrong";
      const chipIcon = isSkip
        ? `<i class="fas fa-minus"></i>`
        : isOk
          ? `<i class="fas fa-check"></i>`
          : `<i class="fas fa-times"></i>`;
      const chipLabel = isSkip ? "Skipped" : isOk ? "Correct" : "Wrong";
      const sectionName = q.pattern_sections?.section_name || "";

      const pyqBadge = q.pyq_year
        ? `<span style="font-size:.65rem;font-weight:700;background:#fffbeb;border:1px solid #fcd34d;color:#92400e;padding:2px 8px;border-radius:999px;white-space:nowrap">
           PYQ${q.pyq_source ? " · " + q.pyq_source : ""} ${q.pyq_year}
         </span>`
        : "";

      const questionImageHtml = q.question_image
        ? `<div style="padding:0 18px 10px">
           <img src="${q.question_image}" alt="Question figure"
                style="max-width:100%;max-height:200px;border-radius:10px;border:1px solid #e2e8f0;object-fit:contain;cursor:zoom-in"
                onclick="openResultImgZoom('${q.question_image}')" />
         </div>`
        : "";

      const optionKeys = Object.keys(opts).sort();
      const optionsHTML = optionKeys
        .map((key) => {
          const isCorrectOpt = key === correct;
          const isSelectedOpt = key === selected;
          const isWrongSel = isSelectedOpt && !isCorrectOpt;

          let optClass = "",
            keyClass = "",
            trailIcon = "";

          if (!isSkip) {
            if (isCorrectOpt) {
              optClass = "opt-correct";
              keyClass = "key-correct";
            }
            if (isWrongSel) {
              optClass = "opt-wrong";
              keyClass = "key-wrong";
            }
            if (isCorrectOpt)
              trailIcon = `<i class="fas fa-check"  style="color:#16a34a;margin-left:auto;flex-shrink:0;font-size:.75rem"></i>`;
            if (isWrongSel)
              trailIcon = `<i class="fas fa-times"  style="color:#dc2626;margin-left:auto;flex-shrink:0;font-size:.75rem"></i>`;
          }

          const optValueHtml = renderOptionValue(opts[key], optionsType);

          return `
        <div class="q-option ${optClass}">
          <span class="opt-key ${keyClass}">${key}</span>
          ${optValueHtml}
          ${trailIcon}
        </div>`;
        })
        .join("");

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
            ${pyqBadge}
          </div>
          <span class="q-status-chip ${chipClass}">
            ${chipIcon} ${chipLabel}
          </span>
        </div>
        <div class="q-text">${renderQuestionText(q.question_text)}</div>
        ${questionImageHtml}
        <div class="q-options">${optionsHTML}</div>
        <div class="q-footer">
          ${
            isSkip
              ? `<div class="qa-item"><i class="fas fa-info-circle" style="color:#1a56db;margin-right:4px"></i>Not attempted &nbsp;·&nbsp; Correct answer: <span class="qa-correct-ans">${correct}</span></div>`
              : `<div class="qa-item">Your answer: <strong>${selected}</strong></div>
               <div class="qa-item">Correct answer: <span class="qa-correct-ans">${correct}</span></div>`
          }
        </div>
        ${explanationHTML}
      </div>`;
    })
    .join("");
}

/* ─────────────────────────────────────────
   IMAGE ZOOM (for result page)
───────────────────────────────────────── */
window.openResultImgZoom = function (src) {
  let overlay = document.getElementById("resultImgZoom");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "resultImgZoom";
    overlay.style.cssText =
      "position:fixed;inset:0;background:rgba(0,0,0,0.88);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px;cursor:zoom-out";
    overlay.innerHTML = `
      <div style="position:relative;max-width:800px;width:100%;display:flex;flex-direction:column;align-items:center;gap:12px">
        <button onclick="document.getElementById('resultImgZoom').remove()"
          style="position:absolute;top:-36px;right:0;background:none;border:none;color:rgba(255,255,255,0.7);font-size:.85rem;cursor:pointer;display:flex;align-items:center;gap:6px">
          ✕ Close
        </button>
        <img id="resultImgZoomImg" src="${src}" alt="Zoomed"
          style="max-width:100%;max-height:80vh;border-radius:12px;object-fit:contain;box-shadow:0 20px 60px rgba(0,0,0,0.5)"
          onclick="event.stopPropagation()">
        <p style="color:rgba(255,255,255,0.35);font-size:.75rem">Tap outside to close</p>
      </div>`;
    overlay.addEventListener("click", () => overlay.remove());
    document.body.appendChild(overlay);
  } else {
    document.getElementById("resultImgZoomImg").src = src;
    overlay.style.display = "flex";
  }
};

/* ─────────────────────────────────────────
   FILTER (client-side, instant)
───────────────────────────────────────── */
window.filterReview = function (type, btn) {
  document.querySelectorAll(".ftab").forEach((t) => {
    t.className = "ftab";
  });
  const map = {
    all: "active-all",
    correct: "active-correct",
    wrong: "active-wrong",
    skipped: "active-skipped",
  };
  btn.classList.add(map[type]);

  const filtered =
    type === "all"
      ? allReviewItems
      : allReviewItems.filter((i) => i.status === type);

  renderReviewList(filtered);
};

/* ─────────────────────────────────────────
   SECTION ACCURACY BARS
───────────────────────────────────────── */
function renderSectionAccuracy(aqData, answerMap) {
  const sectionMap = {};

  aqData.forEach((item) => {
    const q = item.questions;
    const name = q.pattern_sections?.section_name || "General";
    const selected = answerMap[q.id]?.selected_option;
    const isCorrect = selected && selected === q.correct_answer;

    if (!sectionMap[name]) sectionMap[name] = { correct: 0, total: 0 };
    sectionMap[name].total++;
    if (isCorrect) sectionMap[name].correct++;
  });

  const sections = Object.entries(sectionMap);
  if (sections.length < 2) return;

  const COLORS = ["#1a56db", "#0284c7", "#0d9488", "#6366f1", "#7dd3fc"];

  document.getElementById("sectionAccuracyCard").style.display = "block";
  document.getElementById("sectionBars").innerHTML = sections
    .map(([name, s], i) => {
      const pct = s.total ? Math.round((s.correct / s.total) * 100) : 0;
      const color = COLORS[i % COLORS.length];
      const tagClass =
        pct >= 75 ? "tag-strong" : pct >= 50 ? "tag-average" : "tag-weak";
      const tagLabel = pct >= 75 ? "Strong" : pct >= 50 ? "Average" : "Weak";

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
    })
    .join("");
}

/* ─────────────────────────────────────────
   WHATSAPP SHARE
───────────────────────────────────────── */
window.shareResult = function () {
  const score = document.getElementById("score").textContent;
  const acc = document.getElementById("accuracy").textContent;
  const correct = document.getElementById("correctCount").textContent;
  const text = encodeURIComponent(
    `I just completed a Mock Test on Courage Library!\n\n` +
      `Score: ${score}  |  Correct: ${correct}  |  Accuracy: ${acc}\n\n` +
      `Prepare with me: https://couragelibrary.in`,
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
  if (s > 100000) s = Math.floor(s / 1000);
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (hrs > 0) return `${hrs}h ${mins}m`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

function animateCount(id, target, duration) {
  const el = document.getElementById(id);
  const to = Number(target);
  const t0 = performance.now();

  function step(now) {
    const p = Math.min((now - t0) / duration, 1);
    const ease = 1 - Math.pow(1 - p, 3);
    const val = to * ease;
    el.textContent = Number.isInteger(to) ? Math.round(val) : val.toFixed(2);
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/* ─────────────────────────────────────────
   GIVE COINS — calls Edge Function
   FIX #1: Use getSession() properly and
   guard against null session correctly.
   FIX #2: Retry once on session miss
   (tab freshly loaded, token still hydrating).
───────────────────────────────────────── */
async function giveCoins(attemptId) {
  // FIX #1: getSession() returns { data: { session } } — destructure correctly.
  // The old code destructured `user` from it which doesn't exist on session object.
  let session = null;
  try {
    const { data, error } = await client.auth.getSession();
    if (error) {
      console.error("giveCoins: getSession error:", error);
      return;
    }
    session = data?.session;
  } catch (err) {
    console.error("giveCoins: getSession threw:", err);
    return;
  }

  // FIX #2: If session is null on first try (token still hydrating), wait 1.2s and retry once
  if (!session) {
    await new Promise(r => setTimeout(r, 1200));
    try {
      const { data } = await client.auth.getSession();
      session = data?.session;
    } catch (_) {}
  }

  if (!session) {
    console.error("giveCoins: no session after retry — coins not awarded");
    return;
  }

  const user = session.user;

  // Fetch lifetime coins BEFORE reward so we can detect level-up
  let prevLifetime = 0;
  try {
    const { data: prof } = await client
      .from("user_profiles")
      .select("lifetime_coins, total_coins")
      .eq("id", user.id)
      .single();
    prevLifetime = prof?.lifetime_coins || prof?.total_coins || 0;
  } catch (_) {}

  let data;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/submit-test-and-reward`,
      {
        method: "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${session.access_token}`,
          "apikey":        SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ attempt_id: attemptId }),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      console.error("giveCoins: Edge Function returned", res.status, errText);
      return;
    }

    data = await res.json();
  } catch (err) {
    console.error("giveCoins fetch failed:", err);
    return;
  }

  if (!data) return;
  if (data.already_rewarded) return; // coins already given for this attempt — silent
  if (!data.coins) return;           // unexpected empty response

  // Show the breakdown popup + floating coin animation
  showCoinPopup(data.coins, data.streak, data.breakdown);

  // Fetch updated lifetime coins and check for level-up
  try {
    const { data: updated } = await client
      .from("user_profiles")
      .select("lifetime_coins, total_coins")
      .eq("id", user.id)
      .single();
    const newLifetime = updated?.lifetime_coins || updated?.total_coins || 0;
    const prevLevel   = getResultLevel(prevLifetime);
    const newLevel    = getResultLevel(newLifetime);

    if (newLevel.label !== prevLevel.label) {
      setTimeout(() => showLevelUpToast(newLevel, newLifetime), 2800);
    } else {
      renderResultLevelPill(newLifetime);
    }

    if (data.reward_unlocked) {
      setTimeout(() => showRewardUnlockPopup(
        `<i class="fas fa-gift" style="margin-right:6px"></i>${data.reward_unlocked} unlocked!`,
        `You now have ${data.total_coins} coins — enough to claim your ${data.reward_unlocked}. Go to Rewards to claim it!`
      ), newLevel.label !== prevLevel.label ? 5500 : 2200);
    }
  } catch (_) {
    if (data.reward_unlocked) {
      setTimeout(() => showRewardUnlockPopup(
        `<i class="fas fa-gift" style="margin-right:6px"></i>${data.reward_unlocked} unlocked!`,
        `You now have ${data.total_coins} coins — enough to claim your ${data.reward_unlocked}. Go to Rewards to claim it!`
      ), 2200);
    }
  }
}

/* ─────────────────────────────────────────
   COIN POPUP — animated modal + floating coins
───────────────────────────────────────── */
function showCoinPopup(coins, streak, breakdown) {
  const rows = [
    { label: 'Base coins',       val: breakdown?.base,             icon: '<i class="fas fa-calendar-day"></i>' },
    { label: 'Accuracy bonus',   val: breakdown?.accuracy_bonus,   icon: '<i class="fas fa-bullseye"></i>' },
    { label: 'First test bonus', val: breakdown?.first_test_bonus, icon: '<i class="fas fa-star"></i>' },
    { label: 'Streak bonus',     val: breakdown?.streak_bonus,     icon: '<i class="fas fa-fire"></i>' },
  ].filter(r => r.val > 0);

  const breakdownHTML = rows.length > 1
    ? `<div style="
        margin-top:14px;
        background:rgba(255,255,255,.08);
        border-radius:12px;
        padding:12px 16px;
        display:flex;
        flex-direction:column;
        gap:6px;
      ">
        ${rows.map(r => `
          <div style="display:flex;justify-content:space-between;align-items:center;font-size:13px">
            <span style="opacity:.75">${r.icon} ${r.label}</span>
            <span style="font-weight:700;color:#fbbf24">+${r.val}</span>
          </div>`).join('')}
        <div style="
          margin-top:8px;
          padding-top:8px;
          border-top:1px solid rgba(255,255,255,.15);
          display:flex;
          justify-content:space-between;
          font-size:14px;
          font-weight:800;
        ">
          <span>Total earned</span>
          <span style="color:#fbbf24">${coins} coins</span>
        </div>
      </div>`
    : '';

  document.getElementById('coinPopup')?.remove();
  document.getElementById('coinPopupBackdrop')?.remove();

  const popup = document.createElement('div');
  popup.id = 'coinPopup';
  popup.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) scale(0.8);
    background: linear-gradient(140deg, #1a1a2e 0%, #16213e 100%);
    color: white;
    padding: 28px 28px 24px;
    border-radius: 24px;
    text-align: center;
    z-index: 9999;
    min-width: 300px;
    max-width: 360px;
    width: 90vw;
    box-shadow: 0 24px 64px rgba(0,0,0,0.55);
    opacity: 0;
    transition: transform 0.35s cubic-bezier(.34,1.56,.64,1), opacity 0.25s ease;
  `;

  popup.innerHTML = `
    <div style="font-size:2.8rem;line-height:1;margin-bottom:6px">🪙</div>
    <div style="
      font-family:'Sora',sans-serif;
      font-size:2rem;
      font-weight:900;
      color:#fbbf24;
      line-height:1.1;
    ">+${coins} coins</div>
    <div style="font-size:13px;opacity:0.65;margin-top:4px">
      <i class="fas fa-fire" style="color:#fb923c;margin-right:4px"></i>${streak} day streak
    </div>
    ${breakdownHTML}
    <div style="
      margin-top:18px;
      font-size:11px;
      opacity:0.35;
      letter-spacing:.04em;
    ">Tap anywhere to dismiss</div>
  `;

  popup.addEventListener('click', () => { popup.remove(); backdrop.remove(); });

  const backdrop = document.createElement('div');
  backdrop.id = 'coinPopupBackdrop';
  backdrop.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9998;
    backdrop-filter:blur(3px);
  `;
  backdrop.addEventListener('click', () => {
    popup.remove();
    backdrop.remove();
  });

  document.body.appendChild(backdrop);
  document.body.appendChild(popup);

  // Animate in (double rAF ensures transition fires after paint)
  requestAnimationFrame(() => requestAnimationFrame(() => {
    popup.style.transform = 'translate(-50%, -50%) scale(1)';
    popup.style.opacity = '1';
  }));

  // FIX #4: Floating coins — uses `floatUp` keyframe now defined in injectAnimations()
  for (let i = 0; i < 8; i++) {
    setTimeout(() => {
      const coin = document.createElement('div');
      coin.innerHTML = '<svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="14" cy="14" r="14" fill="#fbbf24"/><circle cx="14" cy="14" r="10" fill="none" stroke="#f59e0b" stroke-width="1.5"/><text x="14" y="19" text-anchor="middle" font-size="11" font-weight="700" fill="#92400e" font-family="sans-serif">C</text></svg>';
      coin.style.cssText = `
        position:fixed;
        left:${20 + Math.random() * 60}vw;
        top:${30 + Math.random() * 30}vh;
        width:28px;height:28px;
        animation:floatUp 1.5s ease-out forwards;
        pointer-events:none;
        z-index:10000;
      `;
      document.body.appendChild(coin);
      setTimeout(() => coin.remove(), 1500);
    }, i * 120);
  }

  // Auto-dismiss after 6 seconds
  setTimeout(() => {
    popup.remove();
    backdrop.remove();
  }, 6000);
}

/* ─────────────────────────────────────────
   LEGACY animateCoins — kept for any other
   call sites, uses the now-defined floatCoin
───────────────────────────────────────── */
function animateCoins() {
  for (let i = 0; i < 8; i++) {
    const coin = document.createElement("div");
    coin.innerHTML = '<svg width="20" height="20" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="14" cy="14" r="14" fill="#fbbf24"/><circle cx="14" cy="14" r="10" fill="none" stroke="#f59e0b" stroke-width="1.5"/><text x="14" y="19" text-anchor="middle" font-size="11" font-weight="700" fill="#92400e" font-family="sans-serif">C</text></svg>';
    coin.style.cssText = `
      position: fixed;
      bottom: 40px;
      right: 40px;
      width: 20px;
      height: 20px;
      z-index: 9999;
      animation: floatCoin 1.5s ease forwards;
      transform: translate(${Math.random() * 40}px, 0);
      pointer-events: none;
    `;
    document.body.appendChild(coin);
    setTimeout(() => coin.remove(), 1500);
  }
}

/* ─────────────────────────────────────────
   LEVEL UP TOAST
───────────────────────────────────────── */
function showLevelUpToast(level, lifetimeCoins) {
  document.getElementById("levelUpToast")?.remove();
  const toast = document.createElement("div");
  toast.id = "levelUpToast";
  toast.style.cssText = `
    position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(20px);
    background:linear-gradient(135deg,#1a1a2e,#16213e);
    border:1px solid ${level.border};
    color:#fff;padding:18px 24px 16px;
    border-radius:18px;text-align:center;z-index:9999;
    min-width:300px;max-width:380px;
    box-shadow:0 8px 40px rgba(0,0,0,.5), 0 0 0 1px ${level.border};
    animation:lvlUpIn .4s cubic-bezier(.34,1.56,.64,1) forwards;
  `;
  toast.innerHTML = `
    <style>
      @keyframes lvlUpIn { from{opacity:0;transform:translateX(-50%) translateY(30px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }
      @keyframes lvlUpOut { to{opacity:0;transform:translateX(-50%) translateY(20px)} }
    </style>
    <div style="font-size:13px;font-weight:700;color:${level.color};letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px">
      🎉 Level Up!
    </div>
    <div style="display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:10px">
      <svg width="40" height="40" viewBox="0 0 64 64"><use href="#badge-${level.label.toLowerCase()}"/></svg>
      <div style="text-align:left">
        <div style="font-family:'Syne',sans-serif;font-size:1.3rem;font-weight:800;color:${level.color};line-height:1">${level.label}</div>
        <div style="font-size:.7rem;color:rgba(255,255,255,.55);margin-top:3px">${lifetimeCoins.toLocaleString("en-IN")} lifetime CL</div>
      </div>
    </div>
    <div style="font-size:.78rem;color:rgba(255,255,255,.6);line-height:1.4;margin-bottom:14px">${level.tagline}</div>
    <button onclick="this.closest('#levelUpToast').style.animation='lvlUpOut .3s ease forwards';setTimeout(()=>this.closest('#levelUpToast')?.remove(),300)"
      style="background:${level.bg};border:1px solid ${level.border};color:${level.color};
             padding:7px 20px;border-radius:100px;font-family:'Syne',sans-serif;
             font-size:.75rem;font-weight:800;cursor:pointer;letter-spacing:.04em">
      Awesome! 🚀
    </button>
  `;
  document.body.appendChild(toast);
  renderResultLevelPill(lifetimeCoins);
  setTimeout(() => {
    if (toast.parentNode) {
      toast.style.animation = "lvlUpOut .3s ease forwards";
      setTimeout(() => toast.remove(), 300);
    }
  }, 8000);
}

/* ─────────────────────────────────────────
   LEVEL HELPERS
───────────────────────────────────────── */
function getResultLevel(coins) {
  if (coins >= 6000) return { label: "Legend",   color: "#f59e0b", bg: "rgba(245,158,11,0.12)", border: "#b45309",  tagline: "The rarest rank. Your consistency is your identity." };
  if (coins >= 3000) return { label: "Luminary",  color: "#c084fc", bg: "rgba(168,85,247,0.12)",  border: "#7c3aed",  tagline: "You illuminate the path for those around you." };
  if (coins >= 1000) return { label: "Scholar",   color: "#38bdf8", bg: "rgba(0,168,255,0.10)",   border: "#0284c7",  tagline: "Knowledge is accumulating. The foundations are solid." };
  return               { label: "Seeker",    color: "#8080c0", bg: "rgba(80,80,180,0.10)",   border: "#3030a0",  tagline: "Every journey begins with curiosity. You've started yours." };
}

function renderResultLevelPill(lifetimeCoins) {
  const el = document.getElementById("resultLevelPill");
  if (!el) return;
  const { label, color, bg, border } = getResultLevel(lifetimeCoins);
  el.style.display = "inline-flex";
  el.style.background = bg;
  el.style.borderColor = border;
  el.style.color = color;
  el.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 64 64"><use href="#badge-${label.toLowerCase()}"/></svg>
    ${label}
    <span style="font-size:.68rem;opacity:.7;font-weight:500;margin-left:2px">${lifetimeCoins.toLocaleString("en-IN")} lifetime CL</span>`;
}

/* Prevent back navigation to exam page */
history.pushState(null, null, location.href);
window.onpopstate = () => {
  window.location.href = "/mock/dashboard.html";
};