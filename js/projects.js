/**
 * ==============================================================================
 * TASKFLOW PROJECT MANAGEMENT ENGINE (js/projects.js)
 * Mô tả: Bộ xử lý trung tâm cho Trang 2: Quản Lý Không Gian Dự Án.
 * Nâng cấp phiên bản chuẩn SaaS:
 *   1. Bảo vệ tuyến đường qua Auth.requireAuth().
 *   2. Click-to-Navigate: Nhấp cả thẻ mở ngay Bảng Kanban trong 0ms.
 *   3. Chủ động lật 3D (Manual 3D Flip): Nút "ℹ️ Chi tiết" xoay thẻ xem Typewriter.
 *   4. Thẻ Shortcut "+ Tạo Dự Án Mới" nét đứt chuẩn Trello ở đầu danh sách.
 *   5. Bộ lọc nhanh trạng thái (Filter Chips): Tất Cả, Đang Chạy, Quá Hạn, Tôi Tham Gia.
 *   6. Khối Phân Bổ Nguồn Lực Đội Ngũ thu gọn / mở rộng linh hoạt.
 *   7. Modal tạo/sửa dự án có Live Card Preview (WYSIWYG), Auto-Code Generator,
 *      Agile Quick Presets (+2 tuần Sprint) và Dirty Form Guard chống mất dữ liệu.
 * Tuân thủ: Rubric học phần, colorweb.md, skill.md và ai_detected.md.
 * Tác giả: Lead Frontend Architect & Senior UX/UI Specialist
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

  // Trạng thái bộ lọc hiện tại
  let currentFilterState = 'all'; // 'all' | 'active' | 'overdue' | 'my-projects'
  let isWorkloadCollapsed = false;
  let isModalDirty = false;

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
        if (Array.isArray(list) && list.length > 0) return list;
      }
      try {
        const raw = localStorage.getItem('TASKFLOW_DATA');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && Array.isArray(parsed.projects)) return parsed.projects;
        }
      } catch (e) {
        console.error('[DataEngine] Lỗi đọc projects:', e);
      }
      return [];
    },

    saveProjects(projects) {
      if (window.TaskFlowStorage && typeof window.TaskFlowStorage.set === 'function') {
        window.TaskFlowStorage.set(window.TaskFlowStorage.KEYS.PROJECTS, projects);
      } else {
        localStorage.setItem('taskflow_projects', JSON.stringify(projects));
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
        const list = window.TaskFlowStorage.get(window.TaskFlowStorage.KEYS.TASKS, []);
        if (Array.isArray(list) && list.length > 0) return list;
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

    saveTasks(tasks) {
      if (window.TaskFlowStorage && typeof window.TaskFlowStorage.set === 'function') {
        window.TaskFlowStorage.set(window.TaskFlowStorage.KEYS.TASKS, tasks);
      } else {
        localStorage.setItem('taskflow_tasks', JSON.stringify(tasks));
      }
      try {
        const raw = localStorage.getItem('TASKFLOW_DATA');
        const parsed = raw ? JSON.parse(raw) : {};
        parsed.tasks = tasks;
        localStorage.setItem('TASKFLOW_DATA', JSON.stringify(parsed));
      } catch (e) {
        console.error('[DataEngine] Lỗi ghi TASKFLOW_DATA (tasks):', e);
      }
    },

    getMembers() {
      if (window.TaskFlowStorage && typeof window.TaskFlowStorage.get === 'function') {
        const list = window.TaskFlowStorage.get(window.TaskFlowStorage.KEYS.MEMBERS, []);
        if (Array.isArray(list) && list.length > 0) return list;
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
   * Helper hiển thị Toast đồng bộ toàn hệ thống
   */
  function showToast(message, type = 'success') {
    if (typeof window.showToast === 'function') {
      window.showToast(message, type);
    } else if (authService && typeof authService.showToast === 'function') {
      authService.showToast(message, type);
    } else {
      alert(message);
    }
  }

  /**
   * ==========================================================================
   * 2. ĐỊNH DẠNG THỜI GIAN & TÍNH TOÁN NGÀY HẾT HẠN
   * ==========================================================================
   */
  function formatDeadlineInfo(deadlineStr) {
    if (!deadlineStr) {
      return {
        formatted: 'Chưa đặt hạn',
        isOverdue: false,
        daysRemainingText: 'Không giới hạn'
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
      daysRemainingText = 'Hết hạn hôm nay';
    } else if (diffDays === 1) {
      daysRemainingText = 'Còn 1 ngày';
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
   * ==========================================================================
   * 3. KHỐI PHÂN BỔ NGUỒN LỰC ĐỘI NGŨ (WORKLOAD ALLOCATION & COLLAPSE)
   * ==========================================================================
   */
  function renderResourceAllocation() {
    const container = document.getElementById('resourceAllocationContainer');
    if (!container) return;

    const members = DataEngine.getMembers();
    const tasks = DataEngine.getTasks();

    if (!members || members.length === 0) {
      container.innerHTML = '<p class="text-xs text-slate-500 py-2">Chưa có dữ liệu thành viên.</p>';
      return;
    }

    const html = members.map((member) => {
      const activeTasks = tasks.filter((t) => t.assigneeId === member.id && t.status !== 'done');
      const completedTasks = tasks.filter((t) => t.assigneeId === member.id && t.status === 'done');

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

      const workloadPercent = Math.min(100, Math.round((activeTasks.length / 5) * 100));

      return `
        <div class="p-3.5 rounded-xl bg-slate-50/80 dark:bg-slate-900/40 border border-slate-200 dark:border-white/10 flex flex-col justify-between hover:border-indigo-400/50 transition-all">
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2.5">
              <div class="relative">
                <img 
                  src="${member.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + encodeURIComponent(member.name)}" 
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

          <div class="space-y-1.5 mt-1">
            <div class="flex items-center justify-between text-[11px]">
              <span class="text-slate-500 dark:text-slate-400">Đang gánh: <b class="text-slate-800 dark:text-slate-200">${activeTasks.length} việc</b></span>
              <span class="text-slate-500 dark:text-slate-400">Đã xong: <b class="text-emerald-500 font-bold">${completedTasks.length}</b></span>
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
   * Khởi tạo nút thu gọn / mở rộng khối Workload
   */
  function initWorkloadToggle() {
    const btnToggle = document.getElementById('btnToggleWorkload');
    const container = document.getElementById('resourceAllocationContainer');
    const textEl = document.getElementById('toggleWorkloadText');
    const iconEl = document.getElementById('toggleWorkloadIcon');

    if (!btnToggle || !container) return;

    btnToggle.addEventListener('click', () => {
      isWorkloadCollapsed = !isWorkloadCollapsed;
      if (isWorkloadCollapsed) {
        container.classList.add('hidden');
        if (textEl) textEl.textContent = 'Mở rộng';
        if (iconEl) iconEl.classList.add('rotate-180');
      } else {
        container.classList.remove('hidden');
        if (textEl) textEl.textContent = 'Thu gọn';
        if (iconEl) iconEl.classList.remove('rotate-180');
      }
    });
  }

  /**
   * ==========================================================================
   * 4. BỘ LỌC TRẠNG THÁI NHANH (QUICK FILTER CHIPS: ALL, ACTIVE, OVERDUE, MINE)
   * ==========================================================================
   */
  function updateFilterCounts() {
    const projects = DataEngine.getProjects();
    const currentUser = authService && typeof authService.getCurrentUser === 'function' ? authService.getCurrentUser() : null;
    const currentUserId = currentUser ? currentUser.id || 'mem-01' : 'mem-01';

    let countAll = projects.length;
    let countActive = 0;
    let countOverdue = 0;
    let countMine = 0;

    projects.forEach((p) => {
      const deadline = formatDeadlineInfo(p.deadline);
      const isDone = (p.progress || 0) >= 100;

      if (!isDone && !deadline.isOverdue) countActive++;
      if (deadline.isOverdue && !isDone) countOverdue++;
      if (Array.isArray(p.members) && p.members.includes(currentUserId)) countMine++;
    });

    const elAll = document.getElementById('countFilterAll');
    const elActive = document.getElementById('countFilterActive');
    const elOverdue = document.getElementById('countFilterOverdue');
    const elMine = document.getElementById('countFilterMine');

    if (elAll) elAll.textContent = countAll;
    if (elActive) elActive.textContent = countActive;
    if (elOverdue) elOverdue.textContent = countOverdue;
    if (elMine) elMine.textContent = countMine;
  }

  function initFilterChips() {
    const filterButtons = document.querySelectorAll('.filter-chip');
    filterButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        filterButtons.forEach((b) => {
          b.classList.remove('active', 'bg-indigo-600', 'text-white', 'shadow-sm', 'shadow-indigo-500/20');
          b.classList.add('bg-slate-100', 'dark:bg-white/5', 'text-slate-600', 'dark:text-slate-300');
        });

        btn.classList.add('active', 'bg-indigo-600', 'text-white', 'shadow-sm', 'shadow-indigo-500/20');
        btn.classList.remove('bg-slate-100', 'dark:bg-white/5', 'text-slate-600', 'dark:text-slate-300');

        currentFilterState = btn.getAttribute('data-filter') || 'all';

        const badgeText = document.getElementById('badgeActiveFilterText');
        if (badgeText) {
          const labels = {
            all: 'Tất cả',
            active: '⚡ Đang chạy',
            overdue: '⚠️ Quá hạn',
            'my-projects': '👤 Tôi tham gia'
          };
          badgeText.textContent = labels[currentFilterState] || 'Tất cả';
        }

        applyCurrentFilters();
      });
    });
  }

  function getFilteredProjects() {
    const projects = DataEngine.getProjects();
    const currentUser = authService && typeof authService.getCurrentUser === 'function' ? authService.getCurrentUser() : null;
    const currentUserId = currentUser ? currentUser.id || 'mem-01' : 'mem-01';

    return projects.filter((p) => {
      const deadline = formatDeadlineInfo(p.deadline);
      const isDone = (p.progress || 0) >= 100;

      if (currentFilterState === 'active') return !isDone && !deadline.isOverdue;
      if (currentFilterState === 'overdue') return deadline.isOverdue && !isDone;
      if (currentFilterState === 'my-projects') return Array.isArray(p.members) && p.members.includes(currentUserId);
      return true; // 'all'
    });
  }

  function applyCurrentFilters() {
    const searchInput = document.getElementById('projectSearchInput');
    const query = searchInput ? searchInput.value.trim().toLowerCase() : '';

    let list = getFilteredProjects();

    if (query) {
      list = list.filter((p) => {
        const name = (p.name || '').toLowerCase();
        const code = (p.code || '').toLowerCase();
        const category = (p.category || '').toLowerCase();
        return name.includes(query) || code.includes(query) || category.includes(query);
      });
    }

    renderProjectsGrid(list);
  }

  /**
   * ==========================================================================
   * 5. RENDER LƯỚI DỰ ÁN (CLICK-TO-NAVIGATE, CHỦ ĐỘNG LẬT 3D & SHORTCUT CARD)
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

    updateFilterCounts();

    if (totalCounter) {
      totalCounter.innerHTML = `
        <span class="w-2 h-2 rounded-full bg-indigo-500"></span>
        <span>${projects.length} / ${allProjects.length} dự án</span>
      `;
    }

    // THẺ SHORTCUT ĐẦU TIÊN "+ TẠO DỰ ÁN MỚI" PHONG CÁCH TRELLO / NOTION
    const shortcutCardHtml = `
      <div 
        id="btnCardCreateProject" 
        class="glass-card p-6 border-2 border-dashed border-indigo-400/30 dark:border-indigo-500/30 hover:border-indigo-500 dark:hover:border-indigo-400 hover:bg-indigo-50/50 dark:hover:bg-indigo-500/5 transition-all duration-300 rounded-2xl flex flex-col items-center justify-center text-center cursor-pointer min-h-[330px] group shadow-sm hover:shadow-xl hover:-translate-y-1"
        title="Nhấp để khởi tạo dự án mới"
      >
        <div class="w-14 h-14 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-300 flex items-center justify-center mb-3.5 shadow-md shadow-indigo-500/15 group-hover:scale-110">
          <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"/></svg>
        </div>
        <h3 class="text-base font-bold text-slate-800 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
          Khởi Tạo Không Gian Mới
        </h3>
        <p class="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-[210px] leading-relaxed">
          Tạo bảng việc Agile, cấu hình hạn chót và phân bổ nhân sự
        </p>
      </div>
    `;

    if (projects.length === 0 && currentFilterState !== 'all') {
      container.innerHTML = `
        ${shortcutCardHtml}
        <div class="col-span-1 md:col-span-2 glass-card p-8 border border-slate-200 dark:border-white/10 flex flex-col items-center justify-center text-center min-h-[330px]">
          <span class="text-3xl mb-2">🔍</span>
          <p class="text-sm font-bold text-slate-800 dark:text-white">Không tìm thấy dự án khớp bộ lọc</p>
          <p class="text-xs text-slate-500 mt-1">Hãy thử chuyển bộ lọc hoặc tạo thêm dự án mới.</p>
        </div>
      `;
      bindCardInteractions();
      return;
    }

    const isAdmin = authService && typeof authService.hasRole === 'function' ? authService.hasRole('admin') : true;

    const cardsHtml = projects.map((project) => {
      const projTasks = tasks.filter((t) => t.projectId === project.id);
      const doneTasks = projTasks.filter((t) => t.status === 'done');
      const doingTasks = projTasks.filter((t) => t.status === 'doing');
      const todoTasks = projTasks.filter((t) => t.status === 'todo');

      const progress = projTasks.length > 0
        ? Math.round((doneTasks.length / projTasks.length) * 100)
        : (project.progress || 0);

      const deadlineInfo = formatDeadlineInfo(project.deadline);

      const assignedMembers = (project.members || [])
        .map((id) => members.find((m) => m.id === id))
        .filter(Boolean);

      const avatarClusterHtml = assignedMembers.slice(0, 3).map((m) => `
        <img 
          src="${m.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + encodeURIComponent(m.name)}" 
          alt="${m.name}" 
          title="${m.name} (${m.title || m.role})" 
          class="w-7 h-7 rounded-full object-cover border-2 border-white dark:border-slate-900 bg-slate-200 dark:bg-slate-800 -ml-2 first:ml-0 shadow-sm"
        />
      `).join('');

      const remainingMembersCount = assignedMembers.length - 3;
      const remainingBadgeHtml = remainingMembersCount > 0
        ? `<span class="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px] font-bold border-2 border-white dark:border-slate-900 -ml-2 flex items-center justify-center">+${remainingMembersCount}</span>`
        : '';

      const popoverMembersListHtml = assignedMembers.map((m) => `
        <div class="flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 transition-colors">
          <img src="${m.avatar}" alt="${m.name}" class="w-6 h-6 rounded-full object-cover bg-slate-200 dark:bg-slate-800"/>
          <div class="min-w-0 flex-1">
            <p class="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">${m.name}</p>
            <p class="text-[10px] text-slate-400 font-medium">${m.title || m.role}</p>
          </div>
        </div>
      `).join('');

      const projectColor = project.color || '#6366F1';

      return `
        <div class="flip-card group" data-project-id="${project.id}">
          <div class="flip-card-inner">
            
            <!-- ================= MẶT TRƯỚC (FRONT FACE) ================= -->
            <div 
              class="flip-card-front glass-card p-5 border border-slate-200/90 dark:border-white/10 shadow-sm dark:shadow-xl bg-white/85 dark:bg-slate-900/65"
              data-action="open-kanban"
              data-project-id="${project.id}"
            >
              
              <!-- Header Card Front: Tag danh mục & Nút thao tác -->
              <div class="flex items-center justify-between gap-2 mb-3">
                <span 
                  class="px-2.5 py-0.5 text-[11px] font-bold rounded-md uppercase tracking-wider font-mono"
                  style="background-color: ${projectColor}18; color: ${projectColor}; border: 1px solid ${projectColor}35;"
                >
                  ${project.code || 'PRJ'}
                </span>

                <div class="flex items-center gap-1">
                  <!-- Nút chủ động lật xem chi tiết 3D -->
                  <button 
                    type="button" 
                    class="btn-flip-card px-2 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-[11px] font-bold border border-indigo-200 dark:border-indigo-500/20 flex items-center gap-1 transition-all cursor-pointer"
                    title="Lật xem chi tiết mục tiêu Sprint"
                    data-action="flip"
                  >
                    <span>ℹ️ Chi tiết</span>
                  </button>

                  ${isAdmin ? `
                    <button 
                      type="button" 
                      data-action="edit" 
                      data-id="${project.id}" 
                      title="Chỉnh sửa dự án" 
                      class="btn-edit-project p-1.5 rounded-lg text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-white/5 transition-colors cursor-pointer"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                    </button>
                    <button 
                      type="button" 
                      data-action="delete" 
                      data-id="${project.id}" 
                      title="Xóa dự án" 
                      class="btn-delete-project p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-white/5 transition-colors cursor-pointer"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>
                  ` : ''}
                </div>
              </div>

              <!-- Tên dự án -->
              <h3 class="text-base font-bold text-slate-900 dark:text-white line-clamp-1 mb-2 tracking-tight group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                ${project.name}
              </h3>

              <!-- Hạn chót định dạng chuẩn: HH:mm - DD/MM/YYYY -->
              <div class="flex items-center justify-between text-xs mb-3.5">
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

              <!-- Footer Front Face: Cụm Avatar Đội Ngũ & Trạng thái Quá hạn -->
              <div class="pt-3 border-t border-slate-200 dark:border-slate-700/30 flex items-center justify-between relative mt-auto">
                
                <!-- Cụm Avatar có Popover khi Hover -->
                <div class="relative avatar-cluster-wrap">
                  <div class="flex items-center cursor-pointer avatar-trigger">
                    ${avatarClusterHtml || '<span class="text-xs text-slate-400">Chưa gán</span>'}
                    ${remainingBadgeHtml}
                  </div>

                  <!-- Flyout Popover danh sách đội ngũ Glassmorphism -->
                  <div class="team-flyout-popover absolute bottom-10 left-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200 dark:border-white/10 shadow-2xl rounded-2xl p-3.5 min-w-[240px] z-30 opacity-0 pointer-events-none transform translate-y-2 transition-all duration-200">
                    <p class="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Đội ngũ phụ trách dự án</p>
                    <div class="space-y-1 max-h-48 overflow-y-auto custom-scroll">
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

            </div>

            <!-- ================= MẶT SAU (BACK FACE) ================= -->
            <div class="flip-card-back glass-card p-5 border border-indigo-200 dark:border-indigo-500/30 shadow-2xl bg-white/95 dark:bg-slate-900/95 text-slate-800 dark:text-slate-100 flex flex-col justify-between">
              
              <div>
                <!-- Header Mặt sau: Nút quay lại mặt trước -->
                <div class="flex items-center justify-between border-b border-slate-200 dark:border-white/10 pb-2.5 mb-3">
                  <span class="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                    <span>🎯</span> Mục Tiêu Sprint
                  </span>
                  
                  <button 
                    type="button" 
                    class="btn-unflip-card px-2 py-1 rounded-lg bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/20 text-slate-700 dark:text-slate-300 text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer"
                    data-action="unflip"
                    title="Quay lại mặt trước"
                  >
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
                    <span>Mặt trước</span>
                  </button>
                </div>

                <!-- Hiệu ứng chữ Typewriter mặt sau giải mã chi tiết -->
                <div class="mb-3.5">
                  <p class="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Mục tiêu &amp; Mô tả:</p>
                  <p 
                    class="card-typewriter-desc text-xs text-slate-600 dark:text-slate-300 leading-relaxed min-h-[58px] font-mono bg-slate-50/50 dark:bg-slate-800/40 p-2.5 rounded-xl border border-slate-200/50 dark:border-white/5"
                    data-full-text="${encodeURIComponent(project.description || 'Chưa có mô tả kỹ thuật cho dự án này.')}"
                  >
                    <!-- Typewriter chạy tự động khi lật mặt sau -->
                  </p>
                </div>

                <!-- Thống kê task chi tiết -->
                <div class="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-slate-100/80 dark:bg-white/5 border border-slate-200 dark:border-white/5 text-center mb-3">
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

              <!-- Nút điều hướng sang Kanban Board ở mặt sau -->
              <div class="pt-2 border-t border-slate-200 dark:border-white/10">
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

    container.innerHTML = shortcutCardHtml + cardsHtml;

    bindCardInteractions();
  }

  /**
   * ==========================================================================
   * 6. GẮN SỰ KIỆN TƯƠNG TÁC THẺ (CLICK-TO-NAVIGATE & FLIP TỰ DO)
   * ==========================================================================
   */
  function bindCardInteractions() {
    // 1. Thẻ shortcut tạo dự án
    const btnShortcut = document.getElementById('btnCardCreateProject');
    if (btnShortcut) {
      btnShortcut.addEventListener('click', () => {
        const btnOpen = document.getElementById('btnOpenCreateProjectModal');
        if (btnOpen) btnOpen.click();
      });
    }

    // 2. Tương tác thẻ lật 3D và click mở Kanban
    const flipCards = document.querySelectorAll('.flip-card');
    flipCards.forEach((card) => {
      const cardFront = card.querySelector('.flip-card-front');
      const btnFlip = card.querySelector('[data-action="flip"]');
      const btnUnflip = card.querySelector('[data-action="unflip"]');
      const btnEdit = card.querySelector('.btn-edit-project');
      const btnDelete = card.querySelector('.btn-delete-project');
      const typewriterEl = card.querySelector('.card-typewriter-desc');

      // Click vào nút Lật ℹ️ Chi tiết
      if (btnFlip) {
        btnFlip.addEventListener('click', (e) => {
          e.stopPropagation();
          card.classList.add('is-flipped');
          if (typewriterEl) startCardTypewriter(typewriterEl);
        });
      }

      // Click vào nút Quay lại mặt trước
      if (btnUnflip) {
        btnUnflip.addEventListener('click', (e) => {
          e.stopPropagation();
          card.classList.remove('is-flipped');
        });
      }

      // Click vào nút Sửa
      if (btnEdit) {
        btnEdit.addEventListener('click', (e) => {
          e.stopPropagation();
          const projectId = btnEdit.getAttribute('data-id');
          handleEditProject(projectId);
        });
      }

      // Click vào nút Xóa
      if (btnDelete) {
        btnDelete.addEventListener('click', (e) => {
          e.stopPropagation();
          const projectId = btnDelete.getAttribute('data-id');
          handleDeleteProject(projectId);
        });
      }

      // CLICK VÀO MẶT TRƯỚC ➔ MỞ KANBAN BOARD NGAY LẬP TỨC
      if (cardFront) {
        cardFront.addEventListener('click', (e) => {
          // Bỏ qua nếu click vào nút bấm hoặc cụm avatar popover
          if (e.target.closest('button') || e.target.closest('.avatar-cluster-wrap')) {
            return;
          }
          const projectId = card.getAttribute('data-project-id');
          if (projectId) {
            window.location.href = `board.html?projectId=${encodeURIComponent(projectId)}`;
          }
        });
      }

      // Popover Avatar hover logic
      const avatarCluster = card.querySelector('.avatar-cluster-wrap');
      const popover = card.querySelector('.team-flyout-popover');
      if (avatarCluster && popover) {
        avatarCluster.addEventListener('mouseenter', () => {
          popover.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-2');
          popover.classList.add('opacity-100', 'pointer-events-auto', 'translate-y-0');
        });
        avatarCluster.addEventListener('mouseleave', () => {
          popover.classList.add('opacity-0', 'pointer-events-none', 'translate-y-2');
          popover.classList.remove('opacity-100', 'pointer-events-auto', 'translate-y-0');
        });
      }
    });
  }

  /**
   * Hiệu ứng Typewriter gõ từng chữ ở mặt sau
   */
  function startCardTypewriter(element) {
    if (!element || element.dataset.typing === 'true') return;

    const fullText = decodeURIComponent(element.getAttribute('data-full-text') || '');
    element.textContent = '';
    element.dataset.typing = 'true';

    let index = 0;
    const speed = 25; // ms mỗi ký tự

    function typeNextChar() {
      if (index < fullText.length) {
        element.textContent += fullText.charAt(index);
        index++;
        setTimeout(typeNextChar, speed);
      } else {
        element.dataset.typing = 'done';
      }
    }

    typeNextChar();
  }

  /**
   * ==========================================================================
   * 7. TÌM KIẾM THÔNG MINH AUTOCOMPLETE (GOOGLE-STYLE)
   * ==========================================================================
   */
  function initSmartSearch() {
    const input = document.getElementById('projectSearchInput');
    const dropdown = document.getElementById('searchAutocompleteDropdown');
    const btnClear = document.getElementById('btnClearSearch');

    if (!input || !dropdown) return;

    let activeSuggestionIndex = -1;
    let currentSuggestions = [];

    function renderDropdown(matches, query) {
      if (!matches || matches.length === 0) {
        dropdown.innerHTML = `
          <div class="p-4 text-xs text-slate-500 text-center">
            Không có gợi ý nào cho "<b>${escapeHtml(query)}</b>"
          </div>
        `;
        dropdown.classList.remove('hidden');
        return;
      }

      dropdown.innerHTML = matches.map((m, idx) => {
        const highlightedName = highlightMatch(m.name, query);
        return `
          <div 
            class="suggestion-item p-3 hover:bg-indigo-50/70 dark:hover:bg-white/5 cursor-pointer flex items-center justify-between text-xs transition-colors ${idx === activeSuggestionIndex ? 'bg-indigo-50/90 dark:bg-white/10' : ''}"
            data-index="${idx}"
            data-name="${m.name}"
          >
            <div class="flex items-center gap-2.5 min-w-0">
              <span class="w-2 h-2 rounded-full flex-shrink-0" style="background-color: ${m.color || '#6366F1'};"></span>
              <span class="font-bold text-slate-800 dark:text-slate-100 truncate">${highlightedName}</span>
              <span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-slate-400">${m.code || 'PRJ'}</span>
            </div>
            <span class="text-[11px] text-indigo-500 font-semibold ml-2 flex-shrink-0">${m.progress || 0}%</span>
          </div>
        `;
      }).join('');

      dropdown.classList.remove('hidden');

      dropdown.querySelectorAll('.suggestion-item').forEach((item) => {
        item.addEventListener('click', () => {
          const name = item.getAttribute('data-name');
          selectSuggestion(name);
        });
      });
    }

    function selectSuggestion(name) {
      input.value = name;
      dropdown.classList.add('hidden');
      if (btnClear) btnClear.classList.remove('hidden');
      applyCurrentFilters();
    }

    function highlightMatch(text, query) {
      if (!query) return escapeHtml(text);
      const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
      return escapeHtml(text).replace(regex, '<span class="bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 font-extrabold px-0.5 rounded">$1</span>');
    }

    function escapeHtml(str) {
      return (str || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
    }

    function escapeRegex(str) {
      return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    input.addEventListener('input', () => {
      const query = input.value.trim().toLowerCase();
      activeSuggestionIndex = -1;

      if (btnClear) {
        if (query) btnClear.classList.remove('hidden');
        else btnClear.classList.add('hidden');
      }

      if (!query) {
        dropdown.classList.add('hidden');
        applyCurrentFilters();
        return;
      }

      const all = DataEngine.getProjects();
      currentSuggestions = all.filter((p) => {
        const name = (p.name || '').toLowerCase();
        const code = (p.code || '').toLowerCase();
        const cat = (p.category || '').toLowerCase();
        return name.includes(query) || code.includes(query) || cat.includes(query);
      });

      renderDropdown(currentSuggestions, query);
      applyCurrentFilters();
    });

    // Keyboard navigation (Arrow Up/Down, Enter, Escape)
    input.addEventListener('keydown', (e) => {
      if (dropdown.classList.contains('hidden')) return;

      if (e.key === 'Escape') {
        dropdown.classList.add('hidden');
        return;
      }

      if (e.key === 'ArrowDown') {
        if (currentSuggestions.length > 0) {
          e.preventDefault();
          activeSuggestionIndex = (activeSuggestionIndex + 1) % currentSuggestions.length;
          updateActiveSuggestionHighlight();
        }
        return;
      }

      if (e.key === 'ArrowUp') {
        if (currentSuggestions.length > 0) {
          e.preventDefault();
          activeSuggestionIndex = (activeSuggestionIndex - 1 + currentSuggestions.length) % currentSuggestions.length;
          updateActiveSuggestionHighlight();
        }
        return;
      }

      if (e.key === 'Enter') {
        if (activeSuggestionIndex >= 0 && currentSuggestions[activeSuggestionIndex]) {
          e.preventDefault();
          selectSuggestion(currentSuggestions[activeSuggestionIndex].name);
        } else {
          dropdown.classList.add('hidden');
        }
      }
    });

    function updateActiveSuggestionHighlight() {
      const items = dropdown.querySelectorAll('.suggestion-item');
      items.forEach((it, idx) => {
        if (idx === activeSuggestionIndex) {
          it.classList.add('bg-indigo-50/90', 'dark:bg-white/10');
          it.scrollIntoView({ block: 'nearest' });
        } else {
          it.classList.remove('bg-indigo-50/90', 'dark:bg-white/10');
        }
      });
    }

    if (btnClear) {
      btnClear.addEventListener('click', () => {
        input.value = '';
        btnClear.classList.add('hidden');
        dropdown.classList.add('hidden');
        applyCurrentFilters();
        input.focus();
      });
    }

    // Đóng dropdown khi click ra ngoài hoặc cuộn trang
    document.addEventListener('click', (e) => {
      if (!input.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.classList.add('hidden');
      }
    });

    const mainContainer = document.querySelector('main');
    if (mainContainer) {
      mainContainer.addEventListener('scroll', () => {
        if (!dropdown.classList.contains('hidden')) {
          dropdown.classList.add('hidden');
        }
      }, { passive: true });
    }
  }

  /**
   * ==========================================================================
   * 8. MODAL KHỞI TẠO / SỬA DỰ ÁN (LIVE CARD PREVIEW & AGILE PRESETS)
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

    // Live preview elements
    const previewBox = document.getElementById('liveCardPreviewBox');
    const previewName = document.getElementById('previewProjectName');
    const previewCode = document.getElementById('previewProjectCode');
    const previewCat = document.getElementById('previewCategory');
    const previewDeadline = document.getElementById('previewDeadlineText');
    const previewBar = document.getElementById('previewProgressBar');

    const inputName = document.getElementById('projectNameInput');
    const inputCode = document.getElementById('projectCodeInput');
    const inputCat = document.getElementById('projectCategoryInput');
    const inputDeadline = document.getElementById('projectDeadline');
    const inputDesc = document.getElementById('projectDescInput');
    const btnAutoCode = document.getElementById('btnAutoGenerateCode');

    const btnSelectAll = document.getElementById('btnSelectAllMembers');
    const btnClearMembers = document.getElementById('btnClearMembers');
    const memberCountBadge = document.getElementById('selectedMemberCountBadge');

    if (!modalBackdrop || !form) return;

    // 1. Cập nhật Live Card Preview theo thời gian thực
    function updateLivePreview() {
      const name = (inputName ? inputName.value.trim() : '') || 'Tên dự án mẫu...';
      const code = (inputCode ? inputCode.value.trim().toUpperCase() : '') || 'PRJ-NEW';
      const cat = (inputCat ? inputCat.value.trim() : '') || 'Agile Sprint';
      const deadline = inputDeadline ? inputDeadline.value : '';
      const color = (hiddenColorInput ? hiddenColorInput.value : '#6366F1') || '#6366F1';

      if (previewName) previewName.textContent = name;
      if (previewCode) {
        previewCode.textContent = code;
        previewCode.style.backgroundColor = `${color}18`;
        previewCode.style.color = color;
        previewCode.style.borderColor = `${color}35`;
      }
      if (previewCat) previewCat.textContent = cat;
      if (previewDeadline) {
        const info = formatDeadlineInfo(deadline);
        previewDeadline.textContent = `Hạn chót: ${info.formatted}`;
      }
      if (previewBar) {
        previewBar.style.background = `linear-gradient(90deg, ${color}, #8B5CF6)`;
      }
      if (previewBox) {
        previewBox.style.borderColor = `${color}50`;
        previewBox.style.boxShadow = `0 8px 20px -4px ${color}25`;
      }
    }

    // 2. Tự động sinh mã dự án từ tên (Live Code Generation)
    function autoGenerateCodeFromName() {
      if (!inputName || !inputCode) return;
      const name = inputName.value.trim();
      if (!name) return;

      // Trích xuất chữ cái đầu của mỗi từ: "Cổng Thanh Toán VNPay" -> "CTTVNP"
      const words = name.split(/\s+/).filter(Boolean);
      let acronym = words.map(w => w.charAt(0).toUpperCase()).join('');
      if (acronym.length < 2) acronym = name.slice(0, 3).toUpperCase();
      acronym = acronym.replace(/[^A-Z0-9]/g, '');

      inputCode.value = `PRJ-${acronym}`;
      updateLivePreview();
    }

    if (inputName) {
      inputName.addEventListener('input', () => {
        isModalDirty = true;
        // Chỉ tự sinh mã nếu người dùng chưa tự gõ tay vào ô mã
        if (!inputCode.dataset.userEdited) {
          autoGenerateCodeFromName();
        }
        updateLivePreview();
      });
    }

    if (inputCode) {
      inputCode.addEventListener('input', () => {
        isModalDirty = true;
        inputCode.dataset.userEdited = 'true';
        updateLivePreview();
      });
    }

    if (btnAutoCode) {
      btnAutoCode.addEventListener('click', () => {
        const randomDigits = Math.floor(100 + Math.random() * 900);
        inputCode.value = `PRJ-${randomDigits}`;
        inputCode.dataset.userEdited = 'true';
        updateLivePreview();
      });
    }

    if (inputCat) {
      inputCat.addEventListener('input', () => {
        isModalDirty = true;
        updateLivePreview();
      });
    }

    if (inputDeadline) {
      inputDeadline.addEventListener('change', () => {
        isModalDirty = true;
        updateLivePreview();
      });
    }

    // 3. Phím tắt chọn hạn chót Agile Quick Presets (+1 tuần, +2 tuần Sprint, +1 tháng)
    const presetButtons = document.querySelectorAll('.btn-preset-deadline');
    presetButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const days = parseInt(btn.getAttribute('data-days'), 10) || 14;
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + days);
        targetDate.setHours(18, 0, 0, 0);

        const tzOffset = targetDate.getTimezoneOffset() * 60000;
        const localISO = new Date(targetDate.getTime() - tzOffset).toISOString().slice(0, 16);

        if (inputDeadline) {
          inputDeadline.value = localISO;
          isModalDirty = true;
          updateLivePreview();
        }
      });
    });

    // 4. Chọn màu sắc nhận diện
    colorButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        colorButtons.forEach((b) => b.classList.remove('ring-2', 'ring-offset-2', 'ring-indigo-500', 'ring-offset-slate-900'));
        btn.classList.add('ring-2', 'ring-offset-2', 'ring-indigo-500', 'ring-offset-slate-900');
        const color = btn.getAttribute('data-color') || '#6366F1';
        if (hiddenColorInput) hiddenColorInput.value = color;
        isModalDirty = true;
        updateLivePreview();
      });
    });

    // 5. Quản lý danh sách thành viên phân bổ
    function updateSelectedMembersBadge() {
      const selected = document.querySelectorAll('input[name="projectMembers"]:checked');
      if (memberCountBadge) memberCountBadge.textContent = selected.length;
    }

    function populateMembersCheckboxes(selectedIds = []) {
      if (!membersContainer) return;
      const members = DataEngine.getMembers();

      membersContainer.innerHTML = members.map((m) => {
        const isChecked = selectedIds.includes(m.id) ? 'checked' : '';
        return `
          <label class="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-200/50 dark:hover:bg-white/5 cursor-pointer text-xs transition-colors">
            <input type="checkbox" name="projectMembers" value="${m.id}" ${isChecked} class="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 dark:border-slate-700 cursor-pointer"/>
            <img src="${m.avatar}" alt="${m.name}" class="w-6 h-6 rounded-full object-cover bg-slate-200 dark:bg-slate-800"/>
            <span class="font-bold text-slate-800 dark:text-slate-200">${m.name}</span>
            <span class="text-[10px] text-slate-400 font-medium uppercase">(${m.title || m.role})</span>
          </label>
        `;
      }).join('');

      updateSelectedMembersBadge();

      membersContainer.querySelectorAll('input[name="projectMembers"]').forEach((cb) => {
        cb.addEventListener('change', () => {
          isModalDirty = true;
          updateSelectedMembersBadge();
        });
      });
    }

    if (btnSelectAll) {
      btnSelectAll.addEventListener('click', () => {
        document.querySelectorAll('input[name="projectMembers"]').forEach((cb) => (cb.checked = true));
        isModalDirty = true;
        updateSelectedMembersBadge();
      });
    }

    if (btnClearMembers) {
      btnClearMembers.addEventListener('click', () => {
        document.querySelectorAll('input[name="projectMembers"]').forEach((cb) => (cb.checked = false));
        isModalDirty = true;
        updateSelectedMembersBadge();
      });
    }

    // 6. Mở modal Tạo Mới
    if (btnOpen) {
      btnOpen.addEventListener('click', () => {
        document.getElementById('modalTitle').textContent = 'Khởi Tạo Không Gian Dự Án Mới';
        document.getElementById('editProjectId').value = '';
        form.reset();
        isModalDirty = false;
        if (inputCode) delete inputCode.dataset.userEdited;

        // Đặt hạn chót mặc định: +14 ngày Sprint vào lúc 18:00
        const defaultDate = new Date();
        defaultDate.setDate(defaultDate.getDate() + 14);
        defaultDate.setHours(18, 0, 0, 0);
        const tzOffset = defaultDate.getTimezoneOffset() * 60000;
        const localISO = new Date(defaultDate.getTime() - tzOffset).toISOString().slice(0, 16);
        if (inputDeadline) inputDeadline.value = localISO;

        // Reset màu về mặc định Indigo
        if (hiddenColorInput) hiddenColorInput.value = '#6366F1';
        colorButtons.forEach((b) => b.classList.remove('ring-2', 'ring-offset-2', 'ring-indigo-500', 'ring-offset-slate-900'));
        if (colorButtons[0]) colorButtons[0].classList.add('ring-2', 'ring-offset-2', 'ring-indigo-500', 'ring-offset-slate-900');

        populateMembersCheckboxes(['mem-01']);
        updateLivePreview();
        modalBackdrop.classList.remove('hidden');
        if (inputName) setTimeout(() => inputName.focus(), 100);
      });
    }

    // 7. Đóng modal có Dirty Form Guard
    function attemptCloseModal() {
      if (isModalDirty) {
        if (!confirm('Bạn có các thay đổi chưa được lưu. Bạn có chắc chắn muốn hủy bỏ?')) {
          return;
        }
      }
      modalBackdrop.classList.add('hidden');
      form.reset();
      isModalDirty = false;
    }

    if (btnClose) btnClose.addEventListener('click', attemptCloseModal);
    if (btnCancel) btnCancel.addEventListener('click', attemptCloseModal);

    modalBackdrop.addEventListener('click', (e) => {
      if (e.target === modalBackdrop) attemptCloseModal();
    });

    // 8. Submit Form (Tạo mới hoặc Cập nhật)
    form.addEventListener('submit', (e) => {
      e.preventDefault();

      const editId = document.getElementById('editProjectId').value;
      const name = inputName.value.trim();
      let code = inputCode.value.trim().toUpperCase();
      const category = inputCat.value.trim() || 'Agile Sprint';
      const deadline = inputDeadline.value;
      const description = inputDesc.value.trim();
      const color = (hiddenColorInput ? hiddenColorInput.value : '#6366F1') || '#6366F1';

      if (!name) {
        showToast('Vui lòng nhập tên dự án!', 'warning');
        return;
      }

      if (!code) {
        code = 'PRJ-' + Math.floor(100 + Math.random() * 900);
      }

      const selectedMembers = Array.from(
        document.querySelectorAll('input[name="projectMembers"]:checked')
      ).map((cb) => cb.value);

      const projects = DataEngine.getProjects();
      const currentUser = authService && typeof authService.getCurrentUser === 'function' ? authService.getCurrentUser() : null;
      const ownerId = currentUser ? currentUser.id || 'mem-01' : 'mem-01';

      if (editId) {
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
            members: selectedMembers.length > 0 ? selectedMembers : ['mem-01']
          };
          DataEngine.saveProjects(projects);
          showToast(`Đã cập nhật dự án "${name}" thành công!`, 'success');
        }
      } else {
        const newProject = {
          id: 'proj-' + Date.now(),
          name,
          code,
          category,
          description: description || 'Mục tiêu hoàn thành đúng thời hạn Sprint với chất lượng kiểm thử tối ưu.',
          status: 'active',
          progress: 0,
          startDate: new Date().toISOString().slice(0, 10),
          deadline: deadline || new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 16),
          members: selectedMembers.length > 0 ? selectedMembers : [ownerId],
          ownerId: ownerId,
          color
        };

        projects.unshift(newProject);
        DataEngine.saveProjects(projects);
        showToast(`Đã khởi tạo không gian dự án "${name}" thành công!`, 'success');
      }

      isModalDirty = false;
      modalBackdrop.classList.add('hidden');
      form.reset();

      applyCurrentFilters();
      renderResourceAllocation();
    });
  }

  // 9. Xử lý Chỉnh sửa dự án
  function handleEditProject(projectId) {
    const projects = DataEngine.getProjects();
    const project = projects.find((p) => p.id === projectId);
    if (!project) return;

    const modalBackdrop = document.getElementById('projectModalBackdrop');
    const form = document.getElementById('projectForm');
    const colorButtons = document.querySelectorAll('.color-choice');
    const hiddenColorInput = document.getElementById('selectedProjectColor');

    document.getElementById('modalTitle').textContent = `Chỉnh Sửa: ${project.name}`;
    document.getElementById('editProjectId').value = project.id;
    document.getElementById('projectNameInput').value = project.name || '';
    
    const inputCode = document.getElementById('projectCodeInput');
    if (inputCode) {
      inputCode.value = project.code || '';
      inputCode.dataset.userEdited = 'true';
    }

    document.getElementById('projectCategoryInput').value = project.category || '';
    document.getElementById('projectDeadline').value = project.deadline ? project.deadline.slice(0, 16) : '';
    document.getElementById('projectDescInput').value = project.description || '';

    const color = project.color || '#6366F1';
    if (hiddenColorInput) hiddenColorInput.value = color;

    colorButtons.forEach((btn) => {
      btn.classList.remove('ring-2', 'ring-offset-2', 'ring-indigo-500', 'ring-offset-slate-900');
      if (btn.getAttribute('data-color') === color) {
        btn.classList.add('ring-2', 'ring-offset-2', 'ring-indigo-500', 'ring-offset-slate-900');
      }
    });

    const membersContainer = document.getElementById('membersCheckboxContainer');
    if (membersContainer) {
      const members = DataEngine.getMembers();
      const selectedIds = project.members || [];

      membersContainer.innerHTML = members.map((m) => {
        const isChecked = selectedIds.includes(m.id) ? 'checked' : '';
        return `
          <label class="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-200/50 dark:hover:bg-white/5 cursor-pointer text-xs">
            <input type="checkbox" name="projectMembers" value="${m.id}" ${isChecked} class="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 dark:border-slate-700 cursor-pointer"/>
            <img src="${m.avatar}" alt="${m.name}" class="w-6 h-6 rounded-full object-cover bg-slate-200 dark:bg-slate-800"/>
            <span class="font-bold text-slate-800 dark:text-slate-200">${m.name}</span>
            <span class="text-[10px] text-slate-400 font-medium uppercase">(${m.title || m.role})</span>
          </label>
        `;
      }).join('');

      const memberCountBadge = document.getElementById('selectedMemberCountBadge');
      if (memberCountBadge) memberCountBadge.textContent = selectedIds.length;
    }

    // Kích hoạt cập nhật Live Preview
    const previewName = document.getElementById('previewProjectName');
    const previewCode = document.getElementById('previewProjectCode');
    const previewCat = document.getElementById('previewCategory');
    const previewDeadline = document.getElementById('previewDeadlineText');
    const previewBar = document.getElementById('previewProgressBar');
    const previewBox = document.getElementById('liveCardPreviewBox');

    if (previewName) previewName.textContent = project.name;
    if (previewCode) {
      previewCode.textContent = project.code || 'PRJ';
      previewCode.style.backgroundColor = `${color}18`;
      previewCode.style.color = color;
      previewCode.style.borderColor = `${color}35`;
    }
    if (previewCat) previewCat.textContent = project.category || 'Agile Sprint';
    if (previewDeadline) {
      const info = formatDeadlineInfo(project.deadline);
      previewDeadline.textContent = `Hạn chót: ${info.formatted}`;
    }
    if (previewBar) {
      previewBar.style.background = `linear-gradient(90deg, ${color}, #8B5CF6)`;
    }
    if (previewBox) {
      previewBox.style.borderColor = `${color}50`;
      previewBox.style.boxShadow = `0 8px 20px -4px ${color}25`;
    }

    isModalDirty = false;
    modalBackdrop.classList.remove('hidden');
  }

  // 10. Xử lý Xóa dự án (Admin hoặc Chủ dự án)
  /**
   * ==========================================================================
   * 9. MODAL XÁC NHẬN XÓA DỰ ÁN (CUSTOM GLASS CONFIRMATION MODAL)
   * ==========================================================================
   */
  let pendingDeleteProjectId = null;

  function initDeleteConfirmModal() {
    const modalBackdrop = document.getElementById('deleteConfirmModalBackdrop');
    const nameTarget = document.getElementById('deleteProjectNameTarget');
    const codeTarget = document.getElementById('deleteProjectCodeTarget');
    const btnCancel = document.getElementById('btnCancelDeleteModal');
    const btnConfirm = document.getElementById('btnConfirmDeleteProject');

    if (!modalBackdrop || !btnConfirm) return;

    function closeModal() {
      pendingDeleteProjectId = null;
      modalBackdrop.classList.add('hidden');
    }

    if (btnCancel) btnCancel.addEventListener('click', closeModal);

    modalBackdrop.addEventListener('click', (e) => {
      if (e.target === modalBackdrop) {
        closeModal();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !modalBackdrop.classList.contains('hidden')) {
        closeModal();
      }
    });

    btnConfirm.addEventListener('click', () => {
      if (!pendingDeleteProjectId) return;

      const projects = DataEngine.getProjects();
      const project = projects.find((p) => p.id === pendingDeleteProjectId);
      const projectName = project ? project.name : 'Dự án';

      // 1. Cập nhật danh sách dự án
      const updatedProjects = projects.filter((p) => p.id !== pendingDeleteProjectId);
      DataEngine.saveProjects(updatedProjects);

      // 2. Dọn sạch các thẻ công việc liên kết trên Bảng Kanban
      const allTasks = DataEngine.getTasks();
      const updatedTasks = allTasks.filter((t) => t.projectId !== pendingDeleteProjectId);
      DataEngine.saveTasks(updatedTasks);

      // 3. Hiển thị thông báo Toast chuẩn Glassmorphism
      showToast(`Đã xóa vĩnh viễn không gian dự án "${projectName}".`, 'info');

      // 4. Đóng modal và tái render giao diện
      closeModal();
      applyCurrentFilters();
      renderResourceAllocation();
    });
  }

  // Mở modal xác nhận xóa thay thế hộp thoại confirm mặc định của trình duyệt
  function handleDeleteProject(projectId) {
    const projects = DataEngine.getProjects();
    const project = projects.find((p) => p.id === projectId);
    if (!project) return;

    pendingDeleteProjectId = projectId;
    const modalBackdrop = document.getElementById('deleteConfirmModalBackdrop');
    const nameTarget = document.getElementById('deleteProjectNameTarget');
    const codeTarget = document.getElementById('deleteProjectCodeTarget');

    if (nameTarget) nameTarget.textContent = `"${project.name}"`;
    if (codeTarget) codeTarget.textContent = project.code || 'PRJ';

    if (modalBackdrop) {
      modalBackdrop.classList.remove('hidden');
    }
  }

  /**
   * ==========================================================================
   * 10. KHỞI ĐỘNG TRANG DỰ ÁN KHI TẢI XONG DOM
   * ==========================================================================
   */
  function initProjectsPage() {
    renderResourceAllocation();
    initWorkloadToggle();
    initFilterChips();
    applyCurrentFilters();
    initSmartSearch();
    initProjectModal();
    initDeleteConfirmModal();

    window.addEventListener('themeChanged', () => {
      applyCurrentFilters();
      renderResourceAllocation();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initProjectsPage);
  } else {
    initProjectsPage();
  }

})(window, document);
