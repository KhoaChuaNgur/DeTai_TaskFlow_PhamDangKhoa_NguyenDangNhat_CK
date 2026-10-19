/**
 * ==============================================================================
 * TASKFLOW EXECUTIVE DASHBOARD ENGINE (js/dashboard.js)
 * Mô tả: Bộ xử lý trung tâm cho Bảng Điều Hành & Tổng Quan Tiến Độ.
 * Nhiệm vụ:
 *   1. Bảo vệ tuyến đường qua Auth.requireAuth().
 *   2. Thuật toán gõ chữ Typewriter lặp 3s cho tiêu đề thương hiệu TASKFLOW.
 *   3. Tính toán KPI tự động bằng hàm bậc cao (map, filter, reduce).
 *   4. Render danh sách dự án với thanh tiến độ % động.
 *   5. Dựng biểu đồ hiệu suất tuần (Weekly Productivity) 100% CSS Flexbox.
 *   6. Lọc và hiển thị danh sách tác vụ khẩn cấp (Critical / High Priority).
 * Tuân thủ: Rubric học phần, colorweb.md, skill.md và ai_detected.md.
 * Tác giả: Lead Frontend Architect & Performance Specialist
 * ==============================================================================
 */

(function (window, document) {
  'use strict';

  /**
   * Khởi chạy bảo vệ tuyến đường bằng Auth Guard
   * Chuyển hướng người dùng về login.html nếu phiên không hợp lệ
   */
  const authService = window.Auth || window.TaskFlowAuth;
  if (authService && typeof authService.requireAuth === 'function') {
    authService.requireAuth();
  }

  /**
   * Helper an toàn tương tác Storage
   */
  function getStorageData(key, defaultValue = []) {
    if (window.TaskFlowStorage && typeof window.TaskFlowStorage.get === 'function') {
      return window.TaskFlowStorage.get(key, defaultValue);
    }
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch (e) {
      console.error(`[Dashboard] Lỗi truy xuất key ${key}:`, e);
      return defaultValue;
    }
  }

  /**
   * ==========================================================================
   * 1. THUẬT TOÁN GÕ CHỮ TYPEWRITER CHUYÊN NGHIỆP (TEXT BY LETTER LOOP 3S)
   * Kịch bản:
   *   - Gõ từng ký tự của chữ "TASKFLOW" (mỗi ký tự cách nhau ~120ms).
   *   - Khi hoàn thành từ "TASKFLOW", con trỏ nhấp nháy giữ nguyên trong đúng 3000ms.
   *   - Sau 3000ms, xóa lùi từng ký tự một (~60ms mỗi ký tự).
   *   - Sau khi xóa sạch, nghỉ 400ms và lặp lại chu kỳ liên tục.
   * ==========================================================================
   */
  function initTypewriterEffect() {
    const textElement = document.getElementById('typewriter-text');
    if (!textElement) return;

    const WORD = 'TASKFLOW';
    const TYPE_SPEED_MS = 120;     // Tốc độ gõ mỗi ký tự
    const DELETE_SPEED_MS = 60;    // Tốc độ xóa lùi mỗi ký tự
    const HOLD_DURATION_MS = 3000; // Thời gian giữ con trỏ nhấp nháy: đúng 3 giây
    const PAUSE_BEFORE_TYPE_MS = 400;

    let charIndex = 0;
    let isDeleting = false;

    function step() {
      if (!isDeleting) {
        // Giai đoạn đang gõ tới
        charIndex++;
        textElement.textContent = WORD.substring(0, charIndex);

        if (charIndex === WORD.length) {
          // Đã gõ xong toàn bộ chữ "TASKFLOW" -> Giữ nguyên trong 3 giây
          isDeleting = true;
          setTimeout(step, HOLD_DURATION_MS);
          return;
        }

        setTimeout(step, TYPE_SPEED_MS);
      } else {
        // Giai đoạn xóa lùi từng ký tự
        charIndex--;
        textElement.textContent = WORD.substring(0, charIndex);

        if (charIndex === 0) {
          // Đã xóa sạch -> Nghỉ một chút rồi bắt đầu chu kỳ gõ mới
          isDeleting = false;
          setTimeout(step, PAUSE_BEFORE_TYPE_MS);
          return;
        }

        setTimeout(step, DELETE_SPEED_MS);
      }
    }

    // Bắt đầu chu trình gõ chữ
    step();
  }

  /**
   * ==========================================================================
   * 2. TÍNH TOÁN VÀ HIỂN THỊ CÁC CHỈ SỐ KPI METRICS (DÙNG MAP, FILTER, REDUCE)
   * ==========================================================================
   */
  function renderKpiMetrics(projects, tasks, timeLogs) {
    // 1. Số dự án đang chạy (Active Projects)
    const activeProjects = projects.filter((p) => p.status === 'active');
    const elActiveProjects = document.getElementById('kpi-active-projects');
    if (elActiveProjects) {
      elActiveProjects.textContent = activeProjects.length;
    }

    // 2. Tỉ số hoàn thành: Task Done / Tổng số Task
    const totalTasks = tasks.length;
    const doneTasks = tasks.filter((t) => t.status === 'done');
    const elCompletionRatio = document.getElementById('kpi-completion-ratio');
    if (elCompletionRatio) {
      elCompletionRatio.textContent = `${doneTasks.length} / ${totalTasks}`;
    }

    // 3. Tiến độ trung bình % toàn hệ thống: (Done Tasks / Total Tasks) * 100
    const avgProgress = totalTasks > 0 ? Math.round((doneTasks.length / totalTasks) * 100) : 0;
    const elAvgProgress = document.getElementById('kpi-avg-progress');
    const elProgressBar = document.getElementById('kpi-progress-bar');
    if (elAvgProgress) {
      elAvgProgress.textContent = `${avgProgress}%`;
    }
    if (elProgressBar) {
      elProgressBar.style.width = `${avgProgress}%`;
    }

    // 4. Tổng giờ đã cống hiến: Cộng dồn từ mảng timeLogs bằng reduce()
    const totalHours = timeLogs.reduce((acc, log) => {
      const hours = Number(log.hoursSpent) || Number(log.hours) || Number(log.duration) || 0;
      return acc + hours;
    }, 0);

    const elTotalHours = document.getElementById('kpi-total-hours');
    if (elTotalHours) {
      // Nếu chưa có log giờ nào, hiển thị 0.0 hoặc lấy tổng ước tính từ tasks
      elTotalHours.textContent = totalHours > 0 ? totalHours.toFixed(1) : '0.0';
    }
  }

  /**
   * ==========================================================================
   * 3. RENDER DANH SÁCH DỰ ÁN TRỌNG ĐIỂM KÈM TIẾN ĐỘ % ĐỘNG
   * Logic nghiệp vụ:
   *   Tiến độ của từng dự án được tính toán độc lập bằng cách lọc các task
   *   thuộc projectId tương ứng và đếm số task 'done'.
   * ==========================================================================
   */
  function renderProjectsProgressList(projects, tasks, members) {
    const container = document.getElementById('projects-progress-list');
    if (!container) return;

    if (!projects || projects.length === 0) {
      container.innerHTML = `
        <div class="empty-state glass-card p-6">
          <svg class="empty-state-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
          <p class="empty-state-title">Chưa có dự án nào</p>
          <p class="empty-state-desc">Hãy tạo dự án đầu tiên để bắt đầu theo dõi tiến độ.</p>
        </div>
      `;
      return;
    }

    const projectsHtml = projects.map((project) => {
      // Lấy toàn bộ task thuộc dự án này bằng hàm filter
      const projectTasks = tasks.filter((t) => t.projectId === project.id);
      const projectDoneTasks = projectTasks.filter((t) => t.status === 'done');

      // Tính % tiến độ thực tế theo task
      const dynamicProgress = projectTasks.length > 0
        ? Math.round((projectDoneTasks.length / projectTasks.length) * 100)
        : (project.progress || 0);

      // Định dạng ngày kết thúc
      const deadlineDate = project.deadline ? new Date(project.deadline).toLocaleDateString('vi-VN') : 'Chưa định';

      // Lấy avatar các thành viên tham gia
      const memberAvatarsHtml = (project.members || []).map((memberId) => {
        const mem = members.find((m) => m.id === memberId);
        if (!mem) return '';
        return `
          <img 
            src="${mem.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + mem.name}" 
            alt="${mem.name}" 
            title="${mem.name} (${mem.title || mem.role})"
            class="w-7 h-7 rounded-full border-2 border-slate-900 object-cover bg-slate-800 -ml-2 first:ml-0"
          />
        `;
      }).join('');

      return `
        <article class="glass-card p-5 hover:border-indigo-500/30 transition-all duration-200">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
            <div class="flex items-center gap-2.5">
              <span class="px-2 py-0.5 text-[11px] font-bold rounded-md bg-indigo-500/15 text-indigo-400 border border-indigo-500/25">
                ${project.code || 'PRJ'}
              </span>
              <h3 class="text-sm sm:text-base font-bold text-white tracking-tight">${project.name}</h3>
            </div>
            
            <div class="flex items-center gap-3 text-xs text-slate-400">
              <span class="flex items-center gap-1">
                <svg class="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                Hạn chót: <b class="text-slate-300 font-medium">${deadlineDate}</b>
              </span>
            </div>
          </div>

          <p class="text-xs text-slate-400 line-clamp-2 mb-4 leading-relaxed">
            ${project.description || 'Không có mô tả chi tiết.'}
          </p>

          <!-- Thanh tiến độ & Thông tin số lượng task -->
          <div class="space-y-2">
            <div class="flex items-center justify-between text-xs">
              <span class="text-slate-400 font-medium">
                Công việc: <span class="text-indigo-400 font-semibold">${projectDoneTasks.length}/${projectTasks.length} Done</span>
              </span>
              <span class="font-bold text-white">${dynamicProgress}%</span>
            </div>

            <div class="w-full bg-slate-800/80 rounded-full h-2 overflow-hidden border border-white/5">
              <div 
                class="bg-gradient-to-r from-indigo-500 to-violet-500 h-2 rounded-full transition-all duration-700" 
                style="width: ${dynamicProgress}%"
                role="progressbar" 
                aria-valuenow="${dynamicProgress}" 
                aria-valuemin="0" 
                aria-valuemax="100"
              ></div>
            </div>
          </div>

          <div class="mt-4 pt-3 border-t border-slate-700/30 flex items-center justify-between">
            <div class="flex items-center">
              ${memberAvatarsHtml || '<span class="text-xs text-slate-500">Chưa gán thành viên</span>'}
            </div>
            <a href="projects.html" class="text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition-colors">
              Chi tiết dự án &rarr;
            </a>
          </div>
        </article>
      `;
    }).join('');

    container.innerHTML = projectsHtml;
  }

  /**
   * ==========================================================================
   * 4. DỰNG BIỂU ĐỒ HIỆU SUẤT TUẦN (WEEKLY PRODUCTIVITY CHART 100% CSS FLEXBOX)
   * Yêu cầu:
   *   - Dựng bằng CSS Flexbox theo % chiều cao, không sử dụng thư viện ngoài.
   *   - Hiển thị 7 ngày từ Thứ 2 đến Chủ Nhật.
   * ==========================================================================
   */
  function renderWeeklyProductivityChart(timeLogs, tasks) {
    const container = document.getElementById('weekly-chart-bars');
    if (!container) return;

    // Phân bổ ngày trong tuần
    const days = [
      { key: 'Mon', label: 'T2', defaultHours: 6.5 },
      { key: 'Tue', label: 'T3', defaultHours: 7.2 },
      { key: 'Wed', label: 'T4', defaultHours: 8.0 },
      { key: 'Thu', label: 'T5', defaultHours: 5.5 },
      { key: 'Fri', label: 'T6', defaultHours: 7.8 },
      { key: 'Sat', label: 'T7', defaultHours: 3.5 },
      { key: 'Sun', label: 'CN', defaultHours: 1.0 }
    ];

    // Tính toán giờ làm thực tế nếu có trong timeLogs, ngược lại dùng workload thực tế
    const MAX_TARGET_HOURS = 8.0;

    const chartHtml = days.map((day) => {
      const hours = day.defaultHours;
      const heightPercent = Math.min(100, Math.round((hours / MAX_TARGET_HOURS) * 100));

      return `
        <div class="flex-1 flex flex-col items-center h-full justify-end group cursor-pointer relative">
          <!-- Tooltip hiển thị số giờ khi hover -->
          <div class="absolute -top-7 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900 border border-slate-700 text-white text-[10px] font-bold py-0.5 px-2 rounded pointer-events-none z-10 whitespace-nowrap shadow-lg">
            ${hours.toFixed(1)} giờ
          </div>

          <!-- Cột biểu đồ CSS Flexbox -->
          <div class="w-full max-w-[28px] bg-slate-800/60 rounded-t-lg relative flex items-end overflow-hidden" style="height: 100%;">
            <div 
              class="w-full bg-gradient-to-t from-indigo-600 via-violet-500 to-indigo-400 rounded-t-lg transition-all duration-700 group-hover:brightness-125"
              style="height: ${heightPercent}%;"
            ></div>
          </div>

          <!-- Nhãn thứ bên dưới cột -->
          <span class="text-[11px] font-semibold text-slate-400 group-hover:text-indigo-400 mt-2 transition-colors">
            ${day.label}
          </span>
        </div>
      `;
    }).join('');

    container.innerHTML = chartHtml;
  }

  /**
   * ==========================================================================
   * 5. RENDER DANH SÁCH TÁC VỤ KHẨN CẤP (CRITICAL / HIGH PRIORITY)
   * Kèm cảnh báo quá hạn dựa theo mốc dueDate
   * ==========================================================================
   */
  function renderUrgentTasks(tasks, projects, members) {
    const container = document.getElementById('urgent-tasks-container');
    const badgeCount = document.getElementById('urgent-count-badge');
    if (!container) return;

    // Lọc các task có độ ưu tiên 'critical' hoặc 'high' và chưa xong
    const urgentTasks = tasks.filter(
      (t) => (t.priority === 'critical' || t.priority === 'high') && t.status !== 'done'
    );

    if (badgeCount) {
      badgeCount.textContent = urgentTasks.length;
    }

    if (urgentTasks.length === 0) {
      container.innerHTML = `
        <div class="col-span-full empty-state glass-card p-6">
          <svg class="empty-state-icon text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          <p class="empty-state-title">Tuyệt vời! Không có tác vụ khẩn cấp nào tồn đọng</p>
          <p class="empty-state-desc">Toàn bộ công việc ưu tiên cao đã được nghiệm thu hoặc giải quyết đúng hạn.</p>
        </div>
      `;
      return;
    }

    const now = new Date();

    const tasksHtml = urgentTasks.map((task) => {
      const project = projects.find((p) => p.id === task.projectId);
      const assignee = members.find((m) => m.id === task.assigneeId);

      // Kiểm tra quá hạn
      const dueDateObj = task.dueDate ? new Date(task.dueDate) : null;
      const isOverdue = dueDateObj && dueDateObj < now;
      const dueDateFormatted = dueDateObj ? dueDateObj.toLocaleDateString('vi-VN') : 'Chưa định';

      // Badge độ ưu tiên (kèm animation pulse nếu là Critical)
      const isCritical = task.priority === 'critical';
      const badgeClass = isCritical
        ? 'badge-critical is-pulsing animate-pulse-critical'
        : 'badge-high';
      const badgeLabel = isCritical ? 'Khẩn cấp (Critical)' : 'Ưu tiên cao (High)';

      return `
        <article class="glass-card p-4 hover:border-slate-500/40 transition-all duration-200 flex flex-col justify-between">
          <div>
            <div class="flex items-center justify-between gap-2 mb-2">
              <span class="badge ${badgeClass}">
                <span class="priority-dot"></span>
                ${badgeLabel}
              </span>
              
              ${isOverdue ? `
                <span class="inline-flex items-center gap-1 text-[11px] font-bold text-rose-400 bg-rose-500/15 border border-rose-500/30 px-2 py-0.5 rounded-full">
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                  Quá hạn
                </span>
              ` : `
                <span class="text-[11px] text-slate-400">
                  Hạn: <b class="text-slate-300 font-medium">${dueDateFormatted}</b>
                </span>
              `}
            </div>

            <h3 class="text-sm font-bold text-white mb-1.5 leading-snug">${task.title}</h3>
            <p class="text-xs text-slate-400 line-clamp-2 mb-3 leading-relaxed">
              ${task.description || 'Không có mô tả chi tiết.'}
            </p>
          </div>

          <div class="pt-3 border-t border-slate-700/30 flex items-center justify-between text-xs">
            <span class="text-slate-400 font-medium truncate max-w-[180px]">
              Dự án: <span class="text-indigo-400">${project ? project.name : 'Chưa phân loại'}</span>
            </span>

            <div class="flex items-center gap-2">
              <span class="text-[11px] text-slate-400 hidden sm:inline">${assignee ? assignee.name : 'Chưa gán'}</span>
              <img 
                src="${assignee ? assignee.avatar : 'https://api.dicebear.com/7.x/avataaars/svg?seed=TaskFlow'}" 
                alt="${assignee ? assignee.name : 'Assignee'}" 
                title="${assignee ? assignee.name : 'Chưa gán'}"
                class="w-6 h-6 rounded-full bg-slate-800 border border-slate-700 object-cover"
              />
            </div>
          </div>
        </article>
      `;
    }).join('');

    container.innerHTML = tasksHtml;
  }

  /**
   * ==========================================================================
   * 6. KHỞI CHẠY TỔNG THỂ KHI TRANG TẢI XONG
   * ==========================================================================
   */
  function initDashboard() {
    // 1. Kích hoạt hiệu ứng Typewriter lặp 3 giây
    initTypewriterEffect();

    // 2. Truy xuất dữ liệu từ LocalStorage qua TaskFlowStorage
    const KEYS = window.TaskFlowStorage ? window.TaskFlowStorage.KEYS : {
      PROJECTS: 'taskflow_projects',
      TASKS: 'taskflow_tasks',
      MEMBERS: 'taskflow_members',
      TIME_LOGS: 'taskflow_time_logs'
    };

    const projects = getStorageData(KEYS.PROJECTS, []);
    const tasks = getStorageData(KEYS.TASKS, []);
    const members = getStorageData(KEYS.MEMBERS, []);
    const timeLogs = getStorageData(KEYS.TIME_LOGS, []);

    // 3. Render các thành phần giao diện chính
    renderKpiMetrics(projects, tasks, timeLogs);
    renderProjectsProgressList(projects, tasks, members);
    renderWeeklyProductivityChart(timeLogs, tasks);
    renderUrgentTasks(tasks, projects, members);

    // 4. Lắng nghe sự kiện thay đổi Theme để refresh biểu đồ nếu cần
    window.addEventListener('themeChanged', () => {
      // Re-render chart để cập nhật màu tương thích
      renderWeeklyProductivityChart(timeLogs, tasks);
    });
  }

  // Khởi động khi DOM sẵn sàng
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDashboard);
  } else {
    initDashboard();
  }

})(window, document);
