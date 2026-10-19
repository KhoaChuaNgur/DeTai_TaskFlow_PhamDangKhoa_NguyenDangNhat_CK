/**
 * ==============================================================================
 * TASKFLOW PROJECT MANAGEMENT ENGINE (js/projects.js)
 * Mô tả: Bộ xử lý trung tâm cho Trang 2: Quản Lý Không Gian Dự Án.
 * Nhiệm vụ:
 *   1. Bảo vệ tuyến đường qua Auth.requireAuth().
 *   2. Tìm kiếm thông minh có gợi ý (Google-Style Autocomplete) kèm phím điều hướng.
 *   3. Lưới dự án 3D Card Flip với giải mã chữ Typewriter mặt sau khi hover.
 *   4. Popover danh sách đội ngũ Glassmorphism khi hover cụm avatar.
 *   5. Khối phân bổ nguồn lực đội ngũ (Resource Allocation Workload).
 *   6. Modal CRUD dự án với thẻ chuẩn <input type="datetime-local">.
 * Tuân thủ: Rubric học phần, colorweb.md, skill.md và ai_detected.md.
 * Tác giả: Lead Frontend Architect, Senior UX/UI Designer & Creative Animation Engineer
 * ==============================================================================
 */

(function (window, document) {
  'use strict';

  /**
   * Khởi chạy bảo vệ tuyến đường bằng Auth Guard
   */
  const authService = window.Auth || window.TaskFlowAuth;
  if (authService && typeof authService.requireAuth === 'function') {
    authService.requireAuth();
  }

  /**
   * ==========================================================================
   * 1. STORAGE DATA HELPERS & SYNC ENGINE
   * Đồng bộ hai chiều giữa TaskFlowStorage và key TASKFLOW_DATA theo Rubric
   * ==========================================================================
   */
  const DataEngine = {
    getProjects() {
      if (window.TaskFlowStorage && typeof window.TaskFlowStorage.get === 'function') {
        const list = window.TaskFlowStorage.get(window.TaskFlowStorage.KEYS.PROJECTS, []);
        if (list && list.length > 0) return list;
      }
      try {
        const raw = localStorage.getItem('TASKFLOW_DATA');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && Array.isArray(parsed.projects)) return parsed.projects;
        }
      } catch (e) {
        console.error('[DataEngine] Lỗi đọc TASKFLOW_DATA:', e);
      }
      return [];
    },

    saveProjects(projects) {
      if (window.TaskFlowStorage && typeof window.TaskFlowStorage.set === 'function') {
        window.TaskFlowStorage.set(window.TaskFlowStorage.KEYS.PROJECTS, projects);
      }
      try {
        const raw = localStorage.getItem('TASKFLOW_DATA');
        const parsed = raw ? JSON.parse(raw) : {};
        parsed.projects = projects;
        localStorage.setItem('TASKFLOW_DATA', JSON.stringify(parsed));
      } catch (e) {
        console.error('[DataEngine] Lỗi ghi TASKFLOW_DATA:', e);
      }
    },

    getTasks() {
      if (window.TaskFlowStorage && typeof window.TaskFlowStorage.get === 'function') {
        return window.TaskFlowStorage.get(window.TaskFlowStorage.KEYS.TASKS, []);
      }
      try {
        const raw = localStorage.getItem('TASKFLOW_DATA');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && Array.isArray(parsed.tasks)) return parsed.tasks;
        }
      } catch (e) {}
      return [];
    },

    getMembers() {
      if (window.TaskFlowStorage && typeof window.TaskFlowStorage.get === 'function') {
        return window.TaskFlowStorage.get(window.TaskFlowStorage.KEYS.MEMBERS, []);
      }
      try {
        const raw = localStorage.getItem('TASKFLOW_DATA');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && Array.isArray(parsed.members)) return parsed.members;
        }
      } catch (e) {}
      return [];
    }
  };

  /**
   * ==========================================================================
   * 2. ĐỊNH DẠNG THỜI GIAN & TÍNH TOÁN NGÀY HẾT HẠN
   * Format chuẩn: HH:mm - DD/MM/YYYY
   * Tính số ngày còn lại hoặc cảnh báo Quá Hạn
   * ==========================================================================
   */
  function formatDeadlineInfo(deadlineStr) {
    if (!deadlineStr) {
      return {
        formatted: 'Chưa xác định',
        isOverdue: false,
        daysRemainingText: 'Chưa có hạn'
      };
    }

    const dateObj = new Date(deadlineStr);
    if (isNaN(dateObj.getTime())) {
      return {
        formatted: deadlineStr,
        isOverdue: false,
        daysRemainingText: 'Định dạng linh hoạt'
      };
    }

    const hours = String(dateObj.getHours()).padStart(2, '0');
    const minutes = String(dateObj.getMinutes()).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const year = dateObj.getFullYear();

    const formatted = `${hours}:${minutes} - ${day}/${month}/${year}`;

    const now = new Date();
    const diffMs = dateObj.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    let isOverdue = false;
    let daysRemainingText = '';

    if (diffMs < 0) {
      isOverdue = true;
      const daysPast = Math.abs(diffDays);
      daysRemainingText = daysPast === 0 ? 'Hết hạn hôm nay' : `Quá hạn ${daysPast} ngày`;
    } else if (diffDays === 0) {
      daysRemainingText = 'Hôm nay';
    } else {
      daysRemainingText = `Còn ${diffDays} ngày`;
    }

    return {
      formatted,
      isOverdue,
      daysRemainingText
    };
  }

  /**
   * Helper hiển thị Toast đồng bộ
   */
  function showToast(message, type = 'success') {
    if (window.TaskFlowAuth && typeof window.TaskFlowAuth.showToast === 'function') {
      window.TaskFlowAuth.showToast(message, type);
    } else {
      alert(message);
    }
  }

  /**
   * ==========================================================================
   * 3. KHỐI PHÂN BỔ NGUỒN LỰC ĐỘI NGŨ (RESOURCE ALLOCATION WORKLOAD)
   * Tính toán số lượng task thực tế mỗi thành viên đang gánh để cân bằng tải
   * ==========================================================================
   */
  function renderResourceAllocation() {
    const container = document.getElementById('resourceAllocationContainer');
    if (!container) return;

    const members = DataEngine.getMembers();
    const tasks = DataEngine.getTasks();

    if (!members || members.length === 0) {
      container.innerHTML = '<p class="text-xs text-slate-500">Chưa có dữ liệu thành viên.</p>';
      return;
    }

    const html = members.map((member) => {
      // Đếm task active (chưa done) và task đã hoàn thành
      const activeTasks = tasks.filter((t) => t.assigneeId === member.id && t.status !== 'done');
      const completedTasks = tasks.filter((t) => t.assigneeId === member.id && t.status === 'done');
      const totalAssigned = activeTasks.length + completedTasks.length;

      // Xác định mức tải (Workload Status)
      let statusLabel = 'Cân bằng';
      let statusColorClass = 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20';
      let barGradient = 'from-emerald-500 to-teal-400';

      if (activeTasks.length >= 4) {
        statusLabel = 'Quá tải';
        statusColorClass = 'text-rose-500 bg-rose-500/10 border-rose-500/20';
        barGradient = 'from-rose-500 to-orange-400';
      } else if (activeTasks.length >= 2) {
        statusLabel = 'Bận rộn';
        statusColorClass = 'text-amber-500 bg-amber-500/10 border-amber-500/20';
        barGradient = 'from-amber-500 to-yellow-400';
      }

      // Giới hạn max chuẩn 5 task = 100% thanh đo
      const workloadPercent = Math.min(100, Math.round((activeTasks.length / 5) * 100));

      return `
        <div class="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-white/10 flex flex-col justify-between hover:border-indigo-400/50 transition-all">
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2.5">
              <div class="relative">
                <img 
                  src="${member.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + member.name}" 
                  alt="${member.name}" 
                  class="w-9 h-9 rounded-full object-cover bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
                />
                <span class="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900"></span>
              </div>
              <div>
                <p class="text-xs font-bold text-slate-900 dark:text-white leading-tight">${member.name}</p>
                <p class="text-[10px] text-indigo-500 dark:text-indigo-400 font-semibold uppercase tracking-wider">${member.title || member.role}</p>
              </div>
            </div>

            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusColorClass}">
              ${statusLabel}
            </span>
          </div>

          <!-- Thanh đo tiến trình khối lượng công việc -->
          <div class="space-y-1.5 mt-1">
            <div class="flex items-center justify-between text-[11px]">
              <span class="text-slate-500 dark:text-slate-400">Đang gánh: <b class="text-slate-800 dark:text-slate-200">${activeTasks.length} việc</b></span>
              <span class="text-slate-500 dark:text-slate-400">Đã xong: <b class="text-emerald-500">${completedTasks.length}</b></span>
            </div>
            <div class="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
              <div 
                class="bg-gradient-to-r ${barGradient} h-1.5 rounded-full transition-all duration-700" 
                style="width: ${workloadPercent}%"
              ></div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = html;
  }

  /**
   * ==========================================================================
   * 4. RENDER LƯỚI DỰ ÁN 3D CARD FLIP VÀ HIỆU ỨNG TYPEWRITER MẶT SAU
   * ==========================================================================
   */
  function renderProjectsGrid(filteredProjects = null) {
    const container = document.getElementById('projectsGridContainer');
    const totalCounter = document.getElementById('projectTotalCounter');
    if (!container) return;

    const allProjects = DataEngine.getProjects();
    const projects = filteredProjects !== null ? filteredProjects : allProjects;
    const tasks = DataEngine.getTasks();
    const members = DataEngine.getMembers();

    // Cập nhật bộ đếm
    if (totalCounter) {
      totalCounter.innerHTML = `
        <span class="w-2 h-2 rounded-full bg-indigo-500"></span>
        <span>${projects.length} dự án</span>
      `;
    }

    if (projects.length === 0) {
      container.innerHTML = `
        <div class="col-span-full empty-state glass-card p-10 border border-slate-200 dark:border-white/10">
          <svg class="empty-state-icon text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
          <p class="empty-state-title text-base font-bold text-slate-900 dark:text-white">Không tìm thấy dự án nào</p>
          <p class="empty-state-desc text-xs text-slate-500 dark:text-slate-400">Hãy thử từ khóa khác hoặc bấm nút "+ Tạo Dự Án Mới" để bắt đầu.</p>
        </div>
      `;
      return;
    }

    const isAdmin = authService && typeof authService.hasRole === 'function' ? authService.hasRole('admin') : true;

    const cardsHtml = projects.map((project) => {
      // Tính toán tiến độ động từ tasks
      const projTasks = tasks.filter((t) => t.projectId === project.id);
      const doneTasks = projTasks.filter((t) => t.status === 'done');
      const doingTasks = projTasks.filter((t) => t.status === 'doing');
      const todoTasks = projTasks.filter((t) => t.status === 'todo');

      const progress = projTasks.length > 0
        ? Math.round((doneTasks.length / projTasks.length) * 100)
        : (project.progress || 0);

      // Định dạng hạn chót
      const deadlineInfo = formatDeadlineInfo(project.deadline);

      // Lấy danh sách thành viên đầy đủ cho Popover
      const assignedMembers = (project.members || [])
        .map((id) => members.find((m) => m.id === id))
        .filter(Boolean);

      // Hiển thị cụm avatar mặt trước (tối đa 3 avatar + số dư)
      const visibleMembers = assignedMembers.slice(0, 3);
      const remainingCount = assignedMembers.length - visibleMembers.length;

      const avatarClusterHtml = visibleMembers.map((m) => `
        <img 
          src="${m.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + m.name}" 
          alt="${m.name}" 
          class="w-7 h-7 rounded-full border-2 border-white dark:border-slate-900 object-cover bg-slate-200 dark:bg-slate-800 -ml-2 first:ml-0"
        />
      `).join('');

      const remainingBadgeHtml = remainingCount > 0 ? `
        <span class="w-7 h-7 rounded-full border-2 border-white dark:border-slate-900 bg-indigo-500 text-white text-[10px] font-bold flex items-center justify-center -ml-2">
          +${remainingCount}
        </span>
      ` : '';

      // Danh sách trong Popover Glassmorphism
      const popoverMembersListHtml = assignedMembers.length > 0
        ? assignedMembers.map((m) => `
            <div class="flex items-center gap-2.5 py-1.5 border-b border-slate-100 dark:border-white/5 last:border-0">
              <div class="relative">
                <img src="${m.avatar}" alt="${m.name}" class="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-800 object-cover border border-slate-300 dark:border-slate-700"/>
                <span class="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-emerald-500 ring-1 ring-white dark:ring-slate-900"></span>
              </div>
              <div class="min-w-0 flex-1">
                <p class="text-xs font-bold text-slate-900 dark:text-white truncate">${m.name}</p>
                <p class="text-[10px] text-indigo-500 font-semibold uppercase tracking-wider">${m.title || m.role}</p>
              </div>
            </div>
          `).join('')
        : '<p class="text-xs text-slate-400">Chưa gán thành viên nào.</p>';

      const projectColor = project.color || '#6366F1';

      return `
        <div class="flip-card group" data-project-id="${project.id}">
          <div class="flip-card-inner">
            
            <!-- ================= MẶT TRƯỚC (FRONT FACE) ================= -->
            <div class="flip-card-front glass-card p-5 border border-slate-200/90 dark:border-white/10 shadow-sm dark:shadow-xl bg-white/85 dark:bg-slate-900/65">
              
              <!-- Header Card Front: Tag danh mục & Nút thao tác Admin -->
              <div class="flex items-center justify-between gap-2 mb-3">
                <span 
                  class="px-2.5 py-0.5 text-[11px] font-bold rounded-md uppercase tracking-wider"
                  style="background-color: ${projectColor}18; color: ${projectColor}; border: 1px solid ${projectColor}35;"
                >
                  ${project.code || 'PRJ'}
                </span>

                <div class="flex items-center gap-1.5">
                  ${isAdmin ? `
                    <button 
                      type="button" 
                      data-action="edit" 
                      data-id="${project.id}" 
                      title="Chỉnh sửa dự án" 
                      class="btn-edit-project p-1.5 rounded-lg text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-white/5 transition-colors"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                    </button>
                    <button 
                      type="button" 
                      data-action="delete" 
                      data-id="${project.id}" 
                      title="Xóa dự án" 
                      class="btn-delete-project p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-white/5 transition-colors"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>
                  ` : ''}
                </div>
              </div>

              <!-- Tên dự án -->
              <h3 class="text-base font-bold text-slate-900 dark:text-white line-clamp-1 mb-2 tracking-tight">
                ${project.name}
              </h3>

              <!-- Hạn chót định dạng chuẩn: HH:mm - DD/MM/YYYY -->
              <div class="flex items-center justify-between text-xs mb-4">
                <span class="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <svg class="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                  Hạn chót:
                </span>
                <span class="font-semibold text-slate-700 dark:text-slate-300">
                  ${deadlineInfo.formatted}
                </span>
              </div>

              <!-- Tiến độ % động -->
              <div class="space-y-1.5 mb-4">
                <div class="flex items-center justify-between text-xs">
                  <span class="text-slate-500 dark:text-slate-400 font-medium">Tiến độ Sprint</span>
                  <span class="font-extrabold text-slate-900 dark:text-white">${progress}%</span>
                </div>
                <div class="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-2 overflow-hidden border border-slate-300/40 dark:border-white/5">
                  <div 
                    class="h-2 rounded-full transition-all duration-700" 
                    style="width: ${progress}%; background: linear-gradient(90deg, ${projectColor}, #8B5CF6);"
                  ></div>
                </div>
              </div>

              <!-- Footer Front Face: Cụm Avatar Đội Ngũ & Gợi ý Hover -->
              <div class="pt-3 border-t border-slate-200 dark:border-slate-700/30 flex items-center justify-between relative">
                
                <!-- Cụm Avatar có Popover khi Hover -->
                <div class="relative avatar-cluster-wrap">
                  <div class="flex items-center cursor-pointer avatar-trigger">
                    ${avatarClusterHtml || '<span class="text-xs text-slate-400">Chưa có người phụ trách</span>'}
                    ${remainingBadgeHtml}
                  </div>

                  <!-- Flyout Popover danh sách đội ngũ Glassmorphism -->
                  <div class="team-flyout-popover absolute bottom-10 left-0 bg-white/95 dark:bg-slate-900/90 backdrop-blur-xl border border-slate-200 dark:border-white/10 shadow-2xl rounded-2xl p-4 min-w-[250px] z-30 opacity-0 pointer-events-none transform translate-y-2 transition-all duration-200">
                    <p class="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Đội ngũ phụ trách dự án</p>
                    <div class="space-y-1">
                      ${popoverMembersListHtml}
                    </div>
                  </div>
                </div>

                <!-- Cảnh báo quá hạn hoặc ngày còn lại -->
                <div>
                  ${deadlineInfo.isOverdue ? `
                    <span class="px-2 py-0.5 text-[11px] font-bold rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 animate-pulse">
                      ${deadlineInfo.daysRemainingText}
                    </span>
                  ` : `
                    <span class="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1">
                      ${deadlineInfo.daysRemainingText}
                    </span>
                  `}
                </div>
              </div>

              <!-- Gợi ý lật 3D góc đáy -->
              <p class="text-[10px] text-slate-400 text-center mt-2.5 flex items-center justify-center gap-1">
                <span>Hover để xem chi tiết</span>
                <span class="inline-block transform group-hover:rotate-180 transition-transform duration-500">🔄</span>
              </p>

            </div>

            <!-- ================= MẶT SAU (BACK FACE) ================= -->
            <div class="flip-card-back glass-card p-5 border border-indigo-200 dark:border-indigo-500/30 shadow-2xl bg-white/95 dark:bg-slate-900/95 text-slate-800 dark:text-slate-100">
              
              <div>
                <!-- Header Mặt sau -->
                <div class="flex items-center justify-between border-b border-slate-200 dark:border-white/10 pb-2 mb-3">
                  <span class="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                    Thông Tin Giải Mã
                  </span>
                  <span class="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    Sprint Active
                  </span>
                </div>

                <!-- Hiệu ứng chữ Typewriter mặt sau giải mã chi tiết -->
                <div class="mb-4">
                  <p class="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Mục tiêu &amp; Mô tả:</p>
                  <p 
                    class="card-typewriter-desc text-xs text-slate-600 dark:text-slate-300 leading-relaxed min-h-[54px] font-mono"
                    data-full-text="${encodeURIComponent(project.description || 'Chưa có mô tả kỹ thuật cho dự án này.')}"
                  >
                    <!-- Typewriter chạy tự động khi lật mặt sau -->
                  </p>
                </div>

                <!-- Thống kê task chi tiết -->
                <div class="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-slate-100/80 dark:bg-white/5 border border-slate-200 dark:border-white/5 text-center mb-4">
                  <div>
                    <p class="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400">Chờ làm</p>
                    <p class="text-sm font-bold text-slate-800 dark:text-white">${todoTasks.length}</p>
                  </div>
                  <div>
                    <p class="text-[10px] uppercase font-semibold text-sky-500">Đang làm</p>
                    <p class="text-sm font-bold text-sky-400">${doingTasks.length}</p>
                  </div>
                  <div>
                    <p class="text-[10px] uppercase font-semibold text-emerald-500">Đã xong</p>
                    <p class="text-sm font-bold text-emerald-400">${doneTasks.length}</p>
                  </div>
                </div>
              </div>

              <!-- Nút điều hướng sang Kanban Board -->
              <div class="pt-3 border-t border-slate-200 dark:border-white/10">
                <a 
                  href="board.html?projectId=${project.id}" 
                  class="btn-touch w-full py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold text-xs shadow-md shadow-indigo-500/20 transition-all flex items-center justify-center gap-2"
                >
                  <span>Mở Bảng Việc Kanban</span>
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
                </a>
              </div>

            </div>

          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = cardsHtml;

    // Gắn Event Listener cho hiệu ứng Typewriter mặt sau và Popover Avatar
    bindCardInteractions();
  }

  /**
   * ==========================================================================
   * 5. HIỆU ỨNG GÕ CHỮ (TYPEWRITER) CHO MẶT SAU THẺ KHI HOVER
   * & POPOVER HIỂN THỊ ĐỘI NGŨ
   * ==========================================================================
   */
  function bindCardInteractions() {
    // 1. Hiệu ứng Typewriter khi hover card
    const flipCards = document.querySelectorAll('.flip-card');

    flipCards.forEach((card) => {
      const typewriterEl = card.querySelector('.card-typewriter-desc');
      if (!typewriterEl) return;

      const rawText = decodeURIComponent(typewriterEl.getAttribute('data-full-text') || '');
      let timer = null;

      card.addEventListener('mouseenter', () => {
        // Hủy timer cũ nếu có
        if (timer) clearInterval(timer);

        typewriterEl.textContent = '';
        let index = 0;
        const speed = 25; // 25ms mỗi ký tự cho cảm giác giải mã công nghệ nhanh

        timer = setInterval(() => {
          if (index < rawText.length) {
            typewriterEl.textContent += rawText.charAt(index);
            index++;
          } else {
            clearInterval(timer);
            timer = null;
          }
        }, speed);
      });

      card.addEventListener('mouseleave', () => {
        if (timer) {
          clearInterval(timer);
          timer = null;
        }
      });
    });

    // 2. Team Flyout Popover khi hover avatar cluster
    const clusterWraps = document.querySelectorAll('.avatar-cluster-wrap');

    clusterWraps.forEach((wrap) => {
      const popover = wrap.querySelector('.team-flyout-popover');
      if (!popover) return;

      wrap.addEventListener('mouseenter', () => {
        popover.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-2');
        popover.classList.add('opacity-100', 'pointer-events-auto', 'translate-y-0');
      });

      wrap.addEventListener('mouseleave', () => {
        popover.classList.remove('opacity-100', 'pointer-events-auto', 'translate-y-0');
        popover.classList.add('opacity-0', 'pointer-events-none', 'translate-y-2');
      });
    });

    // 3. Nút Sửa / Xóa cho Admin
    document.querySelectorAll('.btn-edit-project').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        openEditProjectModal(id);
      });
    });

    document.querySelectorAll('.btn-delete-project').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        handleDeleteProject(id);
      });
    });
  }

  /**
   * ==========================================================================
   * 6. THANH TÌM KIẾM THÔNG MINH AUTOCOMPLETE (GOOGLE-STYLE)
   * Kèm phím điều hướng ArrowUp, ArrowDown, Enter, Escape
   * ==========================================================================
   */
  function initSmartSearch() {
    const input = document.getElementById('projectSearchInput');
    const dropdown = document.getElementById('searchAutocompleteDropdown');
    const btnClear = document.getElementById('btnClearSearch');
    if (!input || !dropdown) return;

    let activeSuggestionIndex = -1;
    let currentSuggestions = [];

    // Helper tô đậm từ khóa trùng khớp (Highlighting)
    function highlightMatch(text, query) {
      if (!query) return text;
      const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      return text.replace(regex, '<mark class="bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 font-bold px-0.5 rounded">$1</mark>');
    }

    // Hiển thị gợi ý dropdown
    function renderDropdown(matches, query) {
      currentSuggestions = matches;
      activeSuggestionIndex = -1;

      if (matches.length === 0) {
        dropdown.innerHTML = `
          <div class="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 text-center">
            Không tìm thấy dự án khớp với "<b>${query}</b>"
          </div>
        `;
        dropdown.classList.remove('hidden');
        return;
      }

      dropdown.innerHTML = matches.map((p, idx) => `
        <div 
          class="autocomplete-item px-4 py-2.5 flex items-center justify-between cursor-pointer hover:bg-indigo-50 dark:hover:bg-white/5 transition-colors text-xs"
          data-index="${idx}"
          data-name="${p.name}"
        >
          <div class="flex items-center gap-2.5">
            <span class="w-2 h-2 rounded-full" style="background-color: ${p.color || '#6366F1'};"></span>
            <span class="font-bold text-slate-900 dark:text-white">${highlightMatch(p.name, query)}</span>
            <span class="text-[10px] text-slate-400 uppercase font-semibold">${p.code || ''}</span>
          </div>
          <span class="text-[11px] text-indigo-500 font-medium">Chọn &rarr;</span>
        </div>
      `).join('');

      dropdown.classList.remove('hidden');

      // Click chọn gợi ý
      dropdown.querySelectorAll('.autocomplete-item').forEach((item) => {
        item.addEventListener('click', () => {
          const name = item.getAttribute('data-name');
          selectSuggestion(name);
        });
      });
    }

    function selectSuggestion(name) {
      input.value = name;
      dropdown.classList.add('hidden');
      btnClear.classList.remove('hidden');

      // Lọc danh sách lưới dự án
      const allProjects = DataEngine.getProjects();
      const matched = allProjects.filter((p) => p.name.toLowerCase().includes(name.toLowerCase()));
      renderProjectsGrid(matched);
    }

    function updateActiveSuggestion() {
      const items = dropdown.querySelectorAll('.autocomplete-item');
      items.forEach((el, idx) => {
        if (idx === activeSuggestionIndex) {
          el.classList.add('bg-indigo-100', 'dark:bg-white/10');
          el.scrollIntoView({ block: 'nearest' });
        } else {
          el.classList.remove('bg-indigo-100', 'dark:bg-white/10');
        }
      });
    }

    // Sự kiện nhập liệu thời gian thực
    input.addEventListener('input', (e) => {
      const query = e.target.value.trim().toLowerCase();

      if (query.length > 0) {
        btnClear.classList.remove('hidden');
      } else {
        btnClear.classList.add('hidden');
        dropdown.classList.add('hidden');
        renderProjectsGrid();
        return;
      }

      const allProjects = DataEngine.getProjects();
      const matches = allProjects.filter((p) => {
        const name = (p.name || '').toLowerCase();
        const code = (p.code || '').toLowerCase();
        const desc = (p.description || '').toLowerCase();
        return name.includes(query) || code.includes(query) || desc.includes(query);
      });

      renderDropdown(matches, query);
      renderProjectsGrid(matches);
    });

    // Phím điều hướng bàn phím (ArrowUp, ArrowDown, Enter, Escape)
    input.addEventListener('keydown', (e) => {
      if (dropdown.classList.contains('hidden') || currentSuggestions.length === 0) {
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeSuggestionIndex = (activeSuggestionIndex + 1) % currentSuggestions.length;
        updateActiveSuggestion();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeSuggestionIndex = (activeSuggestionIndex - 1 + currentSuggestions.length) % currentSuggestions.length;
        updateActiveSuggestion();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (activeSuggestionIndex >= 0 && activeSuggestionIndex < currentSuggestions.length) {
          selectSuggestion(currentSuggestions[activeSuggestionIndex].name);
        }
      } else if (e.key === 'Escape') {
        dropdown.classList.add('hidden');
      }
    });

    // Nút Xóa tìm kiếm
    if (btnClear) {
      btnClear.addEventListener('click', () => {
        input.value = '';
        btnClear.classList.add('hidden');
        dropdown.classList.add('hidden');
        renderProjectsGrid();
        input.focus();
      });
    }

    // Đóng dropdown khi click ra ngoài
    document.addEventListener('click', (e) => {
      if (!input.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.classList.add('hidden');
      }
    });
  }

  /**
   * ==========================================================================
   * 7. MODAL CRUD TẠO & CHỈNH SỬA DỰ ÁN
   * ==========================================================================
   */
  function initProjectModal() {
    const modalBackdrop = document.getElementById('projectModalBackdrop');
    const btnOpen = document.getElementById('btnOpenCreateProjectModal');
    const btnClose = document.getElementById('btnCloseProjectModal');
    const btnCancel = document.getElementById('btnCancelProjectModal');
    const form = document.getElementById('projectForm');
    const membersContainer = document.getElementById('membersCheckboxContainer');
    const colorButtons = document.querySelectorAll('.color-choice');
    const hiddenColorInput = document.getElementById('selectedProjectColor');

    if (!modalBackdrop || !form) return;

    // Chọn màu sắc nhận diện
    colorButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        colorButtons.forEach((b) => b.classList.remove('ring-2', 'ring-offset-2', 'ring-indigo-500', 'ring-offset-slate-900'));
        btn.classList.add('ring-2', 'ring-offset-2', 'ring-indigo-500', 'ring-offset-slate-900');
        hiddenColorInput.value = btn.getAttribute('data-color');
      });
    });

    // Nạp danh sách checkbox thành viên
    function populateMembersCheckboxes(selectedIds = []) {
      if (!membersContainer) return;
      const members = DataEngine.getMembers();

      membersContainer.innerHTML = members.map((m) => {
        const isChecked = selectedIds.includes(m.id) ? 'checked' : '';
        return `
          <label class="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-200/50 dark:hover:bg-white/5 cursor-pointer text-xs">
            <input type="checkbox" name="projectMembers" value="${m.id}" ${isChecked} class="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 dark:border-slate-700"/>
            <img src="${m.avatar}" alt="${m.name}" class="w-6 h-6 rounded-full object-cover bg-slate-200 dark:bg-slate-800"/>
            <span class="font-bold text-slate-800 dark:text-slate-200">${m.name}</span>
            <span class="text-[10px] text-slate-400 font-medium uppercase">(${m.title || m.role})</span>
          </label>
        `;
      }).join('');
    }

    // Mở modal tạo mới
    if (btnOpen) {
      btnOpen.addEventListener('click', () => {
        document.getElementById('modalTitle').textContent = 'Khởi Tạo Không Gian Dự Án Mới';
        document.getElementById('editProjectId').value = '';
        form.reset();

        // Đặt hạn chót mặc định: 30 ngày sau vào lúc 18:00
        const defaultDate = new Date();
        defaultDate.setDate(defaultDate.getDate() + 30);
        defaultDate.setHours(18, 0, 0, 0);

        // Format: YYYY-MM-DDTHH:mm
        const tzOffset = defaultDate.getTimezoneOffset() * 60000;
        const localISOTime = new Date(defaultDate.getTime() - tzOffset).toISOString().slice(0, 16);
        document.getElementById('projectDeadline').value = localISOTime;

        populateMembersCheckboxes(['mem-01']); // Mặc định gán Admin
        modalBackdrop.classList.remove('hidden');
      });
    }

    // Đóng modal
    function closeModal() {
      modalBackdrop.classList.add('hidden');
      form.reset();
    }

    if (btnClose) btnClose.addEventListener('click', closeModal);
    if (btnCancel) btnCancel.addEventListener('click', closeModal);

    modalBackdrop.addEventListener('click', (e) => {
      if (e.target === modalBackdrop) closeModal();
    });

    // Submit Form (Lưu hoặc Cập nhật)
    form.addEventListener('submit', (e) => {
      e.preventDefault();

      const editId = document.getElementById('editProjectId').value;
      const name = document.getElementById('projectNameInput').value.trim();
      const code = document.getElementById('projectCodeInput').value.trim().toUpperCase();
      const category = document.getElementById('projectCategoryInput').value.trim();
      const deadline = document.getElementById('projectDeadline').value;
      const description = document.getElementById('projectDescInput').value.trim();
      const color = hiddenColorInput.value || '#6366F1';

      // Lấy danh sách thành viên được chọn
      const selectedMembers = Array.from(
        document.querySelectorAll('input[name="projectMembers"]:checked')
      ).map((cb) => cb.value);

      const projects = DataEngine.getProjects();

      if (editId) {
        // Cập nhật dự án cũ
        const index = projects.findIndex((p) => p.id === editId);
        if (index !== -1) {
          projects[index] = {
            ...projects[index],
            name,
            code,
            category,
            deadline,
            description,
            color,
            members: selectedMembers
          };
          DataEngine.saveProjects(projects);
          showToast(`Đã cập nhật dự án "${name}" thành công!`, 'success');
        }
      } else {
        // Tạo dự án mới
        const newProject = {
          id: 'proj-' + Date.now(),
          name,
          code: code || 'PRJ-' + Math.floor(100 + Math.random() * 900),
          category: category || 'Agile Sprint',
          description,
          status: 'active',
          progress: 0,
          startDate: new Date().toISOString().slice(0, 10),
          deadline,
          members: selectedMembers.length > 0 ? selectedMembers : ['mem-01'],
          color
        };

        projects.unshift(newProject);
        DataEngine.saveProjects(projects);
        showToast(`Đã khởi tạo dự án "${name}" thành công!`, 'success');
      }

      closeModal();
      renderProjectsGrid();
      renderResourceAllocation();
    });
  }

  // Mở modal sửa dự án
  function openEditProjectModal(projectId) {
    const projects = DataEngine.getProjects();
    const project = projects.find((p) => p.id === projectId);
    if (!project) return;

    const modalBackdrop = document.getElementById('projectModalBackdrop');
    if (!modalBackdrop) return;

    document.getElementById('modalTitle').textContent = 'Chỉnh Sửa Không Gian Dự Án';
    document.getElementById('editProjectId').value = project.id;
    document.getElementById('projectNameInput').value = project.name || '';
    document.getElementById('projectCodeInput').value = project.code || '';
    document.getElementById('projectCategoryInput').value = project.category || '';
    document.getElementById('projectDescInput').value = project.description || '';

    // Định dạng datetime-local
    if (project.deadline) {
      try {
        const d = new Date(project.deadline);
        const tzOffset = d.getTimezoneOffset() * 60000;
        const localISOTime = new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
        document.getElementById('projectDeadline').value = localISOTime;
      } catch (e) {
        document.getElementById('projectDeadline').value = project.deadline;
      }
    }

    // Chọn màu
    const hiddenColorInput = document.getElementById('selectedProjectColor');
    if (hiddenColorInput) hiddenColorInput.value = project.color || '#6366F1';

    document.querySelectorAll('.color-choice').forEach((btn) => {
      if (btn.getAttribute('data-color') === project.color) {
        btn.classList.add('ring-2', 'ring-offset-2', 'ring-indigo-500', 'ring-offset-slate-900');
      } else {
        btn.classList.remove('ring-2', 'ring-offset-2', 'ring-indigo-500', 'ring-offset-slate-900');
      }
    });

    // Nạp thành viên
    const membersContainer = document.getElementById('membersCheckboxContainer');
    if (membersContainer) {
      const members = DataEngine.getMembers();
      const selectedIds = project.members || [];

      membersContainer.innerHTML = members.map((m) => {
        const isChecked = selectedIds.includes(m.id) ? 'checked' : '';
        return `
          <label class="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-200/50 dark:hover:bg-white/5 cursor-pointer text-xs">
            <input type="checkbox" name="projectMembers" value="${m.id}" ${isChecked} class="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 dark:border-slate-700"/>
            <img src="${m.avatar}" alt="${m.name}" class="w-6 h-6 rounded-full object-cover bg-slate-200 dark:bg-slate-800"/>
            <span class="font-bold text-slate-800 dark:text-slate-200">${m.name}</span>
            <span class="text-[10px] text-slate-400 font-medium uppercase">(${m.title || m.role})</span>
          </label>
        `;
      }).join('');
    }

    modalBackdrop.classList.remove('hidden');
  }

  // Xóa dự án (Chỉ Admin)
  function handleDeleteProject(projectId) {
    const projects = DataEngine.getProjects();
    const project = projects.find((p) => p.id === projectId);
    if (!project) return;

    if (confirm(`Bạn có chắc chắn muốn xóa dự án "${project.name}"? Các công việc liên kết có thể bị ảnh hưởng.`)) {
      const updated = projects.filter((p) => p.id !== projectId);
      DataEngine.saveProjects(updated);
      showToast(`Đã xóa dự án "${project.name}".`, 'info');
      renderProjectsGrid();
      renderResourceAllocation();
    }
  }

  /**
   * ==========================================================================
   * 8. KHỞI ĐỘNG TRANG DỰ ÁN
   * ==========================================================================
   */
  function initProjectsPage() {
    renderResourceAllocation();
    renderProjectsGrid();
    initSmartSearch();
    initProjectModal();

    // Lắng nghe thay đổi Theme
    window.addEventListener('themeChanged', () => {
      renderProjectsGrid();
      renderResourceAllocation();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initProjectsPage);
  } else {
    initProjectsPage();
  }

})(window, document);
