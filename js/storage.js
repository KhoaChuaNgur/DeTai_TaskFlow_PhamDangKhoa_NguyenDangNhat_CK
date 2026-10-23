/**
 * ==============================================================================
 * TASKFLOW STORAGE & REPORTING DATA ENGINE (js/storage.js)
 * Mô tả: Hạt nhân lưu trữ dữ liệu, Quản lý Theme chống chớp giật (Anti-flicker),
 *        Hệ thống Nhật ký kiểm toán (Audit Trail / Activity Logs) &
 *        Bộ tổng hợp số liệu Báo cáo (Reporting Aggregation Engine).
 * Nhiệm vụ:
 *   1. Quản lý lưu trữ LocalStorage bọc try/catch an toàn & đồng bộ 2 chiều TASKFLOW_DATA.
 *   2. Theme Manager: Khởi tạo Dark/Light mode không giật màn hình (Anti-flicker).
 *   3. Cung cấp dữ liệu mẫu (Seed Data) chuẩn mực: Projects, Tasks, Members, TimeLogs, ActivityLogs.
 *   4. Tự động cấp phát Dự án Khởi Đầu (Onboarding & Training) cho người dùng mới.
 *   5. ActivityLogger Engine: Ghi nhận và truy xuất nhật ký thao tác toàn hệ thống (Audit Trail).
 *   6. TimeTracker Engine: Ghi nhận và truy xuất giờ làm việc thực tế (Timesheet / Stopwatch).
 *   7. ReportingEngine: Cung cấp API tổng hợp báo cáo 1-chạm (getReportsSummary) & Xuất CSV UTF-8.
 * Tuân thủ: Rubric học phần, colorweb.md, skill.md và ai_detected.md.
 * Tác giả: Lead Frontend Architect & Performance Specialist
 * ==============================================================================
 */

(function (window, document) {
  'use strict';

  /**
   * Bộ khóa định danh cho LocalStorage (Namespaced Keys tránh xung đột & đồng bộ toàn hệ thống)
   */
  const STORAGE_KEYS = Object.freeze({
    THEME: 'taskflow_theme',
    LEGACY_THEME: 'TASKFLOW_THEME',
    PROJECTS: 'taskflow_projects',
    TASKS: 'taskflow_tasks',
    MEMBERS: 'taskflow_members',
    TIME_LOGS: 'taskflow_time_logs',
    ACTIVITY_LOGS: 'taskflow_activity_logs',
    CURRENT_USER: 'currentUser',
    LEGACY_USER: 'TASKFLOW_USER',
    NAMESPACED_USER: 'taskflow_current_user',
    SESSION: 'TASKFLOW_SESSION',
    SESSION_META: 'taskflow_session_meta',
    TASKFLOW_DATA: 'TASKFLOW_DATA'
  });

  /**
   * ==========================================================================
   * 1. STORAGE ENGINE (CRUD BỌC AN TOÀN TRONG TRY...CATCH & ĐỒNG BỘ 2 CHIỀU)
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
          // Nếu không tìm thấy ở subkey riêng, thử tìm trong TASKFLOW_DATA bundle
          if (
            key === STORAGE_KEYS.PROJECTS ||
            key === STORAGE_KEYS.TASKS ||
            key === STORAGE_KEYS.MEMBERS ||
            key === STORAGE_KEYS.TIME_LOGS ||
            key === STORAGE_KEYS.ACTIVITY_LOGS
          ) {
            const rawBundle = window.localStorage.getItem(STORAGE_KEYS.TASKFLOW_DATA);
            if (rawBundle) {
              const bundle = JSON.parse(rawBundle);
              if (key === STORAGE_KEYS.PROJECTS && Array.isArray(bundle.projects)) return bundle.projects;
              if (key === STORAGE_KEYS.TASKS && Array.isArray(bundle.tasks)) return bundle.tasks;
              if (key === STORAGE_KEYS.MEMBERS && Array.isArray(bundle.members)) return bundle.members;
              if (key === STORAGE_KEYS.TIME_LOGS && Array.isArray(bundle.timeLogs)) return bundle.timeLogs;
              if (key === STORAGE_KEYS.ACTIVITY_LOGS && Array.isArray(bundle.activityLogs)) return bundle.activityLogs;
            }
          }
          return defaultValue;
        }
        return JSON.parse(item);
      } catch (error) {
        console.error(`[TaskFlowStorage.get] Lỗi giải mã JSON cho khóa "${key}":`, error);
        return defaultValue;
      }
    },

    /**
     * Ghi dữ liệu vào LocalStorage với JSON.stringify an toàn & TỰ ĐỘNG ĐỒNG BỘ 2 CHIỀU
     * @param {string} key - Tên khóa lưu trữ
     * @param {*} value - Dữ liệu cần lưu
     * @returns {boolean} True nếu lưu thành công
     */
    set(key, value) {
      if (!key || typeof key !== 'string') {
        console.warn('[TaskFlowStorage.set] Khóa không hợp lệ:', key);
        return false;
      }

      try {
        const serializedValue = JSON.stringify(value);
        window.localStorage.setItem(key, serializedValue);

        // Tự động đồng bộ hai chiều với key tổng hợp TASKFLOW_DATA
        if ([
          STORAGE_KEYS.PROJECTS,
          STORAGE_KEYS.TASKS,
          STORAGE_KEYS.MEMBERS,
          STORAGE_KEYS.TIME_LOGS,
          STORAGE_KEYS.ACTIVITY_LOGS
        ].includes(key)) {
          let bundle = {};
          try {
            const rawBundle = window.localStorage.getItem(STORAGE_KEYS.TASKFLOW_DATA);
            bundle = rawBundle ? JSON.parse(rawBundle) : {};
          } catch (e) {
            bundle = {};
          }

          if (key === STORAGE_KEYS.PROJECTS) bundle.projects = value;
          if (key === STORAGE_KEYS.TASKS) bundle.tasks = value;
          if (key === STORAGE_KEYS.MEMBERS) bundle.members = value;
          if (key === STORAGE_KEYS.TIME_LOGS) bundle.timeLogs = value;
          if (key === STORAGE_KEYS.ACTIVITY_LOGS) bundle.activityLogs = value;

          window.localStorage.setItem(STORAGE_KEYS.TASKFLOW_DATA, JSON.stringify(bundle));
        }

        // Tự động đồng bộ hai chiều nếu ghi trực tiếp vào TASKFLOW_DATA
        if (key === STORAGE_KEYS.TASKFLOW_DATA && typeof value === 'object' && value !== null) {
          if (Array.isArray(value.projects)) {
            window.localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(value.projects));
          }
          if (Array.isArray(value.tasks)) {
            window.localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(value.tasks));
          }
          if (Array.isArray(value.members)) {
            window.localStorage.setItem(STORAGE_KEYS.MEMBERS, JSON.stringify(value.members));
          }
          if (Array.isArray(value.timeLogs)) {
            window.localStorage.setItem(STORAGE_KEYS.TIME_LOGS, JSON.stringify(value.timeLogs));
          }
          if (Array.isArray(value.activityLogs)) {
            window.localStorage.setItem(STORAGE_KEYS.ACTIVITY_LOGS, JSON.stringify(value.activityLogs));
          }
        }

        return true;
      } catch (error) {
        console.error(`[TaskFlowStorage.set] Lỗi tuần tự hóa hoặc hết hạn mức lưu trữ cho khóa "${key}":`, error);
        return false;
      }
    },

    /**
     * Xóa một khóa chỉ định
     * @param {string} key - Tên khóa cần xóa
     * @returns {boolean} True nếu xóa thành công
     */
    remove(key) {
      if (!key || typeof key !== 'string') return false;
      try {
        window.localStorage.removeItem(key);
        return true;
      } catch (error) {
        console.error(`[TaskFlowStorage.remove] Lỗi xóa khóa "${key}":`, error);
        return false;
      }
    },

    /**
     * Xóa sạch toàn bộ dữ liệu thuộc ứng dụng TaskFlow (giữ nguyên các dữ liệu hệ thống khác)
     */
    clearAppStorage() {
      Object.values(STORAGE_KEYS).forEach((k) => {
        try {
          window.localStorage.removeItem(k);
        } catch (e) {
          console.warn('[TaskFlowStorage.clearAppStorage] Lỗi xóa subkey:', k, e);
        }
      });
    }
  };

  /**
   * ==========================================================================
   * 2. DỮ LIỆU MẪU BAN ĐẦU (SEED DATA CHUẨN MỰC BẢO TOÀN TÀI KHOẢN & SẴN SÀNG BÁO CÁO)
   * ==========================================================================
   */
  const SEED_DATA = {
    // 2 Thành viên chính của đồ án (Được bảo toàn nguyên vẹn)
    members: [
      {
        id: 'mem-01',
        name: 'Phạm Đăng Khoa',
        email: 'admin@taskflow.dev',
        role: 'admin',
        title: 'Lead Frontend Architect',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=KhoaPham&backgroundColor=6366f1'
      },
      {
        id: 'mem-02',
        name: 'Nguyễn Đăng Nhật',
        email: 'member@taskflow.dev',
        role: 'member',
        title: 'Fullstack Engineer & Analytics Lead',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=NhatNguyen&backgroundColor=10b981'
      }
    ],

    // 2 Dự án mẫu ban đầu
    projects: [
      {
        id: 'proj-101',
        name: 'Hệ thống Quản trị Dự án TaskFlow Core',
        code: 'CORE-2026',
        category: 'Agile Software Development',
        description: 'Phát triển nền tảng quản trị luồng công việc Agile/Kanban chuyên nghiệp, hỗ trợ kéo thả thẻ việc 60fps, đồng bộ Google Sheets thời gian thực và quản lý nhịp tim phiên ngân hàng.',
        status: 'active',
        progress: 75,
        startDate: '2026-10-15',
        deadline: '2026-11-15T18:00:00.000Z',
        ownerId: 'mem-01',
        members: ['mem-01', 'mem-02'],
        color: '#6366F1'
      },
      {
        id: 'proj-102',
        name: 'Cổng Thanh Toán Trực Tuyến E-Commerce',
        code: 'PAY-INTEG',
        category: 'Financial Technology (Fintech)',
        description: 'Tích hợp cổng thanh toán trực tuyến bảo mật đa tầng, kết nối webhook VNPay/Momo, chống tấn công giả mạo CSRF và tự động đối soát giao dịch thời gian thực.',
        status: 'active',
        progress: 45,
        startDate: '2026-10-18',
        deadline: '2026-11-30T18:00:00.000Z',
        ownerId: 'mem-02',
        members: ['mem-02', 'mem-01'],
        color: '#8B5CF6'
      }
    ],

    // 4 Tác vụ mẫu ban đầu
    tasks: [
      {
        id: 'task-001',
        projectId: 'proj-101',
        title: 'Xây dựng giao diện Bảng Kanban & kéo thả 60fps',
        description: 'Hiện thực hóa các cột trạng thái To Do, Doing, Done với hiệu ứng Spring Drop chuẩn Trello, hỗ trợ đa phân công và đồng bộ tiến độ thời gian thực.',
        status: 'done',
        priority: 'high',
        assigneeId: 'mem-01',
        startDate: '2026-10-15',
        dueDate: '2026-10-22',
        estimatedHours: 16,
        tags: ['Frontend', 'Kanban', 'UI/UX'],
        evidence: {
          doneUrl: 'https://github.com/KhoaChuaNgur/DeTai_TaskFlow_PhamDangKhoa_NguyenDangNhat_CK',
          doneNote: 'Đã hoàn thiện kéo thả HTML5 mượt mà 60fps và đồng bộ LocalStorage.',
          isApproved: true,
          approvedBy: 'Phạm Đăng Khoa',
          approvedAt: '2026-10-22 17:00'
        }
      },
      {
        id: 'task-002',
        projectId: 'proj-102',
        title: 'Thiết kế luồng thanh toán VNPay & xác thực Checksum IPN',
        description: 'Mã hóa chữ ký SHA256 bảo mật giao dịch, cấu hình webhook trả về kết quả thời gian thực và xử lý hoàn tiền tự động.',
        status: 'doing',
        priority: 'critical',
        assigneeId: 'mem-02',
        startDate: '2026-10-16',
        dueDate: '2026-10-24',
        estimatedHours: 24,
        tags: ['Backend', 'Security', 'VNPay'],
        evidence: {
          inProgressUrl: 'https://sandbox.vnpayment.vn/apis',
          inProgressNote: 'Đang kết nối thử nghiệm trên môi trường Sandbox VNPay.'
        }
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

    // Nhật ký chấm công & bấm giờ mẫu (Timesheet / Time Logs)
    timeLogs: [
      {
        id: 'time-001',
        taskId: 'task-001',
        taskTitle: 'Xây dựng giao diện Bảng Kanban & kéo thả 60fps',
        projectId: 'proj-101',
        projectName: 'Hệ thống Quản trị Dự án TaskFlow Core',
        userId: 'mem-01',
        userName: 'Phạm Đăng Khoa',
        spentHours: 4.5,
        date: '2026-10-20',
        timestamp: '2026-10-20T10:30:00.000Z',
        type: 'stopwatch',
        note: 'Dựng khung Kanban board 3 cột và cấu hình CSS Grid'
      },
      {
        id: 'time-002',
        taskId: 'task-001',
        taskTitle: 'Xây dựng giao diện Bảng Kanban & kéo thả 60fps',
        projectId: 'proj-101',
        projectName: 'Hệ thống Quản trị Dự án TaskFlow Core',
        userId: 'mem-01',
        userName: 'Phạm Đăng Khoa',
        spentHours: 3.5,
        date: '2026-10-21',
        timestamp: '2026-10-21T14:45:00.000Z',
        type: 'stopwatch',
        note: 'Tối ưu hiệu ứng kéo thả Spring Drop 60fps'
      },
      {
        id: 'time-003',
        taskId: 'task-002',
        taskTitle: 'Thiết kế luồng thanh toán VNPay & xác thực Checksum IPN',
        projectId: 'proj-102',
        projectName: 'Cổng Thanh Toán Trực Tuyến E-Commerce',
        userId: 'mem-02',
        userName: 'Nguyễn Đăng Nhật',
        spentHours: 6.0,
        date: '2026-10-21',
        timestamp: '2026-10-21T16:00:00.000Z',
        type: 'stopwatch',
        note: 'Mã hóa chữ ký SHA256 và thử nghiệm kết nối Sandbox'
      },
      {
        id: 'time-004',
        taskId: 'task-002',
        taskTitle: 'Thiết kế luồng thanh toán VNPay & xác thực Checksum IPN',
        projectId: 'proj-102',
        projectName: 'Cổng Thanh Toán Trực Tuyến E-Commerce',
        userId: 'mem-02',
        userName: 'Nguyễn Đăng Nhật',
        spentHours: 4.0,
        date: '2026-10-22',
        timestamp: '2026-10-22T11:15:00.000Z',
        type: 'stopwatch',
        note: 'Xây dựng IPN listener và xử lý phản hồi thời gian thực'
      },
      {
        id: 'time-005',
        taskId: 'task-003',
        taskTitle: 'Tối ưu hóa Database Query Indexing & Caching Redis',
        projectId: 'proj-101',
        projectName: 'Hệ thống Quản trị Dự án TaskFlow Core',
        userId: 'mem-02',
        userName: 'Nguyễn Đăng Nhật',
        spentHours: 3.0,
        date: '2026-10-22',
        timestamp: '2026-10-22T15:30:00.000Z',
        type: 'manual',
        note: 'Nghiên cứu mô hình indexing B-Tree và cấu hình bộ đệm Redis'
      },
      {
        id: 'time-006',
        taskId: 'task-004',
        taskTitle: 'Kiểm thử bảo mật RBAC & Smart Idle Session Timeout',
        projectId: 'proj-101',
        projectName: 'Hệ thống Quản trị Dự án TaskFlow Core',
        userId: 'mem-01',
        userName: 'Phạm Đăng Khoa',
        spentHours: 5.0,
        date: '2026-10-23',
        timestamp: '2026-10-23T09:00:00.000Z',
        type: 'stopwatch',
        note: 'Kiểm thử nhịp tim phiên 5 phút và cơ chế chống sửa trộm form'
      }
    ],

    // Nhật ký hoạt động kiểm toán mẫu (Audit Trail / Activity Logs)
    activityLogs: [
      {
        id: 'act-001',
        timestamp: '2026-10-20T08:00:00.000Z',
        userId: 'mem-01',
        userName: 'Phạm Đăng Khoa',
        userAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=KhoaPham&backgroundColor=6366f1',
        userRole: 'admin',
        action: 'PROJECT_CREATE',
        entityType: 'project',
        entityId: 'proj-101',
        entityTitle: 'Hệ thống Quản trị Dự án TaskFlow Core',
        details: 'Khởi tạo không gian dự án mới với mã định danh [CORE-2026]'
      },
      {
        id: 'act-002',
        timestamp: '2026-10-20T08:15:00.000Z',
        userId: 'mem-01',
        userName: 'Phạm Đăng Khoa',
        userAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=KhoaPham&backgroundColor=6366f1',
        userRole: 'admin',
        action: 'TASK_CREATE',
        entityType: 'task',
        entityId: 'task-001',
        entityTitle: 'Xây dựng giao diện Bảng Kanban & kéo thả 60fps',
        details: 'Tạo công việc mới và phân công cho Phạm Đăng Khoa'
      },
      {
        id: 'act-003',
        timestamp: '2026-10-21T09:30:00.000Z',
        userId: 'mem-02',
        userName: 'Nguyễn Đăng Nhật',
        userAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=NhatNguyen&backgroundColor=10b981',
        userRole: 'member',
        action: 'TASK_MOVE',
        entityType: 'task',
        entityId: 'task-002',
        entityTitle: 'Thiết kế luồng thanh toán VNPay & xác thực Checksum IPN',
        details: 'Chuyển trạng thái công việc từ "Chờ thực hiện" sang "Đang làm (Doing)"'
      },
      {
        id: 'act-004',
        timestamp: '2026-10-21T17:00:00.000Z',
        userId: 'mem-01',
        userName: 'Phạm Đăng Khoa',
        userAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=KhoaPham&backgroundColor=6366f1',
        userRole: 'admin',
        action: 'TASK_EVIDENCE_SUBMIT',
        entityType: 'task',
        entityId: 'task-001',
        entityTitle: 'Xây dựng giao diện Bảng Kanban & kéo thả 60fps',
        details: 'Nộp bằng chứng nghiệm thu hoàn thành: link demo https://taskflow.dev/demo'
      },
      {
        id: 'act-005',
        timestamp: '2026-10-22T10:00:00.000Z',
        userId: 'mem-01',
        userName: 'Phạm Đăng Khoa',
        userAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=KhoaPham&backgroundColor=6366f1',
        userRole: 'admin',
        action: 'TASK_APPROVE',
        entityType: 'task',
        entityId: 'task-001',
        entityTitle: 'Xây dựng giao diện Bảng Kanban & kéo thả 60fps',
        details: 'Phê duyệt nghiệm thu công việc và chốt hoàn thành 100%'
      },
      {
        id: 'act-006',
        timestamp: '2026-10-23T08:30:00.000Z',
        userId: 'mem-02',
        userName: 'Nguyễn Đăng Nhật',
        userAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=NhatNguyen&backgroundColor=10b981',
        userRole: 'member',
        action: 'STOPWATCH_LOG',
        entityType: 'time_log',
        entityId: 'time-004',
        entityTitle: 'Thiết kế luồng thanh toán VNPay & xác thực Checksum IPN',
        details: 'Ghi nhận 4.0 giờ làm việc thực tế từ đồng hồ bấm giờ Stopwatch'
      }
    ]
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
      Storage.set(STORAGE_KEYS.ACTIVITY_LOGS, SEED_DATA.activityLogs);

      const bundle = {
        projects: SEED_DATA.projects,
        tasks: SEED_DATA.tasks,
        members: SEED_DATA.members,
        timeLogs: SEED_DATA.timeLogs,
        activityLogs: SEED_DATA.activityLogs
      };
      window.localStorage.setItem(STORAGE_KEYS.TASKFLOW_DATA, JSON.stringify(bundle));

      console.info(
        '%c[TaskFlowStorage]%c Đã khởi tạo cơ sở dữ liệu mẫu ban đầu thành công (2 Projects, 4 Tasks, 2 Members, 6 TimeLogs, 6 ActivityLogs) đồng bộ 2 chiều.',
        'color: #6366F1; font-weight: bold;',
        'color: inherit;'
      );
      return true;
    }

    // Nếu database đã có dự án nhưng chưa có timeLogs hoặc activityLogs (do nâng cấp từ phiên bản trước)
    // Tự động bổ sung seed cho 2 bảng này để Trang 5 không bị trống dữ liệu
    const existingTimeLogs = Storage.get(STORAGE_KEYS.TIME_LOGS);
    if (!existingTimeLogs || existingTimeLogs.length === 0) {
      Storage.set(STORAGE_KEYS.TIME_LOGS, SEED_DATA.timeLogs);
    }

    const existingActivityLogs = Storage.get(STORAGE_KEYS.ACTIVITY_LOGS);
    if (!existingActivityLogs || existingActivityLogs.length === 0) {
      Storage.set(STORAGE_KEYS.ACTIVITY_LOGS, SEED_DATA.activityLogs);
    }

    return false;
  }

  /**
   * Tự động khởi tạo Dự Án Khởi Đầu (Onboarding & Training) cho người dùng mới
   * Giúp người dùng trải nghiệm thực tế ngay lập tức với các task mẫu có thể thao tác và xóa được.
   * @param {Object} user - Đối tượng currentUser { id, name, email, role, ... }
   * @returns {Object|null} Dự án onboarding nếu vừa tạo, hoặc null nếu người dùng đã có dự án
   */
  function ensureUserOnboarding(user) {
    if (!user || !user.id) return null;

    // Nếu là admin@taskflow.dev hoặc member@taskflow.dev (tài khoản demo) thì dùng dữ liệu mẫu
    if (user.email === 'admin@taskflow.dev' || user.email === 'member@taskflow.dev') return null;

    const projects = Storage.get(STORAGE_KEYS.PROJECTS, []);
    const tasks = Storage.get(STORAGE_KEYS.TASKS, []);

    // Kiểm tra xem người dùng này đã có dự án nào thuộc về mình hay chưa (chủ dự án hoặc thành viên)
    const hasMyProject = projects.some((p) => {
      const isOwner = p.ownerId === user.id;
      const isMember = Array.isArray(p.members) && p.members.includes(user.id);
      return isOwner || isMember;
    });

    if (hasMyProject) return null;

    // Người dùng mới chưa có dự án nào -> Tạo ngay Dự Án Khởi Đầu (Training)
    const welcomeProjectId = 'proj-welcome-' + user.id;
    const nowIso = new Date().toISOString();
    const todayStr = nowIso.split('T')[0];
    const deadlineStr = new Date(Date.now() + 14 * 86400000).toISOString();

    const welcomeProject = {
      id: welcomeProjectId,
      name: '🚀 Chào Mừng Bạn Đến Với TaskFlow (Dự Án Khởi Đầu)',
      code: 'PRJ-START',
      category: 'Onboarding & Training',
      description: 'Dự án mẫu hướng dẫn bạn làm quen hệ thống TaskFlow: thử kéo thả thẻ Kanban, bấm giờ Stopwatch và theo dõi tiến độ. Bạn có thể xóa dự án này khi đã thành thạo!',
      status: 'active',
      progress: 25,
      startDate: todayStr,
      deadline: deadlineStr,
      ownerId: user.id,
      members: [user.id],
      color: '#6366F1',
      isOnboarding: true
    };

    const welcomeTasks = [
      {
        id: 'task-ob-1-' + user.id,
        projectId: welcomeProjectId,
        title: '📝 Bước 1: Khám phá cách kéo thả thẻ trên bảng việc Kanban',
        description: 'Vào menu Bảng Kanban, thử nhấn giữ và kéo thả thẻ này sang cột "Đang làm" hoặc "Hoàn thành" để trải nghiệm hiệu ứng kéo thả mượt mà.',
        status: 'todo',
        priority: 'medium',
        assigneeId: user.id,
        startDate: todayStr,
        dueDate: new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0],
        estimatedHours: 2,
        tags: ['Hướng Dẫn', 'Kanban']
      },
      {
        id: 'task-ob-2-' + user.id,
        projectId: welcomeProjectId,
        title: '⏱️ Bước 2: Bật đồng hồ Stopwatch để ghi nhận giờ làm thực tế',
        description: 'Nhấn vào thẻ công việc để mở chi tiết và bật tính năng bấm giờ. Thời gian làm việc sẽ tự động cập nhật lên biểu đồ Dashboard.',
        status: 'doing',
        priority: 'high',
        assigneeId: user.id,
        startDate: todayStr,
        dueDate: new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0],
        estimatedHours: 4,
        tags: ['Stopwatch', 'Báo Cáo']
      },
      {
        id: 'task-ob-3-' + user.id,
        projectId: welcomeProjectId,
        title: '⚡ Bước 3: Xem cảnh báo thẻ khẩn cấp (Critical Priority Pulse)',
        description: 'Thẻ này có độ ưu tiên Khẩn cấp (Critical) nên sẽ hiển thị viền nhấp nháy đỏ trên Dashboard để nhắc bạn hoàn thành sớm.',
        status: 'doing',
        priority: 'critical',
        assigneeId: user.id,
        startDate: todayStr,
        dueDate: new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0],
        estimatedHours: 3,
        tags: ['Ưu Tiên', 'Critical']
      },
      {
        id: 'task-ob-4-' + user.id,
        projectId: welcomeProjectId,
        title: '🎉 Bước 4: Chúc mừng bạn đã hoàn thành nhiệm vụ làm quen!',
        description: 'Bạn đã làm quen thành công với TaskFlow. Khi đã quen, bạn có thể bấm nút Xóa dự án này tại trang "Dự Án" để tạo không gian mới.',
        status: 'done',
        priority: 'low',
        assigneeId: user.id,
        startDate: todayStr,
        dueDate: todayStr,
        estimatedHours: 1,
        tags: ['Thành Công', 'Khởi Đầu']
      }
    ];

    projects.push(welcomeProject);
    const updatedTasks = [...tasks, ...welcomeTasks];

    Storage.set(STORAGE_KEYS.PROJECTS, projects);
    Storage.set(STORAGE_KEYS.TASKS, updatedTasks);

    // Ghi sẵn 1 log hoạt động khởi tạo dự án cho người dùng mới
    ActivityLogger.log({
      action: 'PROJECT_CREATE',
      entityType: 'project',
      entityId: welcomeProjectId,
      entityTitle: welcomeProject.name,
      details: 'Khởi tạo Dự án Khởi Đầu (Onboarding Training) cho người dùng mới',
      user: user
    });

    console.info(
      `%c[TaskFlowStorage]%c Đã tự động khởi tạo Dự Án Khởi Đầu Onboarding cho người dùng "${user.name}" (${user.email}).`,
      'color: #10B981; font-weight: bold;',
      'color: inherit;'
    );

    return welcomeProject;
  }

  /**
   * Truy xuất danh sách dự án thuộc phạm vi liên quan của User (Làm chủ hoặc Tham gia)
   * Tuyệt đối không để lộ dự án của người ngoài
   */
  function getUserProjects(userId) {
    if (!userId) return [];
    const projects = Storage.get(STORAGE_KEYS.PROJECTS, []);
    return projects.filter(p => p && (p.ownerId === userId || (Array.isArray(p.members) && p.members.includes(userId))));
  }

  /**
   * Truy xuất danh sách công việc thuộc phạm vi các dự án User có mặt
   */
  function getUserTasks(userId, filterMode = 'all-accessible') {
    if (!userId) return [];
    const userProjects = getUserProjects(userId);
    const allowedProjectIds = new Set(userProjects.map(p => p.id));
    const allTasks = Storage.get(STORAGE_KEYS.TASKS, []);
    const inScopeTasks = allTasks.filter(t => allowedProjectIds.has(t.projectId));

    if (filterMode === 'my-tasks-only') {
      return inScopeTasks.filter(t => t.assigneeId === userId || (t.subtasks || []).some(s => (s.assigneeIds || []).includes(userId)));
    }
    return inScopeTasks;
  }

  /**
   * ==========================================================================
   * DANH BẠ CỘNG TÁC VIÊN GẦN ĐÂY & TÌM THÀNH VIÊN THEO GMAIL
   * Không hiển thị mặc định người lạ; chỉ gợi ý những ai đã từng làm việc cùng
   * ==========================================================================
   */
  function getRecentCollaborators(userId) {
    if (!userId) return [];
    try {
      const raw = localStorage.getItem('taskflow_collaborators_' + userId);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {}
    return [];
  }

  function addRecentCollaborator(userId, collaborator) {
    if (!userId || !collaborator || !collaborator.email) return;
    try {
      let list = getRecentCollaborators(userId);
      const normEmail = collaborator.email.toLowerCase().trim();
      list = list.filter(c => (c.email || '').toLowerCase().trim() !== normEmail);
      list.unshift({
        id: collaborator.id || ('collab-' + Date.now()),
        name: collaborator.name || normEmail.split('@')[0],
        email: normEmail,
        avatar: collaborator.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(normEmail)}`,
        addedAt: new Date().toISOString()
      });
      list = list.slice(0, 20); // Giữ tối đa 20 người gần nhất
      localStorage.setItem('taskflow_collaborators_' + userId, JSON.stringify(list));
    } catch (e) {}
  }

  function findUserByEmail(email) {
    if (!email) return null;
    const norm = email.toLowerCase().trim();
    const members = Storage.get(STORAGE_KEYS.MEMBERS, []);
    let found = members.find(m => (m.email || '').toLowerCase().trim() === norm);
    if (!found && Array.isArray(SEED_DATA.members)) {
      found = SEED_DATA.members.find(m => (m.email || '').toLowerCase().trim() === norm);
    }
    return found || null;
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
      const savedTheme = Storage.get(STORAGE_KEYS.THEME) || window.localStorage.getItem(STORAGE_KEYS.LEGACY_THEME);
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
      window.localStorage.setItem(STORAGE_KEYS.LEGACY_THEME, theme);
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
   * 4. HỆ THỐNG GHI NHẬT KÝ KIỂM TOÁN (AUDIT TRAIL / ACTIVITY LOGGING ENGINE)
   * Phục vụ Trang 5: Báo Cáo & Logs
   * ==========================================================================
   */
  const ActivityLogger = {
    /**
     * Ghi nhận một hành động vào nhật ký hệ thống
     * @param {Object} params
     * @param {string} params.action - PROJECT_CREATE, TASK_MOVE, TASK_APPROVE, etc.
     * @param {'project'|'task'|'auth'|'time_log'} params.entityType
     * @param {string} params.entityId
     * @param {string} params.entityTitle
     * @param {string} params.details
     * @param {Object} [params.user]
     */
    log(params) {
      if (!params || !params.action) return null;

      const authService = window.Auth || window.TaskFlowAuth;
      const currentUser = params.user || (authService && typeof authService.getCurrentUser === 'function' ? authService.getCurrentUser() : null) || {
        id: 'system',
        name: 'Hệ Thống',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=System',
        role: 'system'
      };

      const newLog = {
        id: 'act-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
        timestamp: new Date().toISOString(),
        userId: currentUser.id || 'unknown',
        userName: currentUser.name || currentUser.fullname || 'Người dùng',
        userAvatar: currentUser.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(currentUser.name || 'User')}`,
        userRole: currentUser.role || 'member',
        action: params.action,
        entityType: params.entityType || 'task',
        entityId: params.entityId || '',
        entityTitle: params.entityTitle || '',
        details: params.details || ''
      };

      try {
        const logs = Storage.get(STORAGE_KEYS.ACTIVITY_LOGS, []);
        logs.unshift(newLog); // Nhật ký mới nhất nằm trên đầu

        // Giới hạn tối đa 250 bản ghi gần nhất để tối ưu bộ nhớ LocalStorage
        if (logs.length > 250) {
          logs.length = 250;
        }

        Storage.set(STORAGE_KEYS.ACTIVITY_LOGS, logs);

        // Phát sự kiện toàn cục để Trang 5 / Dashboard có thể lắng nghe cập nhật tức thời
        window.dispatchEvent(
          new CustomEvent('activityLogged', {
            detail: { log: newLog }
          })
        );

        return newLog;
      } catch (err) {
        console.warn('[TaskFlowStorage.logActivity] Lỗi khi ghi nhật ký:', err);
        return null;
      }
    },

    /**
     * Lấy danh sách nhật ký hoạt động kèm bộ lọc
     */
    getLogs(filter = {}) {
      const logs = Storage.get(STORAGE_KEYS.ACTIVITY_LOGS, []);
      if (!filter || Object.keys(filter).length === 0) return logs;

      return logs.filter(log => {
        if (filter.userId && log.userId !== filter.userId) return false;
        if (filter.entityType && log.entityType !== filter.entityType) return false;
        if (filter.action && log.action !== filter.action) return false;
        if (filter.projectId && log.entityId !== filter.projectId) return false;
        return true;
      }).slice(0, filter.limit || logs.length);
    }
  };

  /**
   * ==========================================================================
   * 5. HỆ THỐNG GHI NHẬN THỜI GIAN & TIMESHEET (TIME TRACKING ENGINE)
   * Phục vụ Trang 5: Báo Cáo & Logs
   * ==========================================================================
   */
  const TimeTracker = {
    /**
     * Ghi nhận một lượt bấm giờ / thời gian làm việc
     */
    logTime(params) {
      if (!params) return null;

      const authService = window.Auth || window.TaskFlowAuth;
      const currentUser = params.user || (authService && typeof authService.getCurrentUser === 'function' ? authService.getCurrentUser() : null) || {};

      const hours = parseFloat(params.spentHours || params.hours || 0);
      if (isNaN(hours) || hours <= 0) return null;

      const newTimeLog = {
        id: 'time-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
        taskId: params.taskId || '',
        taskTitle: params.taskTitle || 'Công việc không tên',
        projectId: params.projectId || '',
        projectName: params.projectName || 'Dự án',
        userId: params.userId || currentUser.id || 'mem-01',
        userName: params.userName || currentUser.name || 'Thành viên',
        spentHours: Number(hours.toFixed(2)),
        date: params.date || new Date().toISOString().slice(0, 10),
        timestamp: new Date().toISOString(),
        type: params.type || 'stopwatch',
        note: params.note || params.description || 'Ghi nhận thời gian làm việc'
      };

      try {
        const timeLogs = Storage.get(STORAGE_KEYS.TIME_LOGS, []);
        timeLogs.unshift(newTimeLog);

        if (timeLogs.length > 500) {
          timeLogs.length = 500;
        }

        Storage.set(STORAGE_KEYS.TIME_LOGS, timeLogs);

        // Tự động ghi 1 log hoạt động đi kèm
        ActivityLogger.log({
          action: 'STOPWATCH_LOG',
          entityType: 'time_log',
          entityId: newTimeLog.id,
          entityTitle: newTimeLog.taskTitle,
          details: `Ghi nhận ${newTimeLog.spentHours} giờ làm việc (${newTimeLog.note})`,
          user: currentUser
        });

        // Chuyển tiếp sang Google Sheets nếu module SheetsSync khả dụng
        if (window.SheetsSync && typeof window.SheetsSync.sendTimeLog === 'function') {
          window.SheetsSync.sendTimeLog({
            type: 'TIME_TRACKING',
            taskId: newTimeLog.taskId,
            taskTitle: newTimeLog.taskTitle,
            projectId: newTimeLog.projectId,
            spentHours: newTimeLog.spentHours,
            date: newTimeLog.date,
            note: newTimeLog.note,
            name: newTimeLog.userName
          }).catch(() => {});
        }

        window.dispatchEvent(
          new CustomEvent('timeLogged', {
            detail: { timeLog: newTimeLog }
          })
        );

        return newTimeLog;
      } catch (err) {
        console.warn('[TaskFlowStorage.logTime] Lỗi ghi time log:', err);
        return null;
      }
    },

    /**
     * Lấy danh sách bản ghi thời gian
     */
    getTimeLogs(filter = {}) {
      const logs = Storage.get(STORAGE_KEYS.TIME_LOGS, []);
      if (!filter || Object.keys(filter).length === 0) return logs;

      return logs.filter(log => {
        if (filter.userId && log.userId !== filter.userId) return false;
        if (filter.projectId && log.projectId !== filter.projectId) return false;
        if (filter.startDate && log.date < filter.startDate) return false;
        if (filter.endDate && log.date > filter.endDate) return false;
        return true;
      });
    }
  };

  /**
   * ==========================================================================
   * 6. BỘ TÍNH TOÁN BÁO CÁO & XUẤT CSV TỔNG HỢP (REPORTING AGGREGATION ENGINE)
   * Nền tảng dữ liệu phục vụ trực tiếp Trang 5 (reports.html) của đồng đội
   * ==========================================================================
   */
  const ReportingEngine = {
    /**
     * Tổng hợp toàn bộ số liệu thống kê báo cáo theo dự án, thành viên và hiệu suất
     * @param {Object} [filter] - { projectId, userId, dateRange }
     */
    getSummary(filter = {}) {
      const allProjects = Storage.get(STORAGE_KEYS.PROJECTS, []);
      const allTasks = Storage.get(STORAGE_KEYS.TASKS, []);
      const allMembers = Storage.get(STORAGE_KEYS.MEMBERS, []);
      const allTimeLogs = Storage.get(STORAGE_KEYS.TIME_LOGS, []);
      const allActivityLogs = Storage.get(STORAGE_KEYS.ACTIVITY_LOGS, []);

      // Lọc theo dự án nếu có
      let filteredProjects = allProjects;
      let filteredTasks = allTasks;
      let filteredTimeLogs = allTimeLogs;

      if (filter.projectId && filter.projectId !== 'all') {
        filteredProjects = allProjects.filter(p => p.id === filter.projectId);
        filteredTasks = allTasks.filter(t => t.projectId === filter.projectId);
        filteredTimeLogs = allTimeLogs.filter(l => l.projectId === filter.projectId);
      }

      if (filter.userId && filter.userId !== 'all') {
        filteredTasks = filteredTasks.filter(t => t.assigneeId === filter.userId);
        filteredTimeLogs = filteredTimeLogs.filter(l => l.userId === filter.userId);
      }

      // 1. Chỉ số tổng quan (Executive KPIs)
      const totalProjects = filteredProjects.length;
      const activeProjects = filteredProjects.filter(p => p.status === 'active').length;
      const totalTasks = filteredTasks.length;
      const doneTasks = filteredTasks.filter(t => t.status === 'done').length;
      const doingTasks = filteredTasks.filter(t => t.status === 'doing').length;
      const todoTasks = filteredTasks.filter(t => t.status === 'todo').length;

      const totalSpentHours = filteredTimeLogs.reduce((sum, log) => sum + (Number(log.spentHours) || 0), 0);
      const totalEstimatedHours = filteredTasks.reduce((sum, t) => sum + (Number(t.estimatedHours) || 8), 0);
      const avgCompletionRate = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

      // 2. Phân tích chi tiết từng dự án (Projects Summary)
      const projectsSummary = filteredProjects.map(proj => {
        const pTasks = allTasks.filter(t => t.projectId === proj.id);
        const pDone = pTasks.filter(t => t.status === 'done').length;
        const pRate = pTasks.length > 0 ? Math.round((pDone / pTasks.length) * 100) : (proj.progress || 0);
        const pSpent = allTimeLogs.filter(l => l.projectId === proj.id).reduce((sum, l) => sum + (Number(l.spentHours) || 0), 0);
        const pEst = pTasks.reduce((sum, t) => sum + (Number(t.estimatedHours) || 8), 0);

        return {
          id: proj.id,
          name: proj.name,
          code: proj.code || 'PRJ',
          status: proj.status || 'active',
          color: proj.color || '#6366F1',
          deadline: proj.deadline || '',
          totalTasks: pTasks.length,
          doneTasks: pDone,
          progress: pRate,
          spentHours: Number(pSpent.toFixed(1)),
          estimatedHours: Number(pEst.toFixed(1)),
          membersCount: Array.isArray(proj.members) ? proj.members.length : 1
        };
      });

      // 3. Phân bổ tải công việc theo thành viên (Member Workload & Overload status)
      const membersWorkload = allMembers.map(mem => {
        const mTasks = allTasks.filter(t => t.assigneeId === mem.id);
        const mActiveTasks = mTasks.filter(t => t.status !== 'done');
        const mDoneTasks = mTasks.filter(t => t.status === 'done');
        const mSpent = allTimeLogs.filter(l => l.userId === mem.id).reduce((sum, l) => sum + (Number(l.spentHours) || 0), 0);

        // Trạng thái tải: Quá tải nếu >= 4 việc đang làm hoặc >= 35h công; Rảnh nếu 0 việc
        let capacityStatus = 'normal';
        let capacityText = 'Bình thường';
        if (mActiveTasks.length >= 4 || mSpent >= 35) {
          capacityStatus = 'overload';
          capacityText = 'Quá tải (Overload)';
        } else if (mActiveTasks.length === 0) {
          capacityStatus = 'idle';
          capacityText = 'Đang rảnh (Idle)';
        }

        return {
          id: mem.id,
          name: mem.name,
          avatar: mem.avatar,
          role: mem.role || 'Member',
          title: mem.title || 'Kỹ sư phần mềm',
          totalTasks: mTasks.length,
          activeTasks: mActiveTasks.length,
          doneTasks: mDoneTasks.length,
          spentHours: Number(mSpent.toFixed(1)),
          capacityStatus,
          capacityText
        };
      });

      // 4. Phân bổ theo mức độ ưu tiên
      const priorityBreakdown = {
        critical: filteredTasks.filter(t => t.priority === 'critical').length,
        high: filteredTasks.filter(t => t.priority === 'high').length,
        medium: filteredTasks.filter(t => t.priority === 'medium').length,
        low: filteredTasks.filter(t => t.priority === 'low').length
      };

      // 5. Hiệu suất 7 ngày gần nhất (Daily Productivity Trend)
      const dailyProductivity = [];
      const today = new Date();
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(today.getDate() - i);
        const dateStr = d.toISOString().slice(0, 10);
        const dayLabel = d.toLocaleDateString('vi-VN', { weekday: 'short' });

        const dayHours = filteredTimeLogs
          .filter(l => l.date === dateStr)
          .reduce((sum, l) => sum + (Number(l.spentHours) || 0), 0);

        dailyProductivity.push({
          date: dateStr,
          dayLabel,
          spentHours: Number(dayHours.toFixed(1))
        });
      }

      return {
        kpis: {
          totalProjects,
          activeProjects,
          totalTasks,
          doneTasks,
          doingTasks,
          todoTasks,
          avgCompletionRate,
          totalSpentHours: Number(totalSpentHours.toFixed(1)),
          totalEstimatedHours: Number(totalEstimatedHours.toFixed(1))
        },
        projectsSummary,
        membersWorkload,
        priorityBreakdown,
        dailyProductivity,
        recentActivityLogs: allActivityLogs.slice(0, 20)
      };
    },

    /**
     * Xuất dữ liệu Báo cáo ra định dạng CSV có UTF-8 BOM chuẩn (mở Excel tiếng Việt không lỗi font)
     * @param {'tasks'|'timesheet'|'activities'} type
     */
    exportCSV(type = 'tasks') {
      let csvContent = '\uFEFF'; // UTF-8 BOM để Excel hiển thị đúng tiếng Việt có dấu

      if (type === 'timesheet') {
        const logs = Storage.get(STORAGE_KEYS.TIME_LOGS, []);
        csvContent += 'Mã Bản Ghi,Ngày,Nhân Sự,Mã Dự Án,Tên Công Việc,Số Giờ Đã Làm,Loại Ghi Nhận,Ghi Chú\r\n';
        logs.forEach(l => {
          csvContent += `"${l.id}","${l.date || ''}","${l.userName || ''}","${l.projectId || ''}","${(l.taskTitle || '').replace(/"/g, '""')}",${l.spentHours || 0},"${l.type || 'stopwatch'}","${(l.note || '').replace(/"/g, '""')}"\r\n`;
        });
      } else if (type === 'activities') {
        const activities = Storage.get(STORAGE_KEYS.ACTIVITY_LOGS, []);
        csvContent += 'Mã Hoạt Động,Thời Gian,Người Thao Tác,Vai Trò,Hành Động,Đối Tượng,Tên Đối Tượng,Chi Tiết\r\n';
        activities.forEach(a => {
          csvContent += `"${a.id}","${a.timestamp || ''}","${a.userName || ''}","${a.userRole || ''}","${a.action || ''}","${a.entityType || ''}","${(a.entityTitle || '').replace(/"/g, '""')}","${(a.details || '').replace(/"/g, '""')}"\r\n`;
        });
      } else {
        // Mặc định: Danh sách Công Việc (Tasks Report)
        const tasks = Storage.get(STORAGE_KEYS.TASKS, []);
        const projects = Storage.get(STORAGE_KEYS.PROJECTS, []);
        csvContent += 'Mã Task,Tên Công Việc,Mã Dự Án,Tên Dự Án,Trạng Thái,Độ Ưu Tiên,Người Phụ Trách,Hạn Chót,Giờ Ước Tính\r\n';
        tasks.forEach(t => {
          const p = projects.find(proj => proj.id === t.projectId);
          const pName = p ? p.name : 'Dự án chung';
          csvContent += `"${t.id}","${(t.title || '').replace(/"/g, '""')}","${t.projectId || ''}","${pName.replace(/"/g, '""')}","${t.status || 'todo'}","${t.priority || 'medium'}","${t.assignee?.name || t.assigneeId || 'Chưa gán'}","${t.dueDateTime || t.dueDate || ''}",${t.estimatedHours || 8}\r\n`;
        });
      }

      return csvContent;
    }
  };

  /**
   * ==========================================================================
   * 7. THỰC THI ANTI-FLICKER & TỰ ĐỘNG KHỞI TẠO
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
   * 8. ĐÓNG GÓI API VÀO NAMESPACE window.TaskFlowStorage
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

    // Activity Logging Engine (Audit Trail / Logs)
    ActivityLogger,
    logActivity: ActivityLogger.log.bind(ActivityLogger),
    getActivityLogs: ActivityLogger.getLogs.bind(ActivityLogger),

    // Time Tracking Engine (Timesheet / Stopwatch)
    TimeTracker,
    logTime: TimeTracker.logTime.bind(TimeTracker),
    getTimeLogs: TimeTracker.getTimeLogs.bind(TimeTracker),

    // Reporting Engine (Data Foundation cho Trang 5)
    ReportingEngine,
    getReportsSummary: ReportingEngine.getSummary.bind(ReportingEngine),
    exportReportsCSV: ReportingEngine.exportCSV.bind(ReportingEngine),

    // Database Initialization & User Personalization
    initDatabase,
    ensureUserOnboarding,
    getUserProjects,
    getUserTasks,
    getRecentCollaborators,
    addRecentCollaborator,
    findUserByEmail,
    SEED_DATA,

    // Storage Keys Constants
    KEYS: STORAGE_KEYS
  };

  // Gắn an toàn vào window
  window.TaskFlowStorage = TaskFlowStorage;

})(window, document);
