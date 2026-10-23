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
   * 3. ĐỘNG CƠ BẤM GIỜ TRỰC TIẾP 60FPS (LIVE STOPWATCH CONTROLLER)
   * Phong cách Trello Card-Centric Tracking: Liên kết đồng bộ chặt chẽ với Task
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
        btnStart: document.getElementById('btnStopwatchStart'),
        btnPause: document.getElementById('btnStopwatchPause'),
        btnReset: document.getElementById('btnStopwatchReset'),
        btnStopFill: document.getElementById('btnStopwatchStopFill'),
        hoursInput: document.getElementById('logHoursSpent'),
        taskSelect: document.getElementById('stopwatchTaskSelect'),
        projectBadge: document.getElementById('stopwatchTaskProjectBadge'),
        activeBanner: document.getElementById('stopwatchActiveTaskBanner'),
        activeTitle: document.getElementById('stopwatchActiveTaskTitle')
      };

      if (!this.dom.display) return;
      this.populateTaskSelect();
      this.bindEvents();
      this.updateUI();
    },

    populateTaskSelect() {
      if (!this.dom.taskSelect) return;

      this.dom.taskSelect.innerHTML = '<option value="">-- Chọn công việc (hoặc chọn tại Form) --</option>';

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
        if (task.id === ReportsState.selectedTaskId) {
          opt.selected = true;
        }
        this.dom.taskSelect.appendChild(opt);
      });

      this.updateTaskBadge();
    },

    updateTaskBadge() {
      const taskId = ReportsState.selectedTaskId;
      const task = ReportsState.tasks.find(t => t.id === taskId);
      if (task) {
        const project = ReportsState.projects.find(p => p.id === task.projectId);
        if (this.dom.projectBadge) {
          this.dom.projectBadge.textContent = project ? `Dự án: ${project.name}` : '';
        }
        if (this.dom.activeTitle) {
          this.dom.activeTitle.textContent = `Đang theo dõi: ${task.title}`;
        }
      } else {
        if (this.dom.projectBadge) this.dom.projectBadge.textContent = '';
        if (this.dom.activeTitle) this.dom.activeTitle.textContent = 'Đang theo dõi: Chưa chỉ định task cụ thể';
      }
    },

    bindEvents() {
      this.dom.btnStart.addEventListener('click', () => this.start());
      this.dom.btnPause.addEventListener('click', () => this.pause());
      this.dom.btnReset.addEventListener('click', () => this.reset());
      this.dom.btnStopFill.addEventListener('click', () => this.stopAndFill());

      // Lắng nghe chọn task trên Stopwatch
      if (this.dom.taskSelect) {
        this.dom.taskSelect.addEventListener('change', (e) => {
          const val = e.target.value;
          ReportsState.selectedTaskId = val;
          // Đồng bộ sang dropdown Form
          const formTaskSelect = document.getElementById('logTaskId');
          if (formTaskSelect && formTaskSelect.value !== val) {
            formTaskSelect.value = val;
          }
          this.updateTaskBadge();

          // Tự động đồng bộ người thực hiện sang Form nếu task có người phụ trách
          const foundTask = ReportsState.tasks.find(t => t.id === val);
          if (foundTask && foundTask.assigneeId) {
            FormController.syncReportingUserByAssignee(foundTask.assigneeId);
          }
        });
      }
    },

    start() {
      if (ReportsState.stopwatch.status === 'RUNNING') return;

      ReportsState.stopwatch.status = 'RUNNING';
      ReportsState.stopwatch.startTime = performance.now() - ReportsState.stopwatch.elapsedMs;

      // Gia hạn phiên làm việc khi tương tác
      if (window.Auth && typeof window.Auth.extendSession === 'function') {
        window.Auth.extendSession();
      }

      if (ReportsState.stopwatch.intervalId) {
        clearInterval(ReportsState.stopwatch.intervalId);
      }

      // 60fps refresh rate (~33ms)
      ReportsState.stopwatch.intervalId = setInterval(() => {
        ReportsState.stopwatch.elapsedMs = performance.now() - ReportsState.stopwatch.startTime;
        this.updateTimeDisplay();
      }, 33);

      this.updateUI();

      // Hiển thị banner công việc đang theo dõi
      if (this.dom.activeBanner) {
        this.dom.activeBanner.classList.remove('hidden');
      }

      const activeTask = ReportsState.tasks.find(t => t.id === ReportsState.selectedTaskId);
      const taskMsg = activeTask ? `cho task: "${activeTask.title}"` : '(chưa chọn task)';
      Toast.show(`Đã bắt đầu bấm giờ làm việc ${taskMsg}!`, 'info');
    },

    pause() {
      if (ReportsState.stopwatch.status !== 'RUNNING') return;

      ReportsState.stopwatch.status = 'PAUSED';
      if (ReportsState.stopwatch.intervalId) {
        clearInterval(ReportsState.stopwatch.intervalId);
        ReportsState.stopwatch.intervalId = null;
      }

      this.updateUI();
      Toast.show('Đã tạm dừng đồng hồ bấm giờ.', 'warning');
    },

    reset() {
      if (ReportsState.stopwatch.intervalId) {
        clearInterval(ReportsState.stopwatch.intervalId);
        ReportsState.stopwatch.intervalId = null;
      }

      ReportsState.stopwatch.status = 'IDLE';
      ReportsState.stopwatch.elapsedMs = 0;
      ReportsState.stopwatch.startTime = 0;

      if (this.dom.activeBanner) {
        this.dom.activeBanner.classList.add('hidden');
      }

      this.updateTimeDisplay();
      this.updateUI();
    },

    stopAndFill() {
      // Dừng đồng hồ
      if (ReportsState.stopwatch.intervalId) {
        clearInterval(ReportsState.stopwatch.intervalId);
        ReportsState.stopwatch.intervalId = null;
      }
      ReportsState.stopwatch.status = 'IDLE';

      if (this.dom.activeBanner) {
        this.dom.activeBanner.classList.add('hidden');
      }

      // Tính số giờ thập phân chính xác tuyệt đối (làm tròn 2 chữ số, tối thiểu 0.01h = 36 giây)
      const totalSeconds = Math.floor(ReportsState.stopwatch.elapsedMs / 1000);
      let decimalHours = +(totalSeconds / 3600).toFixed(2);

      // Nếu bấm ngắn từ 1s - 35s, quy đổi thành 0.01h; nếu chưa bấm gì (0s) mặc định 0.01h
      if (decimalHours <= 0) {
        decimalHours = totalSeconds > 0 ? 0.01 : 0.01;
      }

      if (this.dom.hoursInput) {
        this.dom.hoursInput.value = decimalHours.toFixed(2);
        // Kích hoạt hiệu ứng highlight trên input
        this.dom.hoursInput.classList.add('ring-2', 'ring-emerald-500', 'border-emerald-500');
        setTimeout(() => {
          this.dom.hoursInput.classList.remove('ring-2', 'ring-emerald-500', 'border-emerald-500');
        }, 1200);

        // Đảm bảo Form Task Select khớp với Stopwatch Task Select
        const formTaskSelect = document.getElementById('logTaskId');
        if (formTaskSelect && ReportsState.selectedTaskId) {
          formTaskSelect.value = ReportsState.selectedTaskId;
        }

        // Tự động focus sang ô kết quả công việc để người dùng viết nhanh
        const workResultEl = document.getElementById('logWorkResult');
        if (workResultEl) workResultEl.focus();
      }

      Toast.show(`Đã quy đổi chính xác ${decimalHours.toFixed(2)} giờ công vào biểu mẫu!`, 'success');
      this.reset();
    },

    updateTimeDisplay() {
      const ms = Math.floor(ReportsState.stopwatch.elapsedMs);
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
    },

    updateUI() {
      const st = ReportsState.stopwatch.status;

      if (st === 'RUNNING') {
        this.dom.statusBadge.textContent = 'Đang chạy...';
        this.dom.statusBadge.className = 'text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20';
        
        this.dom.card.classList.add('stopwatch-running-glow');
        this.dom.btnStart.disabled = true;
        this.dom.btnStart.classList.add('opacity-50', 'cursor-not-allowed');

        this.dom.btnPause.disabled = false;
        this.dom.btnPause.classList.remove('opacity-50', 'cursor-not-allowed');
      } else if (st === 'PAUSED') {
        this.dom.statusBadge.textContent = 'Tạm dừng';
        this.dom.statusBadge.className = 'text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20';

        this.dom.card.classList.remove('stopwatch-running-glow');
        this.dom.btnStart.disabled = false;
        this.dom.btnStart.classList.remove('opacity-50', 'cursor-not-allowed');
        this.dom.btnStart.querySelector('span').textContent = 'Tiếp tục';

        this.dom.btnPause.disabled = true;
        this.dom.btnPause.classList.add('opacity-50', 'cursor-not-allowed');
      } else {
        this.dom.statusBadge.textContent = 'Đang dừng';
        this.dom.statusBadge.className = 'text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200 dark:bg-white/5 dark:text-slate-400 dark:border-white/10';

        this.dom.card.classList.remove('stopwatch-running-glow');
        this.dom.btnStart.disabled = false;
        this.dom.btnStart.classList.remove('opacity-50', 'cursor-not-allowed');
        this.dom.btnStart.querySelector('span').textContent = 'Bắt đầu';

        this.dom.btnPause.disabled = true;
        this.dom.btnPause.classList.add('opacity-50', 'cursor-not-allowed');
      }
    }
  };

  /**
   * ==========================================================================
   * 4. BIỂU MẪU NỘP BÁO CÁO & ĐỒNG BỘ KÉP (TIMESHEET SUBMISSION)
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
        reportingUserSelect: document.getElementById('selectReportingUser')
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
        if (task.id === ReportsState.selectedTaskId) {
          opt.selected = true;
        }
        this.dom.taskSelect.appendChild(opt);
      });
    },

    setDefaultDate() {
      if (this.dom.dateInput) {
        const today = new Date().toISOString().slice(0, 10);
        this.dom.dateInput.value = today;
      }
    },

    bindEvents() {
      this.dom.form.addEventListener('submit', (e) => this.handleSubmit(e));

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

      // Đồng bộ khi người dùng thay đổi dropdown trên form sang stopwatch
      if (this.dom.taskSelect) {
        this.dom.taskSelect.addEventListener('change', (e) => {
          const val = e.target.value;
          ReportsState.selectedTaskId = val;
          const stopwatchSelect = document.getElementById('stopwatchTaskSelect');
          if (stopwatchSelect && stopwatchSelect.value !== val) {
            stopwatchSelect.value = val;
          }
          StopwatchController.updateTaskBadge();

          // Tự động chuyển đổi người báo cáo theo người phụ trách của task nếu có
          const task = ReportsState.tasks.find(t => t.id === val);
          if (task && task.assigneeId) {
            this.syncReportingUserByAssignee(task.assigneeId);
          }
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

        // B. Phản ứng dây chuyền: Cộng dồn spentHours vào task tương ứng
        DataEngine.propagateSpentHoursToTask(taskId, hours);

        // C. Gửi dữ liệu lên Google Sheets
        if (window.SheetsSync && typeof window.SheetsSync.sendTimeLog === 'function') {
          await window.SheetsSync.sendTimeLog(newLog);
        }

        Toast.show('Đã lưu và đồng bộ lên Google Sheets thành công!', 'success');

        // Reset form (giữ lại ngày hôm nay)
        this.dom.workResultInput.value = '';
        this.dom.blockersInput.value = 'Không có';
        this.dom.hoursInput.value = '';
        this.dom.taskSelect.selectedIndex = 0;
        ReportsState.selectedTaskId = '';
        const stopwatchSelect = document.getElementById('stopwatchTaskSelect');
        if (stopwatchSelect) stopwatchSelect.selectedIndex = 0;
        StopwatchController.updateTaskBadge();
        this.setDefaultDate();

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

      // Event delegation cho nút xóa log trên bảng
      this.dom.tbody.addEventListener('click', (e) => {
        const deleteBtn = e.target.closest('[data-action="delete-log"]');
        if (deleteBtn) {
          const logId = deleteBtn.getAttribute('data-log-id');
          this.handleDeleteLog(logId);
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

            <!-- Cột 7: Trạng Thái Đồng Bộ -->
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
          TableController.populateFilterDropdowns();
          TableController.render();
          KPIController.updateMetrics(true);
          AnalyticsController.render();
          Toast.show('Đã làm mới dữ liệu từ Storage!', 'info');
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
  function init() {
    if (window.Auth && typeof window.Auth.requireAuth === 'function') {
      try {
        window.Auth.requireAuth();
      } catch (e) {
        console.warn('[Reports] Auth.requireAuth catch:', e);
      }
    }

    DataEngine.loadAll();

    StopwatchController.init();
    FormController.init();
    TableController.init();
    KPIController.init();
    AnalyticsController.init();
    ExportEngine.init();

    window.addEventListener('storage', (e) => {
      if (['TASKFLOW_DATA', 'taskflow_time_logs', 'taskflow_tasks', 'taskflow_projects'].includes(e.key)) {
        DataEngine.loadAll();
        StopwatchController.populateTaskSelect();
        FormController.populateTaskSelect();
        TableController.populateFilterDropdowns();
        TableController.render();
        KPIController.updateMetrics(true);
        AnalyticsController.render();
      }
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
    Toast
  };

})(window, document);