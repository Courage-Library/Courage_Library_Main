const SUPABASE_URL = "https://sgagswxzsxlgcspwiuoh.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNnYWdzd3h6c3hsZ2NzcHdpdW9oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5NTA1NTIsImV4cCI6MjA2OTUyNjU1Mn0.ZNfk5WNDPkjKcFsRO48rEYk3dhbLYm_m21aZ-wfywo4";

const { createClient } = supabase;
const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

document.addEventListener("DOMContentLoaded", async () => {
  await checkAuth();
  await loadPerformanceAnalytics();
  loadAvailableExams();
});

async function checkAuth() {
  const { data: { user } } = await client.auth.getUser();
  if (!user) window.location.href = "/index.html?checkAuth=1";
}

async function loadPerformanceAnalytics() {
  const { data: { user } } = await client.auth.getUser();

  const { data } = await client
    .from("attempts")
    .select(`
      total_score, accuracy, time_taken, submitted_at,
      scheduled_exams ( exam_patterns ( pattern_name ) )
    `)
    .eq("user_id", user.id)
    .not("submitted_at", "is", null);

  if (!data || data.length === 0) {
    document.getElementById("totalAttempts").textContent = "0";
    document.getElementById("avgAccuracy").textContent   = "0%";
    document.getElementById("bestScore").textContent     = "0";
    document.getElementById("totalTime").textContent     = "0 hrs";
    renderRecentAttempts([]);
    return;
  }

  document.getElementById("totalAttempts").innerText = data.length;

  const avgAccuracy = data.reduce((s, a) => s + Number(a.accuracy || 0), 0) / data.length;
  document.getElementById("avgAccuracy").innerText = avgAccuracy.toFixed(1) + "%";

  const bestScore = Math.max(...data.map((a) => a.total_score || 0));
  document.getElementById("bestScore").innerText = bestScore;

  const totalSeconds = data.reduce((s, a) => s + (a.time_taken || 0), 0);
  document.getElementById("totalTime").innerText = (totalSeconds / 3600).toFixed(1) + " hrs";

  renderRecentAttempts(data.slice(-5).reverse());
}

async function loadAvailableExams() {
  const { data: { user } } = await client.auth.getUser();

  const { data, error } = await client
    .from("scheduled_exams")
    .select(`
      id, mode, availability_type, start_datetime, end_datetime,
      is_premium, attempt_limit,
      exam_patterns ( pattern_name, duration_minutes, negative_marking, total_questions )
    `)
    .eq("is_active", true);

  if (error) { console.error(error); return; }

  const container = document.getElementById("examList");
  container.innerHTML = "";

  if (!data || data.length === 0) {
    container.innerHTML = `
      <div style="grid-column:1/-1">
        <div class="empty-box">
          <div class="empty-ico"><i class="fas fa-calendar-times"></i></div>
          <h3>No Tests Available</h3>
          <p>No mock tests are scheduled right now. Check back soon!</p>
        </div>
      </div>`;
    return;
  }

  // Fetch user's existing attempts for all these exams at once
  const examIds = data.map(e => e.id);
  const { data: userAttempts } = await client
    .from("attempts")
    .select("id, scheduled_exam_id, submitted_at, started_at")
    .eq("user_id", user.id)
    .in("scheduled_exam_id", examIds);

  // Map: examId → list of attempts
  const attemptsByExam = {};
  (userAttempts || []).forEach(a => {
    if (!attemptsByExam[a.scheduled_exam_id]) attemptsByExam[a.scheduled_exam_id] = [];
    attemptsByExam[a.scheduled_exam_id].push(a);
  });

  const now = new Date();

  data.forEach((exam, i) => {
    const pattern      = exam.exam_patterns || {};
    const myAttempts   = attemptsByExam[exam.id] || [];
    const completedAttempts = myAttempts.filter(a => a.submitted_at);
    const incompleteAttempt = myAttempts.find(a => !a.submitted_at);

    // ── Max resume window check ──
    // If student has been "away" for more than 1.5× the exam duration, abandon the attempt
    // This prevents: start → close → research answers → resume
    let isAbandoned = false;
    if (incompleteAttempt && incompleteAttempt.started_at) {
      const durationMs     = (pattern.duration_minutes || 60) * 60 * 1000;
      const maxResumeMs    = durationMs * 1.5; // e.g. 60 min exam → max 90 min window
      const elapsed        = now - new Date(incompleteAttempt.started_at);
      if (elapsed > maxResumeMs) isAbandoned = true;
    }

    // ── Status checks ──
    const isExpired    = exam.end_datetime   && new Date(exam.end_datetime)   < now;
    const notStarted   = exam.start_datetime && new Date(exam.start_datetime) > now;
    const limitReached = exam.attempt_limit  && completedAttempts.length >= exam.attempt_limit;

    const avType       = (exam.availability_type || "practice").toLowerCase();
    const badgeClass   = isExpired ? "badge-expired" : avType === "live" ? "badge-live" : avType === "weekly" ? "badge-weekly" : "badge-practice";
    const negVal       = pattern.negative_marking != null ? `-${pattern.negative_marking}` : "None";

    // ── Button state ──
    let btnHtml = "";
    if (isExpired) {
      btnHtml = `<button class="btn-start-exam disabled-btn" disabled><i class="fas fa-lock"></i> Expired</button>`;
    } else if (notStarted) {
      const startStr = new Date(exam.start_datetime).toLocaleString("en-IN", { day:"numeric", month:"short", hour:"2-digit", minute:"2-digit" });
      btnHtml = `<button class="btn-start-exam disabled-btn" disabled><i class="fas fa-clock"></i> Starts ${startStr}</button>`;
    } else if (limitReached) {
      btnHtml = `<button class="btn-start-exam disabled-btn" disabled><i class="fas fa-ban"></i> Attempt Limit Reached</button>`;
    } else if (incompleteAttempt && !isAbandoned) {
      // Resume existing incomplete attempt — timer is still running server-side
      btnHtml = `<button class="btn-start-exam active" style="background:linear-gradient(135deg,#059669,#10b981)" onclick="resumeExam('${incompleteAttempt.id}', this)"><i class="fas fa-redo"></i> Resume Exam</button>`;
    } else if (incompleteAttempt && isAbandoned) {
      // Attempt exists but window expired — treat as a new attempt (old one auto-submits on entry)
      btnHtml = `<button class="btn-start-exam active" onclick="startExam('${exam.id}', this)"><i class="fas fa-play"></i> Start Exam</button>`;
    } else {
      btnHtml = `<button class="btn-start-exam active" onclick="startExam('${exam.id}', this)"><i class="fas fa-play"></i> Start Exam</button>`;
    }

    // Attempt counter badge
    const attemptsInfo = exam.attempt_limit
      ? `<span style="font-size:.65rem;color:#94a3b8;font-weight:700">${completedAttempts.length}/${exam.attempt_limit} attempts used</span>`
      : completedAttempts.length > 0
        ? `<span style="font-size:.65rem;color:#94a3b8;font-weight:700">Attempted ${completedAttempts.length}×</span>`
        : "";

    const card = document.createElement("div");
    card.className = "exam-card";
    card.style.animation = `fadeInUp .45s ease ${i * 0.07}s both`;
    card.innerHTML = `
      <div class="exam-card-accent ${isExpired ? "expired" : ""}"></div>
      <div class="exam-card-body">
        <div class="exam-card-head">
          <div class="exam-card-title">${pattern.pattern_name || "Mock Test"}</div>
          <span class="exam-type-badge ${badgeClass}">${isExpired ? "Expired" : avType}</span>
        </div>
        <div class="exam-avail ${isExpired || notStarted ? "exp" : "ok"}">
          <span class="avail-dot"></span>
          ${isExpired ? "No longer available" : notStarted ? "Not started yet" : "Available now"}
          ${attemptsInfo ? `&nbsp;·&nbsp;${attemptsInfo}` : ""}
        </div>
        <div class="exam-meta-grid">
          <div class="meta-chip">
            <div class="meta-chip-icon"><i class="far fa-clock"></i></div>
            <div><div class="meta-chip-label">Duration</div><div class="meta-chip-value">${pattern.duration_minutes ?? "—"} min</div></div>
          </div>
          <div class="meta-chip">
            <div class="meta-chip-icon green"><i class="fas fa-list-ol"></i></div>
            <div><div class="meta-chip-label">Questions</div><div class="meta-chip-value">${pattern.total_questions ?? "—"}</div></div>
          </div>
          <div class="meta-chip">
            <div class="meta-chip-icon amber"><i class="fas fa-minus-circle"></i></div>
            <div><div class="meta-chip-label">Negative</div><div class="meta-chip-value">${negVal}</div></div>
          </div>
          <div class="meta-chip">
            <div class="meta-chip-icon indigo"><i class="fas fa-layer-group"></i></div>
            <div><div class="meta-chip-label">Mode</div><div class="meta-chip-value">${exam.mode || "—"}</div></div>
          </div>
        </div>
      </div>
      <div class="exam-card-footer">${btnHtml}</div>`;
    container.appendChild(card);
  });
}

// ─────────────────────────────────────────────
//  Fisher-Yates shuffle — true random
// ─────────────────────────────────────────────
function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─────────────────────────────────────────────
//  SMART QUESTION PICKER
//  Priority 1 — Topic balance (when topics exist)
//  Priority 2 — Difficulty balance (always)
//  Priority 3 — Random within each bucket
//  Graceful fallback at every level
// ─────────────────────────────────────────────

// Target difficulty distribution (must sum to 1.0)
const DIFFICULTY_RATIO = { easy: 0.6, medium: 0.3, hard: 0.1 };

function pickQuestionsForSection(allQuestions, section) {
  const needed = section.question_count || 0;
  if (needed === 0) return [];

  // Filter active questions for this section
  const pool = allQuestions.filter(q => q.pattern_section_id === section.id);
  if (pool.length === 0) {
    console.warn(`No questions for section: ${section.section_name}`);
    return [];
  }

  // ── Check if topics exist in this section ──
  const hasTopics = pool.some(q => q.topic && q.topic.trim() !== "");

  let selected = [];

  if (hasTopics) {
    // ════ PHASE 1 — Topic-balanced selection ════
    // Group by topic
    const byTopic = {};
    pool.forEach(q => {
      const t = (q.topic && q.topic.trim()) ? q.topic.trim() : "__untagged__";
      if (!byTopic[t]) byTopic[t] = [];
      byTopic[t].push(q);
    });

    const topics      = Object.keys(byTopic);
    const fairShare   = Math.ceil(needed / topics.length);

    // Allocate slots per topic — cap at fairShare, take all if pool < fairShare
    let topicPicked = [];
    let overflow    = []; // questions from over-represented topics

    topics.forEach(topic => {
      const shuffled   = shuffleArray(byTopic[topic]);
      const take       = Math.min(shuffled.length, fairShare);
      topicPicked      = topicPicked.concat(shuffled.slice(0, take));
      // Remaining go to overflow pool for gap-filling
      if (shuffled.length > take) {
        overflow = overflow.concat(shuffled.slice(take));
      }
    });

    // If we have more than needed (due to ceil), shuffle and trim
    topicPicked = shuffleArray(topicPicked);

    if (topicPicked.length >= needed) {
      selected = topicPicked.slice(0, needed);
    } else {
      // Fill remaining from overflow (shuffled)
      const remaining = needed - topicPicked.length;
      selected = topicPicked.concat(shuffleArray(overflow).slice(0, remaining));
    }

  } else {
    // ════ PHASE 1 (no topics) — Use full pool ════
    selected = shuffleArray(pool).slice(0, needed);
  }

  // ════ PHASE 2 — Difficulty rebalance ════
  // Re-sort the selected set to match difficulty targets
  // This runs regardless of whether topics exist
  selected = applyDifficultyBalance(selected, pool, needed);

  return selected;
}

function applyDifficultyBalance(currentSelection, fullPool, needed) {
  // Calculate targets
  const targets = {
    easy:   Math.round(needed * DIFFICULTY_RATIO.easy),
    medium: Math.round(needed * DIFFICULTY_RATIO.medium),
    hard:   Math.floor(needed * DIFFICULTY_RATIO.hard),
  };
  // Adjust for rounding — make sure targets sum exactly to needed
  const tSum = targets.easy + targets.medium + targets.hard;
  targets.easy += (needed - tSum); // give remainder to easy

  // Build pools by difficulty from full section pool
  const poolByDiff = { easy: [], medium: [], hard: [] };
  fullPool.forEach(q => {
    const d = (q.difficulty || "easy").toLowerCase();
    if (poolByDiff[d]) poolByDiff[d].push(q);
  });

  // Shuffle each difficulty pool
  Object.keys(poolByDiff).forEach(d => {
    poolByDiff[d] = shuffleArray(poolByDiff[d]);
  });

  let result = [];
  let deficit = 0; // tracks unfilled slots

  // Pick from each difficulty bucket
  ["easy", "medium", "hard"].forEach(diff => {
    const want      = targets[diff];
    const available = poolByDiff[diff];
    const take      = Math.min(want, available.length);
    result = result.concat(available.slice(0, take));
    deficit += (want - take); // count shortfall
  });

  // Fill deficit from easiest available (most common in early phase)
  if (deficit > 0) {
    const already  = new Set(result.map(q => q.id));
    const leftover = shuffleArray(
      fullPool.filter(q => !already.has(q.id))
    );
    result = result.concat(leftover.slice(0, deficit));
  }

  // Final shuffle so difficulty order is mixed (not easy→medium→hard)
  return shuffleArray(result).slice(0, needed);
}

// ─────────────────────────────────────────────
//  RESUME EXAM — redirect to existing incomplete attempt
// ─────────────────────────────────────────────
window.resumeExam = function(attemptId, btn) {
  btn.disabled = true;
  btn.innerHTML = `<span style="display:flex;align-items:center;justify-content:center;gap:8px">
    <svg style="width:16px;height:16px;animation:spin .75s linear infinite" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,.35)" stroke-width="3"/>
      <path d="M22 12a10 10 0 0 1-10 10" stroke="white" stroke-width="3" stroke-linecap="round"/>
    </svg>
    Loading...</span>`;
  window.location.href = `/mock/exam.html?attempt=${attemptId}`;
};

// ─────────────────────────────────────────────
//  START EXAM
// ─────────────────────────────────────────────
window.startExam = async function (examId, btn) {
  btn.disabled = true;
  btn.innerHTML = `
    <span style="display:flex;align-items:center;justify-content:center;gap:8px">
      <svg style="width:16px;height:16px;animation:spin .75s linear infinite;flex-shrink:0" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,.35)" stroke-width="3"/>
        <path d="M22 12a10 10 0 0 1-10 10" stroke="white" stroke-width="3" stroke-linecap="round"/>
      </svg>
      Preparing Exam...
    </span>`;

  try {
    const { data: { user } } = await client.auth.getUser();

    // ── Safety net: re-check all conditions server-side before creating attempt ──

    // 1 — Fetch exam with all restriction fields
    const { data: examCheck } = await client
      .from("scheduled_exams")
      .select("is_active, start_datetime, end_datetime, is_premium, attempt_limit, exam_patterns(id)")
      .eq("id", examId)
      .single();

    if (!examCheck || !examCheck.is_active) throw new Error("This exam is no longer available.");

    const now = new Date();
    if (examCheck.start_datetime && new Date(examCheck.start_datetime) > now)
      throw new Error("This exam has not started yet.");
    if (examCheck.end_datetime && new Date(examCheck.end_datetime) < now)
      throw new Error("This exam has expired.");

    // 2 — Check for existing incomplete attempt (race condition guard)
    const { data: existingAttempts } = await client
      .from("attempts")
      .select("id, submitted_at, started_at")
      .eq("user_id", user.id)
      .eq("scheduled_exam_id", examId);

    const incomplete = (existingAttempts || []).find(a => !a.submitted_at);

    if (incomplete) {
      // Check if this incomplete attempt is within the valid resume window
      const durMins  = examCheck.exam_patterns?.duration_minutes || 60;
      const maxMs    = durMins * 60 * 1000 * 1.5;
      const elapsed  = incomplete.started_at ? Date.now() - new Date(incomplete.started_at).getTime() : Infinity;
      const isAbandoned = elapsed > maxMs;

      if (!isAbandoned) {
        // Valid — just resume it
        window.location.href = `/mock/exam.html?attempt=${incomplete.id}`;
        return;
      } else {
        // Abandoned — delete it cleanly so we can start fresh
        await client.from("attempt_questions").delete().eq("attempt_id", incomplete.id);
        await client.from("answers").delete().eq("attempt_id", incomplete.id);
        await client.from("attempts").delete().eq("id", incomplete.id);
      }
    }

    // 3 — Check attempt limit
    if (examCheck.attempt_limit) {
      const completed = (existingAttempts || []).filter(a => a.submitted_at).length;
      if (completed >= examCheck.attempt_limit)
        throw new Error(`You have reached the maximum attempt limit (${examCheck.attempt_limit}) for this exam.`);
    }

    // ── All checks passed — create attempt ──
    const { data: newAttempt, error: attemptError } = await client
      .from("attempts")
      .insert([{ user_id: user.id, scheduled_exam_id: examId, started_at: new Date() }])
      .select()
      .single();

    if (attemptError) throw new Error(attemptError.message);

    const patternId = examCheck.exam_patterns.id;

    // 4 — Get all sections for this pattern
    const { data: sections } = await client
      .from("pattern_sections")
      .select("id, section_name, question_count")
      .eq("pattern_id", patternId);

    if (!sections || sections.length === 0) throw new Error("No sections found for this exam pattern.");

    // 5 — Fetch ALL active questions for all sections in one query
    const sectionIds = sections.map(s => s.id);
    const { data: allQuestions } = await client
      .from("questions")
      .select("id, pattern_section_id, topic, difficulty")
      .in("pattern_section_id", sectionIds)
      .eq("is_active", true);

    if (!allQuestions || allQuestions.length === 0) throw new Error("No active questions found for this exam.");

    // 6 — Pick random questions per section (smart balanced picker)
    let finalQuestions = [];
    sections.forEach(section => {
      const picked = pickQuestionsForSection(allQuestions, section);
      finalQuestions = finalQuestions.concat(picked);
    });

    if (finalQuestions.length === 0) throw new Error("Could not assign any questions. Please contact admin.");

    // 7 — Insert into attempt_questions
    const { error: insertError } = await client
      .from("attempt_questions")
      .insert(
        finalQuestions.map((q, index) => ({
          attempt_id:     newAttempt.id,
          question_id:    q.id,
          question_order: index + 1,
        }))
      );

    if (insertError) throw new Error(insertError.message);

    // 8 — Go to exam
    window.location.href = `/mock/exam.html?attempt=${newAttempt.id}`;

  } catch (err) {
    console.error("startExam error:", err);
    btn.disabled = false;
    btn.innerHTML = `<i class="fas fa-play"></i> Start Exam`;
    alert(err.message);
  }
};

// ─────────────────────────────────────────────
//  RENDER RECENT ATTEMPTS
// ─────────────────────────────────────────────
function renderRecentAttempts(attempts) {
  const container = document.getElementById("recentAttempts");
  if (!container) return;

  if (!attempts || attempts.length === 0) {
    container.innerHTML = `
      <div class="empty-box">
        <div class="empty-ico"><i class="fas fa-rocket"></i></div>
        <h3>No Attempts Yet</h3>
        <p>Start your first mock test — your performance history will appear here.</p>
      </div>`;
    return;
  }

  const accClass    = (acc) => acc >= 80 ? "p-green" : acc >= 60 ? "p-amber" : "p-red";
  const accMobClass = (acc) => acc >= 80 ? "acc-green" : acc >= 60 ? "acc-amber" : "acc-red";

  const desktopRows = attempts.map((a) => {
    const acc  = Number(a.accuracy ?? 0);
    const name = a.scheduled_exams?.exam_patterns?.pattern_name || "Mock";
    const date = a.submitted_at
      ? new Date(a.submitted_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
      : "—";
    return `
      <div class="attempt-row">
        <div>
          <div class="attempt-name">${name}</div>
          <div class="attempt-date">${date}</div>
        </div>
        <div><span class="a-pill p-blue">${a.total_score ?? 0}</span></div>
        <div><span class="a-pill ${accClass(acc)}">${acc.toFixed(1)}%</span></div>
        <div class="attempt-time">${formatDuration(a.time_taken)}</div>
      </div>`;
  }).join("");

  const mobileCards = attempts.map((a) => {
    const acc  = Number(a.accuracy ?? 0);
    const name = a.scheduled_exams?.exam_patterns?.pattern_name || "Mock";
    const date = a.submitted_at
      ? new Date(a.submitted_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
      : "—";
    return `
      <div class="attempt-mob">
        <div class="amb-top">
          <div class="amb-name">${name}</div>
          <div class="amb-date">${date}</div>
        </div>
        <div class="amb-chips">
          <div class="amb-chip score">
            <div class="amb-chip-val">${a.total_score ?? 0}</div>
            <div class="amb-chip-lbl">Score</div>
          </div>
          <div class="amb-chip ${accMobClass(acc)}">
            <div class="amb-chip-val">${acc.toFixed(1)}%</div>
            <div class="amb-chip-lbl">Accuracy</div>
          </div>
          <div class="amb-chip time">
            <div class="amb-chip-val">${formatDuration(a.time_taken)}</div>
            <div class="amb-chip-lbl">Time</div>
          </div>
        </div>
      </div>`;
  }).join("");

  container.innerHTML = `
    <div class="attempts-thead">
      <div>Exam</div><div>Score</div><div>Accuracy</div><div>Time</div>
    </div>
    ${desktopRows}
    ${mobileCards}`;
}

function formatDuration(time) {
  if (!time) return "—";
  let seconds = Number(time);
  if (seconds > 100000) seconds = Math.floor(seconds / 1000);
  const hrs  = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hrs > 0)  return `${hrs}h ${mins}m`;
  if (mins > 0) return `${mins}m`;
  return "<1m";
}