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
  const { data, error } = await client
    .from("scheduled_exams")
    .select(`
      id, mode, availability_type, end_datetime,
      exam_patterns ( pattern_name, duration_minutes, negative_marking, total_questions )
    `)
    .eq("is_active", true);

  console.log("DATA:", data, "ERROR:", error);
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

  data.forEach((exam, i) => {
    const pattern   = exam.exam_patterns || {};
    const isExpired = exam.end_datetime && new Date(exam.end_datetime) < new Date();
    const avType    = (exam.availability_type || "practice").toLowerCase();
    const badgeClass = isExpired ? "badge-expired" : avType === "live" ? "badge-live" : avType === "weekly" ? "badge-weekly" : "badge-practice";
    const negVal    = pattern.negative_marking != null ? `-${pattern.negative_marking}` : "None";

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
        <div class="exam-avail ${isExpired ? "exp" : "ok"}">
          <span class="avail-dot"></span>
          ${isExpired ? "No longer available" : "Available now"}
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
      <div class="exam-card-footer">
        ${isExpired
          ? `<button class="btn-start-exam disabled-btn" disabled><i class="fas fa-lock"></i> Expired</button>`
          : `<button class="btn-start-exam active" onclick="startExam('${exam.id}', this)"><i class="fas fa-play"></i> Start Exam</button>`
        }
      </div>`;
    container.appendChild(card);
  });
}

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

  const { data: { user } } = await client.auth.getUser();

  const { data: newAttempt, error } = await client
    .from("attempts")
    .insert([{ user_id: user.id, scheduled_exam_id: examId, started_at: new Date() }])
    .select().single();

  if (error) {
    btn.disabled = false;
    btn.innerHTML = `<i class="fas fa-play"></i> Start Exam`;
    alert(error.message);
    return;
  }

  const { data: exam } = await client
    .from("scheduled_exams").select(`mode, exam_patterns(id)`).eq("id", examId).single();

  const patternId = exam.exam_patterns.id;
  const { data: sections } = await client.from("pattern_sections").select("*").eq("pattern_id", patternId);

  let finalQuestions = [];
  const sectionIds = sections.map((s) => s.id);
  const { data: allQuestions } = await client.from("questions").select("id, pattern_section_id").in("pattern_section_id", sectionIds);

  sections.forEach((section) => {
    const sectionQuestions = allQuestions.filter((q) => q.pattern_section_id === section.id).slice(0, section.question_count);
    finalQuestions = finalQuestions.concat(sectionQuestions);
  });

  await client.from("attempt_questions").insert(
    finalQuestions.map((q, index) => ({ attempt_id: newAttempt.id, question_id: q.id, question_order: index + 1 }))
  );

  window.location.href = `/mock/exam.html?attempt=${newAttempt.id}`;
};

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

  const accClass = (acc) => acc >= 80 ? "p-green" : acc >= 60 ? "p-amber" : "p-red";
  const accMobClass = (acc) => acc >= 80 ? "acc-green" : acc >= 60 ? "acc-amber" : "acc-red";

  const desktopRows = attempts.map((a) => {
    const acc  = Number(a.accuracy ?? 0);
    const name = a.scheduled_exams?.exam_patterns?.pattern_name || "Mock";
    const date = a.submitted_at ? new Date(a.submitted_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";
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

  /* Mobile: each attempt becomes a card with name/date on top,
     then 3 equal chips: Score | Accuracy | Time */
  const mobileCards = attempts.map((a) => {
    const acc  = Number(a.accuracy ?? 0);
    const name = a.scheduled_exams?.exam_patterns?.pattern_name || "Mock";
    const date = a.submitted_at ? new Date(a.submitted_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";
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