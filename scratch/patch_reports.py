import re

with open('js/reports.js', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Add saveTasks to DataEngine
save_tasks_code = '''    saveTasks(tasks) {
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
'''

if 'saveTasks(' not in code:
    code = code.replace('saveTimeLogs() {', save_tasks_code + '\n    saveTimeLogs() {', 1)
    print("Added saveTasks to DataEngine")

# 2. Update TableController.bindEvents delegation
old_delegation = '''      // Event delegation cho nút xóa log trên bảng
      this.dom.tbody.addEventListener('click', (e) => {
        const deleteBtn = e.target.closest('[data-action="delete-log"]');
        if (deleteBtn) {
          const logId = deleteBtn.getAttribute('data-log-id');
          this.handleDeleteLog(logId);
        }
      });'''

new_delegation = '''      // Event delegation cho nút xóa log và mở trao đổi bình luận trên bảng
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
      });'''

if old_delegation in code:
    code = code.replace(old_delegation, new_delegation, 1)
    print("Updated TableController delegation")
else:
    print("WARNING: old_delegation not found")

# 3. Update render table rows in TableController
# Let's inspect where blockers and sheets synced are
row_target = '''            <!-- Cột 6: Trở Ngại (Blockers) -->
            <td class="py-3 px-4 whitespace-nowrap">
              ${blockerBadge}
            </td>

            <!-- Cột 7: Trạng Thái Đồng Bộ -->'''

row_replacement = '''            <!-- Cột 6: Trở Ngại (Blockers) -->
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

            <!-- Cột 8: Trạng Thái Đồng Bộ -->'''

if row_target in code:
    code = code.replace(row_target, row_replacement, 1)
    print("Replaced row_target with 9-column row")
else:
    print("WARNING: row_target not found")

# Also in rowsHtml = filtered.map(log => { ... }), find comments for this task
map_top_target = '''        const hasBlocker = log.blockers && log.blockers.toLowerCase() !== 'không có' && log.blockers.trim() !== '';'''
map_top_replacement = '''        const task = ReportsState.tasks.find(t => t.id === log.taskId);
        const comments = (task && Array.isArray(task.comments)) ? task.comments : [];
        const latestComment = comments.length > 0 ? comments[comments.length - 1] : null;

        const hasBlocker = log.blockers && log.blockers.toLowerCase() !== 'không có' && log.blockers.trim() !== '';'''

if map_top_target in code:
    code = code.replace(map_top_target, map_top_replacement, 1)
    print("Added task & comments lookup to map")
else:
    print("WARNING: map_top_target not found")

# 4. Add DiscussionController
discussion_controller_code = '''  /**
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

'''

if 'const DiscussionController =' not in code:
    code = code.replace('  /**\n   * ==========================================================================\n   * 8. CÔNG CỤ XUẤT BÁO CÁO', discussion_controller_code + '  /**\n   * ==========================================================================\n   * 8. CÔNG CỤ XUẤT BÁO CÁO', 1)
    print("Added DiscussionController definition")

# 5. Update init() in reports.js
init_target = '''    DataEngine.loadAll();

    StopwatchController.init();
    FormController.init();
    TableController.init();
    KPIController.init();
    AnalyticsController.init();
    ExportEngine.init();'''

init_replacement = '''    DataEngine.loadAll();

    StopwatchController.init();
    FormController.init();
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
    }'''

if init_target in code:
    code = code.replace(init_target, init_replacement, 1)
    print("Updated init() with DiscussionController and ?taskId= param handler")
else:
    print("WARNING: init_target not found")

# 6. Add DiscussionController to window.TaskFlowReports
api_target = '''  window.TaskFlowReports = {
    DataEngine,
    StopwatchController,
    FormController,
    TableController,
    KPIController,
    AnalyticsController,
    ExportEngine,
    Toast
  };'''

api_replacement = '''  window.TaskFlowReports = {
    DataEngine,
    StopwatchController,
    FormController,
    TableController,
    KPIController,
    AnalyticsController,
    ExportEngine,
    DiscussionController,
    Toast
  };'''

if api_target in code:
    code = code.replace(api_target, api_replacement, 1)
    print("Added DiscussionController to window.TaskFlowReports")

with open('js/reports.js', 'w', encoding='utf-8') as f:
    f.write(code)

print("Patching complete!")
