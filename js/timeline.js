/**
 * ==============================================================================
 * TASKFLOW TIMELINE & GANTT ENGINE (js/timeline.js)
 * Mô tả: Phân hệ Biểu đồ Gantt trực quan 60fps dựng 100% bằng CSS Grid thuần.
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
      console.warn('[Timeline] Auth check warning:', e);
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

  const TimelineData = {
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
      } catch (e) {}

      // Dự án mẫu mặc định
      return [
        {
          id: 'proj-101',
          name: 'TaskFlow Platform Core 2026',
          category: 'Web Platform',
          deadline: '2026-11-20',
          color: '#6366F1'
        },
        {
          id: 'proj-102',
          name: 'Cổng thanh toán VNPay',
          category: 'Fintech / Security',
          deadline: '2026-12-10',
          color: '#8B5CF6'
        }
      ];
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
     * Lấy danh sách tasks và chuẩn hóa dữ liệu ngày tháng
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
          console.error('[TimelineData] Lỗi đọc tasks:', e);
        }
      }

      // Chuẩn hóa schema
      const members = this.getMembers();
      return (tasks || []).map(t => {
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
          startDateTime: t.startDateTime || (t.startDate ? `${t.startDate}T08:00` : '2026-10-20T08:00'),
          dueDateTime: t.dueDateTime || (t.dueDate ? `${t.dueDate}T18:00` : '2026-10-25T18:00'),
          spentHours: typeof t.spentHours === 'number' ? t.spentHours : 0,
          estimatedHours: typeof t.estimatedHours === 'number' ? t.estimatedHours : 8,
          tags: Array.isArray(t.tags) ? t.tags : ['Sprint']
        };
      });
    }
  };

  /**
   * 3. TIỆN ÍCH XỬ LÝ TOÁN HỌC NGÀY THÁNG THUẦN (ZERO DEPENDENCIES)
   */
  const DateUtils = {
    /**
     * Chuyển đổi chuỗi ISO sang đối tượng Date (chỉ lấy phần Năm-Tháng-Ngày để tính toán lưới)
     */
    parseDateOnly(dateStr) {
      if (!dateStr) return new Date();
      const parts = dateStr.split('T')[0].split('-');
      if (parts.length === 3) {
        return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      }
      return new Date(dateStr);
    },

    /**
     * Định dạng YYYY-MM-DD
     */
    formatYMD(date) {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    },

    /**
     * Định dạng hiển thị tiếng Việt ngắn: dd/mm
     */
    formatVNShort(date) {
      const d = String(date.getDate()).padStart(2, '0');
      const m = String(date.getMonth() + 1).padStart(2, '0');
      return `${d}/${m}`;
    },

    /**
     * Cộng thêm ngày
     */
    addDays(date, days) {
      const result = new Date(date);
      result.setDate(result.getDate() + days);
      return result;
    },

    /**
     * Tính khoảng cách ngày giữa hai mốc (date2 - date1)
     */
    diffDays(date1, date2) {
      const utcD1 = Date.UTC(date1.getFullYear(), date1.getMonth(), date1.getDate());
      const utcD2 = Date.UTC(date2.getFullYear(), date2.getMonth(), date2.getDate());
      return Math.round((utcD2 - utcD1) / (1000 * 60 * 60 * 24));
    },

    /**
     * Lấy tên thứ tiếng Việt ngắn
     */
    getDayOfWeekName(date) {
      const days = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
      return days[date.getDay()];
    },

    /**
     * Kiểm tra hai ngày có trùng ngày dương lịch không
     */
    isSameDay(d1, d2) {
      return (
        d1.getFullYear() === d2.getFullYear() &&
        d1.getMonth() === d2.getMonth() &&
        d1.getDate() === d2.getDate()
      );
    }
  };

  /**
   * 4. QUẢN LÝ TRẠNG THÁI TIMELINE WORKSPACE (STATE MACHINE)
   */
  const TimelineState = {
    selectedProjectId: 'all',
    rangeMode: 'all', // 'all' | '14d' | '30d'
    baseDate: new Date(), // Ngày mốc trung tâm
    tasks: [],
    projects: [],
    members: [],
    days: [], // Mảng danh sách các ngày của lưới
    todayIndex: -1 // Chỉ mục cột ngày hôm nay
  };

  /**
   * 5. ĐỘNG CƠ TÍNH TOÁN LƯỚI GANTT (GANTT GRID ENGINE)
   */
  const GanttEngine = {
    /**
     * Tính toán mảng dải ngày hiển thị dựa trên bộ lọc và chế độ xem
     */
    computeDaysRange(tasks, rangeMode, baseDate) {
      const today = new Date();
      let startDate, endDate;

      if (rangeMode === '14d') {
        // Khung nhìn 14 ngày (Sprint): Lùi 4 ngày từ baseDate, tiến 9 ngày
        startDate = DateUtils.addDays(baseDate, -4);
        endDate = DateUtils.addDays(baseDate, 9);
      } else if (rangeMode === '30d') {
        // Khung nhìn 30 ngày (Tháng): Lùi 7 ngày từ baseDate, tiến 22 ngày
        startDate = DateUtils.addDays(baseDate, -7);
        endDate = DateUtils.addDays(baseDate, 22);
      } else {
        // Khung nhìn 'all': Tìm mốc sớm nhất và muộn nhất trong danh sách tasks
        let minTime = today.getTime();
        let maxTime = today.getTime();

        if (tasks.length > 0) {
          tasks.forEach(t => {
            const start = DateUtils.parseDateOnly(t.startDateTime).getTime();
            const due = DateUtils.parseDateOnly(t.dueDateTime).getTime();
            if (start < minTime) minTime = start;
            if (due > maxTime) maxTime = due;
          });
        }

        const minTaskDate = new Date(minTime);
        const maxTaskDate = new Date(maxTime);

        // Bổ sung đệm 3 ngày trước và 4 ngày sau để bố cục thông thoáng
        startDate = DateUtils.addDays(minTaskDate, -3);
        endDate = DateUtils.addDays(maxTaskDate, 4);

        // Đảm bảo tối thiểu 16 ngày để không bị co hẹp lưới
        const totalSpan = DateUtils.diffDays(startDate, endDate) + 1;
        if (totalSpan < 16) {
          endDate = DateUtils.addDays(startDate, 16);
        }
      }

      const totalDays = DateUtils.diffDays(startDate, endDate) + 1;
      const days = [];
      let todayIndex = -1;

      for (let i = 0; i < totalDays; i++) {
        const curDate = DateUtils.addDays(startDate, i);
        const isToday = DateUtils.isSameDay(curDate, today);
        const dayOfWeek = curDate.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

        if (isToday) {
          todayIndex = i;
        }

        days.push({
          date: curDate,
          dateStr: DateUtils.formatYMD(curDate),
          dayOfMonth: curDate.getDate(),
          dayOfWeekName: DateUtils.getDayOfWeekName(curDate),
          month: curDate.getMonth() + 1,
          year: curDate.getFullYear(),
          isToday: isToday,
          isWeekend: isWeekend,
          colIndex: i
        });
      }

      return { days, todayIndex, startDate, endDate };
    },

    /**
     * Kiểm tra trạng thái quá hạn thực tế
     */
    isTaskOverdue(task) {
      if (task.status === 'done') return false;
      const dueDate = new Date(task.dueDateTime || task.dueDate);
      const now = new Date();
      return dueDate.getTime() < now.getTime();
    },

    /**
     * Đếm và cập nhật các chỉ số Mini KPI
     */
    updateKpis(tasks) {
      const total = tasks.length;
      let done = 0;
      let doing = 0;
      let overdue = 0;

      tasks.forEach(t => {
        if (t.status === 'done') {
          done++;
        } else if (t.status === 'doing') {
          doing++;
        }
        if (this.isTaskOverdue(t)) {
          overdue++;
        }
      });

      this.animateCounter('timelineStatTotal', total);
      this.animateCounter('timelineStatDone', done);
      this.animateCounter('timelineStatDoing', doing);
      this.animateCounter('timelineStatOverdue', overdue);

      const overdueWrapper = document.getElementById('timelineStatOverdueWrapper');
      if (overdueWrapper) {
        if (overdue > 0) {
          overdueWrapper.classList.add('animate-pulse');
        } else {
          overdueWrapper.classList.remove('animate-pulse');
        }
      }
    },

    /**
     * Hiệu ứng số chạy mượt Count-up
     */
    animateCounter(elementId, targetValue) {
      const el = document.getElementById(elementId);
      if (!el) return;

      const startValue = parseInt(el.textContent, 10) || 0;
      if (startValue === targetValue) {
        el.textContent = targetValue;
        return;
      }

      const duration = 400;
      const startTime = performance.now();

      function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easeProgress = 1 - Math.pow(1 - progress, 3);
        const current = Math.round(startValue + (targetValue - startValue) * easeProgress);

        el.textContent = current;

        if (progress < 1) {
          requestAnimationFrame(update);
        } else {
          el.textContent = targetValue;
        }
      }

      requestAnimationFrame(update);
    }
  };

  /**
   * 6. TRÌNH RENDER GIAO DIỆN BIỂU ĐỒ GANTT (DOM RENDERER)
   */
  const GanttRenderer = {
    /**
     * Render toàn bộ biểu đồ Gantt
     */
    render() {
      const gridEl = document.getElementById('ganttGrid');
      const emptyStateEl = document.getElementById('ganttEmptyState');
      const loadingEl = document.getElementById('ganttLoading');
      const rangeLabelEl = document.getElementById('timelineRangeLabel');

      if (!gridEl) return;

      // Ẩn spinner
      if (loadingEl) {
        loadingEl.style.opacity = '0';
        setTimeout(() => {
          loadingEl.style.display = 'none';
        }, 300);
      }

      // 1. Lọc tasks theo dự án được chọn
      let filteredTasks = TimelineState.tasks;
      if (TimelineState.selectedProjectId !== 'all') {
        filteredTasks = filteredTasks.filter(t => t.projectId === TimelineState.selectedProjectId);
      }

      // Cập nhật Mini KPIs
      GanttEngine.updateKpis(filteredTasks);

      // Nếu không có task nào khớp
      if (filteredTasks.length === 0) {
        gridEl.innerHTML = '';
        if (emptyStateEl) emptyStateEl.classList.remove('hidden');
        if (rangeLabelEl) rangeLabelEl.textContent = 'Chưa có công việc';
        return;
      } else {
        if (emptyStateEl) emptyStateEl.classList.add('hidden');
      }

      // 2. Tính toán dải ngày hiển thị
      const { days, todayIndex, startDate, endDate } = GanttEngine.computeDaysRange(
        filteredTasks,
        TimelineState.rangeMode,
        TimelineState.baseDate
      );

      TimelineState.days = days;
      TimelineState.todayIndex = todayIndex;

      // Cập nhật nhãn khoảng thời gian
      if (rangeLabelEl) {
        rangeLabelEl.textContent = `${DateUtils.formatVNShort(startDate)} - ${DateUtils.formatVNShort(endDate)} (${days.length} ngày)`;
      }

      // Cấu hình số cột cho CSS Grid
      const totalColumns = days.length;
      gridEl.style.setProperty('--gantt-columns', totalColumns);
      gridEl.style.gridTemplateColumns = `260px repeat(${totalColumns}, minmax(44px, 1fr))`;

      // 3. Render HTML Biểu đồ
      gridEl.innerHTML = '';

      // A. HEADER TRACK (Sticky Top)
      this.renderHeader(gridEl, days);

      // B. TASK ROWS (Các hàng công việc)
      this.renderTaskRows(gridEl, filteredTasks, days, todayIndex);

      // Tự động cuộn đến cột ngày hôm nay nếu có
      this.scrollToToday();
    },

    /**
     * Render Hàng Tiêu Đề Ngày & Tháng
     */
    renderHeader(container, days) {
      // 1. Góc trên bên trái: Tiêu đề cột Task (Sticky cả 2 chiều)
      const cornerHeader = document.createElement('div');
      cornerHeader.className = 'gantt-task-meta gantt-header-sticky font-bold text-xs uppercase tracking-wider text-slate-700 dark:text-slate-200 border-b border-r border-slate-200 dark:border-white/10 flex items-center justify-between';
      cornerHeader.style.zIndex = '25';
      cornerHeader.innerHTML = `
        <div class="flex items-center gap-2">
          <svg class="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <span>Công Việc / Lộ Trình</span>
        </div>
        <span class="text-[10px] text-slate-400 font-normal">Hạn chót</span>
      `;
      container.appendChild(cornerHeader);

      // 2. Dải các ô ngày trong tháng (Sticky top)
      days.forEach((day, idx) => {
        const dayCell = document.createElement('div');
        let classes = 'gantt-cell-header gantt-header-sticky flex flex-col items-center justify-center py-2 select-none';
        
        if (day.isWeekend) {
          classes += ' is-weekend gantt-col-weekend';
        }
        if (day.isToday) {
          classes += ' is-today gantt-col-today';
        }

        dayCell.className = classes;
        dayCell.setAttribute('data-col-index', idx);

        dayCell.innerHTML = `
          ${day.isToday ? '<span class="gantt-today-badge">Hôm nay</span>' : ''}
          <span class="text-[10px] font-semibold tracking-wider text-slate-400 dark:text-slate-500 uppercase">${day.dayOfWeekName}</span>
          <span class="text-xs font-bold ${day.isToday ? 'text-red-500 dark:text-red-400 text-sm' : 'text-slate-700 dark:text-slate-300'}">${day.dayOfMonth}</span>
        `;

        if (day.isToday) {
          dayCell.title = `Hôm nay: ${DateUtils.formatVNShort(day.date)}/${day.year}`;
        }

        container.appendChild(dayCell);
      });
    },

    /**
     * Render các hàng công việc và thanh Gantt Bar
     */
    renderTaskRows(container, tasks, days, todayIndex) {
      const projectsMap = {};
      TimelineState.projects.forEach(p => {
        projectsMap[p.id] = p;
      });

      const firstDate = days[0].date;
      const lastDate = days[days.length - 1].date;

      tasks.forEach((task, taskIdx) => {
        const project = projectsMap[task.projectId] || {
          name: 'Dự án',
          color: '#6366F1'
        };

        const isOverdue = GanttEngine.isTaskOverdue(task);

        // 1. Cột Task Meta bên trái (Sticky left)
        const metaCell = document.createElement('div');
        metaCell.className = 'gantt-task-meta border-b border-r border-slate-200 dark:border-white/10 hover:bg-indigo-50/40 dark:hover:bg-white/5 transition-colors cursor-pointer';
        metaCell.setAttribute('data-task-id', task.id);

        const startDateVN = DateUtils.formatVNShort(DateUtils.parseDateOnly(task.startDateTime));
        const dueDateVN = DateUtils.formatVNShort(DateUtils.parseDateOnly(task.dueDateTime));

        metaCell.innerHTML = `
          <!-- Chấm màu đại diện dự án -->
          <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background-color: ${project.color}; box-shadow: 0 0 6px ${project.color}80;" title="${project.name}"></span>
          
          <!-- Avatar người phụ trách -->
          <img 
            src="${task.assignee.avatar}" 
            alt="${task.assignee.name}" 
            class="w-6 h-6 rounded-full border border-white/20 flex-shrink-0 bg-slate-800"
            title="Phụ trách: ${task.assignee.name}"
            onerror="this.src='https://api.dicebear.com/7.x/avataaars/svg?seed=Fallback'"
          />

          <!-- Tên Task & Khoảng ngày -->
          <div class="flex-1 min-w-0 pr-1">
            <p class="text-xs font-bold text-slate-800 dark:text-slate-100 truncate" title="${task.title}">
              ${task.title}
            </p>
            <p class="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <span>${startDateVN} - ${dueDateVN}</span>
              ${isOverdue ? '<span class="text-rose-500 font-bold ml-1">● Quá hạn</span>' : ''}
            </p>
          </div>
        `;

        // Sự kiện click trên metaCell để mở Tooltip/Popover
        metaCell.addEventListener('mouseenter', (e) => GanttPopover.show(task, project, e.currentTarget));
        metaCell.addEventListener('mouseleave', () => GanttPopover.hide());

        container.appendChild(metaCell);

        // 2. Vùng Track Area (Dải chứa thanh Gantt Bar)
        const trackArea = document.createElement('div');
        trackArea.className = 'gantt-track-area relative border-b border-slate-200 dark:border-white/10';
        trackArea.style.gridColumn = `2 / span ${days.length}`;
        trackArea.style.gridTemplateColumns = `repeat(${days.length}, minmax(44px, 1fr))`;

        // Render các cột nền (Weekend Shading & Today Highlight)
        days.forEach((day, dIdx) => {
          const colBg = document.createElement('div');
          let colClasses = 'h-full border-r border-slate-200/50 dark:border-white/5';
          if (day.isWeekend) {
            colClasses += ' gantt-col-weekend';
          }
          if (day.isToday) {
            colClasses += ' gantt-col-today';
          }
          colBg.className = colClasses;
          colBg.style.gridColumn = `${dIdx + 1} / span 1`;
          trackArea.appendChild(colBg);
        });

        // 3. Tính toán vị trí thanh Gantt Bar
        const taskStartDate = DateUtils.parseDateOnly(task.startDateTime);
        const taskDueDate = DateUtils.parseDateOnly(task.dueDateTime);

        // Tính khoảng offset so với ngày bắt đầu của lưới
        let startDiff = DateUtils.diffDays(firstDate, taskStartDate);
        let dueDiff = DateUtils.diffDays(firstDate, taskDueDate);

        // Clamp vị trí thanh bar trong phạm vi hiển thị của lưới
        const clampedStart = Math.max(0, Math.min(startDiff, days.length - 1));
        const clampedDue = Math.max(0, Math.min(dueDiff, days.length - 1));

        // Số cột mà thanh bar chiếm
        let durationCols = Math.max(1, clampedDue - clampedStart + 1);
        const colStart = clampedStart + 1; // CSS Grid 1-based index

        // Tính toán tỷ lệ % hoàn thành cho kỹ thuật đồng sắc độ (Tone-on-tone)
        let progressPercent = 0;
        if (task.status === 'done') {
          progressPercent = 100;
        } else if (task.status === 'doing') {
          const estimated = Number(task.estimatedHours) || 8;
          const spent = Number(task.spentHours) || 3.5;
          progressPercent = Math.min(95, Math.max(25, Math.round((spent / estimated) * 100)));
        } else {
          progressPercent = 0;
        }

        // Kiểm tra mốc quan trọng (Milestone: Critical priority hoặc có tag Milestone)
        const isMilestone = task.priority === 'critical' || (Array.isArray(task.tags) && task.tags.includes('Milestone'));

        // Tạo thanh Gantt Bar chuẩn SaaS
        const barEl = document.createElement('div');
        let barClass = 'gantt-bar';

        if (isOverdue) {
          barClass += ' gantt-bar-overdue';
        } else if (task.status === 'done') {
          barClass += ' gantt-bar-done';
        } else if (task.status === 'doing') {
          barClass += ' gantt-bar-doing';
        } else {
          barClass += ' gantt-bar-todo';
        }

        barEl.className = barClass;
        barEl.style.gridColumn = `${colStart} / span ${durationCols}`;
        barEl.setAttribute('data-task-id', task.id);

        // Biểu tượng trạng thái
        let statusIcon = '';
        if (task.status === 'done') {
          statusIcon = '<svg class="w-3.5 h-3.5 text-white flex-shrink-0 drop-shadow-xs" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" /></svg>';
        } else if (task.status === 'doing') {
          statusIcon = '<span class="w-2 h-2 rounded-full bg-white animate-pulse flex-shrink-0 drop-shadow-xs"></span>';
        } else {
          statusIcon = '<svg class="w-3.5 h-3.5 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>';
        }

        // Cấu trúc Tone-on-tone: Lớp fill tiến độ + Lớp nội dung chữ tương phản cao
        barEl.innerHTML = `
          <!-- Thanh tiến độ (% đã làm xong) đồng sắc độ -->
          <div class="gantt-bar-fill" style="width: ${progressPercent}%;"></div>

          <!-- Lớp chữ & icon nổi bật -->
          <div class="gantt-bar-content font-['Roboto',sans-serif]">
            <div class="flex items-center gap-1.5 min-w-0 pr-1">
              ${isMilestone ? '<span class="gantt-milestone-diamond" title="Mốc quan trọng (Milestone)"></span>' : statusIcon}
              <span class="truncate text-xs font-semibold leading-none drop-shadow-xs">${task.title}</span>
            </div>
            ${task.status !== 'todo' ? `<span class="text-[10px] font-extrabold opacity-95 ml-2 flex-shrink-0 drop-shadow-xs">${progressPercent}%</span>` : '<span class="text-[10px] font-medium opacity-75 ml-2 flex-shrink-0">Chờ</span>'}
          </div>
        `;

        // Sự kiện Hover hiển thị Popover chi tiết
        barEl.addEventListener('mouseenter', (e) => {
          GanttPopover.show(task, project, e.currentTarget);
          metaCell.classList.add('bg-indigo-50/70', 'dark:bg-indigo-950/40');
        });

        barEl.addEventListener('mouseleave', () => {
          GanttPopover.hide();
          metaCell.classList.remove('bg-indigo-50/70', 'dark:bg-indigo-950/40');
        });

        // Click trên thanh bar chuyển hướng hoặc mở popup
        barEl.addEventListener('click', () => {
          window.location.href = `board.html#${task.id}`;
        });

        trackArea.appendChild(barEl);

        // 4. Nếu có cột Today, vẽ thêm đường Today Line chỉ báo thời gian thực
        if (todayIndex >= 0) {
          const todayLine = document.createElement('div');
          todayLine.className = 'gantt-today-line';
          todayLine.style.gridColumn = `${todayIndex + 1} / span 1`;
          todayLine.style.left = '50%';
          trackArea.appendChild(todayLine);
        }

        container.appendChild(trackArea);
      });
    },

    /**
     * Tự động cuộn tới cột ngày hôm nay
     */
    scrollToToday() {
      const scrollContainer = document.getElementById('ganttScrollContainer');
      const todayCell = document.querySelector('.gantt-cell-header.is-today');

      if (scrollContainer && todayCell) {
        setTimeout(() => {
          const leftOffset = todayCell.offsetLeft - 320;
          scrollContainer.scrollTo({
            left: Math.max(0, leftOffset),
            behavior: 'smooth'
          });
        }, 120);
      }
    }
  };

  /**
   * 7. INTERACTIVE POPOVER TOOLTIP KÍNH MỜ
   */
  const GanttPopover = {
    popoverEl: null,

    init() {
      this.popoverEl = document.getElementById('ganttPopover');
    },

    show(task, project, anchorEl) {
      if (!this.popoverEl || !anchorEl) return;

      const isOverdue = GanttEngine.isTaskOverdue(task);
      const startDateStr = DateUtils.formatVNShort(DateUtils.parseDateOnly(task.startDateTime));
      const dueDateStr = DateUtils.formatVNShort(DateUtils.parseDateOnly(task.dueDateTime));

      // Trạng thái nhãn
      let statusBadge = '';
      if (task.status === 'done') {
        statusBadge = '<span class="badge badge-done text-[10px]">Đã Hoàn Thành</span>';
      } else if (task.status === 'doing') {
        statusBadge = '<span class="badge badge-doing text-[10px]">Đang Tiến Hành</span>';
      } else {
        statusBadge = '<span class="badge badge-todo text-[10px]">Cần Thực Hiện</span>';
      }

      // Nhãn mức độ ưu tiên
      const priorityMap = {
        critical: { text: 'Khẩn Cấp', color: 'text-rose-400 bg-rose-500/10 border-rose-500/30' },
        high: { text: 'Cao', color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
        medium: { text: 'Trung Bình', color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/30' },
        low: { text: 'Thấp', color: 'text-slate-400 bg-slate-500/10 border-slate-500/30' }
      };
      const pri = priorityMap[task.priority] || priorityMap.medium;

      this.popoverEl.innerHTML = `
        <div class="space-y-2.5">
          <!-- Header Popover -->
          <div class="flex items-start justify-between gap-2 border-b border-slate-200/60 dark:border-white/10 pb-2">
            <div>
              <span class="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                <span class="w-2 h-2 rounded-full" style="background-color: ${project.color};"></span>
                <span>${project.name}</span>
              </span>
              <h4 class="text-sm font-bold text-slate-900 dark:text-white mt-0.5 leading-snug">
                ${task.title}
              </h4>
            </div>
            ${statusBadge}
          </div>

          <!-- Thông tin phụ trách & Thời gian -->
          <div class="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span class="text-slate-500 dark:text-slate-400 text-[10px] block">Người thực hiện</span>
              <div class="flex items-center gap-1.5 mt-1 font-semibold text-slate-800 dark:text-slate-200">
                <img src="${task.assignee.avatar}" alt="" class="w-4 h-4 rounded-full border border-white/20" />
                <span class="truncate">${task.assignee.name}</span>
              </div>
            </div>

            <div>
              <span class="text-slate-500 dark:text-slate-400 text-[10px] block">Mức ưu tiên</span>
              <span class="inline-block px-2 py-0.5 mt-1 rounded text-[10px] font-bold border ${pri.color}">
                ${pri.text}
              </span>
            </div>
          </div>

          <!-- Mốc Thời Gian & Cảnh Báo Quá Hạn -->
          <div class="p-2 rounded-xl bg-slate-100/80 dark:bg-white/5 border border-slate-200/60 dark:border-white/5 text-[11px] space-y-1">
            <div class="flex justify-between items-center text-slate-600 dark:text-slate-300">
              <span>Lộ trình:</span>
              <strong class="font-bold">${startDateStr} ➔ ${dueDateStr}</strong>
            </div>
            <div class="flex justify-between items-center text-slate-600 dark:text-slate-300">
              <span>Đã log / Dự kiến:</span>
              <span><strong>${task.spentHours}h</strong> / ${task.estimatedHours}h</span>
            </div>
            ${isOverdue ? `
              <div class="pt-1 mt-1 border-t border-rose-500/20 text-rose-500 font-bold flex items-center gap-1 text-[11px]">
                <svg class="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                <span>Công việc đã vượt quá hạn chót!</span>
              </div>
            ` : ''}
          </div>

          <!-- Nút hành động nhanh -->
          <div class="pt-1 flex items-center justify-between text-[11px]">
            <a href="board.html" class="text-indigo-600 dark:text-indigo-400 hover:underline font-bold flex items-center gap-1">
              <span>Mở trên Kanban</span>
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
            </a>
            <span class="text-[10px] text-slate-400">Click để xem chi tiết</span>
          </div>
        </div>
      `;

      // Định vị Tooltip theo tọa độ chuột hoặc anchor
      const rect = anchorEl.getBoundingClientRect();
      const popoverWidth = 280;
      const popoverHeight = 220;

      let top = rect.bottom + 8;
      let left = rect.left + rect.width / 2 - popoverWidth / 2;

      // Xử lý tràn viền màn hình (Screen Edge Clamping)
      if (left < 16) left = 16;
      if (left + popoverWidth > window.innerWidth - 16) {
        left = window.innerWidth - popoverWidth - 16;
      }
      if (top + popoverHeight > window.innerHeight - 16) {
        top = rect.top - popoverHeight - 8;
      }

      this.popoverEl.style.top = `${top}px`;
      this.popoverEl.style.left = `${left}px`;
      this.popoverEl.classList.add('is-visible');
      this.popoverEl.setAttribute('aria-hidden', 'false');
    },

    hide() {
      if (!this.popoverEl) return;
      this.popoverEl.classList.remove('is-visible');
      this.popoverEl.setAttribute('aria-hidden', 'true');
    }
  };

  /**
   * 8. QUẢN LÝ SỰ KIỆN TƯƠNG TÁC (EVENT LISTENERS)
   */
  const TimelineEvents = {
    bind() {
      // 1. Dropdown lọc Dự Án
      const projectFilter = document.getElementById('filterTimelineProject');
      if (projectFilter) {
        projectFilter.addEventListener('change', (e) => {
          TimelineState.selectedProjectId = e.target.value;
          GanttRenderer.render();
        });
      }

      // 2. Bộ chuyển Time Range: All / 14d / 30d
      const rangeBtns = document.querySelectorAll('.timeline-range-btn');
      rangeBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
          rangeBtns.forEach(b => b.classList.remove('is-active'));
          e.currentTarget.classList.add('is-active');

          const range = e.currentTarget.getAttribute('data-range') || 'all';
          TimelineState.rangeMode = range;
          GanttRenderer.render();
        });
      });

      // 3. Nút Điều Hướng Ngày: Prev / Next
      const btnPrev = document.getElementById('btnPrevRange');
      if (btnPrev) {
        btnPrev.addEventListener('click', () => {
          const shiftDays = TimelineState.rangeMode === '14d' ? -7 : -14;
          TimelineState.baseDate = DateUtils.addDays(TimelineState.baseDate, shiftDays);
          GanttRenderer.render();
        });
      }

      const btnNext = document.getElementById('btnNextRange');
      if (btnNext) {
        btnNext.addEventListener('click', () => {
          const shiftDays = TimelineState.rangeMode === '14d' ? 7 : 14;
          TimelineState.baseDate = DateUtils.addDays(TimelineState.baseDate, shiftDays);
          GanttRenderer.render();
        });
      }

      // 4. Nút Nhảy về Hôm Nay (Jump to Today)
      const btnJumpToday = document.getElementById('btnJumpToday');
      if (btnJumpToday) {
        btnJumpToday.addEventListener('click', () => {
          TimelineState.baseDate = new Date();
          GanttRenderer.render();
          GanttRenderer.scrollToToday();
        });
      }

      // 5. Lắng nghe thay đổi dữ liệu từ các tab khác (Cross-tab Synchronization)
      window.addEventListener('storage', (e) => {
        if (
          e.key === STORAGE_KEYS.TASKS || 
          e.key === STORAGE_KEYS.PROJECTS || 
          e.key === STORAGE_KEYS.TASKFLOW_DATA
        ) {
          TimelineApp.reload();
        }
      });

      // 6. Ẩn popover khi cuộn trang
      const scrollContainer = document.getElementById('ganttScrollContainer');
      if (scrollContainer) {
        scrollContainer.addEventListener('scroll', () => {
          GanttPopover.hide();
        }, { passive: true });
      }
    }
  };

  /**
   * 9. KHỞI TẠO ỨNG DỤNG TIMELINE (MAIN ENTRYPOINT)
   */
  const TimelineApp = {
    init() {
      const authService = window.Auth || window.TaskFlowAuth;
      const currentUser = authService && typeof authService.getCurrentUser === 'function' ? authService.getCurrentUser() : null;
      const isAdmin = currentUser && (currentUser.role === 'admin' || currentUser.email === 'admin@taskflow.dev');
      
      const allProjects = TimelineData.getProjects();
      TimelineState.projects = isAdmin ? allProjects : allProjects.filter(p => p.ownerId === currentUser?.id || (Array.isArray(p.members) && p.members.includes(currentUser?.id)));
      
      const allowedIds = new Set(TimelineState.projects.map(p => p.id));
      TimelineState.tasks = TimelineData.getTasks().filter(t => allowedIds.has(t.projectId));
      TimelineState.members = TimelineData.getMembers();

      try {
        const urlParams = new URLSearchParams(window.location.search);
        const pId = urlParams.get('projectId');
        if (pId && TimelineState.projects.some(p => p.id === pId)) {
          TimelineState.selectedProjectId = pId;
        }
      } catch (e) {}

      // Nạp danh sách dự án vào dropdown lọc
      this.populateProjectFilter();

      // Khởi tạo Popover Tooltip
      GanttPopover.init();

      // Gắn các sự kiện điều khiển
      TimelineEvents.bind();

      // Render biểu đồ lần đầu
      GanttRenderer.render();
    },

    /**
     * Nạp các options vào dropdown chọn dự án
     */
    populateProjectFilter() {
      const filterEl = document.getElementById('filterTimelineProject');
      if (!filterEl) return;

      let html = '<option value="all">📂 Tất Cả Dự Án</option>';
      TimelineState.projects.forEach(p => {
        html += `<option value="${p.id}">● ${p.name}</option>`;
      });

      filterEl.innerHTML = html;
    },

    /**
     * Tải lại dữ liệu khi có thay đổi LocalStorage
     */
    reload() {
      const authService = window.Auth || window.TaskFlowAuth;
      const currentUser = authService && typeof authService.getCurrentUser === 'function' ? authService.getCurrentUser() : null;
      const isAdmin = currentUser && (currentUser.role === 'admin' || currentUser.email === 'admin@taskflow.dev');
      
      const allProjects = TimelineData.getProjects();
      TimelineState.projects = isAdmin ? allProjects : allProjects.filter(p => p.ownerId === currentUser?.id || (Array.isArray(p.members) && p.members.includes(currentUser?.id)));
      
      const allowedIds = new Set(TimelineState.projects.map(p => p.id));
      TimelineState.tasks = TimelineData.getTasks().filter(t => allowedIds.has(t.projectId));
      TimelineState.members = TimelineData.getMembers();
      GanttRenderer.render();
    }
  };

  // Khởi chạy khi DOM sẵn sàng
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => TimelineApp.init());
  } else {
    TimelineApp.init();
  }

  // Đóng gói an toàn vào window.TaskFlowTimeline
  window.TaskFlowTimeline = TimelineApp;

})(window, document);
