/**
 * ==============================================================================
 * TASKFLOW KANBAN WORKSPACE ENGINE (js/kanban.js)
 * Mô tả: Phân hệ Quản trị Bảng việc Agile kéo thả 60fps chuẩn Trello 2026.
 * Tính năng đột phá:
 *   - Bố cục Modal 2 cột công thái học (Master-Detail).
 *   - Phân chia Mini-tasks (Checklist) cho 1 hoặc NHIỀU người cùng làm (Multi-assignee).
 *   - Bằng chứng làm việc ngữ cảnh động (State-Aware: To-do / Doing / Done).
 *   - Hệ thống Thảo luận & Bình luận (Activity & Comments Feed).
 *   - Phân quyền RBAC nghiêm ngặt: Admin duyệt/xóa, Member nộp/bình luận.
 *   - Lọc nhanh 1 chạm theo Thành viên (My Tasks Quick Filter Chips).
 *   - Đồng bộ kép LocalStorage + Google Sheets Webhook qua SheetsSync.
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
     * Lưu danh sách dự án
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
     * Lấy danh sách thành viên nhóm
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

      // Mặc định chuẩn 2 thành viên trong nhóm đồ án
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
     * Lấy danh sách Tasks và chuẩn hóa thuộc tính mở rộng (Mini-tasks, Evidence, Comments)
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

        // Bổ sung dữ liệu Mini-tasks mặc định cho demo nếu chưa có (Hỗ trợ 1 hoặc NHIỀU người)
        let subtasks = Array.isArray(t.subtasks) ? t.subtasks : [];
        if (subtasks.length === 0) {
          if (t.id === 'task-001') {
            subtasks = [
              { id: 'sub-001-1', title: 'Thiết kế hệ thống biến màu Design Tokens', isDone: true, assigneeIds: ['mem-01'] },
              { id: 'sub-001-2', title: 'Dựng animation Spring Drop & Glassmorphism 60fps', isDone: true, assigneeIds: ['mem-01', 'mem-02'] }
            ];
          } else if (t.id === 'task-002') {
            subtasks = [
              { id: 'sub-002-1', title: 'Tạo tài khoản VNPay Sandbox & lấy Merchant Key', isDone: true, assigneeIds: ['mem-02'] },
              { id: 'sub-002-2', title: 'Tích hợp mã hóa SHA256 tạo chữ ký bảo mật', isDone: false, assigneeIds: ['mem-01', 'mem-02'] }
            ];
          } else if (t.id === 'task-003') {
            subtasks = [
              { id: 'sub-003-1', title: 'Dựng đồng hồ bấm giờ Stopwatch', isDone: false, assigneeIds: ['mem-02'] },
              { id: 'sub-003-2', title: 'Kết nối Webhook Google Sheets sync', isDone: false, assigneeIds: ['mem-01'] }
            ];
          }
        }

        // Bổ sung dữ liệu Bằng chứng làm việc (Work Evidence) mặc định
        let evidence = t.evidence && typeof t.evidence === 'object' ? t.evidence : null;
        if (!evidence) {
          if (t.id === 'task-001') {
            evidence = {
              inProgressUrl: 'https://figma.com/file/taskflow-design-system-core',
              inProgressNote: 'Hoàn thiện 100% token giao diện và responsive mockup',
              doneUrl: 'https://github.com/TaskFlow/core/pull/1',
              doneNote: 'Code đã merge vào nhánh main, build 60fps mượt mà không lỗi console',
              isApproved: true,
              approvedBy: 'Phạm Đăng Khoa',
              approvedAt: '2026-10-21 14:30'
            };
          } else if (t.id === 'task-002') {
            evidence = {
              inProgressUrl: 'https://github.com/TaskFlow/core/tree/feat-vnpay-sandbox',
              inProgressNote: 'Đang kiểm thử mã hóa SHA256 và callback webhook',
              doneUrl: '',
              doneNote: '',
              isApproved: false,
              approvedBy: '',
              approvedAt: ''
            };
          } else {
            evidence = {
              inProgressUrl: '',
              inProgressNote: '',
              doneUrl: '',
              doneNote: '',
              isApproved: false,
              approvedBy: '',
              approvedAt: ''
            };
          }
        }

        // Bổ sung dữ liệu Thảo luận / Bình luận (Comments Feed) mặc định
        let comments = Array.isArray(t.comments) ? t.comments : [];
        if (comments.length === 0) {
          if (t.id === 'task-001') {
            comments = [
              {
                id: 'cmt-1',
                authorName: 'Nguyễn Đăng Nhật',
                authorAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=NhatNguyen&backgroundColor=8b5cf6',
                role: 'Member',
                content: 'Mình đã hoàn thiện bảng màu Deep Slate và hiệu ứng nảy lò xo 60fps trên Chrome DevTools.',
                createdAt: '2026-10-21 10:15'
              },
              {
                id: 'cmt-2',
                authorName: 'Phạm Đăng Khoa',
                authorAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=KhoaPham&backgroundColor=6366f1',
                role: 'Admin',
                content: 'Đã kiểm tra code trên repo, độ mượt rất tốt. Đã phê duyệt nghiệm thu task này nhé!',
                createdAt: '2026-10-21 14:30'
              }
            ];
          } else if (t.id === 'task-002') {
            comments = [
              {
                id: 'cmt-3',
                authorName: 'Nguyễn Đăng Nhật',
                authorAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=NhatNguyen&backgroundColor=8b5cf6',
                role: 'Member',
                content: 'Đang test mã hóa SHA256, Khoa xem giúp nhánh branch figma-vnpay nhé.',
                createdAt: '2026-10-21 15:45'
              }
            ];
          }
        }

        return {
          id: t.id || 'task-' + Math.floor(100 + Math.random() * 900),
          projectId: t.projectId || 'proj-101',
          title: t.title || 'Công việc chưa đặt tên',
          description: t.description || '',
          status: t.status || 'todo',
          priority: t.priority || 'medium',
          assignee: assignee,
          assigneeId: t.assigneeId || (members[0] && members[0].id) || 'mem-01',
          startDateTime: t.startDateTime || (t.startDate ? `${t.startDate}T08:00` : '2026-10-20T08:00'),
          dueDateTime: t.dueDateTime || (t.dueDate ? `${t.dueDate}T18:00` : '2026-10-25T18:00'),
          spentHours: typeof t.spentHours === 'number' ? t.spentHours : 0,
          timerStartedAt: t.timerStartedAt || (t.status === 'doing' ? (Date.now() - 15 * 60 * 1000) : null),
          isTracking: t.isTracking || (t.status === 'doing'),
          estimatedHours: typeof t.estimatedHours === 'number' ? t.estimatedHours : 8,
          tags: Array.isArray(t.tags) ? t.tags : ['Sprint'],
          subtasks: subtasks,
          evidence: evidence,
          comments: comments
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
    toast.className = `toast-item toast-${type} animate-modal-enter`;

    const icons = {
      success: `<svg class="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>`,
      info: `<svg class="w-4 h-4 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`,
      warning: `<svg class="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>`,
      error: `<svg class="w-4 h-4 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>`
    };

    toast.innerHTML = `
      <div class="flex items-center gap-3">
        <span class="flex-shrink-0 p-1 rounded-md bg-white/10">${icons[type] || icons.success}</span>
        <p class="text-xs font-semibold text-slate-800 dark:text-slate-100 flex-1 leading-relaxed">${message}</p>
        <button type="button" class="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1" title="Đóng">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>
    `;

    const closeBtn = toast.querySelector('button');
    const dismissToast = () => {
      toast.style.animation = 'toastSlideDown 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards';
      setTimeout(() => toast.remove(), 300);
    };

    if (closeBtn) closeBtn.addEventListener('click', dismissToast);
    setTimeout(dismissToast, 4200);

    container.appendChild(toast);
  }

  /**
   * 4. COUNT-UP ANIMATION & HIGHLIGHT FLASH ENGINE
   */
  function animateCountUp(element, targetValue, duration = 400) {
    if (!element) return;
    const startValue = parseInt(element.textContent, 10) || 0;
    if (startValue === targetValue) return;

    const startTime = performance.now();
    function step(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
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

    const parentWrap = element.closest('span[id^="kpi-stat-"]') || element;
    parentWrap.classList.add('badge-highlight-flash');
    setTimeout(() => {
      parentWrap.classList.remove('badge-highlight-flash');
    }, 700);
  }

  /**
   * 5. KEYWORD HIGHLIGHT HELPER
   */
  function highlightMatches(text, query) {
    if (!text) return '';
    if (!query || typeof query !== 'string' || !query.trim()) return text;

    const escapedQuery = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedQuery})`, 'gi');
    return text.replace(regex, '<span class="search-highlight">$1</span>');
  }

  /**
   * 6. CÔNG THỨC TÍNH TIẾN ĐỘ TỰ ĐỘNG & ĐỒNG BỘ DỰ ÁN
   */
  function recalculateProjectProgress(projectId) {
    if (!projectId) return null;

    const tasks = KanbanData.getTasks();
    const projectTasks = tasks.filter(t => t.projectId === projectId);
    const totalCount = projectTasks.length;

    let newProgress = 0;
    if (totalCount > 0) {
      const doneCount = projectTasks.filter(t => t.status === 'done').length;
      newProgress = Math.round((doneCount / totalCount) * 100);
    }

    const projects = KanbanData.getProjects();
    const projIndex = projects.findIndex(p => p.id === projectId);
    if (projIndex !== -1) {
      projects[projIndex].progress = newProgress;
      KanbanData.saveProjects(projects);
      return { project: projects[projIndex], progress: newProgress };
    }

    return null;
  }

  /**
   * 7. HELPER FORMAT NGÀY & KIỂM TRA QUÁ HẠN (Chuẩn: Không báo quá hạn khi đã Done)
   */
  function isTaskOverdue(dueDateTime, status) {
    if (!dueDateTime || status === 'done') return false; // Triệt tiêu cảnh báo khi đã hoàn thành
    const dueDate = new Date(dueDateTime);
    const now = new Date();
    return dueDate.getTime() < now.getTime();
  }

  function formatDateTimeDisplay(dateStr) {
    if (!dateStr) return 'Chưa định';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      return `${hours}:${minutes} • ${day}/${month}`;
    } catch (e) {
      return dateStr;
    }
  }

  /**
   * 8. ĐỒNG BỘ BẰNG CHỨNG LÊN GOOGLE SHEETS WEBHOOK (SheetsSync)
   */
  async function syncEvidenceToSheets(task, status, evidenceUrl, evidenceNote, isApproved = false, actionType = 'EVIDENCE_UPDATE') {
    if (window.SheetsSync && typeof window.SheetsSync.sendTimeLog === 'function') {
      try {
        const currentUser = KanbanApp.getCurrentUser();

        const payload = {
          type: 'KANBAN_' + actionType,
          taskId: task.id,
          taskTitle: task.title,
          projectId: task.projectId,
          status: status,
          evidenceUrl: evidenceUrl || '',
          evidenceNote: evidenceNote || '',
          isApproved: isApproved,
          submittedBy: currentUser.name || 'Thành viên',
          role: currentUser.role || 'Member',
          timestamp: new Date().toLocaleString('vi-VN')
        };

        await window.SheetsSync.sendTimeLog(payload);
        console.log('[Kanban] Đã đồng bộ lên Google Sheets Webhook:', payload);
      } catch (err) {
        console.warn('[Kanban] Lỗi gửi Sheets Webhook:', err);
      }
    }
  }

  /**
   * 9. KANBAN WORKSPACE CONTROLLER
   */
  const KanbanApp = {
    currentSearch: '',
    currentProjectFilter: 'all',
    currentPriorityFilter: 'all',
    currentMemberFilter: 'all', // Lọc 1 chạm theo thành viên
    draggedTaskId: null,
    currentEditingTaskId: null,
    currentEditingSubtasks: [],
    selectedSubtaskMemberIds: new Set(), // Hỗ trợ gán NHIỀU người cho 1 subtask

    /**
     * Lấy thông tin tài khoản hiện tại & Quản lý vai trò RBAC từ hệ thống Auth
     */
    getCurrentUser() {
      let user = null;
      if (window.Auth && typeof window.Auth.getCurrentUser === 'function') {
        user = window.Auth.getCurrentUser();
      }
      if (!user) {
        try {
          const raw = localStorage.getItem('currentUser');
          if (raw) user = JSON.parse(raw);
        } catch (e) {}
      }

      return user || {
        id: 'mem-01',
        name: 'Phạm Đăng Khoa',
        role: 'admin',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=KhoaPham&backgroundColor=6366f1'
      };
    },

    init() {
      this.updateCommentAuthorAvatar();
      this.populateProjectFilter();
      this.populateMemberFilterBar();
      this.populateModalDropdowns();
      this.bindEvents();
      this.render();
      this.handleHashNavigation();
      window.addEventListener('hashchange', () => this.handleHashNavigation());
    },

    /**
     * Tự động cuộn đến thẻ công việc và mở modal chi tiết khi chuyển từ Timeline hoặc Reports qua URL hash (#taskId)
     */
    handleHashNavigation() {
      const hash = window.location.hash ? window.location.hash.replace('#', '').trim() : '';
      if (!hash) return;

      const attemptFocus = (retry = 0) => {
        const card = document.querySelector(`.task-card[data-task-id="${hash}"], [data-task-id="${hash}"]`);
        if (card) {
          card.scrollIntoView({ behavior: 'smooth', block: 'center' });
          card.classList.add('ring-4', 'ring-indigo-500', 'ring-offset-2', 'animate-pulse');
          setTimeout(() => {
            card.classList.remove('animate-pulse');
          }, 3000);
          this.openEditModal(hash);
        } else if (retry < 6) {
          setTimeout(() => attemptFocus(retry + 1), 200);
        }
      };

      setTimeout(() => attemptFocus(), 250);
    },

    /**
     * Cập nhật avatar cho khung nhập bình luận theo tài khoản đang đăng nhập
     */
    updateCommentAuthorAvatar() {
      const user = this.getCurrentUser();
      const commentAvatar = document.getElementById('commentAuthorAvatar');
      if (commentAvatar && user.avatar) {
        commentAvatar.src = user.avatar;
      }
    },

    /**
     * Nạp danh sách dự án vào Dropdown Lọc
     */
    populateProjectFilter() {
      const filterSelect = document.getElementById('filterProject');
      if (!filterSelect) return;

      const projects = KanbanData.getProjects();
      const currentVal = filterSelect.value || 'all';

      filterSelect.innerHTML = `<option value="all">Tất cả dự án (${projects.length})</option>`;
      projects.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = `${p.name} [${p.progress || 0}%]`;
        filterSelect.appendChild(opt);
      });

      filterSelect.value = currentVal;
    },

    /**
     * Nạp các chip lọc nhanh 1 chạm theo Thành viên (Trello Member Filter Bar)
     */
    populateMemberFilterBar() {
      const bar = document.getElementById('memberFilterBar');
      if (!bar) return;

      const members = KanbanData.getMembers();
      bar.innerHTML = '';

      // Chip 'Tất cả'
      const allBtn = document.createElement('button');
      allBtn.type = 'button';
      allBtn.className = `member-filter-chip ${this.currentMemberFilter === 'all' ? 'is-active' : ''}`;
      allBtn.textContent = 'Tất cả thành viên';
      allBtn.addEventListener('click', () => {
        this.currentMemberFilter = 'all';
        this.populateMemberFilterBar();
        this.render();
      });
      bar.appendChild(allBtn);

      // Chips từng thành viên
      members.forEach(m => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = `member-filter-chip ${this.currentMemberFilter === m.id ? 'is-active' : ''}`;
        chip.innerHTML = `
          <img src="${m.avatar}" alt="${m.name}" class="w-4 h-4 rounded-full" />
          <span>${m.name}</span>
        `;
        chip.addEventListener('click', () => {
          this.currentMemberFilter = (this.currentMemberFilter === m.id) ? 'all' : m.id;
          this.populateMemberFilterBar();
          this.render();
        });
        bar.appendChild(chip);
      });
    },

    /**
     * Nạp dữ liệu vào các dropdown trong Modal
     */
    populateModalDropdowns() {
      const projectSelect = document.getElementById('taskInputProject');
      const assigneeSelect = document.getElementById('taskInputAssignee');

      // 1. Dropdown Dự án
      if (projectSelect) {
        const projects = KanbanData.getProjects();
        projectSelect.innerHTML = '';
        projects.forEach(p => {
          const opt = document.createElement('option');
          opt.value = p.id;
          opt.textContent = `${p.name} (${p.code || 'PRJ'})`;
          projectSelect.appendChild(opt);
        });
      }

      // 2. Dropdown Người phụ trách chính (Lead)
      const members = KanbanData.getMembers();
      if (assigneeSelect) {
        assigneeSelect.innerHTML = '';
        members.forEach(m => {
          const opt = document.createElement('option');
          opt.value = m.id;
          opt.textContent = `${m.name} (${m.role || 'Member'})`;
          opt.setAttribute('data-name', m.name);
          opt.setAttribute('data-avatar', m.avatar);
          assigneeSelect.appendChild(opt);
        });
      }

      // 3. Render các chips chọn NHIỀU người cùng làm subtask
      this.renderSubtaskMemberChips();
    },

    /**
     * Render các chip cho phép chọn 1 hoặc NHIỀU người khi tạo việc con
     */
    renderSubtaskMemberChips() {
      const container = document.getElementById('newSubtaskMembersSelector');
      if (!container) return;

      const members = KanbanData.getMembers();
      container.innerHTML = '';

      members.forEach(m => {
        const isSelected = this.selectedSubtaskMemberIds.has(m.id);
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = `subtask-assignee-select-chip ${isSelected ? 'is-selected' : ''}`;
        chip.innerHTML = `
          <img src="${m.avatar}" alt="${m.name}" class="w-4 h-4 rounded-full" />
          <span>${m.name}</span>
          ${isSelected ? `<span class="text-[10px] text-indigo-500 font-bold ml-0.5">✓</span>` : ''}
        `;
        chip.addEventListener('click', (e) => {
          e.preventDefault();
          if (this.selectedSubtaskMemberIds.has(m.id)) {
            this.selectedSubtaskMemberIds.delete(m.id);
          } else {
            this.selectedSubtaskMemberIds.add(m.id);
          }
          this.renderSubtaskMemberChips();
        });
        container.appendChild(chip);
      });
    },

    /**
     * Lọc danh sách tác vụ theo Search, Project, Priority và Thành viên
     */
    getFilteredTasks() {
      let tasks = KanbanData.getTasks();

      // 1. Lọc theo Dự án
      if (this.currentProjectFilter !== 'all') {
        tasks = tasks.filter(t => t.projectId === this.currentProjectFilter);
      }

      // 2. Lọc theo Độ ưu tiên
      if (this.currentPriorityFilter !== 'all') {
        tasks = tasks.filter(t => t.priority === this.currentPriorityFilter);
      }

      // 3. Lọc theo Thành viên (My Tasks Mode: Làm chính hoặc tham gia việc con)
      if (this.currentMemberFilter !== 'all') {
        const memId = this.currentMemberFilter;
        tasks = tasks.filter(t => {
          const isLead = t.assigneeId === memId;
          const isSubtaskAssignee = (t.subtasks || []).some(s => (s.assigneeIds || []).includes(memId));
          return isLead || isSubtaskAssignee;
        });
      }

      // 4. Lọc theo Từ khóa tìm kiếm
      if (this.currentSearch && this.currentSearch.trim()) {
        const q = this.currentSearch.trim().toLowerCase();
        tasks = tasks.filter(t => {
          const matchTitle = (t.title || '').toLowerCase().includes(q);
          const matchDesc = (t.description || '').toLowerCase().includes(q);
          const matchAssignee = (t.assignee?.name || '').toLowerCase().includes(q);
          const matchTags = (t.tags || []).some(tag => tag.toLowerCase().includes(q));
          const matchSubtasks = (t.subtasks || []).some(sub => sub.title.toLowerCase().includes(q));
          return matchTitle || matchDesc || matchAssignee || matchTags || matchSubtasks;
        });
      }

      return tasks;
    },

    /**
     * Render toàn bộ giao diện bảng Kanban
     */
    render() {
      const allTasks = KanbanData.getTasks();
      const filteredTasks = this.getFilteredTasks();
      const projects = KanbanData.getProjects();

      const todoTasks = filteredTasks.filter(t => t.status === 'todo');
      const doingTasks = filteredTasks.filter(t => t.status === 'doing');
      const doneTasks = filteredTasks.filter(t => t.status === 'done');

      // 1. Cập nhật Badge đếm trên từng cột
      const countTodoEl = document.getElementById('count-todo');
      const countDoingEl = document.getElementById('count-doing');
      const countDoneEl = document.getElementById('count-done');

      if (countTodoEl) countTodoEl.textContent = todoTasks.length;
      if (countDoingEl) countDoingEl.textContent = doingTasks.length;
      if (countDoneEl) countDoneEl.textContent = doneTasks.length;

      // 2. Cập nhật Dải KPI & Thanh Tiến Độ Tự Động
      const totalTasksCount = allTasks.length;
      const totalTodoCount = allTasks.filter(t => t.status === 'todo').length;
      const totalDoingCount = allTasks.filter(t => t.status === 'doing').length;
      const totalDoneCount = allTasks.filter(t => t.status === 'done').length;

      animateCountUp(document.getElementById('stat-total-tasks'), totalTasksCount);
      animateCountUp(document.getElementById('stat-todo-tasks'), totalTodoCount);
      animateCountUp(document.getElementById('stat-doing-tasks'), totalDoingCount);
      animateCountUp(document.getElementById('stat-done-tasks'), totalDoneCount);

      let overallProgress = 0;
      if (totalTasksCount > 0) {
        overallProgress = Math.round((totalDoneCount / totalTasksCount) * 100);
      }

      const progressBar = document.getElementById('stat-progress-bar');
      const progressPercent = document.getElementById('stat-progress-percent');
      if (progressBar) progressBar.style.width = `${overallProgress}%`;
      if (progressPercent) progressPercent.textContent = `${overallProgress}%`;

      // 3. Render các thẻ Task vào từng cột
      this.renderColumnList('kanban-list-todo', todoTasks, projects, 'todo');
      this.renderColumnList('kanban-list-doing', doingTasks, projects, 'doing');
      this.renderColumnList('kanban-list-done', doneTasks, projects, 'done');
    },

    /**
     * Render danh sách thẻ task cho một cột
     */
    renderColumnList(containerId, tasks, projects, status) {
      const container = document.getElementById(containerId);
      if (!container) return;

      container.innerHTML = '';

      if (tasks.length === 0) {
        container.appendChild(this.createEmptyStateElement(status));
        return;
      }

      tasks.forEach(task => {
        const project = projects.find(p => p.id === task.projectId);
        const card = this.createTaskCardElement(task, project);
        container.appendChild(card);
      });
    },

    /**
     * Tạo thẻ công việc (Task Card) tinh gọn chuẩn Trello
     * KHÔNG NÚT BẤM RÁC, KHÔNG THÙNG RÁC ĐỎ LỘ THIÊN, KHÔNG QUÁ HẠN KHI ĐÃ XONG
     */
    createTaskCardElement(task, project) {
      const card = document.createElement('div');
      card.className = 'task-card animate-card-enter cursor-pointer';
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

      // Cảnh báo quá hạn: CHỈ hiển thị nếu CHƯA HOÀN THÀNH
      const isOverdue = isTaskOverdue(task.dueDateTime, task.status);
      const overdueBadge = isOverdue ? `
        <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-rose-500/15 text-rose-500 border border-rose-500/30">
          <svg class="w-3 h-3 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          Quá hạn
        </span>
      ` : '';

      // Tên dự án & Màu nhận diện
      const projName = project ? project.name : 'Dự án chung';
      const projColor = (project && project.color) || '#6366F1';

      // Highlight từ khóa tìm kiếm
      const query = this.currentSearch;
      const highlightedTitle = highlightMatches(task.title, query);
      const highlightedDesc = task.description ? highlightMatches(task.description, query) : '';
      const highlightedProjName = highlightMatches(projName, query);

      // Danh sách tags
      const tagsHtml = (task.tags || []).slice(0, 3).map(tag => `
        <span class="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-white/5">
          #${highlightMatches(tag, query)}
        </span>
      `).join('');

      // Checklist badge
      const subtasks = task.subtasks || [];
      const totalSub = subtasks.length;
      const doneSub = subtasks.filter(s => s.isDone).length;
      const isChecklistComplete = totalSub > 0 && doneSub === totalSub;

      const checklistBadgeHtml = totalSub > 0 ? `
        <span class="badge-checklist ${isChecklistComplete ? 'is-completed' : ''}" title="${doneSub}/${totalSub} việc con hoàn thành">
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg>
          <span>${doneSub}/${totalSub}</span>
        </span>
      ` : '';

      // Comments count badge
      const commentsCount = (task.comments || []).length;
      const commentsBadgeHtml = commentsCount > 0 ? `
        <span class="inline-flex items-center gap-1 text-[11px] text-slate-400 font-semibold" title="${commentsCount} bình luận trao đổi">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
          <span>${commentsCount}</span>
        </span>
      ` : '';

      // Evidence link badge & Approval badge
      let evidenceBadgeHtml = '';
      if (task.status === 'doing' && task.evidence?.inProgressUrl) {
        evidenceBadgeHtml = `
          <a href="${task.evidence.inProgressUrl}" target="_blank" rel="noopener noreferrer" class="btn-evidence-badge bg-sky-500/10 text-sky-600 dark:text-sky-400 hover:bg-sky-500/20 border border-sky-500/30" title="Xem tiến độ: ${task.evidence.inProgressUrl}" onclick="event.stopPropagation();">
            <span>🔗</span>
            <span>Tiến độ ↗</span>
          </a>
        `;
      } else if (task.status === 'done') {
        if (task.evidence?.doneUrl) {
          evidenceBadgeHtml = `
            <a href="${task.evidence.doneUrl}" target="_blank" rel="noopener noreferrer" class="btn-evidence-badge bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/30" title="Xem nghiệm thu: ${task.evidence.doneUrl}" onclick="event.stopPropagation();">
              <span>🔗</span>
              <span>Nghiệm thu ↗</span>
            </a>
          `;
        }
      }

            // Huy hiệu tính giờ ngầm cho task Đang Làm (In-Progress) đồng bộ Trang 5
      let liveTimerBadgeHtml = '';
      if (task.status === 'doing') {
        liveTimerBadgeHtml = `
          <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30 animate-pulse" title="Đang tự động tính giờ ngầm cho Trang 5 (Reports)">
            <span class="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-ping"></span>
            ⏱️ Đang tính giờ
          </span>
        `;
      }

      let approvalBadgeHtml = '';
      if (task.status === 'done') {
        if (task.evidence?.isApproved) {
          approvalBadgeHtml = `
            <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30" title="Đã duyệt bởi: ${task.evidence.approvedBy || 'Admin'}">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
              Đã duyệt
            </span>
          `;
        } else if (task.evidence?.doneUrl) {
          approvalBadgeHtml = `
            <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30" title="Đang chờ Quản trị viên kiểm tra nghiệm thu">
              ⏳ Chờ duyệt
            </span>
          `;
        }
      }

      // Avatar stack của tất cả người tham gia (Lead + Subtask assignees)
      const members = KanbanData.getMembers();
      const participatingMemberIds = new Set();
      if (task.assigneeId) participatingMemberIds.add(task.assigneeId);
      subtasks.forEach(s => {
        (s.assigneeIds || []).forEach(mId => participatingMemberIds.add(mId));
      });

      const memberAvatarsHtml = Array.from(participatingMemberIds).map(mId => {
        const mem = members.find(m => m.id === mId) || {
          name: 'Thành viên',
          avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=User'
        };
        return `
          <img 
            src="${mem.avatar}" 
            alt="${mem.name}" 
            title="${mem.name}" 
            class="w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-700 object-cover flex-shrink-0"
          />
        `;
      }).join('');

      card.innerHTML = `
        <!-- Top bar: Dự án & Priority -->
        <div class="flex items-center justify-between gap-2 mb-2">
          <div class="flex items-center gap-1.5 min-w-0">
            <span class="w-2 h-2 rounded-full flex-shrink-0" style="background-color: ${projColor}"></span>
            <span class="text-[11px] font-bold text-slate-500 dark:text-slate-400 truncate max-w-[130px]" title="${projName}">
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

        <!-- Tiêu đề Task -->
        <h3 class="text-sm font-bold text-slate-900 dark:text-white mb-1.5 line-clamp-2 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
          ${highlightedTitle}
        </h3>

        <!-- Mô tả vắn tắt -->
        ${highlightedDesc ? `
          <p class="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 mb-2.5 leading-relaxed">
            ${highlightedDesc}
          </p>
        ` : ''}

        <!-- Tags -->
        ${tagsHtml ? `
          <div class="flex flex-wrap gap-1 mb-2.5">
            ${tagsHtml}
          </div>
        ` : ''}

        <!-- Footer Card chuẩn Trello: Huy hiệu & Avatar Stack -->
        <div class="pt-2 border-t border-slate-200/80 dark:border-white/5 flex items-center justify-between gap-2 text-xs">
          <!-- Cụm huy hiệu bổ trợ -->
          <div class="flex flex-wrap items-center gap-2">
            ${checklistBadgeHtml}
            ${evidenceBadgeHtml}
            ${approvalBadgeHtml}
            ${liveTimerBadgeHtml}
            ${commentsBadgeHtml}
          </div>

          <!-- Deadline & Avatar Stack -->
          <div class="flex items-center gap-2 flex-shrink-0">
            <div class="avatar-stack">
              ${memberAvatarsHtml}
            </div>
            <span class="text-[10px] font-mono font-medium ${isOverdue ? 'text-rose-500 font-bold' : 'text-slate-400'}">
              ${formatDateTimeDisplay(task.dueDateTime)}
            </span>
          </div>
        </div>
      `;

      // Kéo thả HTML5 Drag & Drop
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

      // Nhấn trực tiếp vào Card mở Modal 2 cột chi tiết
      card.addEventListener('click', (e) => {
        if (e.target.closest('a')) return;
        this.openEditTaskModal(task.id);
      });

      return card;
    },

    /**
     * Tạo phần tử rỗng cho cột Kanban
     */
    createEmptyStateElement(status) {
      const emptyConfigs = {
        todo: {
          icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>`,
          text: 'Chưa có công việc nào cần làm',
          btnText: '+ Thêm việc mới',
          actionStatus: 'todo'
        },
        doing: {
          icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13 10V3L4 14h7v7l9-11h-7z"/>`,
          text: 'Không có việc đang thực hiện',
          btnText: 'Bắt đầu việc mới',
          actionStatus: 'doing'
        },
        done: {
          icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>`,
          text: 'Chưa có công việc hoàn thành',
          btnText: 'Kéo việc vào đây',
          actionStatus: null
        }
      };

      const cfg = emptyConfigs[status] || emptyConfigs.todo;
      const el = document.createElement('div');
      el.className = 'empty-state p-6 flex flex-col items-center justify-center text-center';

      el.innerHTML = `
        <span class="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-white/5 text-slate-400 flex items-center justify-center mb-3">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">${cfg.icon}</svg>
        </span>
        <p class="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-3">${cfg.text}</p>
        ${cfg.actionStatus ? `
          <button 
            type="button" 
            class="px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/20 transition-colors"
            onclick="window.KanbanApp.openCreateTaskModal('${cfg.actionStatus}')"
          >
            ${cfg.btnText}
          </button>
        ` : ''}
      `;

      return el;
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

      const currentUser = this.getCurrentUser();
      const nowMs = Date.now();
      let autoLoggedHours = 0;

      // =========================================================================
      // ĐỒNG BỘ TÍNH GIỜ TỰ ĐỘNG VỚI TRANG 5 (REPORTS & TIME-TRACKER)
      // 1. Kéo sang "doing" (In-Progress): Tự động kích hoạt tính giờ ngầm
      // 2. Kéo sang "done" (Đã hoàn thành): Tự động dừng tính giờ và chốt giờ
      // 3. Kéo về "todo": Dừng tính giờ
      // =========================================================================
      if (targetStatus === 'doing') {
        task.timerStartedAt = nowMs;
        task.isTracking = true;
      } else if (prevStatus === 'doing' && targetStatus === 'done') {
        const startMs = task.timerStartedAt || (nowMs - 15 * 60 * 1000);
        const elapsedMs = Math.max(0, nowMs - startMs);
        autoLoggedHours = +(elapsedMs / 3600000).toFixed(2);
        if (autoLoggedHours <= 0) autoLoggedHours = 0.01;

        task.spentHours = +((parseFloat(task.spentHours) || 0) + autoLoggedHours).toFixed(2);
        task.timerStartedAt = null;
        task.isTracking = false;

        // Tự động sinh bản ghi chấm công vào TimeLogs của Trang 5
        try {
          let timeLogs = [];
          if (window.TaskFlowStorage && typeof window.TaskFlowStorage.get === 'function') {
            timeLogs = window.TaskFlowStorage.get('taskflow_time_logs', []);
          }
          if (!Array.isArray(timeLogs) || timeLogs.length === 0) {
            const rawBundle = localStorage.getItem('TASKFLOW_DATA');
            const bundle = rawBundle ? JSON.parse(rawBundle) : {};
            timeLogs = Array.isArray(bundle.timeLogs) ? bundle.timeLogs : [];
          }

          const projects = KanbanData.getProjects();
          const proj = projects.find(p => p.id === task.projectId);

          const autoLog = {
            id: 'log-' + Date.now(),
            taskId: task.id,
            taskTitle: task.title,
            projectId: task.projectId || '',
            projectName: proj ? proj.name : 'Chung',
            projectColor: proj ? (proj.color || '#6366F1') : '#6366F1',
            assigneeName: currentUser.name || (task.assignee ? task.assignee.name : 'Thành viên'),
            assigneeAvatar: currentUser.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=Nhat',
            hoursSpent: autoLoggedHours,
            date: new Date().toISOString().slice(0, 10),
            workResult: `[Tự động từ Kanban] Đã hoàn thành công việc và chốt ${autoLoggedHours}h làm việc.`,
            blockers: 'Không có',
            syncedToSheets: true,
            createdAt: new Date().toISOString()
          };

          timeLogs.unshift(autoLog);

          if (window.TaskFlowStorage && typeof window.TaskFlowStorage.set === 'function') {
            window.TaskFlowStorage.set('taskflow_time_logs', timeLogs);
          } else {
            localStorage.setItem('taskflow_time_logs', JSON.stringify(timeLogs));
            const rawBundle = localStorage.getItem('TASKFLOW_DATA');
            const bundle = rawBundle ? JSON.parse(rawBundle) : {};
            bundle.timeLogs = timeLogs;
            localStorage.setItem('TASKFLOW_DATA', JSON.stringify(bundle));
          }

          if (window.SheetsSync && typeof window.SheetsSync.sendTimeLog === 'function') {
            window.SheetsSync.sendTimeLog(autoLog);
          }
        } catch (err) {
          console.error('[Kanban] Lỗi khi tạo timeLog tự động:', err);
        }
      } else if (prevStatus === 'doing' && targetStatus === 'todo') {
        task.timerStartedAt = null;
        task.isTracking = false;
      }

      task.status = targetStatus;
      KanbanData.saveTasks(tasks);

      // Kích hoạt sự kiện toàn cục để trang Reports đang mở cập nhật tức thì
      try {
        window.dispatchEvent(new CustomEvent('taskflow_timer_updated', {
          detail: { taskId, targetStatus, task, autoLoggedHours }
        }));
      } catch (e) {}

      const progressResult = recalculateProjectProgress(task.projectId);
      this.render();

      setTimeout(() => {
        const movedCard = document.querySelector(`.task-card[data-task-id="${taskId}"]`);
        if (movedCard) {
          movedCard.classList.add('animate-spring-drop');
          setTimeout(() => movedCard.classList.remove('animate-spring-drop'), 450);
        }
      }, 50);

      const statusLabels = {
        todo: 'Chờ thực hiện',
        doing: 'Đang làm (In-Progress)',
        done: 'Đã hoàn thành'
      };
      const projName = progressResult?.project?.name || 'Dự án';
      const progressText = progressResult ? ` • Tiến độ ${projName}: ${progressResult.progress}%` : '';

      if (targetStatus === 'doing') {
        showToast(`⚡ [Tự động tính giờ] Đã kích hoạt tính giờ ngầm cho: "${task.title}"!`, 'info');
      } else if (prevStatus === 'doing' && targetStatus === 'done') {
        showToast(`✅ [Tự động chốt giờ] Đã chốt ${autoLoggedHours}h làm việc vào Báo cáo & Time-tracker!`, 'success');
      } else {
        showToast(`Đã chuyển sang "${statusLabels[targetStatus]}"${progressText}`, 'success');
      }

      // Tự động kích hoạt Quick Evidence Modal nếu chuyển sang Doing/Done mà chưa có link
      if (targetStatus === 'doing' && !task.evidence?.inProgressUrl) {
        setTimeout(() => this.openQuickEvidenceModal(task, 'doing'), 350);
      } else if (targetStatus === 'done' && !task.evidence?.doneUrl) {
        setTimeout(() => this.openQuickEvidenceModal(task, 'done'), 350);
      }
    },

    /**
     * Mở Quick Evidence Modal
     */
    openQuickEvidenceModal(task, targetStatus) {
      const modal = document.getElementById('quickEvidenceModal');
      if (!modal) return;

      document.getElementById('quickEvidenceTaskId').value = task.id;
      document.getElementById('quickEvidenceTargetStatus').value = targetStatus;
      document.getElementById('quickEvidenceTaskName').textContent = task.title;

      const modalTitle = document.getElementById('quickEvidenceModalTitle');
      const urlLabel = document.getElementById('quickEvidenceUrlLabel');
      const urlInput = document.getElementById('quickEvidenceUrl');
      const noteInput = document.getElementById('quickEvidenceNote');
      const iconEl = document.getElementById('quickEvidenceIcon');
      const hintEl = document.getElementById('quickEvidenceHint');

      if (targetStatus === 'doing') {
        modalTitle.textContent = 'Nộp Bằng Chứng Tiến Độ Đang Làm (WIP Link)';
        urlLabel.innerHTML = `Link Bằng Chứng Đang Làm (Figma, GitHub branch) <span class="text-rose-500">*</span>`;
        urlInput.placeholder = 'https://figma.com/file/... hoặc https://github.com/...';
        urlInput.value = task.evidence?.inProgressUrl || '';
        noteInput.value = task.evidence?.inProgressNote || '';
        iconEl.textContent = '⚡';
        iconEl.className = 'w-8 h-8 rounded-lg bg-sky-500/20 text-sky-500 flex items-center justify-center font-bold text-base';
        hintEl.textContent = 'Dán link Figma hoặc GitHub branch để người phân công kiểm tra tiến độ trực tiếp.';
      } else if (targetStatus === 'done') {
        modalTitle.textContent = 'Nộp Link Nghiệm Thu Hoàn Thành (Done Delivery)';
        urlLabel.innerHTML = `Link Sản Phẩm Bàn Giao / Live Demo / PR Merged <span class="text-rose-500">*</span>`;
        urlInput.placeholder = 'https://demo-app.vercel.app hoặc https://github.com/TaskFlow/pull/1';
        urlInput.value = task.evidence?.doneUrl || '';
        noteInput.value = task.evidence?.doneNote || '';
        iconEl.textContent = '🏆';
        iconEl.className = 'w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-500 flex items-center justify-center font-bold text-base';
        hintEl.textContent = 'Dán link sản phẩm hoàn thiện để Quản trị viên (Admin) kiểm tra và duyệt nghiệm thu.';
      }

      modal.classList.remove('hidden');
      setTimeout(() => urlInput.focus(), 100);
    },

    closeQuickEvidenceModal() {
      const modal = document.getElementById('quickEvidenceModal');
      if (modal) modal.classList.add('hidden');
    },

    /**
     * Mở Modal tạo Task mới
     */
    openCreateTaskModal(defaultStatus = 'todo') {
      const user = this.getCurrentUser();
      if (user.role !== 'admin') {
        showToast('🔒 Chỉ Quản trị viên (Admin) mới có quyền khởi tạo công việc mới! Bạn có thể nhấn nút "Đổi vai trò ⇄" trên thanh công cụ để thử nghiệm quyền Admin.', 'warning');
        return;
      }

      const modal = document.getElementById('taskModal');
      const form = document.getElementById('taskForm');
      if (!modal || !form) return;

      this.currentEditingTaskId = null;
      form.reset();
      document.getElementById('taskFormId').value = '';

      document.getElementById('taskInputTitle').value = '';
      document.getElementById('taskInputDesc').value = '';
      document.getElementById('taskInputStatus').value = defaultStatus;

      // Reset Checklist & Multi-assignees
      this.currentEditingSubtasks = [];
      this.selectedSubtaskMemberIds.clear();
      this.renderSubtaskMemberChips();
      this.renderSubtasksEditor();

      // Reset Evidence & Breadcrumb
      this.renderContextualEvidence(null, defaultStatus);
      this.renderCommentsFeed([]);

      // Reset Sidebar & Quyền form
      this.updateApprovalSidebar(null);
      this.updateFormPermissions(null);

      // Ngày mặc định
      const now = new Date();
      const startIso = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      const dueDate = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
      const dueIso = new Date(dueDate.getTime() - dueDate.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

      document.getElementById('taskInputStart').value = startIso;
      document.getElementById('taskInputDue').value = dueIso;

      modal.classList.remove('hidden');
      setTimeout(() => document.getElementById('taskInputTitle')?.focus(), 100);
    },

    /**
     * Mở Modal chỉnh sửa Task (Bố cục 2 cột chuẩn Trello)
     */
    openEditTaskModal(taskId) {
      const modal = document.getElementById('taskModal');
      if (!modal) return;

      const tasks = KanbanData.getTasks();
      const task = tasks.find(t => t.id === taskId);
      if (!task) return;

      this.currentEditingTaskId = task.id;
      document.getElementById('taskFormId').value = task.id;

      // Cột Trái: Nội dung
      document.getElementById('taskInputTitle').value = task.title || '';
      document.getElementById('taskInputDesc').value = task.description || '';

      const projects = KanbanData.getProjects();
      const proj = projects.find(p => p.id === task.projectId);
      const breadcrumb = document.getElementById('taskModalBreadcrumb');
      if (breadcrumb) {
        breadcrumb.innerHTML = `trong dự án: <b>${proj ? proj.name : 'Dự án chung'}</b>`;
      }

      // Checklist & Multi-assignees
      this.currentEditingSubtasks = JSON.parse(JSON.stringify(task.subtasks || []));
      this.selectedSubtaskMemberIds.clear();
      this.renderSubtaskMemberChips();
      this.renderSubtasksEditor();

      // Bằng chứng ngữ cảnh (State-Aware)
      this.renderContextualEvidence(task, task.status);

      // Thảo luận & Bình luận
      this.renderCommentsFeed(task.comments || []);

      // Cột Phải: Sidebar
      document.getElementById('taskInputProject').value = task.projectId || 'proj-101';
      document.getElementById('taskInputStatus').value = task.status || 'todo';
      document.getElementById('taskInputPriority').value = task.priority || 'medium';
      document.getElementById('taskInputAssignee').value = task.assigneeId || 'mem-01';
      document.getElementById('taskInputStart').value = task.startDateTime ? task.startDateTime.slice(0, 16) : '';
      document.getElementById('taskInputDue').value = task.dueDateTime ? task.dueDateTime.slice(0, 16) : '';
      document.getElementById('taskInputHours').value = task.estimatedHours || 8;
      document.getElementById('taskInputTags').value = (task.tags || []).join(', ');

      // Quản lý Quyền Duyệt & Quyền Xóa (RBAC)
      this.updateApprovalSidebar(task);
      this.updateFormPermissions(task);

      modal.classList.remove('hidden');
    },

    /**
     * Render khu vực Bằng Chứng Làm Việc theo đúng ngữ cảnh trạng thái (State-Aware Evidence)
     */
    renderContextualEvidence(task, status) {
      const container = document.getElementById('contextualEvidenceContainer');
      if (!container) return;

      const evidence = task?.evidence || {
        inProgressUrl: '',
        inProgressNote: '',
        doneUrl: '',
        doneNote: '',
        isApproved: false
      };

      if (status === 'todo') {
        // Trạng thái TO-DO: Không hiện ô nhập bằng chứng thừa thãi
        container.innerHTML = `
          <div class="p-3.5 rounded-xl bg-slate-100/70 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 text-xs text-slate-500 dark:text-slate-400 space-y-1">
            <span class="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <span>📋</span> Giai đoạn chuẩn bị (To-do)
            </span>
            <p class="leading-relaxed">Công việc đang trong giai đoạn lên kế hoạch. Khi bạn kéo thẻ sang <b>Đang làm (In-Progress)</b>, hệ thống sẽ mở khu vực nộp link tiến độ (Figma, GitHub branch...).</p>
          </div>
        `;
      } else if (status === 'doing') {
        // Trạng thái IN-PROGRESS: CHỈ HIỆN LINK ĐANG LÀM
        container.innerHTML = `
          <div class="p-4 rounded-xl bg-sky-500/10 border border-sky-500/25 space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-sky-600 dark:text-sky-400 flex items-center gap-1.5">
                <span class="w-2 h-2 rounded-full bg-sky-400 animate-pulse"></span>
                Bằng chứng Đang làm (In-Progress WIP Link)
              </span>
              <span class="text-[10px] text-slate-400">Figma, GitHub branch, Docs...</span>
            </div>
            <div class="space-y-2">
              <input 
                type="url" 
                id="taskInputWipUrl" 
                value="${evidence.inProgressUrl || ''}" 
                placeholder="https://figma.com/file/... hoặc https://github.com/..." 
                class="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-white/10 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
              />
              <input 
                type="text" 
                id="taskInputWipNote" 
                value="${evidence.inProgressNote || ''}" 
                placeholder="Ghi chú tiến độ (VD: Đang chỉnh sửa responsive màn hình tablet...)" 
                class="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-white/10 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
              />
            </div>
          </div>
        `;
      } else if (status === 'done') {
        // Trạng thái DONE: CHỈ HIỆN LINK NGHIỆM THU + THAM KHẢO LINK CŨ
        const prevWipHtml = evidence.inProgressUrl ? `
          <div class="pt-2 border-t border-emerald-500/20 text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-2">
            <span>📎 Link tiến độ trước đó:</span>
            <a href="${evidence.inProgressUrl}" target="_blank" class="text-sky-500 hover:underline truncate max-w-xs font-mono">${evidence.inProgressUrl}</a>
          </div>
        ` : '';

        container.innerHTML = `
          <div class="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/25 space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
                Bằng chứng Hoàn thành / Nghiệm thu (Done Delivery Link)
              </span>
              <span class="text-[10px] text-slate-400">Live Demo, PR merged, Báo cáo...</span>
            </div>
            <div class="space-y-2">
              <input 
                type="url" 
                id="taskInputDoneUrl" 
                value="${evidence.doneUrl || ''}" 
                placeholder="https://demo-app.vercel.app hoặc PR link..." 
                class="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-white/10 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              />
              <input 
                type="text" 
                id="taskInputDoneNote" 
                value="${evidence.doneNote || ''}" 
                placeholder="Ghi chú bàn giao (VD: Đã merge nhánh main, test pass 100%...)" 
                class="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-white/10 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              />
            </div>
            ${prevWipHtml}
          </div>
        `;
      }
    },

    /**
     * Render trình soạn thảo Mini-tasks (Checklist)
     */
    renderSubtasksEditor() {
      const container = document.getElementById('subtasksContainer');
      const progressText = document.getElementById('subtasksProgressText');
      const progressBar = document.getElementById('subtasksProgressBar');
      if (!container) return;

      const members = KanbanData.getMembers();
      const subtasks = this.currentEditingSubtasks || [];
      const total = subtasks.length;
      const done = subtasks.filter(s => s.isDone).length;
      const percent = total > 0 ? Math.round((done / total) * 100) : 0;

      if (progressText) progressText.textContent = `${done}/${total} (${percent}%)`;
      if (progressBar) progressBar.style.width = `${percent}%`;

      if (total === 0) {
        container.innerHTML = `
          <div class="text-[11px] text-slate-400 text-center py-2.5 italic">
            Chưa có việc con. Nhập tên việc, tích chọn thành viên và bấm "+ Thêm việc".
          </div>
        `;
        return;
      }

      container.innerHTML = '';
      subtasks.forEach((sub, index) => {
        const item = document.createElement('div');
        item.className = `subtask-item ${sub.isDone ? 'is-done' : ''}`;

        // Avatars của các thành viên cùng phụ trách subtask
        const assignedAvatars = (sub.assigneeIds || []).map(mId => {
          const m = members.find(mem => mem.id === mId);
          return m ? `<img src="${m.avatar}" alt="${m.name}" title="${m.name}" class="w-5 h-5 rounded-full" />` : '';
        }).join('');

        item.innerHTML = `
          <div class="flex items-center gap-2.5 min-w-0 flex-1">
            <input 
              type="checkbox" 
              class="subtask-editor-chk w-4 h-4 rounded text-indigo-600 focus:ring-0 border-slate-300 dark:border-white/20 bg-white dark:bg-slate-900 cursor-pointer"
              data-index="${index}" 
              ${sub.isDone ? 'checked' : ''}
            />
            <span class="subtask-text text-xs text-slate-800 dark:text-slate-200 truncate font-medium">${sub.title}</span>
          </div>

          <div class="flex items-center gap-2 flex-shrink-0">
            <div class="avatar-stack scale-90 origin-right">
              ${assignedAvatars}
            </div>
            <button 
              type="button" 
              class="btn-delete-subtask text-slate-400 hover:text-rose-500 p-1 transition-colors" 
              data-index="${index}" 
              title="Xóa việc con"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </button>
          </div>
        `;

        const chk = item.querySelector('.subtask-editor-chk');
        if (chk) {
          chk.addEventListener('change', () => {
            this.currentEditingSubtasks[index].isDone = chk.checked;
            this.renderSubtasksEditor();
          });
        }

        const btnDel = item.querySelector('.btn-delete-subtask');
        if (btnDel) {
          btnDel.addEventListener('click', () => {
            this.currentEditingSubtasks.splice(index, 1);
            this.renderSubtasksEditor();
          });
        }

        container.appendChild(item);
      });
    },

    /**
     * Render Activity & Comments Feed
     */
    renderCommentsFeed(comments) {
      const container = document.getElementById('commentsListContainer');
      if (!container) return;

      if (!comments || comments.length === 0) {
        container.innerHTML = `
          <div class="text-[11px] text-slate-400 text-center py-2 italic">
            Chưa có bình luận nào. Hãy để lại tin nhắn trao đổi đầu tiên cho công việc này.
          </div>
        `;
        return;
      }

      container.innerHTML = comments.slice().reverse().map(cmt => `
        <div class="flex items-start gap-2.5">
          <img src="${cmt.authorAvatar}" alt="${cmt.authorName}" class="w-6 h-6 rounded-full bg-slate-200 dark:bg-white/10 flex-shrink-0 mt-0.5" />
          <div class="flex-1 space-y-1">
            <div class="flex items-center gap-2">
              <span class="text-xs font-bold text-slate-800 dark:text-slate-200">${cmt.authorName}</span>
              <span class="text-[9px] uppercase px-1 rounded bg-slate-200 dark:bg-white/10 text-slate-500 font-bold">${cmt.role || 'Member'}</span>
              <span class="text-[10px] text-slate-400 font-mono">${cmt.createdAt}</span>
            </div>
            <div class="comment-bubble text-slate-700 dark:text-slate-300">
              ${cmt.content}
            </div>
          </div>
        </div>
      `).join('');
    },

    /**
     * Cập nhật Sidebar Phê duyệt & Quyền xóa theo RBAC
     */
    updateApprovalSidebar(task) {
      const user = this.getCurrentUser();
      const isAdmin = user.role === 'admin';

      const statusBadge = document.getElementById('approvalBadgeStatus');
      const adminActions = document.getElementById('approvalAdminActions');
      const infoText = document.getElementById('approvalInfoText');
      const btnDelete = document.getElementById('btnDeleteTaskInModal');

      const isApproved = !!task?.evidence?.isApproved;

      // 1. Badge trạng thái duyệt
      if (statusBadge) {
        if (isApproved) {
          statusBadge.textContent = 'ĐÃ DUYỆT';
          statusBadge.className = 'font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-500';
        } else {
          statusBadge.textContent = 'CHỜ DUYỆT';
          statusBadge.className = 'font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-500';
        }
      }

      // 2. Quyền Duyệt (Chỉ Admin)
      if (adminActions) {
        if (isAdmin) {
          adminActions.classList.remove('hidden');
          if (infoText) {
            infoText.innerHTML = isApproved 
              ? `<span class="text-emerald-500 font-bold">✓ Đã duyệt bởi ${task?.evidence?.approvedBy || 'Admin'} (${task?.evidence?.approvedAt || 'vừa xong'})</span>` 
              : `Bạn đang đăng nhập vai trò <b>Admin (${user.name})</b>, có toàn quyền duyệt nghiệm thu hoặc yêu cầu sửa đổi.`;
          }
        } else {
          // Member: Ẩn nút duyệt
          adminActions.classList.add('hidden');
          if (infoText) {
            infoText.innerHTML = isApproved
              ? `<span class="text-emerald-500 font-bold">✓ Công việc này đã được Admin nghiệm thu thành công.</span>`
              : `<span class="text-amber-500">⏳ Đang chờ Quản trị viên (Admin) kiểm tra và duyệt nghiệm thu. Bạn không có quyền tự phê duyệt.</span>`;
          }
        }
      }

      // 3. Quyền Xóa (Chỉ Admin)
      if (btnDelete) {
        if (isAdmin) {
          btnDelete.classList.remove('hidden');
        } else {
          btnDelete.classList.add('hidden'); // Member không có quyền xóa
        }
      }
    },

    /**
     * Cập nhật quyền hạn chỉnh sửa form (RBAC Form Permissions)
     * Admin: Toàn quyền sửa tất cả các trường
     * Member: Bị khóa Ngày bắt đầu, Hạn chót (Deadline), Dự án, Mức ưu tiên, Người phụ trách chính
     */
    updateFormPermissions(task) {
      const user = this.getCurrentUser();
      const isAdmin = user.role === 'admin';

      const startInput = document.getElementById('taskInputStart');
      const dueInput = document.getElementById('taskInputDue');
      const projectSelect = document.getElementById('taskInputProject');
      const prioritySelect = document.getElementById('taskInputPriority');
      const assigneeSelect = document.getElementById('taskInputAssignee');
      const lockIndicators = document.querySelectorAll('.admin-only-lock');

      const adminOnlyInputs = [startInput, dueInput, projectSelect, prioritySelect, assigneeSelect];

      adminOnlyInputs.forEach(el => {
        if (!el) return;
        el.disabled = !isAdmin;
        if (!isAdmin) {
          el.classList.add('cursor-not-allowed', 'opacity-75', 'bg-slate-100', 'dark:bg-slate-800/80');
          el.title = '🔒 Chỉ Quản trị viên (Admin) mới có quyền chỉnh sửa mục này';
        } else {
          el.classList.remove('cursor-not-allowed', 'opacity-75', 'bg-slate-100', 'dark:bg-slate-800/80');
          el.removeAttribute('title');
        }
      });

      lockIndicators.forEach(lock => {
        lock.classList.toggle('hidden', isAdmin);
      });
    },

    /**
     * Đóng modal Task
     */
    closeModal() {
      const modal = document.getElementById('taskModal');
      if (modal) modal.classList.add('hidden');
      this.currentEditingTaskId = null;
    },

    /**
     * Gắn tất cả sự kiện tương tác
     */
    bindEvents() {
      // 1. Tìm kiếm thời gian thực
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

      // 3. Dropdown Lọc theo Dự án & Priority
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

      // 4. Mở Modal tạo Task mới
      const btnOpenCreate = document.getElementById('btnOpenCreateTaskModal');
      if (btnOpenCreate) {
        btnOpenCreate.addEventListener('click', () => this.openCreateTaskModal('todo'));
      }

      document.querySelectorAll('.btn-quick-add').forEach(btn => {
        btn.addEventListener('click', () => {
          const status = btn.getAttribute('data-status') || 'todo';
          this.openCreateTaskModal(status);
        });
      });

      // 5. Đóng Modal Task
      const btnCloseModal = document.getElementById('btnCloseTaskModal');
      if (btnCloseModal) btnCloseModal.addEventListener('click', () => this.closeModal());

      const taskModal = document.getElementById('taskModal');
      if (taskModal) {
        taskModal.addEventListener('click', (e) => {
          if (e.target === taskModal) this.closeModal();
        });
      }

      // 6. Đổi trạng thái trong modal -> Tự động đổi vùng bằng chứng ngữ cảnh
      const taskInputStatus = document.getElementById('taskInputStatus');
      if (taskInputStatus) {
        taskInputStatus.addEventListener('change', (e) => {
          const newStatus = e.target.value;
          const tasks = KanbanData.getTasks();
          const task = tasks.find(t => t.id === this.currentEditingTaskId);
          this.renderContextualEvidence(task, newStatus);
        });
      }

      // 7. Thêm Subtask mới (Hỗ trợ 1 hoặc NHIỀU người cùng phụ trách)
      const btnAddSubtask = document.getElementById('btnAddSubtask');
      const newSubtaskTitle = document.getElementById('newSubtaskTitle');

      if (btnAddSubtask && newSubtaskTitle) {
        const handleAddSub = () => {
          const title = newSubtaskTitle.value.trim();
          if (!title) return;

          // Lấy danh sách ID các thành viên đã được tích chọn
          let assigneeIds = Array.from(this.selectedSubtaskMemberIds);
          if (assigneeIds.length === 0) {
            assigneeIds = ['mem-01']; // Mặc định gán người đầu tiên nếu không chọn ai
          }

          this.currentEditingSubtasks.push({
            id: 'sub-' + Date.now() + '-' + Math.floor(Math.random() * 100),
            title: title,
            isDone: false,
            assigneeIds: assigneeIds
          });

          newSubtaskTitle.value = '';
          this.selectedSubtaskMemberIds.clear();
          this.renderSubtaskMemberChips();
          this.renderSubtasksEditor();
          newSubtaskTitle.focus();
        };

        btnAddSubtask.addEventListener('click', handleAddSub);
        newSubtaskTitle.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            handleAddSub();
          }
        });
      }

      // 8. Đăng bình luận thảo luận (Activity Feed)
      const btnPostComment = document.getElementById('btnPostComment');
      const newCommentText = document.getElementById('newCommentText');
      if (btnPostComment && newCommentText) {
        btnPostComment.addEventListener('click', () => {
          const content = newCommentText.value.trim();
          if (!content) return;

          const currentUser = this.getCurrentUser();
          const nowStr = new Date().toLocaleString('vi-VN', {
            hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit'
          });

          const newCmt = {
            id: 'cmt-' + Date.now(),
            authorName: currentUser.name,
            authorAvatar: currentUser.avatar,
            role: currentUser.role === 'admin' ? 'Admin' : 'Member',
            content: content,
            createdAt: nowStr
          };

          if (this.currentEditingTaskId) {
            const tasks = KanbanData.getTasks();
            const task = tasks.find(t => t.id === this.currentEditingTaskId);
            if (task) {
              if (!task.comments) task.comments = [];
              task.comments.push(newCmt);
              KanbanData.saveTasks(tasks);
              this.renderCommentsFeed(task.comments);
              this.render(); // Cập nhật badge comment trên card
            }
          }

          newCommentText.value = '';
          showToast('Đã đăng bình luận trao đổi!', 'info');
        });
      }

      // 9. Nút Phê Duyệt Nghiệm Thu (Dành cho Admin)
      const btnApprove = document.getElementById('btnApproveTask');
      if (btnApprove) {
        btnApprove.addEventListener('click', async () => {
          const user = this.getCurrentUser();
          if (user.role !== 'admin') {
            showToast('Chỉ Quản trị viên (Admin) mới có quyền duyệt nghiệm thu!', 'error');
            return;
          }

          if (!this.currentEditingTaskId) return;
          const tasks = KanbanData.getTasks();
          const task = tasks.find(t => t.id === this.currentEditingTaskId);
          if (!task) return;

          if (!task.evidence) task.evidence = {};
          task.evidence.isApproved = true;
          task.evidence.approvedBy = user.name;
          task.evidence.approvedAt = new Date().toLocaleString('vi-VN');

          // Thêm một bình luận hệ thống
          if (!task.comments) task.comments = [];
          task.comments.push({
            id: 'cmt-' + Date.now(),
            authorName: user.name,
            authorAvatar: user.avatar,
            role: 'Admin',
            content: `🛡️ [HỆ THỐNG] Đã phê duyệt nghiệm thu công việc "${task.title}".`,
            createdAt: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
          });

          KanbanData.saveTasks(tasks);
          this.updateApprovalSidebar(task);
          this.renderCommentsFeed(task.comments);
          this.render();

          showToast(`Đã duyệt nghiệm thu công việc "${task.title}"!`, 'success');
          await syncEvidenceToSheets(task, task.status, task.evidence.doneUrl, task.evidence.doneNote, true, 'APPROVE');
        });
      }

      // 10. Nút Yêu Cầu Sửa Lại (Dành cho Admin: Trả về In-Progress)
      const btnRequestChanges = document.getElementById('btnRequestChangesTask');
      if (btnRequestChanges) {
        btnRequestChanges.addEventListener('click', async () => {
          const user = this.getCurrentUser();
          if (user.role !== 'admin') {
            showToast('Chỉ Admin mới có quyền yêu cầu sửa lại!', 'error');
            return;
          }

          const reason = window.prompt('Nhập lý do hoặc nội dung cần chỉnh sửa bổ sung:');
          if (reason === null) return;

          if (!this.currentEditingTaskId) return;
          const tasks = KanbanData.getTasks();
          const task = tasks.find(t => t.id === this.currentEditingTaskId);
          if (!task) return;

          task.status = 'doing'; // Chuyển ngược về In-Progress
          if (!task.evidence) task.evidence = {};
          task.evidence.isApproved = false;

          if (!task.comments) task.comments = [];
          task.comments.push({
            id: 'cmt-' + Date.now(),
            authorName: user.name,
            authorAvatar: user.avatar,
            role: 'Admin',
            content: `↩ [YÊU CẦU SỬA ĐỔI] ${reason || 'Vui lòng hoàn thiện thêm sản phẩm theo yêu cầu.'}`,
            createdAt: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
          });

          KanbanData.saveTasks(tasks);
          recalculateProjectProgress(task.projectId);

          // Cập nhật lại UI modal
          document.getElementById('taskInputStatus').value = 'doing';
          this.renderContextualEvidence(task, 'doing');
          this.updateApprovalSidebar(task);
          this.renderCommentsFeed(task.comments);
          this.render();

          showToast(`Đã yêu cầu chỉnh sửa và chuyển task về Đang làm!`, 'warning');
          await syncEvidenceToSheets(task, 'doing', task.evidence.inProgressUrl, reason, false, 'REQUEST_CHANGES');
        });
      }

      // 11. Xóa Task trong Modal (Chỉ Admin)
      const btnDeleteInModal = document.getElementById('btnDeleteTaskInModal');
      if (btnDeleteInModal) {
        btnDeleteInModal.addEventListener('click', () => {
          const user = this.getCurrentUser();
          if (user.role !== 'admin') {
            showToast('Chỉ Admin mới có quyền xóa công việc!', 'error');
            return;
          }
          if (this.currentEditingTaskId) {
            this.deleteTask(this.currentEditingTaskId);
            this.closeModal();
          }
        });
      }

      // 12. Submit Form Task (Lưu tất cả thay đổi)
      const taskForm = document.getElementById('taskForm');
      if (taskForm) {
        taskForm.addEventListener('submit', (e) => {
          e.preventDefault();

          const btnSave = document.getElementById('btnSaveTask');
          const btnText = document.getElementById('btnSaveTaskText');

          if (btnSave && btnText) {
            btnSave.disabled = true;
            btnText.textContent = 'Đang lưu...';
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

          // Thu thập link bằng chứng theo đúng ngữ cảnh
          const wipUrlInput = document.getElementById('taskInputWipUrl');
          const wipNoteInput = document.getElementById('taskInputWipNote');
          const doneUrlInput = document.getElementById('taskInputDoneUrl');
          const doneNoteInput = document.getElementById('taskInputDoneNote');

          setTimeout(async () => {
            const tasks = KanbanData.getTasks();
            let targetTask = null;

            if (id) {
              const taskIndex = tasks.findIndex(t => t.id === id);
              if (taskIndex !== -1) {
                const prevTask = tasks[taskIndex];
                const prevEvidence = prevTask.evidence || {};

                // Bảo vệ chống sửa trộm (Anti-tamper protection):
                // Nếu người dùng hiện tại là Member, giữ nguyên Ngày bắt đầu, Hạn chót, Dự án, Mức ưu tiên và Người phân công chính từ dữ liệu gốc
                const user = this.getCurrentUser();
                const isAdmin = user.role === 'admin';

                const finalStartDateTime = isAdmin ? startDateTime : prevTask.startDateTime;
                const finalDueDateTime = isAdmin ? dueDateTime : prevTask.dueDateTime;
                const finalProjectId = isAdmin ? projectId : prevTask.projectId;
                const finalPriority = isAdmin ? priority : prevTask.priority;
                const finalAssigneeId = isAdmin ? assigneeId : prevTask.assigneeId;
                const finalAssignee = isAdmin ? { name: assigneeName, avatar: assigneeAvatar } : prevTask.assignee;

                tasks[taskIndex] = {
                  ...prevTask,
                  title,
                  description,
                  projectId: finalProjectId,
                  status,
                  priority: finalPriority,
                  assigneeId: finalAssigneeId,
                  assignee: finalAssignee,
                  startDateTime: finalStartDateTime,
                  dueDateTime: finalDueDateTime,
                  estimatedHours,
                  tags,
                  subtasks: this.currentEditingSubtasks,
                  evidence: {
                    inProgressUrl: wipUrlInput ? wipUrlInput.value.trim() : prevEvidence.inProgressUrl || '',
                    inProgressNote: wipNoteInput ? wipNoteInput.value.trim() : prevEvidence.inProgressNote || '',
                    doneUrl: doneUrlInput ? doneUrlInput.value.trim() : prevEvidence.doneUrl || '',
                    doneNote: doneNoteInput ? doneNoteInput.value.trim() : prevEvidence.doneNote || '',
                    isApproved: prevEvidence.isApproved || false,
                    approvedBy: prevEvidence.approvedBy || '',
                    approvedAt: prevEvidence.approvedAt || ''
                  }
                };
                targetTask = tasks[taskIndex];
                KanbanData.saveTasks(tasks);
                recalculateProjectProgress(projectId);
                showToast(`Đã lưu công việc "${title}"!`, 'success');
              }
            } else {
              targetTask = {
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
                tags: tags.length > 0 ? tags : ['Agile'],
                subtasks: this.currentEditingSubtasks,
                evidence: {
                  inProgressUrl: wipUrlInput ? wipUrlInput.value.trim() : '',
                  inProgressNote: wipNoteInput ? wipNoteInput.value.trim() : '',
                  doneUrl: doneUrlInput ? doneUrlInput.value.trim() : '',
                  doneNote: doneNoteInput ? doneNoteInput.value.trim() : '',
                  isApproved: false,
                  approvedBy: '',
                  approvedAt: ''
                },
                comments: []
              };
              tasks.push(targetTask);
              KanbanData.saveTasks(tasks);
              recalculateProjectProgress(projectId);
              showToast(`Đã thêm mới công việc "${title}"!`, 'success');
            }

            if (btnSave && btnText) {
              btnSave.disabled = false;
              btnText.textContent = 'Lưu Toàn Bộ Thay Đổi';
            }

            this.closeModal();
            this.render();
          }, 280);
        });
      }

      // 13. Quick Evidence Modal Submit
      const quickEvidenceForm = document.getElementById('quickEvidenceForm');
      const btnCloseQuick = document.getElementById('btnCloseQuickEvidenceModal');
      const btnSkipQuick = document.getElementById('btnSkipQuickEvidence');

      if (btnCloseQuick) btnCloseQuick.addEventListener('click', () => this.closeQuickEvidenceModal());
      if (btnSkipQuick) btnSkipQuick.addEventListener('click', () => this.closeQuickEvidenceModal());

      const quickModalEl = document.getElementById('quickEvidenceModal');
      if (quickModalEl) {
        quickModalEl.addEventListener('click', (e) => {
          if (e.target === quickModalEl) this.closeQuickEvidenceModal();
        });
      }

      if (quickEvidenceForm) {
        quickEvidenceForm.addEventListener('submit', async (e) => {
          e.preventDefault();

          const taskId = document.getElementById('quickEvidenceTaskId').value;
          const targetStatus = document.getElementById('quickEvidenceTargetStatus').value;
          const evidenceUrl = document.getElementById('quickEvidenceUrl').value.trim();
          const evidenceNote = document.getElementById('quickEvidenceNote').value.trim();
          const shouldSyncSheets = document.getElementById('quickEvidenceSyncSheets').checked;

          const tasks = KanbanData.getTasks();
          const task = tasks.find(t => t.id === taskId);
          if (!task) {
            this.closeQuickEvidenceModal();
            return;
          }

          if (!task.evidence) {
            task.evidence = {
              inProgressUrl: '', inProgressNote: '', doneUrl: '', doneNote: '', isApproved: false
            };
          }

          if (targetStatus === 'doing') {
            task.evidence.inProgressUrl = evidenceUrl;
            task.evidence.inProgressNote = evidenceNote;
          } else {
            task.evidence.doneUrl = evidenceUrl;
            task.evidence.doneNote = evidenceNote;
            task.evidence.isApproved = false; // Chờ Admin duyệt
          }

          KanbanData.saveTasks(tasks);
          this.closeQuickEvidenceModal();
          this.render();

          showToast('Đã lưu bằng chứng làm việc!', 'success');

          if (shouldSyncSheets) {
            await syncEvidenceToSheets(task, targetStatus, evidenceUrl, evidenceNote, false, 'EVIDENCE_SUBMIT');
            showToast('Đã đồng bộ lên Google Sheets Webhook!', 'info');
          }
        });
      }

      // 14. HTML5 Drag & Drop
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

      // Lắng nghe sự kiện Theme thay đổi
      window.addEventListener('themeChanged', () => {
        this.render();
      });
    },

    /**
     * Xóa vĩnh viễn task (Chỉ Admin)
     */
    deleteTask(taskId) {
      const user = this.getCurrentUser();
      if (user.role !== 'admin') {
        showToast('Chỉ Quản trị viên (Admin) mới có quyền xóa công việc!', 'error');
        return;
      }

      const tasks = KanbanData.getTasks();
      const task = tasks.find(t => t.id === taskId);
      if (!task) return;

      const confirmed = window.confirm(`Bạn có chắc chắn muốn xóa vĩnh viễn công việc:\n"${task.title}"?`);
      if (!confirmed) return;

      const updatedTasks = tasks.filter(t => t.id !== taskId);
      KanbanData.saveTasks(updatedTasks);

      recalculateProjectProgress(task.projectId);
      this.render();
      showToast(`Đã xóa vĩnh viễn công việc "${task.title}"`, 'warning');
    }
  };

  // Khởi chạy khi DOM sẵn sàng
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => KanbanApp.init());
  } else {
    KanbanApp.init();
  }

  // Xuất ra window phục vụ kiểm thử
  window.KanbanApp = KanbanApp;

})(window, document);
