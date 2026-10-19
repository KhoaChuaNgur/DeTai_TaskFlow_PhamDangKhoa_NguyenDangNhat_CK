/**
 * ==============================================================================
 * TASKFLOW STORAGE & THEME ENGINE (js/storage.js)
 * Mô tả: Hạt nhân lưu trữ LocalStorage & Quản lý Theme chống giật màn hình (Anti-flicker).
 * Kiến trúc: Vanilla JS (ES6+ Module Pattern), đóng gói an toàn trong window.TaskFlowStorage.
 * Tuân thủ: Rubric học phần, colorweb.md, skill.md và ai_detected.md.
 * Tác giả: Lead Frontend Engineer
 * ==============================================================================
 */

(function (window, document) {
  'use strict';

  /**
   * Bộ khóa định danh cho LocalStorage (Namespaced Keys tránh xung đột)
   */
  const STORAGE_KEYS = Object.freeze({
    THEME: 'taskflow_theme',
    PROJECTS: 'taskflow_projects',
    TASKS: 'taskflow_tasks',
    MEMBERS: 'taskflow_members',
    TIME_LOGS: 'taskflow_time_logs',
    CURRENT_USER: 'taskflow_current_user',
    SESSION: 'taskflow_session_meta'
  });

  /**
   * ==========================================================================
   * 1. STORAGE ENGINE (CRUD BỌC AN TOÀN TRONG TRY...CATCH)
   * ==========================================================================
   */
  const Storage = {
    /**
     * Lấy dữ liệu từ LocalStorage với JSON.parse an toàn
     * @param {string} key - Tên khóa lưu trữ
     * @param {*} defaultValue - Giá trị mặc định nếu khóa chưa tồn tại hoặc lỗi parse
     * @returns {*} Dữ liệu đã parse hoặc defaultValue
     */
    get(key, defaultValue = null) {
      if (!key || typeof key !== 'string') {
        console.warn('[TaskFlowStorage.get] Khóa không hợp lệ:', key);
        return defaultValue;
      }

      try {
        const item = window.localStorage.getItem(key);
        if (item === null || item === undefined) {
          return defaultValue;
        }
        return JSON.parse(item);
      } catch (error) {
        console.error(`[TaskFlowStorage.get] Lỗi giải mã JSON cho khóa "${key}":`, error);
        return defaultValue;
      }
    },

    /**
     * Ghi dữ liệu vào LocalStorage với JSON.stringify an toàn
     * @param {string} key - Tên khóa lưu trữ
     * @param {*} value - Dữ liệu cần lưu
     * @returns {boolean} True nếu lưu thành công, ngược lại False (VD: QuotaExceeded)
     */
    set(key, value) {
      if (!key || typeof key !== 'string') {
        console.warn('[TaskFlowStorage.set] Khóa không hợp lệ:', key);
        return false;
      }

      try {
        const serializedValue = JSON.stringify(value);
        window.localStorage.setItem(key, serializedValue);
        return true;
      } catch (error) {
        console.error(`[TaskFlowStorage.set] Lỗi tuần tự hóa hoặc hết hạn mức lưu trữ cho khóa "${key}":`, error);
        return false;
      }
    },

    /**
     * Xóa một khóa khỏi LocalStorage
     * @param {string} key - Tên khóa cần xóa
     * @returns {boolean}
     */
    remove(key) {
      if (!key || typeof key !== 'string') {
        return false;
      }

      try {
        window.localStorage.removeItem(key);
        return true;
      } catch (error) {
        console.error(`[TaskFlowStorage.remove] Lỗi khi xóa khóa "${key}":`, error);
        return false;
      }
    },

    /**
     * Xóa toàn bộ dữ liệu ứng dụng TaskFlow (phục vụ reset dữ liệu mẫu hoặc đăng xuất sạch)
     * @returns {boolean}
     */
    clearAppStorage() {
      try {
        Object.values(STORAGE_KEYS).forEach((key) => {
          window.localStorage.removeItem(key);
        });
        return true;
      } catch (error) {
        console.error('[TaskFlowStorage.clearAppStorage] Lỗi khi dọn sạch dữ liệu:', error);
        return false;
      }
    }
  };

  /**
   * ==========================================================================
   * 2. DỮ LIỆU MẪU CHUẨN DOANH NGHIỆP (ANTI-AI & THỰC TẾ)
   * Phù hợp quy chuẩn ai_detected.md: Tên công việc công nghệ cụ thể,
   * nhân sự thật (Phạm Đăng Khoa & Nguyễn Đăng Nhật), đủ 3 trạng thái Kanban.
   * ==========================================================================
   */
  const SEED_DATA = {
    // 2 Dự án công nghệ thực tế
    projects: [
      {
        id: 'proj-101',
        name: 'TaskFlow Platform Core 2026',
        code: 'TFP-2026',
        description: 'Hệ thống quản lý công việc và tiến độ dự án 60fps với kiến trúc Modular Vanilla JS và Glassmorphism UI.',
        status: 'active',
        progress: 68,
        startDate: '2026-10-01',
        deadline: '2026-11-20',
        members: ['mem-01', 'mem-02'],
        color: '#6366F1'
      },
      {
        id: 'proj-102',
        name: 'Cổng thanh toán & Tích hợp VNPay',
        code: 'VNPAY-GW',
        description: 'Xây dựng module thanh toán học phí/dịch vụ qua VNPay QR Code, bảo mật chữ ký điện tử SHA256 và IPN webhook.',
        status: 'planning',
        progress: 25,
        startDate: '2026-10-15',
        deadline: '2026-12-10',
        members: ['mem-01', 'mem-02'],
        color: '#8B5CF6'
      }
    ],

    // 2 Thành viên chính thức (RBAC: Admin & Member)
    members: [
      {
        id: 'mem-01',
        name: 'Phạm Đăng Khoa',
        role: 'Admin',
        title: 'Frontend Lead & System Architect',
        email: 'khoa.pham@taskflow.dev',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=KhoaPham&backgroundColor=6366f1',
        status: 'online'
      },
      {
        id: 'mem-02',
        name: 'Nguyễn Đăng Nhật',
        role: 'Member',
        title: 'Backend & Cloud Infrastructure Dev',
        email: 'nhat.nguyen@taskflow.dev',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=NhatNguyen&backgroundColor=8b5cf6',
        status: 'online'
      }
    ],

    // 4 Tasks phân bổ đủ 3 trạng thái todo / doing / done với các mức độ ưu tiên
    tasks: [
      {
        id: 'task-001',
        projectId: 'proj-101',
        title: 'Xây dựng hệ thống Design Tokens & Glassmorphism 60fps',
        description: 'Định nghĩa biến màu CSS Deep Slate, hiệu ứng Spring drop khi kéo thả và bố cục 3 cột Kanban tương thích màn hình nhỏ.',
        status: 'done',
        priority: 'medium',
        assigneeId: 'mem-01',
        startDate: '2026-10-10',
        dueDate: '2026-10-18',
        estimatedHours: 18,
        tags: ['Frontend', 'CSS Architect', 'DesignSystem']
      },
      {
        id: 'task-002',
        projectId: 'proj-102',
        title: 'Thiết kế luồng thanh toán VNPay & xác thực Checksum IPN',
        description: 'Mã hóa chữ ký SHA256 bảo mật giao dịch, cấu hình webhook trả về kết quả thời gian thực và xử lý hoàn tiền tự động.',
        status: 'doing',
        priority: 'critical', // Kích hoạt hiệu ứng pulseCritical
        assigneeId: 'mem-02',
        startDate: '2026-10-16',
        dueDate: '2026-10-24',
        estimatedHours: 24,
        tags: ['Backend', 'Security', 'VNPay']
      },
      {
        id: 'task-003',
        projectId: 'proj-101',
        title: 'Tối ưu hóa Database Query Indexing & Caching Redis',
        description: 'Thiết lập composite index cho bảng tác vụ theo (project_id, status), cấu hình Redis cache giảm 80% tải đọc.',
        status: 'todo',
        priority: 'high',
        assigneeId: 'mem-02',
        startDate: '2026-10-22',
        dueDate: '2026-10-31',
        estimatedHours: 14,
        tags: ['Database', 'Performance', 'Redis']
      },
      {
        id: 'task-004',
        projectId: 'proj-101',
        title: 'Kiểm thử bảo mật RBAC & Smart Idle Session Timeout',
        description: 'Kiểm tra phiên đăng nhập tự hủy sau 5 phút không hoạt động và tự động gia hạn 2 phút khi người dùng tương tác.',
        status: 'todo',
        priority: 'high',
        assigneeId: 'mem-01',
        startDate: '2026-10-20',
        dueDate: '2026-11-05',
        estimatedHours: 12,
        tags: ['Security', 'QA', 'Session']
      }
    ],

    // Bảng TimeLogs rỗng ban đầu, sẵn sàng cho module Stopwatch Timer và Timesheet logs
    timeLogs: []
  };

  /**
   * Khởi tạo cơ sở dữ liệu mẫu ban đầu nếu LocalStorage rỗng
   * @param {boolean} force - Ghi đè dữ liệu mẫu kể cả khi đã có
   * @returns {boolean} True nếu có thực hiện khởi tạo
   */
  function initDatabase(force = false) {
    const existingProjects = Storage.get(STORAGE_KEYS.PROJECTS);
    const existingTasks = Storage.get(STORAGE_KEYS.TASKS);

    const isDatabaseEmpty = !existingProjects || !existingTasks || existingProjects.length === 0;

    if (isDatabaseEmpty || force) {
      Storage.set(STORAGE_KEYS.PROJECTS, SEED_DATA.projects);
      Storage.set(STORAGE_KEYS.TASKS, SEED_DATA.tasks);
      Storage.set(STORAGE_KEYS.MEMBERS, SEED_DATA.members);
      Storage.set(STORAGE_KEYS.TIME_LOGS, SEED_DATA.timeLogs);

      console.info(
        '%c[TaskFlowStorage]%c Đã khởi tạo cơ sở dữ liệu mẫu ban đầu thành công (2 Projects, 4 Tasks, 2 Members, 0 TimeLogs).',
        'color: #6366F1; font-weight: bold;',
        'color: inherit;'
      );
      return true;
    }

    return false;
  }

  /**
   * ==========================================================================
   * 3. THEME MANAGER (DARK / LIGHT MODE & ANTI-FLICKER ENGINE)
   * ==========================================================================
   */
  const ThemeManager = {
    /**
     * Xác định theme mặc định:
     * 1. Ưu tiên cấu hình đã lưu trong LocalStorage.
     * 2. Nếu chưa lưu: Đọc thiết lập giao diện hệ thống (prefers-color-scheme).
     * 3. Mặc định cuối cùng: 'dark' theo chuẩn Deep Slate (colorweb.md).
     * @returns {'dark'|'light'}
     */
    resolveTheme() {
      const savedTheme = Storage.get(STORAGE_KEYS.THEME);
      if (savedTheme === 'dark' || savedTheme === 'light') {
        return savedTheme;
      }

      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
        return 'light';
      }

      return 'dark'; // Dark theme là mặc định theo colorweb.md
    },

    /**
     * Áp dụng theme lên DOM không gây chớp nháy (Anti-flicker)
     * Đồng bộ cả classList 'dark' và attribute 'data-theme' cho CSS Variables & Tailwind
     * @param {'dark'|'light'} theme
     */
    applyThemeToDOM(theme) {
      const root = document.documentElement;
      const isDark = theme === 'dark';

      // Cập nhật thuộc tính data-theme cho CSS Variables
      root.setAttribute('data-theme', theme);

      // Cập nhật class 'dark' cho Tailwind và 'light-theme' cho body
      if (isDark) {
        root.classList.add('dark');
        if (document.body) {
          document.body.classList.remove('light-theme');
        }
      } else {
        root.classList.remove('dark');
        if (document.body) {
          document.body.classList.add('light-theme');
        }
      }
    },

    /**
     * Khởi tạo theme khi nạp trang
     * @returns {'dark'|'light'} Theme được kích hoạt
     */
    initTheme() {
      const currentTheme = this.resolveTheme();
      this.applyThemeToDOM(currentTheme);
      return currentTheme;
    },

    /**
     * Lấy theme hiện tại
     * @returns {'dark'|'light'}
     */
    getTheme() {
      const currentAttr = document.documentElement.getAttribute('data-theme');
      return currentAttr === 'light' ? 'light' : 'dark';
    },

    /**
     * Đặt theme chỉ định
     * @param {'dark'|'light'} targetTheme
     * @returns {'dark'|'light'}
     */
    setTheme(targetTheme) {
      const theme = targetTheme === 'light' ? 'light' : 'dark';
      Storage.set(STORAGE_KEYS.THEME, theme);
      this.applyThemeToDOM(theme);

      // Phát sự kiện tùy biến themeChanged để các view/chart cập nhật lại màu sắc
      window.dispatchEvent(
        new CustomEvent('themeChanged', {
          detail: {
            theme,
            isDark: theme === 'dark'
          }
        })
      );

      return theme;
    },

    /**
     * Chuyển đổi qua lại giữa Dark và Light Mode
     * @returns {'dark'|'light'} Theme mới sau khi chuyển
     */
    toggleTheme() {
      const current = this.getTheme();
      const nextTheme = current === 'dark' ? 'light' : 'dark';
      return this.setTheme(nextTheme);
    }
  };

  /**
   * ==========================================================================
   * 4. THỰC THI ANTI-FLICKER & TỰ ĐỘNG KHỞI TẠO
   * ==========================================================================
   */
  // Kích hoạt theme ngay lập tức trong luồng thực thi để tránh giật giao diện
  ThemeManager.initTheme();

  // Khởi tạo cơ sở dữ liệu nếu cần
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initDatabase(false));
  } else {
    initDatabase(false);
  }

  /**
   * ==========================================================================
   * 5. ĐÓNG GÓI API VÀO NAMESPACE window.TaskFlowStorage
   * ==========================================================================
   */
  const TaskFlowStorage = {
    // CRUD Engine
    Storage,
    get: Storage.get.bind(Storage),
    set: Storage.set.bind(Storage),
    remove: Storage.remove.bind(Storage),
    clearAppStorage: Storage.clearAppStorage.bind(Storage),

    // Theme Engine
    ThemeManager,
    initTheme: ThemeManager.initTheme.bind(ThemeManager),
    toggleTheme: ThemeManager.toggleTheme.bind(ThemeManager),
    getTheme: ThemeManager.getTheme.bind(ThemeManager),
    setTheme: ThemeManager.setTheme.bind(ThemeManager),

    // Database Initialization
    initDatabase,
    SEED_DATA,

    // Storage Keys Constants
    KEYS: STORAGE_KEYS
  };

  // Gắn an toàn vào window
  window.TaskFlowStorage = TaskFlowStorage;

})(window, document);
