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
let liveUpdateInterval = null;

// ══════════════════════════════════════════════════════════════════════════════
// LIVE UPDATE SYSTEM
// ══════════════════════════════════════════════════════════════════════════════

function startLiveUpdates() {
  console.log('🟢 Starting live updates...');
  
  // Show live indicator
  const indicator = document.getElementById('liveIndicator');
  if (indicator) {
    indicator.classList.remove('hidden');
    setTimeout(() => {
      indicator.style.transition = 'all 0.3s ease';
    }, 100);
  }

  // Refresh data every 30 seconds
  liveUpdateInterval = setInterval(async () => {
    console.log('🔄 Auto-refreshing dashboard data...');
    
    try {
      await loadStudents();
      await loadExams();
      
      // Visual feedback - pulse effect
      const indicator = document.getElementById('liveIndicator');
      if (indicator) {
        indicator.style.transform = 'scale(1.15)';
        indicator.style.boxShadow = '0 6px 30px rgba(16, 185, 129, 0.3)';
        setTimeout(() => {
          indicator.style.transform = 'scale(1)';
          indicator.style.boxShadow = '0 4px 20px rgba(0,0,0,0.1)';
        }, 300);
      }
    } catch (error) {
      console.error('❌ Live update error:', error);
    }
  }, 30000); // 30 seconds
}

function stopLiveUpdates() {
  console.log('🔴 Stopping live updates...');
  
  if (liveUpdateInterval) {
    clearInterval(liveUpdateInterval);
    liveUpdateInterval = null;
  }
  
  const indicator = document.getElementById('liveIndicator');
  if (indicator) {
    indicator.classList.add('hidden');
  }
}

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

  // Start live updates (auto-refresh every 30 seconds)
  startLiveUpdates();
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
  
  // Calculate average score from all completed attempts
  calculateAvgScore().then(avgScore => {
    const statsHTML = `
      <div class="stat-card slide-in" style="animation-delay: 0s">
        <div class="flex items-center justify-between mb-3">
          <div class="w-14 h-14 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg transform hover:scale-110 transition-transform">
            <i class="fas fa-users text-white text-2xl"></i>
          </div>
          <span class="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full">Total</span>
        </div>
        <p class="text-3xl font-bold text-gray-900 mb-1">${totalStudents}</p>
        <p class="text-sm text-gray-500 font-medium">Total Students</p>
      </div>

      <div class="stat-card slide-in" style="animation-delay: 0.1s">
        <div class="flex items-center justify-between mb-3">
          <div class="w-14 h-14 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center shadow-lg transform hover:scale-110 transition-transform">
            <i class="fas fa-clipboard-check text-white text-2xl"></i>
          </div>
          <span class="text-xs font-bold text-green-600 bg-green-50 px-3 py-1.5 rounded-full">Active</span>
        </div>
        <p class="text-3xl font-bold text-gray-900 mb-1">${totalExams}</p>
        <p class="text-sm text-gray-500 font-medium">Scheduled Exams</p>
      </div>

      <div class="stat-card slide-in" style="animation-delay: 0.2s">
        <div class="flex items-center justify-between mb-3">
          <div class="w-14 h-14 bg-gradient-to-br from-purple-500 to-pink-600 rounded-2xl flex items-center justify-center shadow-lg transform hover:scale-110 transition-transform">
            <i class="fas fa-chart-line text-white text-2xl"></i>
          </div>
          <span class="text-xs font-bold text-purple-600 bg-purple-50 px-3 py-1.5 rounded-full">Average</span>
        </div>
        <p class="text-3xl font-bold text-gray-900 mb-1">${avgScore}%</p>
        <p class="text-sm text-gray-500 font-medium">Avg Score</p>
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
  let cardClass = 'exam-card';
  
  if (!exam.is_active) {
    statusBadge = '<span class="px-3 py-1 bg-gray-100 text-gray-600 text-xs font-bold rounded-full">Inactive</span>';
  } else if (endTime && endTime < now) {
    statusBadge = '<span class="px-3 py-1 bg-red-100 text-red-600 text-xs font-bold rounded-full">Expired</span>';
  } else if (startTime && startTime > now) {
    statusBadge = '<span class="px-3 py-1 bg-blue-100 text-blue-600 text-xs font-bold rounded-full">Upcoming</span>';
  } else {
    statusBadge = '<span class="px-3 py-1 bg-green-100 text-green-600 text-xs font-bold rounded-full flex items-center gap-1.5"><span class="live-dot w-2 h-2 bg-green-500 rounded-full"></span>Live</span>';
    cardClass = 'exam-card live';
  }

  const pattern = exam.exam_patterns || {};
  const examName = pattern.pattern_name || 'Exam';
  const duration = pattern.duration_minutes || '—';
  const totalMarks = pattern.total_marks || '—';

  const startStr = startTime ? formatDateTime(startTime) : 'Not set';
  const endStr = endTime ? formatDateTime(endTime) : 'Not set';

  return `
    <div class="${cardClass}">
      <!-- Header -->
      <div class="flex items-start justify-between mb-4">
        <div class="flex-1">
          <h3 class="font-bold text-gray-900 text-xl mb-2">${examName}</h3>
          <div class="flex items-center gap-4 text-sm text-gray-500">
            <span><i class="fas fa-clock mr-1.5 text-blue-500"></i>${duration} min</span>
            <span><i class="fas fa-star mr-1.5 text-amber-500"></i>${totalMarks} marks</span>
          </div>
        </div>
        ${statusBadge}
      </div>

      <!-- Time Info -->
      <div class="bg-gradient-to-r from-gray-50 to-slate-50 rounded-xl p-3.5 mb-4 space-y-2 text-xs border border-gray-100">
        <p class="text-gray-600 flex items-center"><i class="fas fa-calendar-day w-4 mr-2 text-blue-500"></i> <strong class="mr-2">Start:</strong> ${startStr}</p>
        <p class="text-gray-600 flex items-center"><i class="fas fa-calendar-check w-4 mr-2 text-green-500"></i> <strong class="mr-2">End:</strong> ${endStr}</p>
      </div>

      <!-- Passkey with modern gradient -->
      ${exam.passkey ? `
        <div class="bg-gradient-to-br from-blue-50 via-indigo-50 to-blue-50 border-2 border-blue-200 rounded-2xl p-4 mb-4 relative overflow-hidden">
          <div class="absolute top-0 right-0 w-32 h-32 bg-blue-200 rounded-full filter blur-3xl opacity-30"></div>
          <div class="relative">
            <p class="text-xs text-blue-700 font-bold mb-1.5 uppercase tracking-wide">Exam Passkey</p>
            <div class="flex items-center justify-between">
              <p class="text-3xl font-mono font-black text-blue-900 tracking-widest">${exam.passkey}</p>
              <div class="flex gap-2">
                <button onclick="copyPasskey('${exam.passkey}')"
                  class="px-4 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white text-sm rounded-xl font-bold transition-all shadow-md hover:shadow-lg transform hover:-translate-y-0.5">
                  <i class="fas fa-copy"></i>
                </button>
                <button onclick="regeneratePasskey('${exam.id}')"
                  class="px-4 py-2.5 bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white text-sm rounded-xl font-bold transition-all shadow-md hover:shadow-lg transform hover:-translate-y-0.5">
                  <i class="fas fa-sync-alt"></i>
                </button>
              </div>
            </div>
          </div>
        </div>
      ` : ''}

      <!-- Attempt Stats -->
      <div id="examStats_${exam.id}" class="mb-4 text-sm text-gray-600 font-medium">
        <i class="fas fa-spinner fa-spin"></i> Loading stats...
      </div>

      <!-- Modern Action Buttons -->
      <div class="grid grid-cols-2 gap-3 mb-3">
        <button onclick="viewResults('${exam.id}')"
          class="px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-xl font-bold text-sm transition-all shadow-md hover:shadow-lg transform hover:-translate-y-0.5">
          <i class="fas fa-list-alt mr-2"></i>View Results
        </button>
        <button onclick="downloadPDFReport('${exam.id}')"
          class="px-4 py-3 bg-gradient-to-r from-green-600 to-emerald-700 hover:from-green-700 hover:to-emerald-800 text-white rounded-xl font-bold text-sm transition-all shadow-md hover:shadow-lg transform hover:-translate-y-0.5">
          <i class="fas fa-file-pdf mr-2"></i>Download PDF
        </button>
      </div>

      <!-- Toggle Button -->
      <button id="toggleBtn_${exam.id}" onclick="toggleExamActive('${exam.id}', ${exam.is_active})"
        class="w-full px-4 py-3 ${exam.is_active ? 'bg-red-50 hover:bg-red-100 text-red-700 border-2 border-red-200' : 'bg-green-50 hover:bg-green-100 text-green-700 border-2 border-green-200'} rounded-xl font-bold text-sm transition-all">
        <i class="fas fa-${exam.is_active ? 'ban' : 'check-circle'} mr-2"></i>${exam.is_active ? 'Deactivate' : 'Activate'} Exam
      </button>
    </div>
  `;
}
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

  // Calculate statistics
  const avgScore = submitted.length ? (submitted.reduce((sum, a) => sum + (Number(a.total_score) || 0), 0) / submitted.length).toFixed(1) : 0;
  const avgAcc = submitted.length ? (submitted.reduce((sum, a) => sum + (Number(a.accuracy) || 0), 0) / submitted.length).toFixed(1) : 0;
  const highest = submitted.length ? Math.max(...submitted.map(a => Number(a.total_score) || 0)) : 0;
  const lowest = submitted.length ? Math.min(...submitted.map(a => Number(a.total_score) || 0)) : 0;
  
  // Pass/Fail calculation (40% passing criteria)
  const passingScore = totalMarks * 0.4;
  const passed = submitted.filter(a => a.total_score >= passingScore).length;
  const failed = submitted.filter(a => a.total_score < passingScore).length;

  // ═══════════════════════════════════════════════════════════
  // PAGE BORDER (Optional - adds professional touch)
  // ═══════════════════════════════════════════════════════════
  
  doc.setDrawColor(30, 64, 175);
  doc.setLineWidth(2);
  doc.rect(5, 5, pageWidth - 10, pageHeight - 10, 'S');

  // ═══════════════════════════════════════════════════════════
  // HEADER SECTION
  // ═══════════════════════════════════════════════════════════
  
  // Blue header background
  doc.setFillColor(30, 64, 175);
  doc.rect(0, 0, pageWidth, 55, 'F');

  // Decorative corner elements
  doc.setFillColor(59, 130, 246);
  doc.circle(10, 10, 5, 'F');
  doc.circle(pageWidth - 10, 10, 5, 'F');

  // White separator line
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.5);
  doc.line(margin, 52, pageWidth - margin, 52);

  // Title
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('EXAM PERFORMANCE REPORT', pageWidth / 2, 20, { align: 'center' });

  // Coaching name
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(coachingData.name, pageWidth / 2, 32, { align: 'center' });

  // City & date
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const reportDate = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  doc.text(`${coachingData.city || 'India'} | Report Generated: ${reportDate}`, pageWidth / 2, 44, { align: 'center' });

  // ═══════════════════════════════════════════════════════════
  // EXAM INFO BOX
  // ═══════════════════════════════════════════════════════════
  
  let yPos = 65;

  // Light blue background box
  doc.setFillColor(239, 246, 255);
  doc.roundedRect(margin, yPos, pageWidth - 2 * margin, 20, 3, 3, 'F');

  // Exam name
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 64, 175);
  doc.text(examName, margin + 5, yPos + 7);

  // Exam details
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(`Duration: ${duration} min  |  Total Marks: ${totalMarks}  |  Passing: ${passingScore.toFixed(0)} marks (40%)`, margin + 5, yPos + 14);

  yPos += 28;

  // ═══════════════════════════════════════════════════════════
  // CLASS PERFORMANCE SUMMARY (NEW!)
  // ═══════════════════════════════════════════════════════════

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 64, 175);
  doc.text('CLASS PERFORMANCE', margin, yPos);
  yPos += 8;

  // Pass/Fail summary boxes
  const summaryBoxWidth = (pageWidth - 2 * margin - 10) / 3;
  const summaryBoxHeight = 22;

  // Passed box (Green)
  doc.setFillColor(236, 253, 245);
  doc.roundedRect(margin, yPos, summaryBoxWidth, summaryBoxHeight, 3, 3, 'F');
  doc.setFillColor(34, 197, 94);
  doc.roundedRect(margin, yPos, 3, summaryBoxHeight, 3, 3, 'F');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('Passed', margin + 8, yPos + 8);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(34, 197, 94);
  doc.text(passed.toString(), margin + 8, yPos + 18);

  // Failed box (Red)
  doc.setFillColor(254, 242, 242);
  doc.roundedRect(margin + summaryBoxWidth + 5, yPos, summaryBoxWidth, summaryBoxHeight, 3, 3, 'F');
  doc.setFillColor(239, 68, 68);
  doc.roundedRect(margin + summaryBoxWidth + 5, yPos, 3, summaryBoxHeight, 3, 3, 'F');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('Failed', margin + summaryBoxWidth + 13, yPos + 8);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(239, 68, 68);
  doc.text(failed.toString(), margin + summaryBoxWidth + 13, yPos + 18);

  // Pass Percentage (Blue)
  doc.setFillColor(239, 246, 255);
  doc.roundedRect(margin + 2 * (summaryBoxWidth + 5), yPos, summaryBoxWidth, summaryBoxHeight, 3, 3, 'F');
  doc.setFillColor(59, 130, 246);
  doc.roundedRect(margin + 2 * (summaryBoxWidth + 5), yPos, 3, summaryBoxHeight, 3, 3, 'F');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('Pass Rate', margin + 2 * (summaryBoxWidth + 5) + 8, yPos + 8);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(59, 130, 246);
  const passRate = submitted.length ? ((passed / submitted.length) * 100).toFixed(0) : 0;
  doc.text(`${passRate}%`, margin + 2 * (summaryBoxWidth + 5) + 8, yPos + 18);

  yPos += summaryBoxHeight + 12;

  // Decorative separator
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.5);
  doc.line(margin, yPos, pageWidth - margin, yPos);
  yPos += 8;

  // ═══════════════════════════════════════════════════════════
  // DETAILED STATISTICS
  // ═══════════════════════════════════════════════════════════

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 64, 175);
  doc.text('DETAILED STATISTICS', margin, yPos);
  yPos += 8;

  // Stats grid - 3 columns x 2 rows
  const statBoxWidth = (pageWidth - 2 * margin - 10) / 3;
  const statBoxHeight = 24;
  const statGap = 5;

  const stats = [
    { label: 'Total Students', value: allStudents.length.toString(), color: [59, 130, 246], bgColor: [239, 246, 255] },
    { label: 'Attempted', value: submitted.length.toString(), color: [34, 197, 94], bgColor: [240, 253, 244] },
    { label: 'Absent', value: notAttempted.length.toString(), color: [239, 68, 68], bgColor: [254, 242, 242] },
    { label: 'Average Score', value: `${avgScore} / ${totalMarks}`, color: [99, 102, 241], bgColor: [238, 242, 255] },
    { label: 'Highest Score', value: highest.toString(), color: [16, 185, 129], bgColor: [236, 253, 245] },
    { label: 'Avg Accuracy', value: `${avgAcc}%`, color: [168, 85, 247], bgColor: [250, 245, 255] }
  ];

  // Draw enhanced stat boxes
  stats.forEach((stat, idx) => {
    const row = Math.floor(idx / 3);
    const col = idx % 3;
    const x = margin + col * (statBoxWidth + statGap);
    const y = yPos + row * (statBoxHeight + statGap);

    // Shadow effect
    doc.setFillColor(200, 200, 200);
    doc.roundedRect(x + 0.5, y + 0.5, statBoxWidth, statBoxHeight, 3, 3, 'F');

    // Main box
    doc.setFillColor(...stat.bgColor);
    doc.roundedRect(x, y, statBoxWidth, statBoxHeight, 3, 3, 'F');

    // Left accent bar
    doc.setFillColor(...stat.color);
    doc.roundedRect(x, y, 3, statBoxHeight, 3, 3, 'F');

    // Icon circle
    doc.setFillColor(...stat.color);
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(1.5);
    doc.circle(x + 10, y + statBoxHeight / 2, 5, 'FD');

    // Label
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(stat.label, x + 18, y + 10);

    // Value
    doc.setFontSize(15);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...stat.color);
    doc.text(stat.value, x + 18, y + 19);
  });

  yPos += 2 * (statBoxHeight + statGap) + 12;

  // ═══════════════════════════════════════════════════════════
  // TOP PERFORMERS TABLE
  // ═══════════════════════════════════════════════════════════

  if (submitted.length > 0) {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 64, 175);
    doc.text('TOP PERFORMERS', margin, yPos);
    yPos += 5;

    const topPerformers = submitted.slice(0, Math.min(10, submitted.length));
    const tableData = topPerformers.map((attempt, idx) => {
      const name = getStudentName(attempt.user_id);
      const timeTaken = attempt.time_taken ? `${Math.floor(attempt.time_taken / 60)} min` : '-';
      const score = attempt.total_score || 0;
      const isPassed = score >= passingScore;
      const status = isPassed ? '✓ Pass' : '✗ Fail';
      
      return [
        idx + 1,
        name,
        `${score} / ${totalMarks}`,
        `${(attempt.accuracy || 0).toFixed(1)}%`,
        timeTaken,
        status
      ];
    });

    doc.autoTable({
      startY: yPos,
      head: [['Rank', 'Student Name', 'Score', 'Accuracy', 'Time', 'Status']],
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
        0: { cellWidth: 15, halign: 'center' },
        1: { cellWidth: 60, halign: 'left' },
        2: { cellWidth: 25, halign: 'center' },
        3: { cellWidth: 25, halign: 'center' },
        4: { cellWidth: 20, halign: 'center' },
        5: { cellWidth: 25, halign: 'center', fontStyle: 'bold' }
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: margin, right: margin },
      didParseCell: function(data) {
        // Color code the Status column
        if (data.column.index === 5) {
          if (data.cell.text[0].includes('Pass')) {
            data.cell.styles.textColor = [34, 197, 94]; // Green
          } else {
            data.cell.styles.textColor = [239, 68, 68]; // Red
          }
        }
      }
    });

    yPos = doc.lastAutoTable.finalY + 12;
  }

  // ═══════════════════════════════════════════════════════════
  // SCORE DISTRIBUTION (if space available)
  // ═══════════════════════════════════════════════════════════

  if (submitted.length > 0 && yPos < 210) {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 64, 175);
    doc.text('SCORE DISTRIBUTION', margin, yPos);
    yPos += 8;

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
      if (range.count > 0 && yPos < 250) {
        const percentage = (range.count / submitted.length) * 100;
        const barWidth = (percentage / 100) * (pageWidth - 2 * margin - 90);

        doc.setFillColor(...range.color);
        doc.roundedRect(margin, yPos - 4, barWidth, 6, 1, 1, 'F');

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(71, 85, 105);
        doc.text(`${range.label}: ${range.count} (${percentage.toFixed(0)}%)`, margin + barWidth + 5, yPos);

        yPos += 9;
      }
    });
  }

  // ═══════════════════════════════════════════════════════════
  // ABSENT STUDENTS (New page if needed)
  // ═══════════════════════════════════════════════════════════

  if (notAttempted.length > 0) {
    if (yPos > 235) {
      doc.addPage();
      yPos = 25;
      
      // Page border on new page
      doc.setDrawColor(30, 64, 175);
      doc.setLineWidth(2);
      doc.rect(5, 5, pageWidth - 10, pageHeight - 10, 'S');
    }

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(220, 38, 38);
    doc.text(`ABSENT STUDENTS (${notAttempted.length})`, margin, yPos);
    yPos += 8;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);

    notAttempted.forEach((student, idx) => {
      if (yPos > 265) {
        doc.addPage();
        yPos = 25;
        doc.setDrawColor(30, 64, 175);
        doc.setLineWidth(2);
        doc.rect(5, 5, pageWidth - 10, pageHeight - 10, 'S');
      }
      doc.text(`${idx + 1}. ${student.full_name || student.user_email?.split('@')[0] || 'Student'}`, margin + 5, yPos);
      yPos += 6;
    });
  }

  // ═══════════════════════════════════════════════════════════
  // SIGNATURE BLOCK (NEW!)
  // ═══════════════════════════════════════════════════════════

  const pageCount = doc.internal.getNumberOfPages();
  doc.setPage(pageCount);

  // Position signature block 50mm from bottom
  const sigYPos = pageHeight - 50;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 64, 175);
  doc.text('Verified & Approved By:', margin, sigYPos);

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(51, 65, 85);
  doc.text(currentUser.user_metadata?.full_name || 'Teacher', margin, sigYPos + 10);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('Instructor', margin, sigYPos + 16);

  // Signature line
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.5);
  doc.line(pageWidth - margin - 60, sigYPos + 15, pageWidth - margin, sigYPos + 15);
  doc.setFontSize(8);
  doc.text('Signature', pageWidth - margin - 30, sigYPos + 20, { align: 'center' });

  // ═══════════════════════════════════════════════════════════
  // FOOTER ON ALL PAGES
  // ═══════════════════════════════════════════════════════════

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);

    // Footer line
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.5);
    doc.line(margin, pageHeight - 22, pageWidth - margin, pageHeight - 22);

    // Branding
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 64, 175);
    doc.text('Powered by Courage Library', pageWidth / 2, pageHeight - 15, { align: 'center' });

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text('www.couragelibrary.in | Making Education Accessible', pageWidth / 2, pageHeight - 10, { align: 'center' });

    // Page number
    doc.setFontSize(8);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin, pageHeight - 12, { align: 'right' });

    // Generated timestamp
    const timestamp = new Date().toLocaleString('en-IN', { 
      day: '2-digit', 
      month: 'short', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    doc.text(`Generated: ${timestamp}`, margin, pageHeight - 12);
  }

  // ═══════════════════════════════════════════════════════════
  // SAVE PDF
  // ═══════════════════════════════════════════════════════════

  const fileName = `${coachingData.name.replace(/\s+/g, '_')}_${examName.replace(/\s+/g, '_')}_Report.pdf`;
  doc.save(fileName);

  showToast('Professional report downloaded successfully!');
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

window.logout = async function() {
  if (!confirm('Logout from teacher portal?')) return;
  
  // Stop live updates
  stopLiveUpdates();
  
  await client.auth.signOut();
  window.location.href = '/index.html';
};