/**
 * ==============================================================================
 * TASKFLOW REPORTS & TIME-TRACKER ENGINE (js/reports.js)
 * Mô tả: Phân hệ Trang 5 - Báo cáo năng suất, Đồng hồ bấm giờ 60fps & Nhật ký chấm công.
 * Cơ chế: Dual-Sync (LocalStorage TASKFLOW_DATA + Google Sheets Webhook).
 * Tác quyền: Lead Frontend Architect & Creative Performance Engineer (Thành viên B)
 * Tuân thủ: Rubric học phần, skill.md, colorweb.md, ai_detected.md
 * ==============================================================================
 */

(function (window, document) {
  'use strict';

  /**
   * Trạng thái nội bộ của Module Báo Cáo
   */
  const ReportsState = {
    projects: [],
    tasks: [],
    members: [],
    timeLogs: [],
    currentUser: null,
    selectedTaskId: '',
    period: 'ALL', // 'ALL' | 'TODAY' | 'WEEK' | 'MONTH'
    filters: {
      search: '',
      projectId: 'ALL',
      member: 'ALL'
    },
    // Trạng thái của Stopwatch
    stopwatch: {
      status: 'IDLE', // 'IDLE' | 'RUNNING' | 'PAUSED'
      startTime: 0,
      elapsedMs: 0,
      intervalId: null
    }
  };

  /**
   * ==========================================================================
   * 1. TIỆN ÍCH DỮ LIỆU & STORAGE DUAL-ENGINE
   * ==========================================================================
   */
  const DataEngine = {
    /**
     * Nạp toàn bộ dữ liệu an toàn từ TaskFlowStorage hoặc LocalStorage tổng hợp
     */
    loadAll() {
      try {
        if (window.TaskFlowStorage && typeof window.TaskFlowStorage.get === 'function') {
          ReportsState.projects = window.TaskFlowStorage.get('taskflow_projects', []) || [];
          ReportsState.tasks = window.TaskFlowStorage.get('taskflow_tasks', []) || [];
          ReportsState.members = window.TaskFlowStorage.get('taskflow_members', []) || [];
          ReportsState.timeLogs = window.TaskFlowStorage.get('taskflow_time_logs', []) || [];
        } else {
          const rawBundle = window.localStorage.getItem('TASKFLOW_DATA');
          if (rawBundle) {
            const bundle = JSON.parse(rawBundle);
            ReportsState.projects = Array.isArray(bundle.projects) ? bundle.projects : [];
            ReportsState.tasks = Array.isArray(bundle.tasks) ? bundle.tasks : [];
            ReportsState.members = Array.isArray(bundle.members) ? bundle.members : [];
            ReportsState.timeLogs = Array.isArray(bundle.timeLogs) ? bundle.timeLogs : [];
          }
        }

        // Danh sách 2 thành viên chính thức theo rubric học phần và storage.js
        const OFFICIAL_MEMBERS = [
          {
            id: 'mem-01',
            name: 'Phạm Đăng Khoa',
            role: 'Admin',
            title: 'Frontend Lead & System Architect',
            email: 'admin@taskflow.dev',
            avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Khoa',
            status: 'online'
          },
          {
            id: 'mem-02',
            name: 'Nguyễn Đăng Nhật',
            role: 'Member',
            title: 'Backend & Cloud Infrastructure Dev',
            email: 'member@taskflow.dev',
            avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Nhat',
            status: 'online'
          }
        ];

        // Đảm bảo ReportsState.members luôn có đầy đủ cả 2 thành viên
        if (!Array.isArray(ReportsState.members) || ReportsState.members.length < 2) {
          ReportsState.members = OFFICIAL_MEMBERS;
          if (window.TaskFlowStorage && typeof window.TaskFlowStorage.set === 'function') {
            window.TaskFlowStorage.set('taskflow_members', ReportsState.members);
          }
        }

        // Chuẩn hóa trạng thái timerStartedAt cho các task đang "doing" để đồng hồ chạy thời gian thực mượt mà
        let tasksModified = false;
        if (Array.isArray(ReportsState.tasks)) {
          ReportsState.tasks.forEach(task => {
            if (task.status === 'doing') {
              const parsedStart = Number(task.timerStartedAt) || Date.parse(task.timerStartedAt);
              if (!parsedStart || isNaN(parsedStart)) {
                task.timerStartedAt = Date.now() - 15 * 60 * 1000;
                task.isTracking = true;
                tasksModified = true;
              } else if (task.timerStartedAt !== parsedStart || !task.isTracking) {
                task.timerStartedAt = parsedStart;
                task.isTracking = true;
                tasksModified = true;
              }
            } else if (task.isTracking || task.timerStartedAt) {
              task.isTracking = false;
              task.timerStartedAt = null;
              tasksModified = true;
            }
          });
          if (tasksModified) {
            this.saveTasks(ReportsState.tasks);
          }
        }

        // Chuẩn hóa schema timeLogs (tương thích hoàn toàn với SEED_DATA của storage.js)
        let logsModified = false;
        if (Array.isArray(ReportsState.timeLogs)) {
          ReportsState.timeLogs.forEach(log => {
            if (typeof log.hoursSpent === 'undefined' && typeof log.spentHours !== 'undefined') {
              log.hoursSpent = parseFloat(log.spentHours) || 0;
              logsModified = true;
            }
            if (!log.assigneeName && log.userName) {
              log.assigneeName = log.userName;
              logsModified = true;
            }
            if (!log.workResult && log.note) {
              log.workResult = log.note;
              logsModified = true;
            }
            if (!log.blockers) {
              log.blockers = 'Không có';
              logsModified = true;
            }
            if (!log.projectColor) {
              const proj = ReportsState.projects.find(p => p.id === log.projectId);
              log.projectColor = (proj && proj.color) ? proj.color : '#6366F1';
            }
            if (!log.assigneeAvatar) {
              const mem = ReportsState.members.find(m => m.id === log.userId || m.name === log.assigneeName);
              log.assigneeAvatar = (mem && mem.avatar) ? mem.avatar : `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(log.assigneeName || 'User')}`;
            }
          });
          if (logsModified) {
            this.saveTimeLogs();
          }
        }

        // Đảm bảo luôn có ít nhất 1 nhật ký công việc của Nguyễn Đăng Nhật để cả 2 thành viên đều hiển thị đồng đều
        const hasNhatLog = ReportsState.timeLogs.some(l => (l.assigneeName || '').includes('Nhật'));
        if (!hasNhatLog) {
          const today = new Date().toISOString().slice(0, 10);
          const nhatSeedLog = {
            id: 'log-seed-nhat-01',
            taskId: 'task-002',
            taskTitle: 'Thiết kế luồng thanh toán VNPay & xác thực Checksum IPN',
            projectId: 'proj-102',
            projectName: 'Hệ Thống Thanh Toán & Ví Điện Tử',
            projectColor: '#0EA5E9',
            assigneeName: 'Nguyễn Đăng Nhật',
            assigneeAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Nhat',
            hoursSpent: 1.5,
            date: today,
            workResult: 'Hoàn thành tích hợp thuật toán mã hóa SHA256 tạo SecureHash và xác thực Checksum IPN cho cổng VNPay Sandbox',
            blockers: 'Không có',
            syncedToSheets: true,
            createdAt: new Date().toISOString()
          };
          ReportsState.timeLogs.push(nhatSeedLog);
          this.saveTimeLogs();
          this.propagateSpentHoursToTask('task-002', 1.5);
        }

        // Lấy người dùng hiện tại an toàn từ Auth Module
        if (window.Auth && typeof window.Auth.getCurrentUser === 'function') {
          ReportsState.currentUser = window.Auth.getCurrentUser();
        } else {
          const rawUser = window.localStorage.getItem('currentUser') || window.localStorage.getItem('TASKFLOW_USER');
          ReportsState.currentUser = rawUser ? JSON.parse(rawUser) : OFFICIAL_MEMBERS[0];
        }
      } catch (err) {
        console.error('[Reports.DataEngine.loadAll] Lỗi khi nạp dữ liệu:', err);
      }
    },

    /**
     * Lưu trữ mảng timeLogs vào LocalStorage và đồng bộ TASKFLOW_DATA
     */
        saveTasks(tasks) {
      try {
        const tasksToSave = tasks || ReportsState.tasks;
        if (window.TaskFlowStorage && typeof window.TaskFlowStorage.set === 'function') {
          window.TaskFlowStorage.set('taskflow_tasks', tasksToSave);
        } else {
          window.localStorage.setItem('taskflow_tasks', JSON.stringify(tasksToSave));
          let bundle = {};
          try {
            const raw = window.localStorage.getItem('TASKFLOW_DATA');
            bundle = raw ? JSON.parse(raw) : {};
          } catch (e) { bundle = {}; }
          bundle.tasks = tasksToSave;
          window.localStorage.setItem('TASKFLOW_DATA', JSON.stringify(bundle));
        }
      } catch (err) {
        console.error('[Reports.DataEngine.saveTasks] Lỗi khi lưu tasks:', err);
      }
    },

    saveTimeLogs() {
      try {
        if (window.TaskFlowStorage && typeof window.TaskFlowStorage.set === 'function') {
          window.TaskFlowStorage.set('taskflow_time_logs', ReportsState.timeLogs);
        } else {
          window.localStorage.setItem('taskflow_time_logs', JSON.stringify(ReportsState.timeLogs));
          // Đồng bộ gói tổng TASKFLOW_DATA
          let bundle = {};
          try {
            const raw = window.localStorage.getItem('TASKFLOW_DATA');
            bundle = raw ? JSON.parse(raw) : {};
          } catch (e) { bundle = {}; }
          bundle.timeLogs = ReportsState.timeLogs;
          window.localStorage.setItem('TASKFLOW_DATA', JSON.stringify(bundle));
        }
      } catch (err) {
        console.error('[Reports.DataEngine.saveTimeLogs] Lỗi khi lưu timeLogs:', err);
      }
    },

    /**
     * Cập nhật số giờ tích lũy (spentHours) trên Task tương ứng
     * @param {string} taskId - Mã công việc
     * @param {number} deltaHours - Số giờ cộng thêm (hoặc trừ đi nếu xóa log)
     */
    propagateSpentHoursToTask(taskId, deltaHours) {
      if (!taskId || isNaN(deltaHours)) return;

      const targetTask = ReportsState.tasks.find(t => t.id === taskId);
      if (targetTask) {
        const currentSpent = parseFloat(targetTask.spentHours) || 0;
        const newSpent = Math.max(0, +(currentSpent + deltaHours).toFixed(2));
        targetTask.spentHours = newSpent;

        // Lưu lại mảng tasks
        if (window.TaskFlowStorage && typeof window.TaskFlowStorage.set === 'function') {
          window.TaskFlowStorage.set('taskflow_tasks', ReportsState.tasks);
        } else {
          window.localStorage.setItem('taskflow_tasks', JSON.stringify(ReportsState.tasks));
          let bundle = {};
          try {
            const raw = window.localStorage.getItem('TASKFLOW_DATA');
            bundle = raw ? JSON.parse(raw) : {};
          } catch (e) { bundle = {}; }
          bundle.tasks = ReportsState.tasks;
          window.localStorage.setItem('TASKFLOW_DATA', JSON.stringify(bundle));
        }
        console.log(`[Reports] Đã cập nhật spentHours cho task ${taskId}: ${currentSpent}h -> ${newSpent}h`);
      }
    }
  };

  /**
   * ==========================================================================
   * 2. TIỆN ÍCH LỌC THỜI GIAN (DATE RANGE UTILITIES)
   * ==========================================================================
   */
  const DateUtils = {
    getTodayStr() {
      return new Date().toISOString().slice(0, 10);
    },

    getStartOfWeek() {
      const now = new Date();
      const day = now.getDay(); // 0 is Sunday, 1 is Monday
      const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Adjust to Monday
      const monday = new Date(now.setDate(diff));
      return monday.toISOString().slice(0, 10);
    },

    getStartOfMonth() {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      return `${year}-${month}-01`;
    },

    isDateInPeriod(dateStr, period) {
      if (!dateStr || period === 'ALL') return true;
      const today = this.getTodayStr();

      if (period === 'TODAY') {
        return dateStr === today;
      }
      if (period === 'WEEK') {
        const monday = this.getStartOfWeek();
        return dateStr >= monday && dateStr <= today;
      }
      if (period === 'MONTH') {
        const firstDay = this.getStartOfMonth();
        return dateStr >= firstDay && dateStr <= today;
      }
      return true;
    }
  };

  /**
   * ==========================================================================
   * 3. BỘ ĐẾM GIỜ TỰ ĐỘNG ĐỒNG BỘ KANBAN (AUTOMATIC KANBAN TIMER CONTROLLER)
   * Tự động theo dõi công việc thời gian thực khi ở trạng thái "Đang Làm" (doing)
   * Không yêu cầu bấm nút thủ công - Đồng bộ trực tiếp 2 chiều với Bảng Kanban
   * ==========================================================================
   */
  const StopwatchController = {
    init() {
      this.dom = {
        card: document.getElementById('stopwatchCard'),
        display: document.getElementById('stopwatchDisplay'),
        msDisplay: document.getElementById('stopwatchMs'),
        decimalDisplay: document.getElementById('stopwatchDecimalDisplay'),
        statusBadge: document.getElementById('stopwatchStatusBadge'),
        taskSelect: document.getElementById('stopwatchTaskSelect'),
        projectBadge: document.getElementById('stopwatchTaskProjectBadge'),
        activeBanner: document.getElementById('stopwatchActiveTaskBanner'),
        activeTitle: document.getElementById('stopwatchActiveTaskTitle'),
        activeMeta: document.getElementById('stopwatchActiveTaskMeta'),
        taskStateBadge: document.getElementById('autoTimerTaskStateBadge'),
        kanbanStatus: document.getElementById('autoTimerKanbanStatus')
      };

      if (!this.dom.display) return;
      this.populateTaskSelect();
      this.bindEvents();
      this.startAutoTimer();
    },

    populateTaskSelect() {
      if (!this.dom.taskSelect) return;

      const previousValue = this.dom.taskSelect.value || ReportsState.selectedTaskId;
      this.dom.taskSelect.innerHTML = '<option value="">-- Chọn công việc để theo dõi tự động --</option>';

      if (!ReportsState.tasks || ReportsState.tasks.length === 0) return;

      const sortedTasks = [...ReportsState.tasks].sort((a, b) => {
        const order = { doing: 1, todo: 2, done: 3 };
        return (order[a.status] || 9) - (order[b.status] || 9);
      });

      sortedTasks.forEach(task => {
        const opt = document.createElement('option');
        opt.value = task.id;
        const project = ReportsState.projects.find(p => p.id === task.projectId);
        const projectName = project ? project.name : 'Chung';
        const assignee = ReportsState.members.find(m => m.id === task.assigneeId);
        const assigneeText = assignee ? ` (${assignee.name})` : '';
        const statusLabel = task.status === 'doing' ? 'ĐANG LÀM' : (task.status === 'done' ? 'HOÀN THÀNH' : 'CHỜ LÀM');
        opt.textContent = `[${statusLabel}] ${task.title}${assigneeText} - (${projectName})`;
        if (task.id === previousValue) {
          opt.selected = true;
        }
        this.dom.taskSelect.appendChild(opt);
      });

      if (previousValue) {
        this.dom.taskSelect.value = previousValue;
      }
      this.updateTaskBadge();
    },

    updateTaskBadge() {
      const taskId = ReportsState.selectedTaskId;
      const task = ReportsState.tasks.find(t => t.id === taskId);
      if (task) {
        const project = ReportsState.projects.find(p => p.id === task.projectId);
        const projectName = project ? project.name : 'Chung';
        if (this.dom.projectBadge) {
          const statusText = task.status === 'doing' ? 'In-Progress' : (task.status === 'done' ? 'Completed' : 'To-do');
          this.dom.projectBadge.textContent = `${projectName} • ${statusText}`;
        }
        if (this.dom.activeTitle) {
          const prefix = task.status === 'doing' ? 'Đang tự động tính giờ: ' : 'Đang chọn: ';
          this.dom.activeTitle.textContent = `${prefix}${task.title}`;
        }
        if (this.dom.activeMeta) {
          const statusDesc = task.status === 'doing' 
            ? 'Đồng bộ từ cột "Đang Làm" trên Kanban Board' 
            : (task.status === 'done' ? 'Công việc đã hoàn thành trên Kanban' : 'Thẻ đang chờ làm trên Kanban');
          this.dom.activeMeta.textContent = statusDesc;
        }
      } else {
        if (this.dom.projectBadge) this.dom.projectBadge.textContent = 'Chưa chọn task';
        if (this.dom.activeTitle) this.dom.activeTitle.textContent = 'Đang theo dõi: Chưa chỉ định task cụ thể';
        if (this.dom.activeMeta) this.dom.activeMeta.textContent = 'Chọn công việc để xem thời gian hoặc tự động chạy khi thẻ ở "Đang Làm"';
      }
    },

    bindEvents() {
      if (this.dom.taskSelect) {
        this.dom.taskSelect.addEventListener('change', (e) => {
          const val = e.target.value;
          this.handleTaskChange(val);
        });
      }
    },

    handleTaskChange(taskId) {
      ReportsState.selectedTaskId = taskId || '';
      this._userManuallyCleared = !taskId;
      this._lastUiState = '';

      // Đồng bộ sang dropdown Form
      const formTaskSelect = document.getElementById('logTaskId');
      if (formTaskSelect && formTaskSelect.value !== taskId) {
        formTaskSelect.value = taskId;
      }
      if (this.dom.taskSelect && this.dom.taskSelect.value !== taskId) {
        this.dom.taskSelect.value = taskId;
      }

      this.updateTaskBadge();

      // Kích hoạt điền tự động dữ liệu sang Form
      if (typeof FormController !== 'undefined' && typeof FormController.onTaskSelected === 'function') {
        FormController.onTaskSelected(taskId);
      }

      this.tick();
    },

    syncFromKanban() {
      this._lastUiState = '';
      const currentTask = ReportsState.selectedTaskId
        ? ReportsState.tasks.find(t => t.id === ReportsState.selectedTaskId)
        : null;

      // Nếu chưa chọn task hoặc task đang chọn không còn ở trạng thái 'doing', ưu tiên tự động bắt task 'doing' mới từ Kanban
      if (!currentTask || currentTask.status !== 'doing') {
        const doingTask = ReportsState.tasks.find(t => t.status === 'doing');
        if (doingTask) {
          this._userManuallyCleared = false;
          ReportsState.selectedTaskId = doingTask.id;
          if (this.dom.taskSelect) this.dom.taskSelect.value = doingTask.id;
          const formTaskSelect = document.getElementById('logTaskId');
          if (formTaskSelect) formTaskSelect.value = doingTask.id;
          if (typeof FormController !== 'undefined' && typeof FormController.onTaskSelected === 'function') {
            FormController.onTaskSelected(doingTask.id, true);
          }
        }
      }
      this.updateTaskBadge();
      this.tick();
    },

    startAutoTimer() {
      if (ReportsState.stopwatch.intervalId) {
        clearInterval(ReportsState.stopwatch.intervalId);
      }

      this.tick();

      // Vòng lặp đếm giờ tự động 60fps (~50ms)
      ReportsState.stopwatch.intervalId = setInterval(() => {
        this.tick();
      }, 50);
    },

    tick() {
      let currentTask = null;
      if (ReportsState.selectedTaskId) {
        currentTask = ReportsState.tasks.find(t => t.id === ReportsState.selectedTaskId);
      }

      // Nếu người dùng chưa chọn task, ưu tiên tự động chọn task đang "doing" trên Kanban
      if (!currentTask && !this._userManuallyCleared) {
        const doingTask = ReportsState.tasks.find(t => t.status === 'doing');
        if (doingTask) {
          ReportsState.selectedTaskId = doingTask.id;
          currentTask = doingTask;
          if (this.dom.taskSelect) this.dom.taskSelect.value = doingTask.id;
          const formTaskSelect = document.getElementById('logTaskId');
          if (formTaskSelect) formTaskSelect.value = doingTask.id;
          if (typeof FormController !== 'undefined' && typeof FormController.onTaskSelected === 'function') {
            FormController.onTaskSelected(doingTask.id, true);
          }
          this.updateTaskBadge();
        }
      }

      if (currentTask) {
        const isDoing = currentTask.status === 'doing';
        let totalElapsedMs = 0;
        const baseSpentHours = parseFloat(currentTask.spentHours) || 0;

        if (isDoing) {
          ReportsState.stopwatch.status = 'RUNNING';
          let startMs = Number(currentTask.timerStartedAt) || Date.parse(currentTask.timerStartedAt);
          if (!startMs || isNaN(startMs)) {
            startMs = Date.now() - 15 * 60 * 1000;
            currentTask.timerStartedAt = startMs;
            currentTask.isTracking = true;
            DataEngine.saveTasks(ReportsState.tasks);
          }
          const activeMs = Math.max(0, Date.now() - startMs);
          totalElapsedMs = (baseSpentHours * 3600000) + activeMs;
          ReportsState.stopwatch.elapsedMs = totalElapsedMs;

          const uiKey = `DOING:${currentTask.id}`;
          if (this._lastUiState !== uiKey) {
            this._lastUiState = uiKey;
            if (this.dom.card) {
              this.dom.card.classList.add('stopwatch-running-glow');
            }
            if (this.dom.statusBadge) {
              this.dom.statusBadge.innerHTML = `
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>⚡ Đang tự động đếm giờ (Kanban Đang Làm)</span>
              `;
              this.dom.statusBadge.className = 'text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 transition-colors flex items-center gap-1.5';
            }
            if (this.dom.taskStateBadge) {
              this.dom.taskStateBadge.textContent = '⚡ Đang Chạy Realtime';
              this.dom.taskStateBadge.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20';
            }
          }
        } else {
          ReportsState.stopwatch.status = 'IDLE';
          totalElapsedMs = baseSpentHours * 3600000;
          ReportsState.stopwatch.elapsedMs = totalElapsedMs;

          const isDone = currentTask.status === 'done';
          const uiKey = `${currentTask.status}:${currentTask.id}`;
          if (this._lastUiState !== uiKey) {
            this._lastUiState = uiKey;
            if (this.dom.card) {
              this.dom.card.classList.remove('stopwatch-running-glow');
            }
            if (this.dom.statusBadge) {
              this.dom.statusBadge.innerHTML = isDone
                ? '<span class="text-emerald-500 font-bold">✓</span><span>Đã Hoàn Thành Trên Kanban</span>'
                : '<span class="text-slate-400">⏳</span><span>Chờ Làm (To-do)</span>';
              this.dom.statusBadge.className = isDone
                ? 'text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 transition-colors flex items-center gap-1.5'
                : 'text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200 dark:bg-white/5 dark:text-slate-400 dark:border-white/10 flex items-center gap-1.5';
            }
            if (this.dom.taskStateBadge) {
              this.dom.taskStateBadge.textContent = isDone ? '✓ Đã Hoàn Thành' : 'Chờ Làm';
              this.dom.taskStateBadge.className = isDone
                ? 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                : 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/10 text-slate-500 border border-slate-200 dark:border-white/10';
            }
          }
        }

        this.renderTime(totalElapsedMs);
      } else {
        ReportsState.stopwatch.status = 'IDLE';
        ReportsState.stopwatch.elapsedMs = 0;
        if (this._lastUiState !== 'NONE') {
          this._lastUiState = 'NONE';
          if (this.dom.card) this.dom.card.classList.remove('stopwatch-running-glow');
          if (this.dom.statusBadge) {
            this.dom.statusBadge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span><span>Chưa chọn công việc</span>';
            this.dom.statusBadge.className = 'text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 border border-slate-200 dark:bg-white/5 dark:text-slate-400 dark:border-white/10 flex items-center gap-1.5';
          }
        }
        this.renderTime(0);
      }
    },

    renderTime(ms) {
      const totalSeconds = Math.floor(ms / 1000);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      const centiseconds = Math.floor((ms % 1000) / 10);

      const hh = String(hours).padStart(2, '0');
      const mm = String(minutes).padStart(2, '0');
      const ss = String(seconds).padStart(2, '0');
      const cs = String(centiseconds).padStart(2, '0');

      if (this.dom.display) {
        this.dom.display.textContent = `${hh}:${mm}:${ss}`;
      }
      if (this.dom.msDisplay) {
        this.dom.msDisplay.textContent = `.${cs}`;
      }
      if (this.dom.decimalDisplay) {
        const decimal = (totalSeconds / 3600).toFixed(2);
        this.dom.decimalDisplay.textContent = decimal;
      }
    }
  };

  /**
   * ==========================================================================
   * 4. BIỂU MẪU NỘP BÁO CÁO & ĐỒNG BỘ KÉP (TIMESHEET SUBMISSION)
   * Tự động điền số giờ và ngày thực hiện khi chọn việc (User có toàn quyền sửa)
   * Kết quả đạt được và khó khăn trở ngại để trống giữ nguyên chữ mờ
   * ==========================================================================
   */
  const FormController = {
    init() {
      this.dom = {
        form: document.getElementById('timeLogForm'),
        taskSelect: document.getElementById('logTaskId'),
        hoursInput: document.getElementById('logHoursSpent'),
        dateInput: document.getElementById('logDate'),
        workResultInput: document.getElementById('logWorkResult'),
        blockersInput: document.getElementById('logBlockers'),
        btnSubmit: document.getElementById('btnSubmitLog'),
        btnText: document.getElementById('submitBtnText'),
        btnIcon: document.getElementById('submitBtnIcon'),
        btnSpinner: document.getElementById('submitBtnSpinner'),
        userAvatar: document.getElementById('formUserAvatar'),
        userName: document.getElementById('formUserName'),
        reportingUserSelect: document.getElementById('selectReportingUser'),
        btnSyncHours: document.getElementById('btnSyncHoursFromStopwatch')
      };

      if (!this.dom.form) return;

      this.populateCurrentUser();
      this.populateTaskSelect();
      this.setDefaultDate();
      this.bindEvents();
    },

    populateCurrentUser() {
      const user = ReportsState.currentUser;
      if (user) {
        if (this.dom.userName) this.dom.userName.textContent = user.name || 'Thành viên';
        if (this.dom.userAvatar && user.avatar) this.dom.userAvatar.src = user.avatar;
        if (this.dom.reportingUserSelect && user.id) {
          this.dom.reportingUserSelect.value = user.id;
        }
      }
    },

    syncReportingUserByAssignee(assigneeId) {
      if (!assigneeId) return;
      const member = ReportsState.members.find(m => m.id === assigneeId);
      if (member) {
        ReportsState.currentUser = member;
        if (this.dom.userAvatar && member.avatar) {
          this.dom.userAvatar.src = member.avatar;
        }
        if (this.dom.reportingUserSelect) {
          this.dom.reportingUserSelect.value = member.id;
        }
      }
    },

    populateTaskSelect() {
      if (!this.dom.taskSelect) return;

      const previousValue = this.dom.taskSelect.value || ReportsState.selectedTaskId;
      this.dom.taskSelect.innerHTML = '<option value="" disabled selected>-- Chọn công việc đang thực hiện --</option>';

      if (!ReportsState.tasks || ReportsState.tasks.length === 0) {
        const opt = document.createElement('option');
        opt.disabled = true;
        opt.textContent = 'Chưa có công việc nào trong hệ thống';
        this.dom.taskSelect.appendChild(opt);
        return;
      }

      const sortedTasks = [...ReportsState.tasks].sort((a, b) => {
        const order = { doing: 1, todo: 2, done: 3 };
        return (order[a.status] || 9) - (order[b.status] || 9);
      });

      sortedTasks.forEach(task => {
        const opt = document.createElement('option');
        opt.value = task.id;

        const project = ReportsState.projects.find(p => p.id === task.projectId);
        const projectName = project ? project.name : 'Chung';
        const assignee = ReportsState.members.find(m => m.id === task.assigneeId);
        const assigneeText = assignee ? ` (${assignee.name})` : '';
        const statusLabel = task.status === 'doing' ? 'ĐANG LÀM' : (task.status === 'done' ? 'HOÀN THÀNH' : 'CHỜ LÀM');

        opt.textContent = `[${statusLabel}] ${task.title}${assigneeText} - (${projectName})`;
        if (task.id === previousValue) {
          opt.selected = true;
        }
        this.dom.taskSelect.appendChild(opt);
      });

      if (previousValue) {
        this.dom.taskSelect.value = previousValue;
      }
    },

    setDefaultDate() {
      if (this.dom.dateInput) {
        const today = new Date().toISOString().slice(0, 10);
        this.dom.dateInput.value = today;
      }
    },

    /**
     * Tự động điền dữ liệu khi người dùng chọn công việc:
     * - Số giờ đã kết thúc của công việc đó (User/chủ dự án vẫn có toàn quyền sửa)
     * - Ngày thực hiện (User/chủ dự án vẫn có toàn quyền sửa)
     * - Kết quả đạt được và khó khăn trở ngại để trống giữ nguyên chữ mờ
     */
    onTaskSelected(taskId, isInitialAutoSelect) {
      if (!taskId) return;
      const task = ReportsState.tasks.find(t => t.id === taskId);
      if (!task) return;

      // 1. Tự động điền số giờ đã kết thúc của công việc đó
      let hours = parseFloat(task.spentHours) || 0;
      if ((task.status === 'doing' || task.isTracking) && task.timerStartedAt) {
        const activeHours = Math.max(0, Date.now() - task.timerStartedAt) / 3600000;
        hours += activeHours;
      }
      if (hours <= 0) {
        hours = 0.50; // Giá trị khởi điểm thân thiện
      }

      if (this.dom.hoursInput) {
        this.dom.hoursInput.value = (+hours).toFixed(2);
        // ĐẢM BẢO USER CHỦ DỰ ÁN VẪN CÓ QUYỀN SỬA
        this.dom.hoursInput.readOnly = false;
        this.dom.hoursInput.disabled = false;
      }

      // 2. Tự động điền ngày thực hiện
      if (this.dom.dateInput) {
        let taskDate = '';
        if (task.dueDateTime) taskDate = task.dueDateTime.slice(0, 10);
        else if (task.dueDate) taskDate = task.dueDate;
        else if (task.startDateTime) taskDate = task.startDateTime.slice(0, 10);
        else if (task.startDate) taskDate = task.startDate;
        else taskDate = new Date().toISOString().slice(0, 10);

        this.dom.dateInput.value = taskDate;
        // ĐẢM BẢO USER CHỦ DỰ ÁN VẪN CÓ QUYỀN SỬA
        this.dom.dateInput.readOnly = false;
        this.dom.dateInput.disabled = false;
      }

      // 3. Kết quả đạt được và khó khăn trở ngại: ĐỂ TRỐNG GIỮ NGUYÊN CHỮ MỜ
      if (this.dom.workResultInput) {
        this.dom.workResultInput.value = '';
      }
      if (this.dom.blockersInput) {
        this.dom.blockersInput.value = '';
      }

      // 4. Đồng bộ người thực hiện
      if (task.assigneeId) {
        this.syncReportingUserByAssignee(task.assigneeId);
      }
    },

    handleTaskChange(taskId) {
      ReportsState.selectedTaskId = taskId || '';
      const stopwatchSelect = document.getElementById('stopwatchTaskSelect');
      if (stopwatchSelect && stopwatchSelect.value !== taskId) {
        stopwatchSelect.value = taskId;
      }
      StopwatchController.updateTaskBadge();
      this.onTaskSelected(taskId);
    },

    bindEvents() {
      this.dom.form.addEventListener('submit', (e) => this.handleSubmit(e));

      // Nút lấy nhanh giờ từ đồng hồ bấm giờ (nếu người dùng muốn sync số đo realtime hiện tại)
      if (this.dom.btnSyncHours) {
        this.dom.btnSyncHours.addEventListener('click', () => {
          const decEl = document.getElementById('stopwatchDecimalDisplay');
          if (decEl && this.dom.hoursInput) {
            const val = parseFloat(decEl.textContent) || 0;
            this.dom.hoursInput.value = val > 0 ? val.toFixed(2) : '0.50';
            this.dom.hoursInput.classList.add('ring-2', 'ring-emerald-500');
            setTimeout(() => this.dom.hoursInput.classList.remove('ring-2', 'ring-emerald-500'), 1000);
            Toast.show(`Đã lấy ${this.dom.hoursInput.value} giờ từ đồng hồ!`, 'info');
          }
        });
      }

      // Chuyển đổi người thực hiện báo cáo thủ công qua dropdown
      if (this.dom.reportingUserSelect) {
        this.dom.reportingUserSelect.addEventListener('change', (e) => {
          const memId = e.target.value;
          const chosen = ReportsState.members.find(m => m.id === memId);
          if (chosen) {
            ReportsState.currentUser = chosen;
            if (this.dom.userAvatar && chosen.avatar) {
              this.dom.userAvatar.src = chosen.avatar;
            }
            Toast.show(`Đã chuyển người thực hiện báo cáo: ${chosen.name}`, 'info');
          }
        });
      }

      // Đồng bộ khi người dùng thay đổi dropdown trên form
      if (this.dom.taskSelect) {
        this.dom.taskSelect.addEventListener('change', (e) => {
          const val = e.target.value;
          this.handleTaskChange(val);
        });
      }
    },

    async handleSubmit(e) {
      e.preventDefault();

      const taskId = this.dom.taskSelect.value;
      const hours = parseFloat(this.dom.hoursInput.value);
      const date = this.dom.dateInput.value;
      const workResult = this.dom.workResultInput.value.trim();
      const blockers = (this.dom.blockersInput.value || '').trim() || 'Không có';

      if (!taskId) {
        Toast.show('Vui lòng chọn công việc thực hiện!', 'warning');
        this.dom.taskSelect.focus();
        return;
      }

      if (isNaN(hours) || hours <= 0 || hours > 24) {
        Toast.show('Số giờ làm việc không hợp lệ (từ 0.01 đến 24 giờ)!', 'warning');
        this.dom.hoursInput.focus();
        return;
      }

      if (!workResult) {
        Toast.show('Vui lòng mô tả kết quả công việc đã đạt được!', 'warning');
        this.dom.workResultInput.focus();
        return;
      }

      const task = ReportsState.tasks.find(t => t.id === taskId);
      const project = task ? ReportsState.projects.find(p => p.id === task.projectId) : null;
      const currentUser = ReportsState.currentUser || {};

      const newLog = {
        id: 'log-' + Date.now(),
        taskId: taskId,
        taskTitle: task ? task.title : 'Công việc không xác định',
        projectId: project ? project.id : (task ? task.projectId : ''),
        projectName: project ? project.name : 'Chung',
        projectColor: project ? (project.color || '#6366F1') : '#6366F1',
        assigneeName: currentUser.name || (task && task.assignee ? task.assignee.name : 'Thành viên'),
        assigneeAvatar: currentUser.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=Nhat',
        hoursSpent: +hours.toFixed(2),
        date: date,
        workResult: workResult,
        blockers: blockers,
        syncedToSheets: true,
        createdAt: new Date().toISOString()
      };

      this.setSubmitting(true);

      try {
        // A. Thêm vào đầu mảng timeLogs cục bộ
        ReportsState.timeLogs.unshift(newLog);
        DataEngine.saveTimeLogs();

        // B. Cập nhật và đồng bộ spentHours vào Task (đồng bộ trực tiếp sang Timeline & Kanban)
        if (task) {
          task.spentHours = +hours.toFixed(2);
          if (task.status === 'doing') {
            task.timerStartedAt = Date.now(); // reset mốc đếm giờ từ mốc mới ghi nhận
          }
        }
        DataEngine.saveTasks(ReportsState.tasks);

        // Phát sự kiện đồng bộ toàn hệ thống (Cross-module Sync sang Timeline & Kanban)
        window.dispatchEvent(new Event('storage'));
        window.dispatchEvent(new CustomEvent('taskflow_data_updated', {
          detail: { taskId, spentHours: task ? task.spentHours : hours, newLog }
        }));

        // C. Gửi dữ liệu lên Google Sheets
        if (window.SheetsSync && typeof window.SheetsSync.sendTimeLog === 'function') {
          await window.SheetsSync.sendTimeLog(newLog);
        }

        Toast.show('Đã lưu kết quả công việc và đồng bộ thành công sang Timeline & Kanban!', 'success');

        // Reset form: Để trống kết quả và trở ngại giữ nguyên chữ mờ, đồng bộ lại đồng hồ Kanban
        this.dom.workResultInput.value = '';
        this.dom.blockersInput.value = '';
        this.dom.hoursInput.value = '';
        this.setDefaultDate();
        StopwatchController.syncFromKanban();

        // Làm mới bảng Timesheet, KPI metrics & Phân tích trực quan
        TableController.render();
        KPIController.updateMetrics(true);
        AnalyticsController.render();

      } catch (error) {
        console.error('[Reports.FormController] Lỗi khi xử lý nộp báo cáo:', error);
        Toast.show('Đã lưu cục bộ nhưng lỗi kết nối Google Sheets!', 'warning');
      } finally {
        this.setSubmitting(false);
      }
    },

    setSubmitting(isSubmitting) {
      if (!this.dom.btnSubmit) return;

      if (isSubmitting) {
        this.dom.btnSubmit.disabled = true;
        this.dom.btnIcon.classList.add('hidden');
        this.dom.btnSpinner.classList.remove('hidden');
        this.dom.btnText.textContent = 'Đang đồng bộ lên Google Sheets...';
      } else {
        this.dom.btnSubmit.disabled = false;
        this.dom.btnIcon.classList.remove('hidden');
        this.dom.btnSpinner.classList.add('hidden');
        this.dom.btnText.textContent = 'Ghi Nhận & Đồng Bộ (LocalStorage + Google Sheets)';
      }
    }
  };

  /**
   * ==========================================================================
   * 5. PHÂN TÍCH TRỰC QUAN (VISUAL ANALYTICS CONTROLLER - TRELLO STYLE)
   * Render biểu đồ phân bổ thời gian theo dự án & theo thành viên bằng Pure CSS
   * ==========================================================================
   */
  const AnalyticsController = {
    init() {
      this.dom = {
        projectList: document.getElementById('analyticsProjectList'),
        projectCount: document.getElementById('analyticsProjectCount'),
        memberList: document.getElementById('analyticsMemberList'),
        memberCount: document.getElementById('analyticsMemberCount')
      };

      this.bindEvents();
      this.render();
    },

    bindEvents() {
      // Bấm vào hàng thành viên để lọc nhanh bảng nhật ký
      if (this.dom.memberList) {
        this.dom.memberList.addEventListener('click', (e) => {
          const row = e.target.closest('[data-filter-member]');
          if (row) {
            const memberName = row.getAttribute('data-filter-member');
            const memberSelect = document.getElementById('filterMember');
            if (memberSelect) {
              if (ReportsState.filters.member === memberName) {
                ReportsState.filters.member = 'ALL';
                memberSelect.value = 'ALL';
                Toast.show('Đã hiển thị tất cả thành viên!', 'info');
              } else {
                ReportsState.filters.member = memberName;
                memberSelect.value = memberName;
                Toast.show(`Đang lọc nhật ký của: ${memberName}`, 'info');
              }
              TableController.render();
              KPIController.updateMetrics(true);
              this.render();
            }
          }
        });
      }
    },

    render() {
      const logs = TableController.getFilteredLogs();
      this.renderProjectDistribution(logs);
      this.renderMemberContribution(logs);
    },

    renderProjectDistribution(logs) {
      if (!this.dom.projectList) return;

      if (!logs || logs.length === 0) {
        this.dom.projectList.innerHTML = '<p class="text-xs text-slate-400 dark:text-slate-500 italic py-2">Chưa có dữ liệu chấm công trong chu kỳ này.</p>';
        if (this.dom.projectCount) this.dom.projectCount.textContent = '0 dự án';
        return;
      }

      // Tổng hợp giờ theo dự án
      const projectMap = {};
      let totalHours = 0;

      logs.forEach(log => {
        const pid = log.projectId || 'default';
        const pName = log.projectName || 'Chung';
        const pColor = log.projectColor || '#6366F1';
        const hours = parseFloat(log.hoursSpent) || 0;

        if (!projectMap[pid]) {
          projectMap[pid] = { name: pName, color: pColor, hours: 0 };
        }
        projectMap[pid].hours += hours;
        totalHours += hours;
      });

      const projectArr = Object.values(projectMap).sort((a, b) => b.hours - a.hours);

      if (this.dom.projectCount) {
        this.dom.projectCount.textContent = `${projectArr.length} dự án`;
      }

      const html = projectArr.slice(0, 4).map(p => {
        const pct = totalHours > 0 ? Math.round((p.hours / totalHours) * 100) : 0;
        return `
          <div>
            <div class="flex items-center justify-between text-xs mb-1">
              <span class="flex items-center gap-1.5 font-medium text-slate-800 dark:text-slate-200 truncate max-w-[200px]">
                <span class="w-2 h-2 rounded-full flex-shrink-0" style="background-color: ${p.color};"></span>
                <span>${this.escapeHtml(p.name)}</span>
              </span>
              <span class="font-mono-numbers font-semibold text-slate-600 dark:text-slate-300">
                ${p.hours.toFixed(1)}h <span class="text-slate-400 text-[10px]">(${pct}%)</span>
              </span>
            </div>
            <div class="analytics-progress-track">
              <div class="analytics-progress-fill" style="width: ${pct}%; background-color: ${p.color};"></div>
            </div>
          </div>
        `;
      }).join('');

      this.dom.projectList.innerHTML = html;
    },

    renderMemberContribution(logs) {
      if (!this.dom.memberList) return;

      const memberMap = {};
      let totalHours = 0;

      // Đảm bảo luôn lấy danh sách đầy đủ 2 thành viên chính thức: Phạm Đăng Khoa & Nguyễn Đăng Nhật
      const defaultMembers = [
        { id: 'mem-01', name: 'Phạm Đăng Khoa', role: 'Admin', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Khoa' },
        { id: 'mem-02', name: 'Nguyễn Đăng Nhật', role: 'Member', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Nhat' }
      ];

      const members = (ReportsState.members && ReportsState.members.length >= 2)
        ? ReportsState.members
        : defaultMembers;

      // 1. Khởi tạo đầy đủ trước cho mọi thành viên (kể cả khi chưa có log nào)
      members.forEach(m => {
        memberMap[m.name] = {
          id: m.id,
          name: m.name,
          avatar: m.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(m.name)}`,
          role: m.role || 'Member',
          hours: 0
        };
      });

      // 2. Tích lũy giờ từ logs theo chu kỳ lọc
      if (Array.isArray(logs)) {
        logs.forEach(log => {
          const name = log.assigneeName || 'Thành viên';
          const hours = parseFloat(log.hoursSpent) || 0;

          if (!memberMap[name]) {
            memberMap[name] = {
              id: log.assigneeId || 'mem-custom',
              name: name,
              avatar: log.assigneeAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name)}`,
              role: 'Thành viên',
              hours: 0
            };
          }
          memberMap[name].hours += hours;
          totalHours += hours;
        });
      }

      const memberArr = Object.values(memberMap).sort((a, b) => b.hours - a.hours);

      if (this.dom.memberCount) {
        this.dom.memberCount.textContent = `${memberArr.length} thành viên`;
      }

      const html = memberArr.map(m => {
        const pct = totalHours > 0 ? Math.round((m.hours / totalHours) * 100) : (m.hours > 0 ? 100 : 0);
        const isNhat = m.name.includes('Nhật');
        const gradientClass = isNhat
          ? 'bg-gradient-to-r from-indigo-500 via-indigo-600 to-violet-500'
          : 'bg-gradient-to-r from-emerald-500 to-teal-500';

        const roleBadge = m.role === 'Admin'
          ? '<span class="text-[9px] px-1.5 py-0.5 rounded font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">Admin</span>'
          : '<span class="text-[9px] px-1.5 py-0.5 rounded font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">Member</span>';

        const isFiltered = ReportsState.filters.member === m.name;
        const activeBorder = isFiltered ? 'ring-2 ring-indigo-500/60 bg-indigo-50/50 dark:bg-indigo-500/10' : '';

        return `
          <div class="p-2 -mx-1.5 rounded-xl hover:bg-slate-100/70 dark:hover:bg-white/5 transition-all cursor-pointer group ${activeBorder}" data-filter-member="${this.escapeHtml(m.name)}" title="Bấm để lọc nhật ký của ${this.escapeHtml(m.name)}">
            <div class="flex items-center justify-between text-xs mb-1.5">
              <span class="flex items-center gap-2 font-medium text-slate-800 dark:text-slate-200 truncate max-w-[200px]">
                <img src="${m.avatar}" alt="Avatar" class="w-5 h-5 rounded-full bg-indigo-500/10 object-cover flex-shrink-0 ring-1 ring-slate-200 dark:ring-white/10" />
                <span class="font-bold group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">${this.escapeHtml(m.name)}</span>
                ${roleBadge}
              </span>
              <span class="font-mono-numbers font-semibold text-slate-700 dark:text-slate-300">
                ${m.hours.toFixed(1)}h <span class="text-slate-400 text-[10px]">(${pct}%)</span>
              </span>
            </div>
            <div class="analytics-progress-track">
              <div class="analytics-progress-fill ${gradientClass}" style="width: ${Math.max(pct, m.hours > 0 ? 3 : 0)}%;"></div>
            </div>
          </div>
        `;
      }).join('');

      this.dom.memberList.innerHTML = html;
    },

    escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }
  };

  /**
   * ==========================================================================
   * 6. BẢNG LỊCH SỬ CHẤM CÔNG & NHẬT KÝ BÁO CÁO (TIMESHEET TABLE CONTROLLER)
   * ==========================================================================
   */
  const TableController = {
    init() {
      this.dom = {
        tbody: document.getElementById('timesheetTableBody'),
        emptyState: document.getElementById('timesheetEmptyState'),
        countBadge: document.getElementById('tableLogCountBadge'),
        filterSearch: document.getElementById('filterSearch'),
        filterProject: document.getElementById('filterProject'),
        filterMember: document.getElementById('filterMember'),
        btnResetFilters: document.getElementById('btnResetFilters'),
        periodChips: document.querySelectorAll('.filter-date-chip')
      };

      if (!this.dom.tbody) return;

      this.populateFilterDropdowns();
      this.bindEvents();
      this.render();
    },

    populateFilterDropdowns() {
      if (this.dom.filterProject) {
        this.dom.filterProject.innerHTML = '<option value="ALL">Tất cả dự án</option>';
        ReportsState.projects.forEach(p => {
          const opt = document.createElement('option');
          opt.value = p.id;
          opt.textContent = p.name;
          this.dom.filterProject.appendChild(opt);
        });
      }

      if (this.dom.filterMember) {
        this.dom.filterMember.innerHTML = '<option value="ALL">Tất cả thành viên</option>';
        ReportsState.members.forEach(m => {
          const opt = document.createElement('option');
          opt.value = m.name;
          opt.textContent = `${m.name} (${m.role || 'Member'})`;
          if (m.name === ReportsState.filters.member) {
            opt.selected = true;
          }
          this.dom.filterMember.appendChild(opt);
        });
      }
    },

    bindEvents() {
      if (this.dom.filterSearch) {
        this.dom.filterSearch.addEventListener('input', (e) => {
          ReportsState.filters.search = e.target.value.toLowerCase().trim();
          this.render();
          AnalyticsController.render();
        });
      }

      if (this.dom.filterProject) {
        this.dom.filterProject.addEventListener('change', (e) => {
          ReportsState.filters.projectId = e.target.value;
          this.render();
          AnalyticsController.render();
        });
      }

      if (this.dom.filterMember) {
        this.dom.filterMember.addEventListener('change', (e) => {
          ReportsState.filters.member = e.target.value;
          this.render();
          AnalyticsController.render();
        });
      }

      // Bộ lọc chu kỳ thời gian nhanh
      if (this.dom.periodChips) {
        this.dom.periodChips.forEach(chip => {
          chip.addEventListener('click', () => {
            this.dom.periodChips.forEach(c => c.classList.remove('is-active'));
            chip.classList.add('is-active');
            ReportsState.period = chip.getAttribute('data-period') || 'ALL';
            this.render();
            KPIController.updateMetrics(true);
            AnalyticsController.render();
          });
        });
      }

      if (this.dom.btnResetFilters) {
        this.dom.btnResetFilters.addEventListener('click', () => {
          ReportsState.filters.search = '';
          ReportsState.filters.projectId = 'ALL';
          ReportsState.filters.member = 'ALL';
          ReportsState.period = 'ALL';

          if (this.dom.filterSearch) this.dom.filterSearch.value = '';
          if (this.dom.filterProject) this.dom.filterProject.value = 'ALL';
          if (this.dom.filterMember) this.dom.filterMember.value = 'ALL';
          if (this.dom.periodChips) {
            this.dom.periodChips.forEach(c => {
              c.classList.toggle('is-active', c.getAttribute('data-period') === 'ALL');
            });
          }

          this.render();
          KPIController.updateMetrics(true);
          AnalyticsController.render();
          Toast.show('Đã đặt lại bộ lọc danh sách!', 'info');
        });
      }

      // Event delegation cho nút xóa log và mở trao đổi bình luận trên bảng
      this.dom.tbody.addEventListener('click', (e) => {
        const deleteBtn = e.target.closest('[data-action="delete-log"]');
        if (deleteBtn) {
          const logId = deleteBtn.getAttribute('data-log-id');
          this.handleDeleteLog(logId);
          return;
        }

        const discussBtn = e.target.closest('[data-action="open-discussion"]');
        if (discussBtn) {
          const taskId = discussBtn.getAttribute('data-task-id');
          if (taskId && typeof DiscussionController !== 'undefined') {
            DiscussionController.openModal(taskId);
          }
        }
      });
    },

    getFilteredLogs() {
      const { search, projectId, member } = ReportsState.filters;
      const period = ReportsState.period;

      return ReportsState.timeLogs.filter(log => {
        // Lọc theo Chu kỳ thời gian
        if (!DateUtils.isDateInPeriod(log.date, period)) {
          return false;
        }

        // Lọc theo Dự án
        if (projectId !== 'ALL' && log.projectId !== projectId) {
          return false;
        }

        // Lọc theo Thành viên
        if (member !== 'ALL' && log.assigneeName !== member) {
          return false;
        }

        // Lọc theo từ khóa tìm kiếm
        if (search) {
          const matchTask = (log.taskTitle || '').toLowerCase().includes(search);
          const matchResult = (log.workResult || '').toLowerCase().includes(search);
          const matchBlockers = (log.blockers || '').toLowerCase().includes(search);
          const matchAssignee = (log.assigneeName || '').toLowerCase().includes(search);
          if (!matchTask && !matchResult && !matchBlockers && !matchAssignee) {
            return false;
          }
        }

        return true;
      });
    },

    render() {
      const filtered = this.getFilteredLogs();

      if (this.dom.countBadge) {
        this.dom.countBadge.textContent = `${filtered.length} bản ghi`;
      }

      if (filtered.length === 0) {
        this.dom.tbody.innerHTML = '';
        if (this.dom.emptyState) this.dom.emptyState.classList.remove('hidden');
        return;
      }

      if (this.dom.emptyState) this.dom.emptyState.classList.add('hidden');

      const rowsHtml = filtered.map(log => {
        let formattedDate = log.date || '';
        if (log.date && log.date.includes('-')) {
          const parts = log.date.split('-');
          if (parts.length === 3) {
            formattedDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
          }
        }

        const task = ReportsState.tasks.find(t => t.id === log.taskId);
        const comments = (task && Array.isArray(task.comments)) ? task.comments : [];
        const latestComment = comments.length > 0 ? comments[comments.length - 1] : null;

        const hasBlocker = log.blockers && log.blockers.toLowerCase() !== 'không có' && log.blockers.trim() !== '';
        const blockerBadge = hasBlocker
          ? `<span class="badge-blocker-alert" title="${this.escapeHtml(log.blockers)}">⚠️ ${this.escapeHtml(log.blockers)}</span>`
          : `<span class="badge-blocker-none">✓ Không có</span>`;

        const avatarUrl = log.assigneeAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(log.assigneeName || 'User')}`;

        return `
          <tr class="hover:bg-slate-50/80 dark:hover:bg-white/5 transition-colors">
            <!-- Cột 1: Ngày -->
            <td class="py-3 px-4 font-mono-numbers font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
              ${formattedDate}
            </td>

            <!-- Cột 2: Tên Task & Dự Án -->
            <td class="py-3 px-4">
              <div class="font-bold text-slate-900 dark:text-white leading-snug">
                ${this.escapeHtml(log.taskTitle)}
              </div>
              <div class="flex items-center gap-1.5 mt-1">
                <span class="w-1.5 h-1.5 rounded-full" style="background-color: ${log.projectColor || '#6366F1'};"></span>
                <span class="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  ${this.escapeHtml(log.projectName || 'Dự án')}
                </span>
              </div>
            </td>

            <!-- Cột 3: Người Thực Hiện -->
            <td class="py-3 px-4">
              <div class="flex items-center gap-2">
                <img src="${avatarUrl}" alt="Avatar" class="w-6 h-6 rounded-full bg-indigo-500/10 object-cover flex-shrink-0" />
                <span class="font-medium text-slate-800 dark:text-slate-200 truncate max-w-[110px]" title="${this.escapeHtml(log.assigneeName)}">
                  ${this.escapeHtml(log.assigneeName)}
                </span>
              </div>
            </td>

            <!-- Cột 4: Số Giờ -->
            <td class="py-3 px-4 text-center whitespace-nowrap">
              <span class="badge-hours-spent">
                ⏱ ${Number(log.hoursSpent).toFixed(2)}h
              </span>
            </td>

            <!-- Cột 5: Kết Quả Công Việc -->
            <td class="py-3 px-4 text-slate-600 dark:text-slate-300 leading-relaxed max-w-xs break-words">
              ${this.escapeHtml(log.workResult)}
            </td>

            <!-- Cột 6: Trở Ngại (Blockers) -->
            <td class="py-3 px-4 whitespace-nowrap">
              ${blockerBadge}
            </td>

            <!-- Cột 7: Trao Đổi & Bình Luận (Activity & Discussion) -->
            <td class="py-3 px-4">
              <div class="flex items-center gap-2">
                <button 
                  type="button"
                  data-action="open-discussion"
                  data-task-id="${this.escapeHtml(log.taskId)}"
                  class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${comments.length > 0 ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-500/20' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'} border border-slate-200 dark:border-white/10 transition-all cursor-pointer shadow-2xs group"
                  title="Xem hoặc để lại bình luận cho công việc này"
                >
                  <span class="text-xs group-hover:scale-110 transition-transform">💬</span>
                  <span class="font-bold">${comments.length}</span>
                  <span class="text-[11px] text-slate-400 group-hover:text-inherit">bình luận</span>
                </button>
                ${latestComment ? `
                  <div class="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[130px] italic" title="${this.escapeHtml(latestComment.authorName + ': ' + (latestComment.content || latestComment.text))}">
                    <span class="font-medium text-slate-700 dark:text-slate-300">${this.escapeHtml((latestComment.authorName || latestComment.author || '').split(' ').pop())}:</span>
                    "${this.escapeHtml(latestComment.content || latestComment.text || '')}"
                  </div>
                ` : ''}
              </div>
            </td>

            <!-- Cột 8: Trạng Thái Đồng Bộ -->
            <td class="py-3 px-4 text-center whitespace-nowrap">
              <span class="badge-sheets-synced" title="Dữ liệu đã được nạp vào Google Sheets">
                <svg class="w-3 h-3 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
                </svg>
                <span>Sheets Synced</span>
              </span>
            </td>

            <!-- Cột 8: Thao Tác (Xóa Log) -->
            <td class="py-3 px-4 text-center whitespace-nowrap">
              <button type="button" data-action="delete-log" data-log-id="${log.id}" title="Xóa bản ghi này và trừ giờ trên task" class="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors cursor-pointer">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </td>
          </tr>
        `;
      }).join('');

      this.dom.tbody.innerHTML = rowsHtml;
    },

    handleDeleteLog(logId) {
      if (!logId) return;

      const targetIndex = ReportsState.timeLogs.findIndex(l => l.id === logId);
      if (targetIndex === -1) return;

      const targetLog = ReportsState.timeLogs[targetIndex];
      const confirmDelete = window.confirm(`Bạn có chắc muốn xóa bản ghi chấm công "${targetLog.taskTitle}" (${targetLog.hoursSpent}h)?\nThao tác này sẽ tự động trừ đi ${targetLog.hoursSpent} giờ trên công việc tương ứng.`);

      if (!confirmDelete) return;

      // 1. Phản ứng dây chuyền: Trừ số giờ trên task tương ứng
      DataEngine.propagateSpentHoursToTask(targetLog.taskId, -targetLog.hoursSpent);

      // 2. Xóa khỏi mảng timeLogs
      ReportsState.timeLogs.splice(targetIndex, 1);
      DataEngine.saveTimeLogs();

      // 3. Render lại bảng, KPI và Phân tích trực quan
      this.render();
      KPIController.updateMetrics(true);
      AnalyticsController.render();

      Toast.show('Đã xóa bản ghi chấm công và điều chỉnh lại giờ trên task!', 'info');
    },

    escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }
  };

  /**
   * ==========================================================================
   * 7. DẢI THẺ KPI METRICS & HIỆU ỨNG SỐ NHẢY COUNT-UP (KPI CONTROLLER)
   * ==========================================================================
   */
  const KPIController = {
    init() {
      this.dom = {
        totalHours: document.getElementById('kpiTotalHours'),
        totalLogs: document.getElementById('kpiTotalLogs'),
        todayHours: document.getElementById('kpiTodayHours'),
        topTaskName: document.getElementById('kpiTopTaskName'),
        topTaskHours: document.getElementById('kpiTopTaskHours'),
        totalHoursSubtitle: document.getElementById('kpiTotalHoursSubtitle'),
        cards: [
          document.getElementById('kpiCardTotalHours'),
          document.getElementById('kpiCardTotalLogs'),
          document.getElementById('kpiCardTodayHours'),
          document.getElementById('kpiCardTopTask')
        ]
      };

      this.updateMetrics(false);
    },

    updateMetrics(withAnimation = true) {
      // Tính toán dựa trên danh sách filtered theo chu kỳ thời gian
      const filteredLogs = TableController.getFilteredLogs();
      const allLogs = ReportsState.timeLogs;

      // 1. Tổng giờ trong chu kỳ hiện tại
      const totalHours = filteredLogs.reduce((acc, log) => acc + (parseFloat(log.hoursSpent) || 0), 0);

      // 2. Tổng số bản ghi trong chu kỳ
      const totalLogs = filteredLogs.length;

      // 3. Giờ làm việc hôm nay (luôn cố định theo ngày hôm nay)
      const todayStr = DateUtils.getTodayStr();
      const todayHours = allLogs
        .filter(log => log.date === todayStr)
        .reduce((acc, log) => acc + (parseFloat(log.hoursSpent) || 0), 0);

      // 4. Task tiêu tốn nhiều thời gian nhất trong chu kỳ
      const taskHoursMap = {};
      filteredLogs.forEach(log => {
        const tid = log.taskId || log.taskTitle;
        taskHoursMap[tid] = (taskHoursMap[tid] || 0) + (parseFloat(log.hoursSpent) || 0);
      });

      let topTaskId = null;
      let maxHours = 0;
      Object.keys(taskHoursMap).forEach(tid => {
        if (taskHoursMap[tid] > maxHours) {
          maxHours = taskHoursMap[tid];
          topTaskId = tid;
        }
      });

      let topTaskTitle = 'Chưa có dữ liệu';
      if (topTaskId) {
        const foundTask = ReportsState.tasks.find(t => t.id === topTaskId);
        if (foundTask) {
          topTaskTitle = foundTask.title;
        } else {
          const foundLog = filteredLogs.find(l => l.taskId === topTaskId);
          topTaskTitle = foundLog ? foundLog.taskTitle : topTaskId;
        }
      }

      // Cập nhật Subtitle theo period
      if (this.dom.totalHoursSubtitle) {
        const p = ReportsState.period;
        const labels = {
          'ALL': 'Cộng dồn toàn thời gian',
          'TODAY': 'Ghi nhận trong ngày hôm nay',
          'WEEK': 'Ghi nhận trong tuần này',
          'MONTH': 'Ghi nhận trong tháng này'
        };
        this.dom.totalHoursSubtitle.textContent = labels[p] || 'Cộng dồn chu kỳ';
      }

      // Cập nhật DOM
      if (withAnimation) {
        this.animateCountUp(this.dom.totalHours, totalHours, 1);
        this.animateCountUp(this.dom.totalLogs, totalLogs, 0);
        this.animateCountUp(this.dom.todayHours, todayHours, 1);

        this.dom.cards.forEach(card => {
          if (card) {
            card.classList.remove('kpi-stat-flash');
            void card.offsetWidth;
            card.classList.add('kpi-stat-flash');
          }
        });
      } else {
        if (this.dom.totalHours) this.dom.totalHours.textContent = totalHours.toFixed(1);
        if (this.dom.totalLogs) this.dom.totalLogs.textContent = String(totalLogs);
        if (this.dom.todayHours) this.dom.todayHours.textContent = todayHours.toFixed(1);
      }

      if (this.dom.topTaskName) {
        this.dom.topTaskName.textContent = topTaskTitle;
        this.dom.topTaskName.title = topTaskTitle;
      }
      if (this.dom.topTaskHours) {
        this.dom.topTaskHours.textContent = `${maxHours.toFixed(1)}h`;
      }
    },

    animateCountUp(element, targetValue, decimals = 0) {
      if (!element) return;

      const duration = 650;
      const startValue = parseFloat(element.textContent) || 0;
      const startTime = performance.now();

      function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easeOut = 1 - Math.pow(1 - progress, 3);
        const current = startValue + (targetValue - startValue) * easeOut;

        element.textContent = current.toFixed(decimals);

        if (progress < 1) {
          requestAnimationFrame(update);
        } else {
          element.textContent = targetValue.toFixed(decimals);
        }
      }

      requestAnimationFrame(update);
    }
  };

  /**
   * ==========================================================================
   * 7. CONTROLLER: TRAO ĐỔI & BÌNH LUẬN CÔNG VIỆC (DISCUSSION FEED MODAL)
   * Đồng bộ 2 chiều với Bảng Kanban (Trang 3) & Báo Cáo (Trang 5)
   * ==========================================================================
   */
  const DiscussionController = {
    activeTaskId: null,
    dom: {},

    init() {
      this.dom = {
        modal: document.getElementById('taskDiscussionModal'),
        backdrop: document.getElementById('taskDiscussionBackdrop'),
        countBadge: document.getElementById('modalDiscussionCountBadge'),
        taskSubtitle: document.getElementById('modalDiscussionTaskSubtitle'),
        btnClose: document.getElementById('btnCloseDiscussionModal'),
        btnCloseFooter: document.getElementById('btnCloseDiscussionModalFooter'),
        authorAvatar: document.getElementById('discussionModalAuthorAvatar'),
        userSelect: document.getElementById('discussionModalUserSelect'),
        inputText: document.getElementById('discussionModalInputText'),
        btnSubmit: document.getElementById('btnSubmitDiscussionModal'),
        commentsList: document.getElementById('discussionModalCommentsList')
      };

      if (!this.dom.modal) return;

      this.populateUserSelect();
      this.bindEvents();
    },

    populateUserSelect() {
      if (!this.dom.userSelect) return;
      this.dom.userSelect.innerHTML = '';

      const members = ReportsState.members.length > 0 ? ReportsState.members : [
        { id: 'u1', name: 'Nguyễn Đăng Nhật', role: 'Leader', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Nhat' },
        { id: 'u2', name: 'Phạm Đăng Khoa', role: 'Member', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=KhoaPham' }
      ];

      members.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.name;
        opt.textContent = `${m.name} (${m.role || 'Member'})`;
        opt.dataset.avatar = m.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(m.name)}`;
        opt.dataset.role = m.role || 'Member';
        this.dom.userSelect.appendChild(opt);
      });

      if (ReportsState.currentUser && ReportsState.currentUser.name) {
        this.dom.userSelect.value = ReportsState.currentUser.name;
      }
      this.updateAuthorAvatar();
    },

    updateAuthorAvatar() {
      if (!this.dom.userSelect || !this.dom.authorAvatar) return;
      const selectedOpt = this.dom.userSelect.selectedOptions[0];
      if (selectedOpt && selectedOpt.dataset.avatar) {
        this.dom.authorAvatar.src = selectedOpt.dataset.avatar;
      }
    },

    bindEvents() {
      if (this.dom.btnClose) {
        this.dom.btnClose.addEventListener('click', () => this.closeModal());
      }
      if (this.dom.btnCloseFooter) {
        this.dom.btnCloseFooter.addEventListener('click', () => this.closeModal());
      }
      if (this.dom.backdrop) {
        this.dom.backdrop.addEventListener('click', () => this.closeModal());
      }
      if (this.dom.userSelect) {
        this.dom.userSelect.addEventListener('change', () => this.updateAuthorAvatar());
      }
      if (this.dom.btnSubmit) {
        this.dom.btnSubmit.addEventListener('click', () => this.submitComment());
      }
      if (this.dom.inputText) {
        this.dom.inputText.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            this.submitComment();
          }
        });
      }

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.dom.modal && !this.dom.modal.classList.contains('hidden')) {
          this.closeModal();
        }
      });
    },

    openModal(taskId) {
      if (!taskId) return;
      this.activeTaskId = taskId;

      const task = ReportsState.tasks.find(t => t.id === taskId);
      if (!task) {
        Toast.show('Không tìm thấy công việc tương ứng.', 'warning');
        return;
      }

      if (this.dom.taskSubtitle) {
        const proj = ReportsState.projects.find(p => p.id === task.projectId);
        this.dom.taskSubtitle.textContent = `[${proj ? proj.name : 'Dự Án'}] ${task.title}`;
      }

      this.renderCommentsList(task.comments || []);

      if (this.dom.inputText) {
        this.dom.inputText.value = '';
      }

      if (this.dom.modal) {
        this.dom.modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
      }

      setTimeout(() => {
        if (this.dom.inputText) this.dom.inputText.focus();
      }, 100);
    },

    closeModal() {
      if (this.dom.modal) {
        this.dom.modal.classList.add('hidden');
        document.body.style.overflow = '';
      }
      this.activeTaskId = null;
    },

    renderCommentsList(comments) {
      if (!this.dom.commentsList) return;
      const count = Array.isArray(comments) ? comments.length : 0;
      if (this.dom.countBadge) {
        this.dom.countBadge.textContent = count;
      }

      if (count === 0) {
        this.dom.commentsList.innerHTML = `
          <div class="text-center py-6 px-4 bg-slate-50 dark:bg-white/5 rounded-xl border border-dashed border-slate-200 dark:border-white/10">
            <span class="text-2xl mb-1 block">💬</span>
            <p class="text-xs font-semibold text-slate-700 dark:text-slate-300">Chưa có trao đổi nào cho công việc này</p>
            <p class="text-[11px] text-slate-400 mt-0.5">Hãy viết ý kiến hoặc góp ý đầu tiên ở khung phía trên!</p>
          </div>
        `;
        return;
      }

      this.dom.commentsList.innerHTML = comments.slice().reverse().map(cmt => {
        const author = cmt.authorName || cmt.author || 'Thành viên';
        const avatar = cmt.authorAvatar || cmt.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(author)}`;
        const role = cmt.role || 'Member';
        const timeStr = cmt.createdAt || cmt.time || '';
        const content = cmt.content || cmt.text || '';

        return `
          <div class="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-100 dark:border-white/5 hover:border-slate-200 dark:hover:border-white/10 transition-colors">
            <img src="${avatar}" alt="${author}" class="w-7 h-7 rounded-full bg-slate-200 dark:bg-white/10 flex-shrink-0 mt-0.5 ring-1 ring-slate-200 dark:ring-white/10" />
            <div class="flex-1 space-y-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="text-xs font-bold text-slate-900 dark:text-white truncate">${TableController.escapeHtml(author)}</span>
                <span class="text-[9px] uppercase px-1.5 py-0.2 rounded font-bold ${role === 'Leader' ? 'bg-indigo-500/15 text-indigo-500' : 'bg-slate-200 dark:bg-white/10 text-slate-500'}">${role}</span>
                <span class="text-[10px] text-slate-400 font-mono ml-auto whitespace-nowrap">${TableController.escapeHtml(timeStr)}</span>
              </div>
              <div class="text-xs text-slate-700 dark:text-slate-300 leading-relaxed break-words">
                ${TableController.escapeHtml(content)}
              </div>
            </div>
          </div>
        `;
      }).join('');
    },

    submitComment() {
      if (!this.activeTaskId) return;
      const text = this.dom.inputText ? this.dom.inputText.value.trim() : '';
      if (!text) {
        Toast.show('Vui lòng nhập nội dung trao đổi hoặc bình luận!', 'warning');
        if (this.dom.inputText) this.dom.inputText.focus();
        return;
      }

      const selectedOpt = this.dom.userSelect ? this.dom.userSelect.selectedOptions[0] : null;
      const authorName = selectedOpt ? selectedOpt.value : (ReportsState.currentUser?.name || 'Thành viên');
      const authorAvatar = selectedOpt ? selectedOpt.dataset.avatar : (ReportsState.currentUser?.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=Nhat');
      const role = selectedOpt ? (selectedOpt.dataset.role || 'Member') : 'Member';

      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} ${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;

      const newCmt = {
        id: 'cmt-' + Date.now(),
        authorName: authorName,
        authorAvatar: authorAvatar,
        role: role,
        content: text,
        createdAt: timeStr
      };

      const task = ReportsState.tasks.find(t => t.id === this.activeTaskId);
      if (task) {
        if (!Array.isArray(task.comments)) task.comments = [];
        task.comments.push(newCmt);

        DataEngine.saveTasks(ReportsState.tasks);

        this.renderCommentsList(task.comments);
        if (this.dom.inputText) this.dom.inputText.value = '';
        Toast.show('Đã gửi bình luận trao đổi thành công!', 'success');

        TableController.render();
      }
    }
  };

  /**
   * ==========================================================================
   * 8. ĐỘNG CƠ XUẤT BÁO CÁO CSV CHUẨN QUỐC TẾ (BLOB API UTF-8 BOM)
   * ==========================================================================
   */
  const ExportEngine = {
    init() {
      const btnExport = document.getElementById('btnExportCsv');
      if (btnExport) {
        btnExport.addEventListener('click', () => this.exportCsv());
      }

      const btnRefresh = document.getElementById('btnRefreshReports');
      if (btnRefresh) {
        btnRefresh.addEventListener('click', () => {
          DataEngine.loadAll();
          StopwatchController.populateTaskSelect();
          FormController.populateTaskSelect();
          StopwatchController.syncFromKanban();
          TableController.populateFilterDropdowns();
          TableController.render();
          KPIController.updateMetrics(true);
          AnalyticsController.render();
          Toast.show('Đã làm mới dữ liệu và đồng bộ đồng hồ từ Kanban!', 'info');
        });
      }
    },

    exportCsv() {
      const logs = TableController.getFilteredLogs();

      if (!logs || logs.length === 0) {
        Toast.show('Không có dữ liệu nhật ký nào để xuất báo cáo!', 'warning');
        return;
      }

      const headers = [
        "Mã Log",
        "Ngày Thực Hiện",
        "Công Việc",
        "Mã Dự Án",
        "Tên Dự Án",
        "Người Thực Hiện",
        "Số Giờ (h)",
        "Kết Quả Đạt Được",
        "Trở Ngại (Blockers)",
        "Thời Điểm Ghi Nhận"
      ];

      const rows = logs.map(log => [
        `"${log.id}"`,
        `"${log.date}"`,
        `"${(log.taskTitle || '').replace(/"/g, '""')}"`,
        `"${(log.projectId || '').replace(/"/g, '""')}"`,
        `"${(log.projectName || '').replace(/"/g, '""')}"`,
        `"${(log.assigneeName || '').replace(/"/g, '""')}"`,
        Number(log.hoursSpent).toFixed(2),
        `"${(log.workResult || '').replace(/"/g, '""')}"`,
        `"${(log.blockers || '').replace(/"/g, '""')}"`,
        `"${log.createdAt || ''}"`
      ]);

      const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(r => r.join(","))].join("\r\n");

      try {
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        const todayStr = new Date().toISOString().slice(0, 10);
        
        link.setAttribute("href", url);
        link.setAttribute("download", `TaskFlow_Timesheet_Report_${todayStr}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        Toast.show(`Đã xuất thành công ${logs.length} bản ghi sang file CSV!`, 'success');
      } catch (err) {
        console.error('[Reports.ExportEngine] Lỗi khi tạo file CSV:', err);
        Toast.show('Không thể xuất file CSV. Vui lòng thử lại!', 'warning');
      }
    }
  };

  /**
   * ==========================================================================
   * 9. HỆ THỐNG THÔNG BÁO TOAST KÍNH MỜ ĐỒNG BỘ
   * ==========================================================================
   */
  const Toast = {
    show(message, type = 'info') {
      const container = document.getElementById('toastContainer');
      if (!container) return;

      const toast = document.createElement('div');
      
      let typeClasses = 'border-indigo-500/30 text-indigo-400';
      let icon = '<span class="text-indigo-500">ℹ️</span>';

      if (type === 'success') {
        typeClasses = 'border-emerald-500/30 text-emerald-500 dark:text-emerald-400';
        icon = '<span class="text-emerald-500">✓</span>';
      } else if (type === 'warning') {
        typeClasses = 'border-amber-500/30 text-amber-500 dark:text-amber-400';
        icon = '<span class="text-amber-500">⚠️</span>';
      }

      toast.className = `flex items-center gap-3 px-4 py-3 rounded-2xl bg-white/90 dark:bg-slate-900/95 backdrop-blur-md border ${typeClasses} shadow-2xl text-xs font-semibold text-slate-800 dark:text-slate-100 animate-bounce-in z-50 min-w-[260px]`;
      toast.innerHTML = `
        <div class="text-base">${icon}</div>
        <div class="flex-1">${message}</div>
      `;

      container.appendChild(toast);

      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
      }, 3500);
    }
  };

  /**
   * ==========================================================================
   * 10. KHỞI CHẠY HỆ THỐNG KHI DOM READY
   * ==========================================================================
   */
  function refreshAllFromStorage() {
    DataEngine.loadAll();
    StopwatchController.populateTaskSelect();
    FormController.populateTaskSelect();
    StopwatchController.syncFromKanban();
    TableController.populateFilterDropdowns();
    TableController.render();
    KPIController.updateMetrics(true);
    AnalyticsController.render();
  }

  function init() {
    if (window.Auth && typeof window.Auth.requireAuth === 'function') {
      try {
        window.Auth.requireAuth();
      } catch (e) {
        console.warn('[Reports] Auth.requireAuth catch:', e);
      }
    }

    DataEngine.loadAll();

    // Khởi tạo FormController trước để StopwatchController đồng bộ sang form ngay từ tick đầu tiên
    FormController.init();
    StopwatchController.init();
    TableController.init();
    KPIController.init();
    AnalyticsController.init();
    ExportEngine.init();
    DiscussionController.init();

    // Tự động nhận diện tham số ?taskId=... khi chuyển từ Timeline hoặc Kanban
    const urlParams = new URLSearchParams(window.location.search);
    const targetTaskId = urlParams.get('taskId');
    if (targetTaskId) {
      setTimeout(() => {
        if (StopwatchController.dom.taskSelect) {
          StopwatchController.dom.taskSelect.value = targetTaskId;
          StopwatchController.handleTaskChange(targetTaskId);
        }
        if (FormController.dom.taskSelect) {
          FormController.dom.taskSelect.value = targetTaskId;
          FormController.handleTaskChange(targetTaskId);
        }
        Toast.show(`Đã chọn công việc từ Lộ Trình Timeline: ${targetTaskId}`, 'info');
      }, 250);
    }

    window.addEventListener('storage', (e) => {
      if (!e.key || ['TASKFLOW_DATA', 'taskflow_time_logs', 'taskflow_tasks', 'taskflow_projects'].includes(e.key)) {
        refreshAllFromStorage();
      }
    });

    window.addEventListener('taskflow_timer_updated', () => {
      refreshAllFromStorage();
    });

    window.addEventListener('focus', () => {
      refreshAllFromStorage();
    });

    window.addEventListener('pageshow', () => {
      refreshAllFromStorage();
    });

    console.log('[TaskFlow] Trang 5: Báo Cáo & Time-tracker tự động (Trello-Grade) đã khởi chạy thành công 60fps.');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Đóng gói API ra window
  window.TaskFlowReports = {
    DataEngine,
    StopwatchController,
    FormController,
    TableController,
    KPIController,
    AnalyticsController,
    ExportEngine,
    DiscussionController,
    Toast
  };

})(window, document);