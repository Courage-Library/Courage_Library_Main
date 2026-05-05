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
// PDF REPORT GENERATION — PROFESSIONAL VERSION (No Emojis, Proper Layout)
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
  const margin = 20;

  // ═══════════════════════════════════════════════════════════
  // HEADER SECTION
  // ═══════════════════════════════════════════════════════════
  
  // Blue header background
  doc.setFillColor(30, 64, 175); // Dark blue
  doc.rect(0, 0, pageWidth, 50, 'F');

  // White line separator
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.5);
  doc.line(margin, 48, pageWidth - margin, 48);

  // Title
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('EXAM PERFORMANCE REPORT', pageWidth / 2, 18, { align: 'center' });

  // Coaching name
  doc.setFontSize(14);
  doc.setFont('helvetica', 'normal');
  doc.text(coachingData.name, pageWidth / 2, 30, { align: 'center' });

  // City
  if (coachingData.city) {
    doc.setFontSize(10);
    doc.text(coachingData.city, pageWidth / 2, 40, { align: 'center' });
  }

  // ═══════════════════════════════════════════════════════════
  // EXAM INFO SECTION
  // ═══════════════════════════════════════════════════════════
  
  let yPos = 60;

  // Exam name
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 64, 175);
  doc.text(examName, margin, yPos);
  yPos += 10;

  // Exam details
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(`Duration: ${duration} minutes  |  Total Marks: ${totalMarks}`, margin, yPos);
  yPos += 6;

  if (exam.start_datetime) {
    const examDate = new Date(exam.start_datetime);
    doc.text(`Date: ${examDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} at ${examDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`, margin, yPos);
    yPos += 6;
  }

  // Horizontal line
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.line(margin, yPos + 2, pageWidth - margin, yPos + 2);
  yPos += 10;

  // ═══════════════════════════════════════════════════════════
  // STATISTICS SECTION - REDESIGNED WITH VISUAL APPEAL
  // ═══════════════════════════════════════════════════════════

  const avgScore = submitted.length ? (submitted.reduce((sum, a) => sum + (Number(a.total_score) || 0), 0) / submitted.length).toFixed(1) : 0;
  const avgAcc = submitted.length ? (submitted.reduce((sum, a) => sum + (Number(a.accuracy) || 0), 0) / submitted.length).toFixed(1) : 0;
  const highest = submitted.length ? Math.max(...submitted.map(a => Number(a.total_score) || 0)) : 0;
  const lowest = submitted.length ? Math.min(...submitted.map(a => Number(a.total_score) || 0)) : 0;

  // Section heading
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 64, 175);
  doc.text('PERFORMANCE SUMMARY', margin, yPos);
  yPos += 10;

  // Stats grid - 3 columns x 2 rows
  const statBoxWidth = (pageWidth - 2 * margin - 10) / 3;
  const statBoxHeight = 26;
  const statGap = 5;

  const stats = [
    { label: 'Total Students', value: allStudents.length.toString(), color: [59, 130, 246], bgColor: [239, 246, 255] },
    { label: 'Attempted', value: submitted.length.toString(), color: [34, 197, 94], bgColor: [240, 253, 244] },
    { label: 'Absent', value: notAttempted.length.toString(), color: [239, 68, 68], bgColor: [254, 242, 242] },
    { label: 'Average Score', value: `${avgScore} / ${totalMarks}`, color: [99, 102, 241], bgColor: [238, 242, 255] },
    { label: 'Highest Score', value: highest.toString(), color: [16, 185, 129], bgColor: [236, 253, 245] },
    { label: 'Avg Accuracy', value: `${avgAcc}%`, color: [168, 85, 247], bgColor: [250, 245, 255] }
  ];

  // Draw stats boxes with enhanced design
  stats.forEach((stat, idx) => {
    const row = Math.floor(idx / 3);
    const col = idx % 3;
    const x = margin + col * (statBoxWidth + statGap);
    const y = yPos + row * (statBoxHeight + statGap);

    // Shadow effect (subtle)
    doc.setFillColor(200, 200, 200);
    doc.roundedRect(x + 0.5, y + 0.5, statBoxWidth, statBoxHeight, 3, 3, 'F');

    // Main box with gradient-like background
    doc.setFillColor(...stat.bgColor);
    doc.roundedRect(x, y, statBoxWidth, statBoxHeight, 3, 3, 'F');

    // Left colored accent bar
    doc.setFillColor(...stat.color);
    doc.roundedRect(x, y, 3, statBoxHeight, 3, 3, 'F');

    // Icon circle (simple geometric)
    doc.setFillColor(...stat.color);
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(1.5);
    doc.circle(x + 10, y + statBoxHeight / 2, 5, 'FD');

    // Label (smaller, gray)
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(stat.label, x + 18, y + 10);

    // Value (large, colored, bold)
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...stat.color);
    doc.text(stat.value, x + 18, y + 20);
  });

  yPos += 2 * (statBoxHeight + statGap) + 12;

  // ═══════════════════════════════════════════════════════════
  // TOP PERFORMERS TABLE
  // ═══════════════════════════════════════════════════════════

  if (submitted.length > 0) {
    // Section heading
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 64, 175);
    doc.text('TOP PERFORMERS', margin, yPos);
    yPos += 5;

    const topPerformers = submitted.slice(0, Math.min(10, submitted.length));
    const tableData = topPerformers.map((attempt, idx) => {
      const student = allStudents.find(s => s.id === attempt.user_id);
      const timeTaken = attempt.time_taken ? `${Math.floor(attempt.time_taken / 60)} min` : '-';
      return [
        idx + 1,
        student?.full_name || 'Student',
        `${attempt.total_score || 0} / ${totalMarks}`,
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
        fillColor: [30, 64, 175],
        textColor: [255, 255, 255],
        fontSize: 9,
        fontStyle: 'bold',
        halign: 'center'
      },
      bodyStyles: { 
        fontSize: 9,
        textColor: [51, 65, 85]
      },
      columnStyles: {
        0: { cellWidth: 20, halign: 'center' },
        1: { cellWidth: 70, halign: 'left' },
        2: { cellWidth: 30, halign: 'center' },
        3: { cellWidth: 30, halign: 'center' },
        4: { cellWidth: 25, halign: 'center' }
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: margin, right: margin }
    });

    yPos = doc.lastAutoTable.finalY + 12;
  }

  // ═══════════════════════════════════════════════════════════
  // SCORE DISTRIBUTION
  // ═══════════════════════════════════════════════════════════

  if (submitted.length > 0 && yPos < 220) {
    // Section heading
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 64, 175);
    doc.text('SCORE DISTRIBUTION', margin, yPos);
    yPos += 8;

    // Calculate distribution ranges
    const excellent = submitted.filter(a => (a.total_score / totalMarks) >= 0.9).length;
    const good = submitted.filter(a => (a.total_score / totalMarks) >= 0.7 && (a.total_score / totalMarks) < 0.9).length;
    const average = submitted.filter(a => (a.total_score / totalMarks) >= 0.5 && (a.total_score / totalMarks) < 0.7).length;
    const belowAvg = submitted.filter(a => (a.total_score / totalMarks) >= 0.3 && (a.total_score / totalMarks) < 0.5).length;
    const poor = submitted.filter(a => (a.total_score / totalMarks) < 0.3).length;

    const distribution = [
      { label: 'Excellent (90-100%)', count: excellent, color: [16, 185, 129] },
      { label: 'Good (70-89%)', count: good, color: [59, 130, 246] },
      { label: 'Average (50-69%)', count: average, color: [251, 191, 36] },
      { label: 'Below Average (30-49%)', count: belowAvg, color: [249, 115, 22] },
      { label: 'Poor (0-29%)', count: poor, color: [239, 68, 68] }
    ];

    distribution.forEach(range => {
      if (range.count > 0) {
        const percentage = (range.count / submitted.length) * 100;
        const barWidth = (percentage / 100) * (pageWidth - 2 * margin - 80);

        // Bar
        doc.setFillColor(...range.color);
        doc.roundedRect(margin, yPos - 4, barWidth, 6, 1, 1, 'F');

        // Label
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(71, 85, 105);
        doc.text(`${range.label}: ${range.count} student${range.count > 1 ? 's' : ''}`, margin + barWidth + 5, yPos);

        yPos += 10;
      }
    });

    yPos += 5;
  }

  // ═══════════════════════════════════════════════════════════
  // ABSENT STUDENTS
  // ═══════════════════════════════════════════════════════════

  if (notAttempted.length > 0) {
    if (yPos > 240) {
      doc.addPage();
      yPos = 25;
    }

    // Section heading
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(220, 38, 38);
    doc.text(`ABSENT STUDENTS (${notAttempted.length})`, margin, yPos);
    yPos += 8;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);

    notAttempted.forEach((student, idx) => {
      if (yPos > 275) {
        doc.addPage();
        yPos = 25;
      }
      doc.text(`${idx + 1}. ${student.full_name}`, margin + 5, yPos);
      yPos += 6;
    });
  }

  // ═══════════════════════════════════════════════════════════
  // FOOTER ON ALL PAGES
  // ═══════════════════════════════════════════════════════════

  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);

    // Footer line
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    doc.line(margin, pageHeight - 20, pageWidth - margin, pageHeight - 20);

    // Branding
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 64, 175);
    doc.text('Powered by Courage Library', pageWidth / 2, pageHeight - 13, { align: 'center' });

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text('www.couragelibrary.in', pageWidth / 2, pageHeight - 8, { align: 'center' });

    // Page number (right)
    doc.setFontSize(8);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin, pageHeight - 10, { align: 'right' });

    // Generated timestamp (left)
    const timestamp = new Date().toLocaleString('en-IN', { 
      day: '2-digit', 
      month: 'short', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    doc.text(`Generated: ${timestamp}`, margin, pageHeight - 10);
  }

  // ═══════════════════════════════════════════════════════════
  // SAVE PDF
  // ═══════════════════════════════════════════════════════════

  const fileName = `${coachingData.name.replace(/\s+/g, '_')}_${examName.replace(/\s+/g, '_')}_Report.pdf`;
  doc.save(fileName);

  showToast('PDF downloaded successfully!');
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