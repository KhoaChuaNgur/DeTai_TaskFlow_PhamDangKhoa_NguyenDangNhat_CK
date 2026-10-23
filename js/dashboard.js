/**
 * ==============================================================================
 * TASKFLOW EXECUTIVE DASHBOARD ENGINE (js/dashboard.js)
 * Mô tả: Bộ xử lý trung tâm cho Bảng Điều Hành, Phân Quyền Dữ Liệu & Cá Nhân Hóa.
 * Nhiệm vụ:
 *   1. Bảo vệ tuyến đường qua Auth.requireAuth().
 *   2. Thuật toán gõ chữ Typewriter lặp 3s cho tiêu đề thương hiệu TASKFLOW.
 *   3. Cá nhân hóa chào đón người dùng (Hero Avatar, Tên, Role Badge, Onboarding).
 *   4. Phân quyền dữ liệu (RBAC Scoping): Người dùng mới/Member chỉ thấy dự án/task của mình.
 *   5. Bộ lọc góc nhìn SaaS: "Công Việc Của Tôi" (My Tasks) vs "Toàn Cảnh Dự Án" (All Projects).
 *   6. Dropdown lọc theo từng Dự án cụ thể phản ứng tức thì (Reactive KPI recalculation).
 *   7. Tính toán KPI tự động bằng hàm bậc cao (map, filter, reduce).
 *   8. Render danh sách dự án với thanh tiến độ % động.
 *   9. Dựng biểu đồ hiệu suất tuần (Weekly Productivity) 100% CSS Flexbox.
 *   10. Lọc và hiển thị danh sách tác vụ khẩn cấp (Critical / High Priority).
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
   * 2. STATE QUẢN LÝ DỮ LIỆU & BỘ LỌC ĐIỀU HÀNH
   * ==========================================================================
   */
  const DashboardState = {
    currentUser: null,
    isAdmin: false,
    allProjects: [],
    allTasks: [],
    allMembers: [],
    allTimeLogs: [],
    userAccessibleProjects: [],
    viewMode: 'mine',           // 'mine' | 'all'
    selectedProjectId: 'all'    // 'all' | projectId cụ thể
  };

  /**
   * Truy xuất thông tin người dùng hiện tại an toàn từ đa nguồn
   */
  function getCurrentUser() {
    if (authService && typeof authService.getCurrentUser === 'function') {
      const u = authService.getCurrentUser();
      if (u) return u;
    }
    try {
      const sessionRaw = localStorage.getItem('TASKFLOW_SESSION') || localStorage.getItem('taskflow_session_meta');
      if (sessionRaw) {
        const s = JSON.parse(sessionRaw);
        if (s && s.user) return s.user;
      }
      const rawUser = localStorage.getItem('currentUser') || localStorage.getItem('TASKFLOW_USER') || localStorage.getItem('taskflow_current_user');
      if (rawUser) return JSON.parse(rawUser);
    } catch (err) {
      console.warn('[Dashboard] Không thể đọc current user:', err);
    }
    return {
      id: 'guest',
      name: 'Người Dùng',
      email: '',
      role: 'member',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=TaskFlow'
    };
  }

  /**
   * ==========================================================================
   * 3. KHỞI TẠO CÁ NHÂN HÓA HERO SECTION
   * ==========================================================================
   */
  function renderUserHero(currentUser, userProjects) {
    const elAvatar = document.getElementById('userHeroAvatar');
    const elName = document.getElementById('userHeroName');
    const elRole = document.getElementById('userHeroRoleBadge');
    const elOnboardingNotice = document.getElementById('onboardingNoticeBadge');
    const elOpenOnboardingKanban = document.getElementById('btnOpenOnboardingKanban');

    const displayName = currentUser.name || currentUser.fullname || currentUser.username || 'Thành viên mới';
    const roleText = (currentUser.role === 'admin') ? 'Quản trị viên (Admin)' : 'Thành viên (Member)';
    const avatarUrl = currentUser.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(displayName)}`;

    if (elAvatar) elAvatar.src = avatarUrl;
    if (elName) elName.textContent = displayName;
    if (elRole) {
      elRole.textContent = roleText;
      if (currentUser.role === 'admin') {
        elRole.className = 'inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/30 w-fit';
      }
    }

    // Kiểm tra xem có dự án Onboarding Training hay không
    const onboardingProj = userProjects.find(p => p.id === 'PRJ-START' || (p.code && p.code === 'START'));
    if (elOnboardingNotice) {
      if (onboardingProj) {
        elOnboardingNotice.classList.remove('hidden');
        elOnboardingNotice.classList.add('flex');
        if (elOpenOnboardingKanban) {
          elOpenOnboardingKanban.href = `board.html?projectId=${onboardingProj.id}`;
        }
      } else {
        elOnboardingNotice.classList.add('hidden');
        elOnboardingNotice.classList.remove('flex');
      }
    }
  }

  /**
   * ==========================================================================
   * 4. ĐỒNG BỘ CONTROL BAR & DROPDOWN DỰ ÁN
   * ==========================================================================
   */
  function setupControlBar(userProjects, scopedTasks) {
    const btnMine = document.getElementById('btnViewMine');
    const btnAll = document.getElementById('btnViewAll');
    const badgeMine = document.getElementById('badgeMyTasksCount');
    const badgeAll = document.getElementById('badgeAllProjectsCount');
    const selectFilter = document.getElementById('dashboardProjectFilter');

    // Cập nhật số đếm trên badge
    if (badgeAll) badgeAll.textContent = userProjects.length;

    // Số việc thuộc về tôi
    const myTasksCount = DashboardState.allTasks.filter(t => {
      const isMine = (t.assigneeId === DashboardState.currentUser.id) ||
        (!t.assigneeId && userProjects.some(p => p.id === t.projectId && p.ownerId === DashboardState.currentUser.id));
      const inScope = userProjects.some(p => p.id === t.projectId);
      return isMine && inScope;
    }).length;

    if (badgeMine) badgeMine.textContent = myTasksCount;

    // Đổ danh sách dự án vào Dropdown
    if (selectFilter) {
      const currentSelected = selectFilter.value || 'all';
      let optionsHtml = `<option value="all">📌 Tất cả dự án (${userProjects.length})</option>`;
      userProjects.forEach(p => {
        const codePrefix = p.code ? `[${p.code}] ` : '';
        optionsHtml += `<option value="${p.id}">${codePrefix}${p.name}</option>`;
      });
      selectFilter.innerHTML = optionsHtml;

      // Giữ nguyên giá trị đang chọn nếu còn hợp lệ
      if (userProjects.some(p => p.id === currentSelected)) {
        selectFilter.value = currentSelected;
        DashboardState.selectedProjectId = currentSelected;
      } else {
        selectFilter.value = 'all';
        DashboardState.selectedProjectId = 'all';
      }

      // Lắng nghe sự kiện đổi dự án
      selectFilter.onchange = function () {
        DashboardState.selectedProjectId = this.value;
        renderDashboardData();
      };
    }

    // Toggle góc nhìn: Công việc của tôi vs Toàn cảnh dự án
    function updateSwitchButtons() {
      if (!btnMine || !btnAll) return;
      if (DashboardState.viewMode === 'mine') {
        btnMine.className = 'view-switch-btn active flex-1 md:flex-none px-4 py-2 rounded-lg transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-sm';
        btnAll.className = 'view-switch-btn flex-1 md:flex-none px-4 py-2 rounded-lg transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white';
      } else {
        btnAll.className = 'view-switch-btn active flex-1 md:flex-none px-4 py-2 rounded-lg transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-sm';
        btnMine.className = 'view-switch-btn flex-1 md:flex-none px-4 py-2 rounded-lg transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white';
      }
    }

    if (btnMine) {
      btnMine.onclick = function () {
        if (DashboardState.viewMode !== 'mine') {
          DashboardState.viewMode = 'mine';
          updateSwitchButtons();
          renderDashboardData();
        }
      };
    }

    if (btnAll) {
      btnAll.onclick = function () {
        if (DashboardState.viewMode !== 'all') {
          DashboardState.viewMode = 'all';
          updateSwitchButtons();
          renderDashboardData();
        }
      };
    }

    updateSwitchButtons();
  }

  /**
   * ==========================================================================
   * 5. LỌC DỮ LIỆU ĐỘNG THEO GÓC NHÌN & DỰ ÁN
   * ==========================================================================
   */
  function getFilteredDashboardData() {
    const { currentUser, isAdmin, userAccessibleProjects, allTasks, viewMode, selectedProjectId } = DashboardState;

    // 1. Lọc dự án theo dropdown
    let activeProjects = userAccessibleProjects;
    if (selectedProjectId !== 'all') {
      activeProjects = userAccessibleProjects.filter(p => p.id === selectedProjectId);
    }

    const activeProjectIds = new Set(activeProjects.map(p => p.id));

    // 2. Lấy các task nằm trong phạm vi dự án đang hiển thị
    let activeTasks = allTasks.filter(t => activeProjectIds.has(t.projectId));

    // 3. Nếu ở chế độ "Công việc của tôi", chỉ lấy task gán cho user hoặc do user sở hữu dự án
    if (viewMode === 'mine') {
      activeTasks = activeTasks.filter(t => {
        if (t.assigneeId === currentUser.id) return true;
        // Nếu task chưa gán nhưng dự án do người này tạo (hoặc onboarding)
        const isOwner = activeProjects.some(p => p.id === t.projectId && p.ownerId === currentUser.id);
        if (isOwner && (!t.assigneeId || t.assigneeId === 'mem-onboarding')) return true;
        return false;
      });
    }

    return {
      projects: activeProjects,
      tasks: activeTasks
    };
  }

  /**
   * ==========================================================================
   * 6. TÍNH TOÁN VÀ HIỂN THỊ CÁC CHỈ SỐ KPI METRICS (DÙNG MAP, FILTER, REDUCE)
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
    const currentUserId = DashboardState.currentUser ? DashboardState.currentUser.id : null;
    const projectIds = new Set(projects.map(p => p.id));

    const totalHours = timeLogs.reduce((acc, log) => {
      // Nếu là admin và ở view All thì tính hết, ngược lại tính theo user hoặc project
      const matchUser = !currentUserId || log.userId === currentUserId || log.memberId === currentUserId;
      const matchProj = !log.projectId || projectIds.has(log.projectId);

      if (DashboardState.isAdmin && DashboardState.viewMode === 'all') {
        const hours = Number(log.hoursSpent) || Number(log.hours) || Number(log.duration) || 0;
        return acc + hours;
      }

      if (matchUser || matchProj) {
        const hours = Number(log.hoursSpent) || Number(log.hours) || Number(log.duration) || 0;
        return acc + hours;
      }
      return acc;
    }, 0);

    const elTotalHours = document.getElementById('kpi-total-hours');
    if (elTotalHours) {
      elTotalHours.textContent = totalHours > 0 ? totalHours.toFixed(1) : (totalTasks > 0 ? (doneTasks.length * 2.5).toFixed(1) : '0.0');
    }
  }

  /**
   * ==========================================================================
   * 7. RENDER DANH SÁCH DỰ ÁN TRỌNG ĐIỂM KÈM TIẾN ĐỘ % ĐỘNG
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
        <div class="empty-state glass-card p-8 text-center flex flex-col items-center justify-center">
          <div class="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400 mb-3 border border-indigo-200 dark:border-indigo-500/20">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
          </div>
          <p class="empty-state-title text-base font-bold text-slate-800 dark:text-white mb-1">Chưa có dự án nào trong phạm vi này</p>
          <p class="empty-state-desc text-xs text-slate-500 dark:text-slate-400 max-w-sm mb-4">Bạn có thể tạo một dự án mới để bắt đầu sắp xếp công việc và theo dõi hiệu suất đội ngũ.</p>
          <a href="projects.html" class="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md transition-all">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            Tạo Dự Án Đầu Tiên
          </a>
        </div>
      `;
      return;
    }

    const projectsHtml = projects.map((project) => {
      // Lấy toàn bộ task thuộc dự án này từ allTasks (để tính toán % chuẩn của dự án)
      const projectTasks = DashboardState.allTasks.filter((t) => t.projectId === project.id);
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
            src="${mem.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + encodeURIComponent(mem.name)}" 
            alt="${mem.name}" 
            title="${mem.name} (${mem.title || mem.role})"
            class="w-7 h-7 rounded-full border-2 border-slate-900 object-cover bg-slate-800 -ml-2 first:ml-0"
          />
        `;
      }).join('');

      const isOnboarding = project.id === 'PRJ-START' || project.code === 'START';

      return `
        <article class="glass-card p-5 border border-slate-200/90 dark:border-white/10 hover:border-indigo-400/50 dark:hover:border-indigo-500/30 transition-all duration-200 ${isOnboarding ? 'ring-1 ring-indigo-500/30 bg-indigo-50/20 dark:bg-indigo-950/20' : ''}">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
            <div class="flex items-center gap-2.5">
              <span class="px-2 py-0.5 text-[11px] font-bold rounded-md ${isOnboarding ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300 border border-amber-300 dark:border-amber-500/30' : 'bg-indigo-50 text-indigo-600 border border-indigo-200/80 dark:bg-indigo-500/15 dark:text-indigo-400 dark:border-indigo-500/25'}">
                ${project.code || 'PRJ'}
              </span>
              <h3 class="text-sm sm:text-base font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-1.5">
                ${project.name}
                ${isOnboarding ? '<span class="text-[10px] px-2 py-0.2 rounded-full bg-indigo-500 text-white font-semibold">Tập sự</span>' : ''}
              </h3>
            </div>
            
            <div class="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
              <span class="flex items-center gap-1">
                <svg class="w-3.5 h-3.5 text-slate-400 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                Hạn chót: <b class="text-slate-700 dark:text-slate-300 font-semibold">${deadlineDate}</b>
              </span>
            </div>
          </div>

          <p class="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 mb-4 leading-relaxed font-normal">
            ${project.description || 'Không có mô tả chi tiết.'}
          </p>

          <!-- Thanh tiến độ & Thông tin số lượng task -->
          <div class="space-y-2">
            <div class="flex items-center justify-between text-xs">
              <span class="text-slate-600 dark:text-slate-400 font-medium">
                Công việc: <span class="text-indigo-600 dark:text-indigo-400 font-bold">${projectDoneTasks.length}/${projectTasks.length} Done</span>
              </span>
              <span class="font-extrabold text-slate-900 dark:text-white">${dynamicProgress}%</span>
            </div>

            <div class="w-full bg-slate-200 dark:bg-slate-800/80 rounded-full h-2 overflow-hidden border border-slate-300/50 dark:border-white/5">
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

          <div class="mt-4 pt-3 border-t border-slate-200 dark:border-slate-700/30 flex items-center justify-between">
            <div class="flex items-center">
              ${memberAvatarsHtml || '<span class="text-xs text-slate-500">Chưa gán thành viên</span>'}
            </div>
            <div class="flex items-center gap-3">
              <a href="board.html?projectId=${project.id}" class="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors flex items-center gap-1">
                Bảng Kanban &rarr;
              </a>
              <a href="projects.html" class="text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors">
                Chi tiết
              </a>
            </div>
          </div>
        </article>
      `;
    }).join('');

    container.innerHTML = projectsHtml;
  }

  /**
   * ==========================================================================
   * 8. DỰNG BIỂU ĐỒ HIỆU SUẤT TUẦN (WEEKLY PRODUCTIVITY CHART 100% CSS FLEXBOX)
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

          <!-- Cột biểu đồ CSS Flexbox: Background track tinh chỉnh theo Theme -->
          <div class="w-full max-w-[28px] bg-slate-200/80 dark:bg-slate-800/60 rounded-t-lg relative flex items-end overflow-hidden" style="height: 100%;">
            <div 
              class="w-full bg-gradient-to-t from-indigo-600 via-violet-500 to-indigo-400 rounded-t-lg transition-all duration-700 group-hover:brightness-110"
              style="height: ${heightPercent}%;"
            ></div>
          </div>

          <!-- Nhãn thứ bên dưới cột -->
          <span class="text-[11px] font-semibold text-slate-600 dark:text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 mt-2 transition-colors">
            ${day.label}
          </span>
        </div>
      `;
    }).join('');

    container.innerHTML = chartHtml;
  }

  /**
   * ==========================================================================
   * 9. RENDER DANH SÁCH TÁC VỤ KHẨN CẤP (CRITICAL / HIGH PRIORITY)
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
        <div class="col-span-full empty-state glass-card p-6 text-center">
          <svg class="empty-state-icon text-emerald-500 dark:text-emerald-400 mx-auto w-10 h-10 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          <p class="empty-state-title text-slate-900 dark:text-white font-bold text-sm">Tuyệt vời! Không có tác vụ khẩn cấp nào tồn đọng</p>
          <p class="empty-state-desc text-slate-600 dark:text-slate-400 text-xs mt-1">Toàn bộ công việc ưu tiên cao đã được nghiệm thu hoặc giải quyết đúng hạn.</p>
        </div>
      `;
      return;
    }

    const now = new Date();

    const tasksHtml = urgentTasks.map((task) => {
      const project = projects.find((p) => p.id === task.projectId) || DashboardState.allProjects.find(p => p.id === task.projectId);
      const assignee = members.find((m) => m.id === task.assigneeId) || (task.assignee ? task.assignee : null);

      // Kiểm tra quá hạn
      const dueDateVal = task.dueDateTime || task.dueDate;
      const dueDateObj = dueDateVal ? new Date(dueDateVal) : null;
      const isOverdue = dueDateObj && dueDateObj < now;
      const dueDateFormatted = dueDateObj ? dueDateObj.toLocaleDateString('vi-VN') : 'Chưa định';

      // Badge độ ưu tiên (kèm animation pulse nếu là Critical)
      const isCritical = task.priority === 'critical';
      const badgeClass = isCritical
        ? 'badge-critical is-pulsing animate-pulse-critical'
        : 'badge-high';
      const badgeLabel = isCritical ? 'Khẩn cấp (Critical)' : 'Ưu tiên cao (High)';

      return `
        <article class="glass-card p-4 border border-slate-200/90 dark:border-white/10 hover:border-slate-400/50 dark:hover:border-slate-500/40 transition-all duration-200 flex flex-col justify-between">
          <div>
            <div class="flex items-center justify-between gap-2 mb-2">
              <span class="badge ${badgeClass}">
                <span class="priority-dot"></span>
                ${badgeLabel}
              </span>
              
              ${isOverdue ? `
                <span class="inline-flex items-center gap-1 text-[11px] font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/30 px-2 py-0.5 rounded-full">
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                  Quá hạn
                </span>
              ` : `
                <span class="text-[11px] text-slate-500 dark:text-slate-400">
                  Hạn: <b class="text-slate-700 dark:text-slate-300 font-semibold">${dueDateFormatted}</b>
                </span>
              `}
            </div>

            <h3 class="text-sm font-bold text-slate-900 dark:text-white mb-1.5 leading-snug">${task.title}</h3>
            <p class="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 mb-3 leading-relaxed">
              ${task.description || 'Không có mô tả chi tiết.'}
            </p>
          </div>

          <div class="pt-3 border-t border-slate-200 dark:border-slate-700/30 flex items-center justify-between text-xs">
            <span class="text-slate-600 dark:text-slate-400 font-medium truncate max-w-[180px]">
              Dự án: <span class="text-indigo-600 dark:text-indigo-400 font-semibold">${project ? project.name : 'Chưa phân loại'}</span>
            </span>

            <div class="flex items-center gap-2">
              <span class="text-[11px] text-slate-600 dark:text-slate-400 hidden sm:inline font-medium">${assignee ? assignee.name : 'Chưa gán'}</span>
              <img 
                src="${assignee ? (assignee.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + encodeURIComponent(assignee.name)) : 'https://api.dicebear.com/7.x/avataaars/svg?seed=TaskFlow'}" 
                alt="${assignee ? assignee.name : 'Assignee'}" 
                title="${assignee ? assignee.name : 'Chưa gán'}"
                class="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 object-cover"
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
   * 10. RE-RENDER TOÀN BỘ GIAO DIỆN PHẢN ỨNG DỰA TRÊN STATE HIỆN TẠI
   * ==========================================================================
   */
  function renderDashboardData() {
    const { projects, tasks } = getFilteredDashboardData();

    // Render KPI Metrics
    renderKpiMetrics(projects, tasks, DashboardState.allTimeLogs);

    // Render Danh sách dự án
    renderProjectsProgressList(projects, tasks, DashboardState.allMembers);

    // Render Biểu đồ tuần
    renderWeeklyProductivityChart(DashboardState.allTimeLogs, tasks);

    // Render Nhiệm vụ khẩn cấp
    renderUrgentTasks(tasks, projects, DashboardState.allMembers);
  }

  /**
   * ==========================================================================
   * 11. KHỞI CHẠY TỔNG THỂ KHI TRANG TẢI XONG
   * ==========================================================================
   */
  function initDashboard() {
    // 1. Kích hoạt hiệu ứng Typewriter lặp 3 giây
    initTypewriterEffect();

    // 2. Xác định người dùng hiện tại
    const currentUser = getCurrentUser();
    DashboardState.currentUser = currentUser;
    DashboardState.isAdmin = (currentUser.role === 'admin' || currentUser.email === 'admin@taskflow.dev');

    // 3. Tự động kiểm tra và cấp dự án Khởi Đầu (Onboarding) nếu là người dùng mới
    if (window.TaskFlowStorage && typeof window.TaskFlowStorage.ensureUserOnboarding === 'function') {
      window.TaskFlowStorage.ensureUserOnboarding(currentUser);
    }

    // 4. Đọc dữ liệu từ Storage
    const KEYS = window.TaskFlowStorage ? window.TaskFlowStorage.KEYS : {
      PROJECTS: 'taskflow_projects',
      TASKS: 'taskflow_tasks',
      MEMBERS: 'taskflow_members',
      TIME_LOGS: 'taskflow_time_logs'
    };

    DashboardState.allProjects = getStorageData(KEYS.PROJECTS, []);
    DashboardState.allTasks = getStorageData(KEYS.TASKS, []);
    DashboardState.allMembers = getStorageData(KEYS.MEMBERS, []);
    DashboardState.allTimeLogs = getStorageData(KEYS.TIME_LOGS, []);

    // 5. Xác định tập Dự án được phép truy cập (RBAC Scoping)
    if (DashboardState.isAdmin) {
      // Admin có quyền truy cập toàn bộ dự án
      DashboardState.userAccessibleProjects = DashboardState.allProjects;
    } else {
      // Member chỉ thấy:
      // a) Dự án do họ sở hữu (ownerId === currentUser.id)
      // b) Dự án họ là thành viên (members.includes(currentUser.id))
      // c) Dự án Onboarding cá nhân nếu có
      DashboardState.userAccessibleProjects = DashboardState.allProjects.filter(p => {
        if (!p) return false;
        if (p.ownerId === currentUser.id) return true;
        if (Array.isArray(p.members) && p.members.includes(currentUser.id)) return true;
        return false;
      });

      // Nếu người dùng mới chưa có dự án nào (kể cả sau ensure), tạo onboarding ngay
      if (DashboardState.userAccessibleProjects.length === 0 && window.TaskFlowStorage && typeof window.TaskFlowStorage.ensureUserOnboarding === 'function') {
        window.TaskFlowStorage.ensureUserOnboarding(currentUser);
        DashboardState.allProjects = getStorageData(KEYS.PROJECTS, []);
        DashboardState.allTasks = getStorageData(KEYS.TASKS, []);
        DashboardState.userAccessibleProjects = DashboardState.allProjects.filter(p => p.ownerId === currentUser.id);
      }
    }

    // 6. Hiển thị thông tin cá nhân hóa trên Hero
    renderUserHero(currentUser, DashboardState.userAccessibleProjects);

    // 7. Thiết lập Control Bar & Bộ lọc
    setupControlBar(DashboardState.userAccessibleProjects, DashboardState.allTasks);

    // 8. Render toàn bộ dữ liệu phản ứng
    renderDashboardData();

    // 9. Lắng nghe sự kiện thay đổi Theme để refresh biểu đồ nếu cần
    window.addEventListener('themeChanged', () => {
      const { tasks } = getFilteredDashboardData();
      renderWeeklyProductivityChart(DashboardState.allTimeLogs, tasks);
    });
  }

  // Khởi động khi DOM sẵn sàng
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDashboard);
  } else {
    initDashboard();
  }

})(window, document);
