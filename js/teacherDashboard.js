// ══════════════════════════════════════════════════════════════════════════════
// Teacher Dashboard — Courage Library B2B Platform
// ══════════════════════════════════════════════════════════════════════════════
// Features:
// - View all scheduled exams for coaching
// - See student performance and results
// - Manage passkeys (view, copy, regenerate)
// - Activate/deactivate exams
// - Download branded PDF reports
// - Track who attempted and who didn't
// ══════════════════════════════════════════════════════════════════════════════

const SUPABASE_URL = "https://sgagswxzsxlgcspwiuoh.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNnYWdzd3h6c3hsZ2NzcHdpdW9oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5NTA1NTIsImV4cCI6MjA2OTUyNjU1Mn0.ZNfk5WNDPkjKcFsRO48rEYk3dhbLYm_m21aZ-wfywo4";

const { createClient } = supabase;
const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let coachingData = null;
let allExams = [];
let allStudents = [];

// ══════════════════════════════════════════════════════════════════════════════
// INITIALIZATION
// ══════════════════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async () => {
  await init();
});

async function init() {
  // Check authentication
  const { data: { user }, error: authError } = await client.auth.getUser();
  
  if (authError || !user) {
    window.location.href = '/index.html?action=login';
    return;
  }

  currentUser = user;

  // Get user profile and verify teacher role
  const { data: profile, error: profileError } = await client
    .from('user_profiles')
    .select('role, coaching_id, full_name')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    showToast('Profile not found. Please contact support.', 'error');
    setTimeout(() => { window.location.href = '/index.html'; }, 2000);
    return;
  }

  // Verify teacher role
  if (profile.role !== 'teacher') {
    showToast('Access denied. Teacher account required.', 'error');
    setTimeout(() => { window.location.href = '/coaching/dashboard.html'; }, 2000);
    return;
  }

  // Verify coaching assignment
  if (!profile.coaching_id) {
    showToast('No coaching center assigned. Please contact admin.', 'error');
    setTimeout(() => { window.location.href = '/index.html'; }, 2000);
    return;
  }

  // Load coaching data
  const { data: coaching, error: coachingError } = await client
    .from('coaching_centers')
    .select('id, name, slug, city, primary_color, logo_url')
    .eq('id', profile.coaching_id)
    .single();

  if (coachingError || !coaching) {
    showToast('Coaching center not found.', 'error');
    return;
  }

  coachingData = coaching;

  // Populate coaching info card
  document.getElementById('coachingName').textContent = coaching.name;
  document.getElementById('coachingCity').innerHTML = `<i class="fas fa-map-marker-alt mr-2 text-blue-600"></i>${coaching.city || 'India'}`;
  document.getElementById('teacherName').textContent = profile.full_name || 'Teacher';
  
  // Set join link
  const joinUrl = `${window.location.origin}/c/${coaching.slug}`;
  document.getElementById('joinLink').textContent = joinUrl;

  // Load dashboard data
  await loadDashboard();

  // Hide loading, show dashboard
  document.getElementById('loadingState').classList.add('hidden');
  document.getElementById('dashboard').classList.remove('hidden');
}

// ══════════════════════════════════════════════════════════════════════════════
// LOAD DASHBOARD DATA
// ══════════════════════════════════════════════════════════════════════════════

async function loadDashboard() {
  await Promise.all([
    loadStudents(),
    loadExams(),
  ]);

  renderStats();
  renderExams();
}

async function loadStudents() {
  const { data, error } = await client
    .from('user_profiles')
    .select('id, full_name, user_email, created_at, role')
    .eq('coaching_id', coachingData.id)
    .neq('role', 'teacher') // Exclude teachers!
    .order('full_name');

  if (!error && data) {
    allStudents = data;
  }
}

async function loadExams() {
  const { data, error } = await client
    .from('scheduled_exams')
    .select(`
      id,
      start_datetime,
      end_datetime,
      is_active,
      passkey,
      attempt_limit,
      exam_patterns!pattern_id (
        id,
        pattern_name,
        duration_minutes,
        total_marks
      )
    `)
    .eq('coaching_id', coachingData.id)
    .order('start_datetime', { ascending: false });

  if (!error && data) {
    allExams = data;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// RENDER STATS
// ══════════════════════════════════════════════════════════════════════════════

function renderStats() {
  const totalStudents = allStudents.length;
  const totalExams = allExams.length;
  
  // Update coaching info card counts
  document.getElementById('studentCount').innerHTML = `<i class="fas fa-users text-blue-600 mr-1"></i>${totalStudents} Students`;
  document.getElementById('examCount').innerHTML = `<i class="fas fa-clipboard-list text-green-600 mr-1"></i>${totalExams} Exams`;
  
  // Calculate average score from all completed attempts
  let totalScore = 0;
  let attemptCount = 0;

  // We'll fetch this separately for now
  calculateAvgScore().then(avgScore => {
    const statsHTML = `
      <div class="stat-card">
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
            <i class="fas fa-users text-blue-600 text-xl"></i>
          </div>
          <div>
            <p class="text-2xl font-bold text-gray-900">${totalStudents}</p>
            <p class="text-sm text-gray-500">Total Students</p>
          </div>
        </div>
      </div>

      <div class="stat-card">
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
            <i class="fas fa-clipboard-list text-green-600 text-xl"></i>
          </div>
          <div>
            <p class="text-2xl font-bold text-gray-900">${totalExams}</p>
            <p class="text-sm text-gray-500">Scheduled Exams</p>
          </div>
        </div>
      </div>

      <div class="stat-card">
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center">
            <i class="fas fa-chart-line text-indigo-600 text-xl"></i>
          </div>
          <div>
            <p class="text-2xl font-bold text-gray-900">${avgScore}%</p>
            <p class="text-sm text-gray-500">Avg Score</p>
          </div>
        </div>
      </div>
    `;

    document.getElementById('statsRow').innerHTML = statsHTML;
  });
}

async function calculateAvgScore() {
  const examIds = allExams.map(e => e.id);
  if (!examIds.length) return '—';

  const { data, error } = await client
    .from('attempts')
    .select('total_score, accuracy')
    .in('scheduled_exam_id', examIds)
    .not('submitted_at', 'is', null);

  if (error || !data || !data.length) return '—';

  const totalScore = data.reduce((sum, a) => sum + (Number(a.total_score) || 0), 0);
  const avg = (totalScore / data.length).toFixed(1);
  return avg;
}

// ══════════════════════════════════════════════════════════════════════════════
// RENDER EXAMS
// ══════════════════════════════════════════════════════════════════════════════

function renderExams() {
  if (!allExams.length) {
    document.getElementById('examsGrid').innerHTML = `
      <div class="col-span-2 text-center py-12">
        <i class="fas fa-inbox text-gray-300 text-5xl mb-3"></i>
        <p class="text-gray-500">No exams scheduled yet</p>
      </div>
    `;
    return;
  }

  const examsHTML = allExams.map(exam => renderExamCard(exam)).join('');
  document.getElementById('examsGrid').innerHTML = examsHTML;

  // Load attempt counts for each exam
  allExams.forEach(exam => {
    loadExamAttempts(exam.id);
  });
}

function renderExamCard(exam) {
  const now = new Date();
  const startTime = exam.start_datetime ? new Date(exam.start_datetime) : null;
  const endTime = exam.end_datetime ? new Date(exam.end_datetime) : null;

  let statusBadge = '';
  if (!exam.is_active) {
    statusBadge = '<span class="px-2 py-1 bg-gray-100 text-gray-600 text-xs font-semibold rounded-full">Inactive</span>';
  } else if (endTime && endTime < now) {
    statusBadge = '<span class="px-2 py-1 bg-red-100 text-red-600 text-xs font-semibold rounded-full">Expired</span>';
  } else if (startTime && startTime > now) {
    statusBadge = '<span class="px-2 py-1 bg-blue-100 text-blue-600 text-xs font-semibold rounded-full">Upcoming</span>';
  } else {
    statusBadge = '<span class="px-2 py-1 bg-green-100 text-green-600 text-xs font-semibold rounded-full">Live</span>';
  }

  const pattern = exam.exam_patterns || {};
  const examName = pattern.pattern_name || 'Exam';
  const duration = pattern.duration_minutes || '—';
  const totalMarks = pattern.total_marks || '—';

  const startStr = startTime ? formatDateTime(startTime) : 'Not set';
  const endStr = endTime ? formatDateTime(endTime) : 'Not set';

  return `
    <div class="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
      <!-- Header -->
      <div class="flex items-start justify-between mb-4">
        <div class="flex-1">
          <h3 class="font-bold text-gray-900 text-lg mb-1">${examName}</h3>
          <p class="text-sm text-gray-500">
            <i class="fas fa-clock mr-1"></i>${duration} min  |  
            <i class="fas fa-star mr-1"></i>${totalMarks} marks
          </p>
        </div>
        ${statusBadge}
      </div>

      <!-- Time Info -->
      <div class="bg-gray-50 rounded-xl p-3 mb-4 space-y-1 text-xs">
        <p class="text-gray-600"><i class="fas fa-calendar-start w-4"></i> <strong>Start:</strong> ${startStr}</p>
        <p class="text-gray-600"><i class="fas fa-calendar-check w-4"></i> <strong>End:</strong> ${endStr}</p>
      </div>

      <!-- Passkey -->
      ${exam.passkey ? `
        <div class="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-xs text-blue-600 font-semibold mb-1">Exam Passkey</p>
              <p class="text-2xl font-mono font-bold text-blue-900 tracking-wider">${exam.passkey}</p>
            </div>
            <div class="flex gap-2">
              <button onclick="copyPasskey('${exam.passkey}')"
                class="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-lg font-semibold transition">
                <i class="fas fa-copy"></i>
              </button>
              <button onclick="regeneratePasskey('${exam.id}')"
                class="px-3 py-2 bg-gray-600 hover:bg-gray-700 text-white text-xs rounded-lg font-semibold transition">
                <i class="fas fa-sync"></i>
              </button>
            </div>
          </div>
        </div>
      ` : ''}

      <!-- Attempt Stats -->
      <div id="examStats_${exam.id}" class="mb-4 text-sm text-gray-500">
        <i class="fas fa-spinner fa-spin"></i> Loading stats...
      </div>

      <!-- Actions -->
      <div class="flex gap-2">
        <button onclick="viewResults('${exam.id}')"
          class="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold text-sm transition">
          <i class="fas fa-chart-bar mr-2"></i>View Results
        </button>
        <button onclick="downloadPDFReport('${exam.id}')"
          class="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold text-sm transition">
          <i class="fas fa-file-pdf mr-2"></i>Download PDF
        </button>
      </div>

      <!-- Toggle Active -->
      <button id="toggleBtn_${exam.id}" onclick="toggleExamActive('${exam.id}', ${exam.is_active})"
        class="w-full mt-2 px-4 py-2 ${exam.is_active ? 'bg-red-50 hover:bg-red-100 text-red-600' : 'bg-green-50 hover:bg-green-100 text-green-600'} rounded-lg font-semibold text-sm transition">
        <i class="fas fa-${exam.is_active ? 'ban' : 'check-circle'} mr-2"></i>${exam.is_active ? 'Deactivate' : 'Activate'} Exam
      </button>
    </div>
  `;
}

async function loadExamAttempts(examId) {
  const { data, error } = await client
    .from('attempts')
    .select('id, user_id, submitted_at')
    .eq('scheduled_exam_id', examId);

  if (error) {
    document.getElementById(`examStats_${examId}`).innerHTML = 
      '<p class="text-red-600">Failed to load stats</p>';
    return;
  }

  const attempted = data.filter(a => a.submitted_at).length;
  const total = allStudents.length;

  document.getElementById(`examStats_${examId}`).innerHTML = `
    <p><strong>${attempted}/${total}</strong> students attempted</p>
    ${attempted < total ? `<p class="text-orange-600 text-xs mt-1"><i class="fas fa-exclamation-triangle mr-1"></i>${total - attempted} students haven't attempted</p>` : ''}
  `;

  // Hide/disable deactivate button if exam has attempts
  const toggleBtn = document.getElementById(`toggleBtn_${examId}`);
  if (toggleBtn && attempted > 0) {
    toggleBtn.style.display = 'none';
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// ACTIONS
// ══════════════════════════════════════════════════════════════════════════════

window.copyPasskey = function(passkey) {
  navigator.clipboard.writeText(passkey).then(() => {
    showToast(`Passkey ${passkey} copied!`);
  });
};

window.regeneratePasskey = async function(examId) {
  if (!confirm('Regenerate passkey? The old code will stop working.')) return;

  const newPasskey = Math.floor(1000 + Math.random() * 9000).toString();

  const { error } = await client
    .from('scheduled_exams')
    .update({ passkey: newPasskey })
    .eq('id', examId);

  if (error) {
    showToast('Failed to regenerate passkey', 'error');
    return;
  }

  showToast(`New passkey: ${newPasskey}`);
  await loadExams();
  renderExams();
};

window.toggleExamActive = async function(examId, currentStatus) {
  const newStatus = !currentStatus;
  const action = newStatus ? 'activate' : 'deactivate';

  if (!confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} this exam?`)) return;

  const { error } = await client
    .from('scheduled_exams')
    .update({ is_active: newStatus })
    .eq('id', examId);

  if (error) {
    showToast('Failed to update exam status', 'error');
    return;
  }

  showToast(`Exam ${action}d successfully`);
  await loadExams();
  renderExams();
};

window.viewResults = async function(examId) {
  const exam = allExams.find(e => e.id === examId);
  if (!exam) return;

  const { data: attempts, error } = await client
    .from('attempts')
    .select('user_id, total_score, accuracy, time_taken, submitted_at')
    .eq('scheduled_exam_id', examId)
    .not('submitted_at', 'is', null)
    .order('total_score', { ascending: false });

  if (error || !attempts) {
    showToast('Failed to load results', 'error');
    return;
  }

  const pattern = exam.exam_patterns || {};
  const examName = pattern.pattern_name || 'Exam';
  const totalMarks = pattern.total_marks || '—';

  // Create modal
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    padding: 20px;
  `;

  let resultsHTML = '';
  
  if (!attempts.length) {
    resultsHTML = `
      <div class="text-center py-12">
        <i class="fas fa-inbox text-gray-300 text-5xl mb-3"></i>
        <p class="text-gray-500">No submissions yet</p>
      </div>
    `;
  } else {
    resultsHTML = `
      <div style="max-height: 400px; overflow-y: auto;">
        <table style="width: 100%; border-collapse: collapse;">
          <thead style="position: sticky; top: 0; background: #1e40af; color: white;">
            <tr>
              <th style="padding: 10px; text-align: center; font-size: 12px;">Rank</th>
              <th style="padding: 10px; text-align: left; font-size: 12px;">Student Name</th>
              <th style="padding: 10px; text-align: center; font-size: 12px;">Score</th>
              <th style="padding: 10px; text-align: center; font-size: 12px;">Accuracy</th>
              <th style="padding: 10px; text-align: center; font-size: 12px;">Time</th>
            </tr>
          </thead>
          <tbody>
    `;

    attempts.forEach((attempt, idx) => {
      const name = getStudentName(attempt.user_id);
      const score = attempt.total_score || 0;
      const acc = attempt.accuracy || 0;
      const time = attempt.time_taken ? `${Math.floor(attempt.time_taken / 60)} min` : '-';

      const rowBg = idx % 2 === 0 ? '#f8fafc' : '#ffffff';

      resultsHTML += `
        <tr style="background: ${rowBg};">
          <td style="padding: 12px; text-align: center; font-weight: bold; color: #64748b; font-size: 13px;">#${idx + 1}</td>
          <td style="padding: 12px; font-weight: 600; color: #1e293b; font-size: 13px;">${name}</td>
          <td style="padding: 12px; text-align: center; font-weight: bold; color: #2563eb; font-size: 13px;">${score}/${totalMarks}</td>
          <td style="padding: 12px; text-align: center; color: ${acc >= 80 ? '#16a34a' : acc >= 60 ? '#ea580c' : '#dc2626'}; font-weight: 600; font-size: 13px;">${acc.toFixed(1)}%</td>
          <td style="padding: 12px; text-align: center; color: #64748b; font-size: 13px;">${time}</td>
        </tr>
      `;
    });

    resultsHTML += `
          </tbody>
        </table>
      </div>
    `;
  }

  modal.innerHTML = `
    <div style="background: white; border-radius: 16px; padding: 0; max-width: 700px; width: 100%; max-height: 90vh; overflow: hidden; display: flex; flex-direction: column;">
      <!-- Header -->
      <div style="background: linear-gradient(135deg, #1e40af, #3730a3); padding: 24px; color: white;">
        <h2 style="font-size: 20px; font-weight: bold; margin: 0 0 8px 0;">Results - ${examName}</h2>
        <p style="font-size: 14px; opacity: 0.9; margin: 0;">${attempts.length} submission${attempts.length !== 1 ? 's' : ''}</p>
      </div>

      <!-- Results -->
      <div style="flex: 1; overflow: hidden;">
        ${resultsHTML}
      </div>

      <!-- Footer -->
      <div style="padding: 16px 24px; border-top: 1px solid #e2e8f0; background: #f8fafc;">
        <button onclick="this.closest('div[style*=\\'position: fixed\\']').remove()"
          style="width: 100%; padding: 12px; background: #3b82f6; color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 14px;">
          Close
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Close on outside click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });
};

// ══════════════════════════════════════════════════════════════════════════════
// PDF REPORT GENERATION — WORLD-CLASS PROFESSIONAL VERSION
// ══════════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════════
// PROFESSIONAL PDF REPORT - MODERN DESIGN
// ══════════════════════════════════════════════════════════════════════════════

window.downloadPDFReport = async function(examId) {
  const exam = allExams.find(e => e.id === examId);
  if (!exam) return;

  showToast('Generating professional report...');

  // Fetch data
  const { data: attempts, error } = await client
    .from('attempts')
    .select('user_id, total_score, accuracy, time_taken, submitted_at')
    .eq('scheduled_exam_id', examId)
    .order('total_score', { ascending: false });

  if (error) {
    showToast('Failed to fetch data', 'error');
    return;
  }

  const submitted = attempts.filter(a => a.submitted_at);
  const notAttempted = allStudents.filter(s => !attempts.find(a => a.user_id === s.id));

  // Initialize PDF
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  const pattern = exam.exam_patterns || {};
  const examName = pattern.pattern_name || 'Exam';
  const duration = pattern.duration_minutes || '—';
  const totalMarks = pattern.total_marks || '—';

  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  const margin = 15;

  // Statistics
  const avgScore = submitted.length ? (submitted.reduce((sum, a) => sum + (Number(a.total_score) || 0), 0) / submitted.length).toFixed(1) : 0;
  const highest = submitted.length ? Math.max(...submitted.map(a => Number(a.total_score) || 0)) : 0;
  const passingScore = totalMarks * 0.4;
  const passed = submitted.filter(a => a.total_score >= passingScore).length;
  const failed = submitted.filter(a => a.total_score < passingScore).length;
  const passRate = submitted.length ? ((passed / submitted.length) * 100).toFixed(0) : 0;

  // ═══════════════════════════════════════════════════════════
  // MODERN HEADER WITH GRADIENT EFFECT
  // ═══════════════════════════════════════════════════════════
  
  // Multi-layer header for depth
  doc.setFillColor(30, 64, 175);
  doc.rect(0, 0, pageWidth, 50, 'F');
  
  doc.setFillColor(59, 130, 246);
  for (let i = 0; i < 20; i++) {
    doc.setFillColor(30 + i * 1.5, 64 + i * 3, 175 + i * 0.4);
    doc.rect(0, i * 2.5, pageWidth, 2.5, 'F');
  }

  // Title
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('PERFORMANCE REPORT', pageWidth / 2, 20, { align: 'center' });

  // Coaching name
  doc.setFontSize(16);
  doc.text(coachingData.name, pageWidth / 2, 32, { align: 'center' });

  // Date
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  const reportDate = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  doc.text(`${coachingData.city || ''} | ${reportDate}`, pageWidth / 2, 43, { align: 'center' });

  let yPos = 60;

  // ═══════════════════════════════════════════════════════════
  // EXAM INFO - Colored Box
  // ═══════════════════════════════════════════════════════════
  
  doc.setFillColor(240, 249, 255);
  doc.roundedRect(margin, yPos, pageWidth - 2 * margin, 20, 3, 3, 'F');
  
  doc.setFillColor(59, 130, 246);
  doc.roundedRect(margin, yPos, 4, 20, 3, 3, 'F');

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 64, 175);
  doc.text(examName, margin + 8, yPos + 8);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(`${duration} min  |  ${totalMarks} marks  |  Pass: ${passingScore.toFixed(0)} (40%)`, margin + 8, yPos + 15);

  yPos += 28;

  // ═══════════════════════════════════════════════════════════
  // PERFORMANCE SUMMARY - 3 Big Cards
  // ═══════════════════════════════════════════════════════════
  
  const cardWidth = (pageWidth - 2 * margin - 10) / 3;
  const cardHeight = 28;
  
  const cards = [
    { label: 'PASSED', value: passed, color: [34, 197, 94], bgColor: [240, 253, 244] },
    { label: 'FAILED', value: failed, color: [239, 68, 68], bgColor: [254, 242, 242] },
    { label: 'PASS RATE', value: `${passRate}%`, color: [59, 130, 246], bgColor: [239, 246, 255] }
  ];

  cards.forEach((card, idx) => {
    const x = margin + idx * (cardWidth + 5);
    
    // Card background
    doc.setFillColor(...card.bgColor);
    doc.roundedRect(x, yPos, cardWidth, cardHeight, 4, 4, 'F');
    
    // Left accent
    doc.setFillColor(...card.color);
    doc.roundedRect(x, yPos, 3, cardHeight, 4, 4, 'F');
    
    // Label
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text(card.label, x + 8, yPos + 10);
    
    // Value - BIG
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...card.color);
    doc.text(card.value.toString(), x + 8, yPos + 22);
  });

  yPos += cardHeight + 15;

  // ═══════════════════════════════════════════════════════════
  // KEY METRICS - 6 Small Boxes in Grid
  // ═══════════════════════════════════════════════════════════
  
  const metrics = [
    { label: 'Total Students', value: allStudents.length, icon: '👥', color: [59, 130, 246] },
    { label: 'Attempted', value: submitted.length, icon: '✓', color: [34, 197, 94] },
    { label: 'Absent', value: notAttempted.length, icon: '✗', color: [239, 68, 68] },
    { label: 'Average', value: `${avgScore}/${totalMarks}`, icon: '📊', color: [168, 85, 247] },
    { label: 'Highest', value: highest, icon: '⭐', color: [251, 191, 36] },
    { label: 'Lowest', value: submitted.length ? Math.min(...submitted.map(a => a.total_score)) : 0, icon: '📉', color: [249, 115, 22] }
  ];

  const metricWidth = (pageWidth - 2 * margin - 10) / 3;
  const metricHeight = 18;

  metrics.forEach((metric, idx) => {
    const row = Math.floor(idx / 3);
    const col = idx % 3;
    const x = margin + col * (metricWidth + 5);
    const y = yPos + row * (metricHeight + 5);
    
    // Box
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(...metric.color);
    doc.setLineWidth(1.5);
    doc.roundedRect(x, y, metricWidth, metricHeight, 3, 3, 'FD');
    
    // Icon circle
    doc.setFillColor(...metric.color);
    doc.circle(x + 7, y + metricHeight / 2, 4, 'F');
    
    // Label
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(metric.label, x + 14, y + 8);
    
    // Value
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text(metric.value.toString(), x + 14, y + 14);
  });

  yPos += 2 * (metricHeight + 5) + 15;

  // ═══════════════════════════════════════════════════════════
  // TOP PERFORMERS TABLE - Modern Style
  // ═══════════════════════════════════════════════════════════

  if (submitted.length > 0) {
    // Section header
    doc.setFillColor(248, 250, 252);
    doc.rect(margin, yPos, pageWidth - 2 * margin, 8, 'F');
    doc.setFillColor(59, 130, 246);
    doc.rect(margin, yPos, 3, 8, 'F');
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 64, 175);
    doc.text('TOP PERFORMERS', margin + 6, yPos + 5.5);
    
    yPos += 12;

    const topPerformers = submitted.slice(0, 10);
    const tableData = topPerformers.map((attempt, idx) => {
      const name = getStudentName(attempt.user_id);
      const isPassed = attempt.total_score >= passingScore;
      return [
        idx + 1,
        name,
        `${attempt.total_score}/${totalMarks}`,
        `${(attempt.accuracy || 0).toFixed(1)}%`,
        isPassed ? 'PASS' : 'FAIL'
      ];
    });

    doc.autoTable({
      startY: yPos,
      head: [['#', 'Student Name', 'Score', 'Accuracy', 'Status']],
      body: tableData,
      theme: 'grid',
      headStyles: { 
        fillColor: [30, 64, 175],
        textColor: [255, 255, 255],
        fontSize: 9,
        fontStyle: 'bold',
        halign: 'center',
        cellPadding: 3
      },
      bodyStyles: { 
        fontSize: 9,
        textColor: [51, 65, 85],
        cellPadding: 2.5
      },
      columnStyles: {
        0: { cellWidth: 12, halign: 'center' },
        1: { cellWidth: 70, halign: 'left' },
        2: { cellWidth: 25, halign: 'center' },
        3: { cellWidth: 25, halign: 'center' },
        4: { cellWidth: 25, halign: 'center', fontStyle: 'bold' }
      },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      margin: { left: margin, right: margin },
      didParseCell: function(data) {
        if (data.column.index === 4) {
          if (data.cell.text[0].includes('PASS')) {
            data.cell.styles.textColor = [34, 197, 94];
            data.cell.styles.fillColor = [240, 253, 244];
          } else {
            data.cell.styles.textColor = [239, 68, 68];
            data.cell.styles.fillColor = [254, 242, 242];
          }
        }
      }
    });

    yPos = doc.lastAutoTable.finalY + 10;
  }

  // ═══════════════════════════════════════════════════════════
  // SIGNATURE
  // ═══════════════════════════════════════════════════════════

  if (yPos > pageHeight - 50) {
    doc.addPage();
    yPos = 20;
  }

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 64, 175);
  doc.text('Verified By:', margin, yPos);
  
  doc.setFontSize(11);
  doc.setTextColor(51, 65, 85);
  doc.text(currentUser.user_metadata?.full_name || 'Teacher', margin, yPos + 8);
  
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.5);
  doc.line(pageWidth - margin - 50, yPos + 7, pageWidth - margin, yPos + 7);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('Signature', pageWidth - margin - 25, yPos + 12, { align: 'center' });

  // ═══════════════════════════════════════════════════════════
  // FOOTER (All Pages)
  // ═══════════════════════════════════════════════════════════

  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(margin, pageHeight - 15, pageWidth - margin, pageHeight - 15);
    
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    
    const timestamp = new Date().toLocaleString('en-IN', { 
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    doc.text(timestamp, margin, pageHeight - 9);
    doc.text(coachingData.name, pageWidth / 2, pageHeight - 9, { align: 'center' });
    doc.text(`Page ${i}/${pageCount}`, pageWidth - margin, pageHeight - 9, { align: 'right' });
  }

  // Save
  const fileName = `${coachingData.name.replace(/\s+/g, '_')}_${examName.replace(/\s+/g, '_')}_Report.pdf`;
  doc.save(fileName);

  showToast('Professional report downloaded!');
};

// ══════════════════════════════════════════════════════════════════════════════
// UTILITIES
// ══════════════════════════════════════════════════════════════════════════════

function formatDateTime(date) {
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function getStudentName(userId) {
  const student = allStudents.find(s => s.id === userId);
  if (!student) return 'Unknown Student';
  
  // Try full_name first, then email username, then 'Student'
  if (student.full_name && student.full_name.trim()) {
    return student.full_name;
  }
  
  if (student.user_email) {
    return student.user_email.split('@')[0]; // Use email before @
  }
  
  return 'Student';
}

function showToast(msg, type = 'success') {
  const toast = document.createElement('div');
  toast.style.cssText = `
    padding: 12px 20px;
    background: ${type === 'error' ? '#fee2e2' : '#d1fae5'};
    color: ${type === 'error' ? '#991b1b' : '#065f46'};
    border: 1px solid ${type === 'error' ? '#fca5a5' : '#6ee7b7'};
    border-radius: 12px;
    font-size: 14px;
    font-weight: 600;
    margin-bottom: 10px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    max-width: 320px;
  `;
  toast.textContent = msg;
  document.getElementById('toast-container').appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

// ══════════════════════════════════════════════════════════════════════════════
// COPY JOIN LINK
// ══════════════════════════════════════════════════════════════════════════════

window.copyJoinLink = function() {
  const link = document.getElementById('joinLink').textContent;
  navigator.clipboard.writeText(link).then(() => {
    showToast('Join link copied!');
  }).catch(() => {
    showToast('Failed to copy link', 'error');
  });
};

// ══════════════════════════════════════════════════════════════════════════════
// LOGOUT
// ══════════════════════════════════════════════════════════════════════════════

window.logout = async function() {
  if (!confirm('Logout from teacher portal?')) return;
  await client.auth.signOut();
  window.location.href = '/index.html';
};