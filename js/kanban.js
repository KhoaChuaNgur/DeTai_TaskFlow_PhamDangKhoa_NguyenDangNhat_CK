/**
 * ==============================================================================
 * TASKFLOW KANBAN WORKSPACE ENGINE (js/kanban.js)
 * Mô tả: Phân hệ Quản trị Bảng việc Agile kéo thả 60fps & Tính toán tiến độ tự động.
 * Nâng cấp: Keyword Highlight, Card Slide-down, KPI Count-up, Flash highlight, 
 *           nút Loading state & Custom dropdowns theo Rubric.
 * Kiến trúc: Vanilla JS (ES6+ Module Pattern), tuân thủ 100% Safety & Isolation Rules.
 * Tác giả: Lead Frontend Architect (Thành viên B)
 * ==============================================================================
 */

(function (window, document) {
  'use strict';

  /**
   * 1. BẢO VỆ TUYẾN ĐƯỜNG (AUTH GUARD AN TOÀN)
   */
  const authService = window.Auth || window.TaskFlowAuth;
  if (authService && typeof authService.requireAuth === 'function') {
    try {
      authService.requireAuth();
    } catch (e) {
      console.warn('[Kanban] Auth check warning:', e);
    }
  }

  /**
   * 2. BỘ KHÓA & DỮ LIỆU ĐỒNG BỘ HAI CHIỀU (DUAL-STORAGE ENGINE)
   * Đồng bộ giữa TaskFlowStorage (namespaced) và key thống nhất TASKFLOW_DATA
   */
  const STORAGE_KEYS = Object.freeze({
    PROJECTS: (window.TaskFlowStorage && window.TaskFlowStorage.KEYS && window.TaskFlowStorage.KEYS.PROJECTS) || 'taskflow_projects',
    TASKS: (window.TaskFlowStorage && window.TaskFlowStorage.KEYS && window.TaskFlowStorage.KEYS.TASKS) || 'taskflow_tasks',
    MEMBERS: (window.TaskFlowStorage && window.TaskFlowStorage.KEYS && window.TaskFlowStorage.KEYS.MEMBERS) || 'taskflow_members',
    TASKFLOW_DATA: 'TASKFLOW_DATA'
  });

  const KanbanData = {
    /**
     * Lấy danh sách dự án
     */
    getProjects() {
      if (window.TaskFlowStorage && typeof window.TaskFlowStorage.get === 'function') {
        const list = window.TaskFlowStorage.get(STORAGE_KEYS.PROJECTS, []);
        if (Array.isArray(list) && list.length > 0) return list;
      }
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.TASKFLOW_DATA);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && Array.isArray(parsed.projects) && parsed.projects.length > 0) {
            return parsed.projects;
          }
        }
      } catch (e) {
        console.error('[KanbanData] Lỗi đọc projects:', e);
      }
      return [];
    },

    /**
     * Lưu danh sách dự án (đồng bộ 2 chiều)
     */
    saveProjects(projects) {
      if (window.TaskFlowStorage && typeof window.TaskFlowStorage.set === 'function') {
        window.TaskFlowStorage.set(STORAGE_KEYS.PROJECTS, projects);
      }
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.TASKFLOW_DATA);
        const parsed = raw ? JSON.parse(raw) : {};
        parsed.projects = projects;
        localStorage.setItem(STORAGE_KEYS.TASKFLOW_DATA, JSON.stringify(parsed));
      } catch (e) {
        console.error('[KanbanData] Lỗi ghi projects:', e);
      }
    },

    /**
     * Lấy danh sách thành viên
     */
    getMembers() {
      if (window.TaskFlowStorage && typeof window.TaskFlowStorage.get === 'function') {
        const list = window.TaskFlowStorage.get(STORAGE_KEYS.MEMBERS, []);
        if (Array.isArray(list) && list.length > 0) return list;
      }
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.TASKFLOW_DATA);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && Array.isArray(parsed.members) && parsed.members.length > 0) {
            return parsed.members;
          }
        }
      } catch (e) {}

      // Mặc định chuẩn danh tính thành viên nhóm
      return [
        {
          id: 'mem-01',
          name: 'Phạm Đăng Khoa',
          role: 'Admin',
          avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=KhoaPham&backgroundColor=6366f1'
        },
        {
          id: 'mem-02',
          name: 'Nguyễn Đăng Nhật',
          role: 'Member',
          avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=NhatNguyen&backgroundColor=8b5cf6'
        }
      ];
    },

    /**
     * Lấy danh sách Tasks và chuẩn hóa thuộc tính tương thích tuyệt đối
     */
    getTasks() {
      let tasks = [];
      if (window.TaskFlowStorage && typeof window.TaskFlowStorage.get === 'function') {
        tasks = window.TaskFlowStorage.get(STORAGE_KEYS.TASKS, []);
      }
      if (!tasks || tasks.length === 0) {
        try {
          const raw = localStorage.getItem(STORAGE_KEYS.TASKFLOW_DATA);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && Array.isArray(parsed.tasks)) {
              tasks = parsed.tasks;
            }
          }
        } catch (e) {
          console.error('[KanbanData] Lỗi đọc tasks:', e);
        }
      }

      // Chuẩn hóa schema cho từng task để không bị thiếu trường
      const members = this.getMembers();
      return tasks.map(t => {
        let assignee = t.assignee;
        if (!assignee) {
          const foundMember = members.find(m => m.id === t.assigneeId);
          if (foundMember) {
            assignee = { name: foundMember.name, avatar: foundMember.avatar };
          } else {
            assignee = {
              name: 'Đăng Khoa',
              avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Khoa'
            };
          }
        }

        return {
          id: t.id || 'task-' + Math.floor(100 + Math.random() * 900),
          projectId: t.projectId || 'proj-101',
          title: t.title || 'Công việc chưa đặt tên',
          description: t.description || '',
          status: t.status || 'todo', // 'todo' | 'doing' | 'done'
          priority: t.priority || 'medium', // 'low' | 'medium' | 'high' | 'critical'
          assignee: assignee,
          assigneeId: t.assigneeId || (members[0] && members[0].id) || 'mem-01',
          startDateTime: t.startDateTime || (t.startDate ? `${t.startDate}T08:00` : '2026-10-20T08:00'),
          dueDateTime: t.dueDateTime || (t.dueDate ? `${t.dueDate}T18:00` : '2026-10-25T18:00'),
          spentHours: typeof t.spentHours === 'number' ? t.spentHours : 0,
          estimatedHours: typeof t.estimatedHours === 'number' ? t.estimatedHours : 8,
          tags: Array.isArray(t.tags) ? t.tags : ['Sprint']
        };
      });
    },

    /**
     * Lưu danh sách Tasks vào LocalStorage (Đồng bộ kép)
     */
    saveTasks(tasks) {
      if (window.TaskFlowStorage && typeof window.TaskFlowStorage.set === 'function') {
        window.TaskFlowStorage.set(STORAGE_KEYS.TASKS, tasks);
      }
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.TASKFLOW_DATA);
        const parsed = raw ? JSON.parse(raw) : {};
        parsed.tasks = tasks;
        localStorage.setItem(STORAGE_KEYS.TASKFLOW_DATA, JSON.stringify(parsed));
      } catch (e) {
        console.error('[KanbanData] Lỗi ghi tasks:', e);
      }
    }
  };

  /**
   * 3. GLASSMORPHISM TOAST NOTIFICATION ENGINE
   * Hiển thị thông báo trượt mượt mà góc màn hình chuẩn design system
   */
  function showToast(message, type = 'success') {
    if (typeof window.showToast === 'function') {
      window.showToast(message, type);
      return;
    }
    let container = document.getElementById('toastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toastContainer';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'toast-item';

    const icons = {
      success: `<span class="text-emerald-500 flex-shrink-0"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg></span>`,
      info: `<span class="text-indigo-500 flex-shrink-0"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></span>`,
      warning: `<span class="text-amber-500 flex-shrink-0"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg></span>`,
      error: `<span class="text-rose-500 flex-shrink-0"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg></span>`
    };

    toast.innerHTML = `
      ${icons[type] || icons.success}
      <div class="flex-1 text-xs sm:text-sm font-medium text-slate-800 dark:text-slate-100">
        ${message}
      </div>
      <button type="button" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 transition-colors" title="Đóng">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
      </button>
    `;

    const closeBtn = toast.querySelector('button');
    const dismissToast = () => {
      toast.classList.add('is-dismissing');
      setTimeout(() => toast.remove(), 280);
    };

    closeBtn.addEventListener('click', dismissToast);
    container.appendChild(toast);

    setTimeout(() => {
      if (toast.parentElement) dismissToast();
    }, 3800);
  }

  /**
   * 4. COUNT-UP ANIMATION & HIGHLIGHT FLASH ENGINE
   * Hiệu ứng số chạy mượt mà kèm nhấp nháy phát sáng khi dữ liệu KPI thay đổi
   */
  function animateCountUp(element, targetValue, duration = 400) {
    if (!element) return;
    const startValue = parseInt(element.textContent, 10) || 0;
    if (startValue === targetValue) return;

    const startTime = performance.now();
    function step(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      const currentNumber = Math.round(startValue + (targetValue - startValue) * easeProgress);
      element.textContent = currentNumber;

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        element.textContent = targetValue;
      }
    }
    requestAnimationFrame(step);
  }

  function triggerHighlightFlash(wrapperEl) {
    if (!wrapperEl) return;
    wrapperEl.classList.remove('kpi-change-highlight');
    // Force DOM reflow
    void wrapperEl.offsetWidth;
    wrapperEl.classList.add('kpi-change-highlight');
    setTimeout(() => {
      wrapperEl.classList.remove('kpi-change-highlight');
    }, 700);
  }

  /**
   * 5. KEYWORD HIGHLIGHT HELPER
   * Tô nổi từ khóa tìm kiếm trong tiêu đề, mô tả và tags
   */
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function highlightMatches(text, query) {
    if (!text) return '';
    const safeText = escapeHtml(text);
    if (!query || !query.trim()) return safeText;

    const trimmedQuery = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${trimmedQuery})`, 'gi');
    return safeText.replace(regex, '<mark class="search-highlight">$1</mark>');
  }

  /**
   * 6. CÔNG THỨC TÍNH TIẾN ĐỘ TỰ ĐỘNG & ĐỒNG BỘ DỰ ÁN
   * Ngay khi task chuyển sang 'done' hoặc thay đổi trạng thái,
   * tự động tính: Tiến độ (%) = (Số task Done / Tổng số task) * 100
   * Cập nhật ngay vào dự án tương ứng trong LocalStorage.
   */
  function recalculateProjectProgress(projectId) {
    if (!projectId) return null;

    const projects = KanbanData.getProjects();
    const tasks = KanbanData.getTasks();

    const targetProjectIndex = projects.findIndex(p => p.id === projectId);
    if (targetProjectIndex === -1) return null;

    const projectTasks = tasks.filter(t => t.projectId === projectId);
    const totalCount = projectTasks.length;
    const doneCount = projectTasks.filter(t => t.status === 'done').length;

    const newProgress = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
    projects[targetProjectIndex].progress = newProgress;

    // Lưu dự án đã cập nhật tiến độ
    KanbanData.saveProjects(projects);

    return {
      project: projects[targetProjectIndex],
      progress: newProgress,
      doneCount,
      totalCount
    };
  }

  /**
   * 7. HELPER FORMAT NGÀY & KIỂM TRA QUÁ HẠN
   */
  function formatDateTimeDisplay(dateTimeStr) {
    if (!dateTimeStr) return 'Chưa đặt hạn';
    try {
      const d = new Date(dateTimeStr);
      if (isNaN(d.getTime())) return dateTimeStr;

      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const MM = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();

      return `${hh}:${mm} - ${dd}/${MM}/${yyyy}`;
    } catch (e) {
      return dateTimeStr;
    }
  }

  function isTaskOverdue(dueDateTimeStr, status) {
    if (status === 'done' || !dueDateTimeStr) return false;
    try {
      const due = new Date(dueDateTimeStr).getTime();
      return !isNaN(due) && due < Date.now();
    } catch (e) {
      return false;
    }
  }

  /**
   * 8. KANBAN CONTROLLER & UI RENDERER
   */
  const KanbanApp = {
    currentSearch: '',
    currentProjectFilter: 'all',
    currentPriorityFilter: 'all',
    draggedTaskId: null,
    previousCounts: { total: -1, todo: -1, doing: -1, done: -1, progress: -1 },

    init() {
      this.populateProjectFilter();
      this.populateModalDropdowns();
      this.bindEvents();
      this.render();
    },

    /**
     * Nạp danh sách dự án vào Dropdown Lọc
     */
    populateProjectFilter() {
      const select = document.getElementById('filterProject');
      if (!select) return;

      const projects = KanbanData.getProjects();
      const currentVal = select.value;

      select.innerHTML = `<option value="all">Tất cả dự án (${projects.length})</option>`;
      projects.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = `${p.name} (${p.code || 'PRJ'})`;
        select.appendChild(opt);
      });

      if (currentVal) select.value = currentVal;
    },

    /**
     * Nạp dữ liệu vào các dropdown trong Modal
     */
    populateModalDropdowns() {
      const projectSelect = document.getElementById('taskInputProject');
      const assigneeSelect = document.getElementById('taskInputAssignee');

      if (projectSelect) {
        const projects = KanbanData.getProjects();
        projectSelect.innerHTML = projects.map(p => `
          <option value="${p.id}">${p.name} (${p.code || 'PRJ'})</option>
        `).join('');
      }

      if (assigneeSelect) {
        const members = KanbanData.getMembers();
        assigneeSelect.innerHTML = members.map(m => `
          <option value="${m.id}" data-name="${m.name}" data-avatar="${m.avatar}">
            ${m.name} (${m.role || 'Member'})
          </option>
        `).join('');
      }
    },

    /**
     * Lọc danh sách tác vụ theo Search, Project và Priority
     */
    getFilteredTasks() {
      const allTasks = KanbanData.getTasks();
      const query = this.currentSearch.trim().toLowerCase();
      const projectFilter = this.currentProjectFilter;
      const priorityFilter = this.currentPriorityFilter;

      return allTasks.filter(task => {
        // Lọc theo từ khóa tìm kiếm (Glow, Hover, Keyword Highlight)
        if (query) {
          const matchTitle = (task.title || '').toLowerCase().includes(query);
          const matchDesc = (task.description || '').toLowerCase().includes(query);
          const matchAssignee = (task.assignee?.name || '').toLowerCase().includes(query);
          const matchTags = Array.isArray(task.tags) && task.tags.some(t => t.toLowerCase().includes(query));
          if (!matchTitle && !matchDesc && !matchAssignee && !matchTags) return false;
        }

        // Lọc theo Dự án
        if (projectFilter !== 'all' && task.projectId !== projectFilter) {
          return false;
        }

        // Lọc theo Mức độ ưu tiên (name="priority", value)
        if (priorityFilter !== 'all' && task.priority !== priorityFilter) {
          return false;
        }

        return true;
      });
    },

    /**
     * Render toàn bộ giao diện bảng Kanban và cập nhật các thanh chỉ số
     */
    render() {
      const filteredTasks = this.getFilteredTasks();
      const projects = KanbanData.getProjects();
      const projectMap = new Map(projects.map(p => [p.id, p]));

      const columns = {
        todo: document.getElementById('kanban-list-todo'),
        doing: document.getElementById('kanban-list-doing'),
        done: document.getElementById('kanban-list-done')
      };

      const counts = { todo: 0, doing: 0, done: 0 };

      // Xóa nội dung cũ trong 3 cột
      Object.values(columns).forEach(col => {
        if (col) col.innerHTML = '';
      });

      // Phân bổ từng task vào đúng cột
      filteredTasks.forEach(task => {
        const status = ['todo', 'doing', 'done'].includes(task.status) ? task.status : 'todo';
        counts[status]++;

        const colEl = columns[status];
        if (colEl) {
          const cardEl = this.createTaskCardElement(task, projectMap.get(task.projectId));
          colEl.appendChild(cardEl);
        }
      });

      // Cập nhật số đếm trên Header cột
      const countTodoEl = document.getElementById('count-todo');
      const countDoingEl = document.getElementById('count-doing');
      const countDoneEl = document.getElementById('count-done');
      if (countTodoEl) countTodoEl.textContent = counts.todo;
      if (countDoingEl) countDoingEl.textContent = counts.doing;
      if (countDoneEl) countDoneEl.textContent = counts.done;

      // Cập nhật dải thống kê với COUNT-UP và FLASH HIGHLIGHT
      const statTotalEl = document.getElementById('stat-total-tasks');
      const statTodoEl = document.getElementById('stat-todo-tasks');
      const statDoingEl = document.getElementById('stat-doing-tasks');
      const statDoneEl = document.getElementById('stat-done-tasks');
      const statProgressPercent = document.getElementById('stat-progress-percent');
      const statProgressBar = document.getElementById('stat-progress-bar');

      const wrapTotal = document.getElementById('kpi-stat-total-wrap');
      const wrapTodo = document.getElementById('kpi-stat-todo-wrap');
      const wrapDoing = document.getElementById('kpi-stat-doing-wrap');
      const wrapDone = document.getElementById('kpi-stat-done-wrap');

      const totalFiltered = filteredTasks.length;
      const progressPercent = totalFiltered > 0 ? Math.round((counts.done / totalFiltered) * 100) : 0;

      // Kiểm tra thay đổi để kích hoạt Count-up & Highlight flash
      if (this.previousCounts.total !== totalFiltered) {
        animateCountUp(statTotalEl, totalFiltered);
        if (this.previousCounts.total !== -1) triggerHighlightFlash(wrapTotal);
      }
      if (this.previousCounts.todo !== counts.todo) {
        animateCountUp(statTodoEl, counts.todo);
        if (this.previousCounts.todo !== -1) triggerHighlightFlash(wrapTodo);
      }
      if (this.previousCounts.doing !== counts.doing) {
        animateCountUp(statDoingEl, counts.doing);
        if (this.previousCounts.doing !== -1) triggerHighlightFlash(wrapDoing);
      }
      if (this.previousCounts.done !== counts.done) {
        animateCountUp(statDoneEl, counts.done);
        if (this.previousCounts.done !== -1) triggerHighlightFlash(wrapDone);
      }

      // Thanh tiến độ chạy mượt mà
      if (statProgressBar) {
        statProgressBar.style.width = `${progressPercent}%`;
      }
      if (statProgressPercent) {
        if (this.previousCounts.progress !== progressPercent) {
          statProgressPercent.textContent = `${progressPercent}%`;
          if (this.previousCounts.progress !== -1) triggerHighlightFlash(statProgressPercent);
        }
      }

      // Lưu lại giá trị đếm kỳ trước
      this.previousCounts = {
        total: totalFiltered,
        todo: counts.todo,
        doing: counts.doing,
        done: counts.done,
        progress: progressPercent
      };

      // Hiển thị Trạng thái rỗng (Empty State) cho từng cột nếu chưa có việc
      Object.entries(columns).forEach(([statusKey, colEl]) => {
        if (colEl && counts[statusKey] === 0) {
          colEl.appendChild(this.createEmptyStateElement(statusKey));
        }
      });
    },

    /**
     * Tạo phần tử HTML cho thẻ công việc (Task Card) kèm Keyword Highlight & Slide-down animation
     */
    createTaskCardElement(task, project) {
      const card = document.createElement('div');
      card.className = 'task-card animate-card-enter';
      card.setAttribute('draggable', 'true');
      card.setAttribute('data-task-id', task.id);
      card.setAttribute('data-status', task.status);

      // Mức độ ưu tiên
      const priorityConfigs = {
        critical: { label: 'Khẩn cấp', class: 'badge-critical animate-pulse-critical' },
        high: { label: 'Ưu tiên cao', class: 'badge-high' },
        medium: { label: 'Trung bình', class: 'badge-medium' },
        low: { label: 'Thấp', class: 'badge-low' }
      };
      const prio = priorityConfigs[task.priority] || priorityConfigs.medium;

      // Cảnh báo quá hạn
      const isOverdue = isTaskOverdue(task.dueDateTime, task.status);
      const overdueBadge = isOverdue ? `
        <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-rose-500/15 text-rose-500 border border-rose-500/30">
          <svg class="w-3 h-3 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          Quá hạn
        </span>
      ` : '';

      // Tên dự án & Màu chấm nhận diện
      const projName = project ? project.name : 'Dự án chung';
      const projColor = (project && project.color) || '#6366F1';

      // Áp dụng Keyword Highlight cho tiêu đề, mô tả và tags
      const query = this.currentSearch;
      const highlightedTitle = highlightMatches(task.title, query);
      const highlightedDesc = task.description ? highlightMatches(task.description, query) : '';
      const highlightedProjName = highlightMatches(projName, query);
      const highlightedAssignee = highlightMatches(task.assignee?.name || 'Chưa gán', query);

      // Danh sách tags có Highlight
      const tagsHtml = (task.tags || []).slice(0, 3).map(tag => `
        <span class="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-white/5">
          #${highlightMatches(tag, query)}
        </span>
      `).join('');

      // Nút điều chuyển nhanh (Quick actions cho Touch/Mobile & Trợ năng)
      const nextActions = {
        todo: `<button type="button" class="btn-move-task px-2.5 py-1 rounded-md text-[11px] font-semibold bg-sky-500/10 text-sky-600 dark:text-sky-400 hover:bg-sky-500/20 active:scale-95 transition-all" data-target="doing">Bắt đầu &rarr;</button>`,
        doing: `<button type="button" class="btn-move-task px-2.5 py-1 rounded-md text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 active:scale-95 transition-all" data-target="done">Xong &check;</button>`,
        done: `<button type="button" class="btn-move-task px-2.5 py-1 rounded-md text-[11px] font-semibold bg-slate-500/10 text-slate-600 dark:text-slate-400 hover:bg-slate-500/20 active:scale-95 transition-all" data-target="doing">&larr; Mở lại</button>`
      };

      card.innerHTML = `
        <!-- Top bar: Priority & Project Tag -->
        <div class="flex items-center justify-between gap-2 mb-2.5">
          <div class="flex items-center gap-1.5 min-w-0">
            <span class="w-2 h-2 rounded-full flex-shrink-0" style="background-color: ${projColor}"></span>
            <span class="text-[11px] font-bold text-slate-500 dark:text-slate-400 truncate max-w-[140px]" title="${projName}">
              ${highlightedProjName}
            </span>
          </div>
          <div class="flex items-center gap-1.5 flex-shrink-0">
            ${overdueBadge}
            <span class="badge ${prio.class}">
              <span class="priority-dot"></span>
              ${prio.label}
            </span>
          </div>
        </div>

        <!-- Task Title có Highlight -->
        <h3 class="text-sm font-bold text-slate-900 dark:text-white mb-1.5 line-clamp-2 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
          ${highlightedTitle}
        </h3>

        <!-- Description có Highlight -->
        ${highlightedDesc ? `
          <p class="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 mb-3">
            ${highlightedDesc}
          </p>
        ` : ''}

        <!-- Tags List -->
        ${tagsHtml ? `
          <div class="flex flex-wrap gap-1 mb-3">
            ${tagsHtml}
          </div>
        ` : ''}

        <!-- Meta Footer: Assignee & Deadline -->
        <div class="pt-2.5 border-t border-slate-200/80 dark:border-white/5 flex items-center justify-between gap-2 text-xs">
          <!-- Assignee Avatar & Name có Highlight -->
          <div class="flex items-center gap-2 min-w-0">
            <img 
              src="${task.assignee?.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=User'}" 
              alt="${task.assignee?.name || 'Assignee'}" 
              class="w-6 h-6 rounded-full bg-slate-200 dark:bg-white/10 object-cover flex-shrink-0 border border-white/20"
            />
            <span class="text-[11px] font-semibold text-slate-700 dark:text-slate-300 truncate max-w-[105px]" title="${task.assignee?.name}">
              ${highlightedAssignee}
            </span>
          </div>

          <!-- Deadline -->
          <div class="flex items-center gap-1 text-[11px] ${isOverdue ? 'text-rose-500 font-bold' : 'text-slate-500 dark:text-slate-400'} flex-shrink-0">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
            <span>${formatDateTimeDisplay(task.dueDateTime)}</span>
          </div>
        </div>

        <!-- Touch/Accessibility Quick Actions & Edit/Delete -->
        <div class="mt-2.5 pt-2 border-t border-dashed border-slate-200/60 dark:border-white/5 flex items-center justify-between gap-2">
          <div class="flex items-center gap-1">
            ${nextActions[task.status] || ''}
          </div>
          <div class="flex items-center gap-1">
            <button type="button" class="btn-edit-task p-1 text-slate-400 hover:text-indigo-500 dark:hover:text-indigo-400 rounded transition-colors" title="Chỉnh sửa công việc">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
            </button>
            <button type="button" class="btn-delete-task p-1 text-slate-400 hover:text-rose-500 rounded transition-colors" title="Xóa công việc">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </button>
          </div>
        </div>
      `;

      // Gắn sự kiện kéo thả HTML5 cho từng Task Card
      card.addEventListener('dragstart', (e) => {
        this.draggedTaskId = task.id;
        card.classList.add('is-dragging');
        e.dataTransfer.setData('text/plain', task.id);
        e.dataTransfer.effectAllowed = 'move';
      });

      card.addEventListener('dragend', () => {
        this.draggedTaskId = null;
        card.classList.remove('is-dragging');
      });

      // Bắt sự kiện nút bấm nhanh
      const btnMove = card.querySelector('.btn-move-task');
      if (btnMove) {
        btnMove.addEventListener('click', (e) => {
          e.stopPropagation();
          const targetStatus = btnMove.getAttribute('data-target');
          this.moveTaskToStatus(task.id, targetStatus);
        });
      }

      const btnEdit = card.querySelector('.btn-edit-task');
      if (btnEdit) {
        btnEdit.addEventListener('click', (e) => {
          e.stopPropagation();
          this.openEditTaskModal(task.id);
        });
      }

      const btnDelete = card.querySelector('.btn-delete-task');
      if (btnDelete) {
        btnDelete.addEventListener('click', (e) => {
          e.stopPropagation();
          this.deleteTask(task.id);
        });
      }

      return card;
    },

    /**
     * Tạo phần tử hiển thị trạng thái rỗng cho cột Kanban
     */
    createEmptyStateElement(status) {
      const state = document.createElement('div');
      state.className = 'empty-state py-8 animate-card-enter';
      
      const statusLabels = {
        todo: 'Không có việc nào chờ làm',
        doing: 'Chưa có việc đang thực hiện',
        done: 'Chưa có việc hoàn thành'
      };

      state.innerHTML = `
        <div class="empty-state-icon">
          <svg class="w-10 h-10 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
        </div>
        <p class="empty-state-title">${statusLabels[status] || 'Không có dữ liệu'}</p>
        <p class="empty-state-desc">Kéo thả công việc vào đây hoặc bấm dấu (+) để thêm nhanh</p>
      `;
      return state;
    },

    /**
     * Chuyển trạng thái công việc và tự động tính lại tiến độ dự án
     */
    moveTaskToStatus(taskId, targetStatus) {
      const tasks = KanbanData.getTasks();
      const taskIndex = tasks.findIndex(t => t.id === taskId);
      if (taskIndex === -1) return;

      const task = tasks[taskIndex];
      const prevStatus = task.status;
      if (prevStatus === targetStatus) return;

      task.status = targetStatus;
      KanbanData.saveTasks(tasks);

      // TỰ ĐỘNG TÍNH LẠI TIẾN ĐỘ DỰ ÁN KHI CÓ THAY ĐỔI
      const progressResult = recalculateProjectProgress(task.projectId);

      // Render lại giao diện
      this.render();

      // Thêm animation nảy lò xo Spring Drop cho card vừa di chuyển
      setTimeout(() => {
        const movedCard = document.querySelector(`.task-card[data-task-id="${taskId}"]`);
        if (movedCard) {
          movedCard.classList.add('animate-spring-drop');
          setTimeout(() => movedCard.classList.remove('animate-spring-drop'), 450);
        }
      }, 50);

      // Thông báo Toast kính mờ
      const statusLabels = {
        todo: 'Chờ thực hiện',
        doing: 'Đang làm (In-Progress)',
        done: 'Đã hoàn thành'
      };
      const projName = progressResult?.project?.name || 'Dự án';
      const progressText = progressResult ? ` • Tiến độ ${projName}: ${progressResult.progress}%` : '';

      showToast(`Đã chuyển sang "${statusLabels[targetStatus]}"${progressText}`, 'success');
    },

    /**
     * Xóa công việc kèm xác nhận
     */
    deleteTask(taskId) {
      const tasks = KanbanData.getTasks();
      const task = tasks.find(t => t.id === taskId);
      if (!task) return;

      if (confirm(`Bạn có chắc muốn xóa công việc "${task.title}"?`)) {
        const remainingTasks = tasks.filter(t => t.id !== taskId);
        KanbanData.saveTasks(remainingTasks);

        // Cập nhật lại tiến độ dự án
        recalculateProjectProgress(task.projectId);

        showToast(`Đã xóa công việc "${task.title}".`, 'info');
        this.render();
      }
    },

    /**
     * Mở modal thêm Task mới
     */
    openCreateTaskModal(defaultStatus = 'todo') {
      const modal = document.getElementById('taskModal');
      const form = document.getElementById('taskForm');
      const titleEl = document.getElementById('modalTaskTitle');
      const statusEl = document.getElementById('taskInputStatus');

      if (!modal || !form) return;

      form.reset();
      document.getElementById('taskFormId').value = '';
      if (titleEl) titleEl.textContent = 'Thêm Công Việc Mới';
      if (statusEl) statusEl.value = defaultStatus;

      // Điền mặc định ngày bắt đầu hôm nay và hạn chót sau 5 ngày
      const now = new Date();
      const due = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
      const toIsoLocal = (d) => {
        const offset = d.getTimezoneOffset() * 60000;
        return (new Date(d.getTime() - offset)).toISOString().slice(0, 16);
      };

      const startInput = document.getElementById('taskInputStart');
      const dueInput = document.getElementById('taskInputDue');
      if (startInput) startInput.value = toIsoLocal(now);
      if (dueInput) dueInput.value = toIsoLocal(due);

      modal.classList.remove('hidden');
    },

    /**
     * Mở modal chỉnh sửa Task
     */
    openEditTaskModal(taskId) {
      const tasks = KanbanData.getTasks();
      const task = tasks.find(t => t.id === taskId);
      if (!task) return;

      const modal = document.getElementById('taskModal');
      const titleEl = document.getElementById('modalTaskTitle');
      if (!modal) return;

      document.getElementById('taskFormId').value = task.id;
      if (titleEl) titleEl.textContent = 'Chỉnh Sửa Công Việc';

      document.getElementById('taskInputTitle').value = task.title || '';
      document.getElementById('taskInputDesc').value = task.description || '';
      document.getElementById('taskInputProject').value = task.projectId || '';
      document.getElementById('taskInputStatus').value = task.status || 'todo';
      document.getElementById('taskInputPriority').value = task.priority || 'medium';
      document.getElementById('taskInputAssignee').value = task.assigneeId || '';
      document.getElementById('taskInputStart').value = (task.startDateTime || '').slice(0, 16);
      document.getElementById('taskInputDue').value = (task.dueDateTime || '').slice(0, 16);
      document.getElementById('taskInputHours').value = task.estimatedHours || 8;
      document.getElementById('taskInputTags').value = Array.isArray(task.tags) ? task.tags.join(', ') : '';

      modal.classList.remove('hidden');
    },

    /**
     * Đóng modal
     */
    closeModal() {
      const modal = document.getElementById('taskModal');
      if (modal) modal.classList.add('hidden');
    },

    /**
     * Gắn tất cả sự kiện tương tác
     */
    bindEvents() {
      // 1. Tìm kiếm thời gian thực (Glow/Shadow, Hover, Keyword Highlight)
      const searchInput = document.getElementById('taskSearchInput');
      const clearSearchBtn = document.getElementById('btnClearTaskSearch');

      if (searchInput) {
        searchInput.addEventListener('input', (e) => {
          this.currentSearch = e.target.value;
          if (clearSearchBtn) {
            clearSearchBtn.classList.toggle('hidden', !this.currentSearch);
          }
          this.render();
        });
      }

      if (clearSearchBtn) {
        clearSearchBtn.addEventListener('click', () => {
          if (searchInput) {
            searchInput.value = '';
            this.currentSearch = '';
            clearSearchBtn.classList.add('hidden');
            searchInput.focus();
            this.render();
          }
        });
      }

      // 2. Dropdown Lọc theo Dự án & Priority
      const filterProject = document.getElementById('filterProject');
      if (filterProject) {
        filterProject.addEventListener('change', (e) => {
          this.currentProjectFilter = e.target.value;
          this.render();
        });
      }

      const filterPriority = document.getElementById('filterPriority');
      if (filterPriority) {
        filterPriority.addEventListener('change', (e) => {
          this.currentPriorityFilter = e.target.value;
          this.render();
        });
      }

      // 3. Mở Modal tạo Task mới
      const btnOpenCreate = document.getElementById('btnOpenCreateTaskModal');
      if (btnOpenCreate) {
        btnOpenCreate.addEventListener('click', () => this.openCreateTaskModal('todo'));
      }

      // Nút (+) nhanh trên từng cột
      document.querySelectorAll('.btn-quick-add').forEach(btn => {
        btn.addEventListener('click', () => {
          const status = btn.getAttribute('data-status') || 'todo';
          this.openCreateTaskModal(status);
        });
      });

      // 4. Đóng Modal
      const btnCloseModal = document.getElementById('btnCloseTaskModal');
      const btnCancelModal = document.getElementById('btnCancelTaskModal');
      if (btnCloseModal) btnCloseModal.addEventListener('click', () => this.closeModal());
      if (btnCancelModal) btnCancelModal.addEventListener('click', () => this.closeModal());

      const taskModal = document.getElementById('taskModal');
      if (taskModal) {
        taskModal.addEventListener('click', (e) => {
          if (e.target === taskModal) this.closeModal();
        });
      }

      // 5. Submit Form Thêm / Sửa Task (Kèm Trạng thái Loading & Thông báo thành công)
      const taskForm = document.getElementById('taskForm');
      if (taskForm) {
        taskForm.addEventListener('submit', (e) => {
          e.preventDefault();

          const btnSave = document.getElementById('btnSaveTask');
          const btnText = document.getElementById('btnSaveTaskText');

          // Bật trạng thái Loading
          if (btnSave && btnText) {
            btnSave.disabled = true;
            btnSave.classList.add('opacity-80', 'cursor-not-allowed');
            btnText.innerHTML = `
              <span class="spinner-border-sm mr-2"></span>
              Đang lưu...
            `;
          }

          const id = document.getElementById('taskFormId').value;
          const title = document.getElementById('taskInputTitle').value.trim();
          const description = document.getElementById('taskInputDesc').value.trim();
          const projectId = document.getElementById('taskInputProject').value;
          const status = document.getElementById('taskInputStatus').value;
          const priority = document.getElementById('taskInputPriority').value;
          const assigneeSelect = document.getElementById('taskInputAssignee');
          const assigneeId = assigneeSelect.value;
          const assigneeOpt = assigneeSelect.selectedOptions[0];
          const assigneeName = assigneeOpt ? assigneeOpt.getAttribute('data-name') : 'Thành viên';
          const assigneeAvatar = assigneeOpt ? assigneeOpt.getAttribute('data-avatar') : 'https://api.dicebear.com/7.x/avataaars/svg?seed=User';
          
          const startDateTime = document.getElementById('taskInputStart').value;
          const dueDateTime = document.getElementById('taskInputDue').value;
          const estimatedHours = parseFloat(document.getElementById('taskInputHours').value) || 8;
          const tagsRaw = document.getElementById('taskInputTags').value;
          const tags = tagsRaw.split(',').map(t => t.trim()).filter(Boolean);

          // Tạo độ trễ ngắn 320ms mô phỏng xử lý bất đồng bộ mượt mà
          setTimeout(() => {
            const tasks = KanbanData.getTasks();

            if (id) {
              // Cập nhật công việc hiện có
              const taskIndex = tasks.findIndex(t => t.id === id);
              if (taskIndex !== -1) {
                tasks[taskIndex] = {
                  ...tasks[taskIndex],
                  title,
                  description,
                  projectId,
                  status,
                  priority,
                  assigneeId,
                  assignee: { name: assigneeName, avatar: assigneeAvatar },
                  startDateTime,
                  dueDateTime,
                  estimatedHours,
                  tags
                };
                KanbanData.saveTasks(tasks);
                recalculateProjectProgress(projectId);
                showToast(`Đã cập nhật công việc "${title}" thành công!`, 'success');
              }
            } else {
              // Tạo công việc mới
              const newTask = {
                id: 'task-' + Date.now(),
                projectId,
                title,
                description,
                status,
                priority,
                assigneeId,
                assignee: { name: assigneeName, avatar: assigneeAvatar },
                startDateTime,
                dueDateTime,
                spentHours: 0,
                estimatedHours,
                tags: tags.length > 0 ? tags : ['Agile']
              };
              tasks.push(newTask);
              KanbanData.saveTasks(tasks);
              recalculateProjectProgress(projectId);
              showToast(`Đã thêm mới công việc "${title}" thành công!`, 'success');
            }

            // Phục hồi nút bấm
            if (btnSave && btnText) {
              btnSave.disabled = false;
              btnSave.classList.remove('opacity-80', 'cursor-not-allowed');
              btnText.textContent = 'Lưu Công Việc';
            }

            this.closeModal();
            this.render();
          }, 320);
        });
      }

      // 6. GẮN SỰ KIỆN HTML5 DRAG & DROP CHO CẢ 3 CỘT (DROP ZONES)
      const columnLists = document.querySelectorAll('.kanban-list');
      columnLists.forEach(listEl => {
        listEl.addEventListener('dragover', (e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          listEl.classList.add('is-drag-over');
        });

        listEl.addEventListener('dragleave', () => {
          listEl.classList.remove('is-drag-over');
        });

        listEl.addEventListener('drop', (e) => {
          e.preventDefault();
          listEl.classList.remove('is-drag-over');

          const taskId = e.dataTransfer.getData('text/plain') || this.draggedTaskId;
          const targetStatus = listEl.getAttribute('data-status');

          if (taskId && targetStatus) {
            this.moveTaskToStatus(taskId, targetStatus);
          }
        });
      });

      // Lắng nghe sự kiện Theme thay đổi từ storage.js
      window.addEventListener('themeChanged', () => {
        this.render();
      });
    }
  };

  // Khởi chạy khi DOM sẵn sàng
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => KanbanApp.init());
  } else {
    KanbanApp.init();
  }

  // Đóng gói vào window để hỗ trợ debug & module testing
  window.KanbanApp = KanbanApp;

})(window, document);
