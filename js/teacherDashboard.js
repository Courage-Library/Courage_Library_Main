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

  // Set header info
  document.getElementById('coachingName').textContent = coaching.name;
  document.getElementById('teacherName').textContent = profile.full_name || 'Teacher';

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
    .select('id, full_name, user_email, created_at')
    .eq('coaching_id', coachingData.id)
    .eq('role', 'student')
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
  // For now, show results in modal (can be expanded later)
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

  // Build results modal
  const pattern = exam.exam_patterns || {};
  const examName = pattern.pattern_name || 'Exam';

  let resultsHTML = '<div class="space-y-2">';
  
  if (!attempts.length) {
    resultsHTML += '<p class="text-gray-500 text-center py-8">No submissions yet</p>';
  } else {
    attempts.forEach((attempt, idx) => {
      const student = allStudents.find(s => s.id === attempt.user_id);
      const name = student?.full_name || 'Unknown';
      const score = attempt.total_score || 0;
      const acc = attempt.accuracy || 0;

      resultsHTML += `
        <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <div class="flex items-center gap-3">
            <span class="text-sm font-bold text-gray-500">#${idx + 1}</span>
            <span class="font-semibold text-gray-900">${name}</span>
          </div>
          <div class="flex items-center gap-4 text-sm">
            <span class="font-bold text-blue-600">${score}</span>
            <span class="text-gray-500">${acc.toFixed(1)}%</span>
          </div>
        </div>
      `;
    });
  }

  resultsHTML += '</div>';

  // Show modal (simplified version)
  alert(`Results for ${examName}\n\n${attempts.length} submissions\n\nCheck console for details or download PDF for full report.`);
  console.table(attempts);
};

// ══════════════════════════════════════════════════════════════════════════════
// PDF REPORT GENERATION — ENHANCED VERSION
// ══════════════════════════════════════════════════════════════════════════════

window.downloadPDFReport = async function(examId) {
  const exam = allExams.find(e => e.id === examId);
  if (!exam) return;

  showToast('Generating PDF report...');

  // Fetch all attempts for this exam
  const { data: attempts, error } = await client
    .from('attempts')
    .select('user_id, total_score, accuracy, time_taken, submitted_at')
    .eq('scheduled_exam_id', examId)
    .order('total_score', { ascending: false });

  if (error) {
    showToast('Failed to fetch data for PDF', 'error');
    return;
  }

  const submitted = attempts.filter(a => a.submitted_at);
  const notAttempted = allStudents.filter(s => !attempts.find(a => a.user_id === s.id));

  // Generate PDF
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  const pattern = exam.exam_patterns || {};
  const examName = pattern.pattern_name || 'Exam';
  const duration = pattern.duration_minutes || '—';
  const totalMarks = pattern.total_marks || '—';

  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;

  // ═══ HEADER WITH GRADIENT BACKGROUND ═══
  doc.setFillColor(29, 78, 216); // Blue-700
  doc.rect(0, 0, pageWidth, 45, 'F');

  // Logo placeholder (you can add actual logo later)
  doc.setFillColor(255, 255, 255);
  doc.circle(15, 15, 8, 'F');
  doc.setFontSize(8);
  doc.setTextColor(29, 78, 216);
  doc.text('CL', 12, 17);

  // Header text
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('EXAM PERFORMANCE REPORT', pageWidth / 2, 18, { align: 'center' });

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(coachingData.name, pageWidth / 2, 28, { align: 'center' });

  if (coachingData.city) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`📍 ${coachingData.city}`, pageWidth / 2, 36, { align: 'center' });
  }

  // ═══ EXAM DETAILS BOX ═══
  let yPos = 55;
  doc.setFillColor(239, 246, 255);
  doc.roundedRect(15, yPos, pageWidth - 30, 22, 3, 3, 'F');

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 64, 175);
  doc.text(examName, 20, yPos + 7);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(`Duration: ${duration} min  |  Total Marks: ${totalMarks}`, 20, yPos + 14);

  if (exam.start_datetime) {
    doc.text(`Date: ${formatDateTime(new Date(exam.start_datetime))}`, 20, yPos + 19);
  }

  yPos += 30;

  // ═══ QUICK STATS CARDS ═══
  const avgScore = submitted.length ? (submitted.reduce((sum, a) => sum + (Number(a.total_score) || 0), 0) / submitted.length).toFixed(1) : 0;
  const avgAcc = submitted.length ? (submitted.reduce((sum, a) => sum + (Number(a.accuracy) || 0), 0) / submitted.length).toFixed(1) : 0;
  const highest = submitted.length ? Math.max(...submitted.map(a => Number(a.total_score) || 0)) : 0;
  const lowest = submitted.length ? Math.min(...submitted.map(a => Number(a.total_score) || 0)) : 0;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('📊 PERFORMANCE OVERVIEW', 20, yPos);
  yPos += 8;

  // Stats cards in 2 rows
  const cardWidth = (pageWidth - 40) / 2;
  const cardHeight = 18;
  const cardGap = 5;

  // Row 1
  drawStatCard(doc, 15, yPos, cardWidth - 2.5, cardHeight, 'Total Students', allStudents.length.toString(), [59, 130, 246]);
  drawStatCard(doc, 15 + cardWidth + 2.5, yPos, cardWidth - 2.5, cardHeight, 'Attempted', submitted.length.toString(), [34, 197, 94]);
  yPos += cardHeight + cardGap;

  // Row 2
  drawStatCard(doc, 15, yPos, cardWidth - 2.5, cardHeight, 'Absent', notAttempted.length.toString(), [239, 68, 68]);
  drawStatCard(doc, 15 + cardWidth + 2.5, yPos, cardWidth - 2.5, cardHeight, 'Avg Score', `${avgScore}/${totalMarks}`, [99, 102, 241]);
  yPos += cardHeight + cardGap;

  // Row 3
  drawStatCard(doc, 15, yPos, cardWidth - 2.5, cardHeight, 'Highest', highest.toString(), [16, 185, 129]);
  drawStatCard(doc, 15 + cardWidth + 2.5, yPos, cardWidth - 2.5, cardHeight, 'Avg Accuracy', `${avgAcc}%`, [236, 72, 153]);
  yPos += cardHeight + 10;

  // ═══ TOP PERFORMERS TABLE ═══
  if (submitted.length) {
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('🏆 TOP PERFORMERS', 20, yPos);
    yPos += 5;

    const topPerformers = submitted.slice(0, Math.min(10, submitted.length));
    const tableData = topPerformers.map((attempt, idx) => {
      const student = allStudents.find(s => s.id === attempt.user_id);
      const timeTaken = attempt.time_taken ? `${Math.floor(attempt.time_taken / 60)}m` : '—';
      return [
        idx + 1,
        student?.full_name || 'Unknown',
        `${attempt.total_score || 0}/${totalMarks}`,
        `${(attempt.accuracy || 0).toFixed(1)}%`,
        timeTaken
      ];
    });

    doc.autoTable({
      startY: yPos,
      head: [['Rank', 'Student Name', 'Score', 'Accuracy', 'Time']],
      body: tableData,
      theme: 'striped',
      headStyles: { 
        fillColor: [37, 99, 235], 
        fontSize: 9,
        fontStyle: 'bold',
        halign: 'center'
      },
      bodyStyles: { 
        fontSize: 9,
        halign: 'center'
      },
      columnStyles: {
        0: { cellWidth: 15, halign: 'center' },
        1: { cellWidth: 70, halign: 'left' },
        2: { cellWidth: 30, halign: 'center' },
        3: { cellWidth: 30, halign: 'center' },
        4: { cellWidth: 25, halign: 'center' }
      },
      margin: { left: 15, right: 15 },
      alternateRowStyles: { fillColor: [248, 250, 252] }
    });

    yPos = doc.lastAutoTable.finalY + 10;
  }

  // ═══ PERFORMANCE DISTRIBUTION ═══
  if (submitted.length > 0 && yPos < 220) {
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('📈 SCORE DISTRIBUTION', 20, yPos);
    yPos += 8;

    // Calculate distribution
    const ranges = [
      { label: `${Math.floor(totalMarks * 0.9)}-${totalMarks}`, min: totalMarks * 0.9, color: [16, 185, 129] },
      { label: `${Math.floor(totalMarks * 0.7)}-${Math.floor(totalMarks * 0.89)}`, min: totalMarks * 0.7, color: [59, 130, 246] },
      { label: `${Math.floor(totalMarks * 0.5)}-${Math.floor(totalMarks * 0.69)}`, min: totalMarks * 0.5, color: [251, 191, 36] },
      { label: `${Math.floor(totalMarks * 0.3)}-${Math.floor(totalMarks * 0.49)}`, min: totalMarks * 0.3, color: [249, 115, 22] },
      { label: `0-${Math.floor(totalMarks * 0.29)}`, min: 0, color: [239, 68, 68] }
    ];

    ranges.forEach(range => {
      const count = submitted.filter(a => {
        const score = Number(a.total_score) || 0;
        const nextRange = ranges[ranges.indexOf(range) - 1];
        if (nextRange) {
          return score >= range.min && score < nextRange.min;
        } else {
          return score >= range.min;
        }
      }).length;

      if (count > 0) {
        const barWidth = (count / submitted.length) * 120;
        
        doc.setFillColor(...range.color);
        doc.roundedRect(20, yPos, barWidth, 6, 1, 1, 'F');
        
        doc.setFontSize(8);
        doc.setTextColor(71, 85, 105);
        doc.text(`${range.label}: ${count} student${count > 1 ? 's' : ''}`, 145, yPos + 4);
        
        yPos += 9;
      }
    });

    yPos += 5;
  }

  // ═══ ABSENT STUDENTS (if any) ═══
  if (notAttempted.length > 0) {
    if (yPos > 250) {
      doc.addPage();
      yPos = 20;
    }

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(220, 38, 38);
    doc.text(`❌ ABSENT STUDENTS (${notAttempted.length})`, 20, yPos);
    yPos += 8;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    
    notAttempted.forEach((student, idx) => {
      if (yPos > 280) {
        doc.addPage();
        yPos = 20;
      }
      doc.text(`${idx + 1}. ${student.full_name}`, 25, yPos);
      yPos += 6;
    });
  }

  // ═══ FOOTER ON ALL PAGES ═══
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    
    // Footer background
    doc.setFillColor(248, 250, 252);
    doc.rect(0, pageHeight - 15, pageWidth, 15, 'F');
    
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(59, 130, 246);
    doc.text('Powered by Courage Library', pageWidth / 2, pageHeight - 8, { align: 'center' });
    
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text('www.couragelibrary.in', pageWidth / 2, pageHeight - 4, { align: 'center' });
    
    // Page number
    doc.setFontSize(7);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - 20, pageHeight - 6, { align: 'right' });
    
    // Generated timestamp
    doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, 20, pageHeight - 6);
  }

  // ═══ SAVE PDF ═══
  const fileName = `${coachingData.name.replace(/\s+/g, '_')}_${examName.replace(/\s+/g, '_')}_Report.pdf`;
  doc.save(fileName);

  showToast('PDF downloaded successfully!');
};

// Helper function to draw stat cards
function drawStatCard(doc, x, y, width, height, label, value, color) {
  // Card background
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(x, y, width, height, 2, 2, 'F');
  
  // Border
  doc.setDrawColor(...color);
  doc.setLineWidth(0.5);
  doc.roundedRect(x, y, width, height, 2, 2, 'S');
  
  // Icon circle
  doc.setFillColor(...color);
  doc.circle(x + 8, y + height / 2, 4, 'F');
  
  // Label
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text(label, x + 15, y + height / 2 - 2);
  
  // Value
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...color);
  doc.text(value, x + 15, y + height / 2 + 5);
}

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

window.logout = async function() {
  if (!confirm('Logout from teacher portal?')) return;
  await client.auth.signOut();
  window.location.href = '/index.html';
};