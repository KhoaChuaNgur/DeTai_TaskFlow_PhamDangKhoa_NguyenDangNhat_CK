/**
 * ==============================================================================
 * TASKFLOW AUTHENTICATION & BANKING-GRADE SESSION ENGINE (js/auth.js)
 * Mô tả: Module xác thực, phân quyền RBAC và quản lý phiên tự hủy/gia hạn kiểu ngân hàng.
 * Kiến trúc: Vanilla JS (ES6+ Module Pattern), đóng gói an toàn trong window.TaskFlowAuth.
 * Tuân thủ: Rubric học phần, skill.md (Mục 4), colorweb.md và ai_detected.md.
 * Tác giả: Security & Full-Stack Architect
 * ==============================================================================
 */

(function (window, document) {
  'use strict';

  /**
   * Cấu hình tham số bảo mật phiên ngân hàng (Banking-Grade Session Parameters)
   */
  const AUTH_CONFIG = Object.freeze({
    SESSION_DURATION_MS: 5 * 60 * 1000,          // Hạn phiên: 5 phút (300 giây)
    EXTENSION_THRESHOLD_MS: 2 * 60 * 1000,       // Ngưỡng gia hạn: còn dưới 2 phút
    EXTENSION_AMOUNT_MS: 2 * 60 * 1000,          // Lượng thời gian cộng thêm: 2 phút
    MAX_SESSION_CEILING_MS: 60 * 60 * 1000,      // Trần tối đa phiên làm việc: 60 phút
    THROTTLE_ACTIVITY_MS: 15 * 1000,             // Throttle cập nhật tương tác: 15 giây
    HEARTBEAT_INTERVAL_MS: 1000,                 // Chu kỳ kiểm tra Heartbeat: 1 giây
    LOGIN_PAGE_URL: 'login.html',                // Tuyến trang đăng nhập
    DASHBOARD_PAGE_URL: 'index.html'             // Tuyến trang chủ sau đăng nhập
  });

  /**
   * Bộ khóa định danh lưu trữ cho Auth
   */
  const AUTH_STORAGE_KEYS = Object.freeze({
    USERS: 'taskflow_users',
    CURRENT_USER: 'taskflow_current_user',
    SESSION: 'taskflow_session_meta',
    FLASH_MESSAGE: 'taskflow_flash_message'
  });

  /**
   * Tài khoản mặc định ban đầu theo yêu cầu nghiệp vụ
   */
  const DEFAULT_ACCOUNTS = [
    {
      id: 'usr-admin-01',
      memberId: 'mem-01',
      email: 'admin@taskflow.dev',
      password: 'admin123',
      name: 'Phạm Đăng Khoa',
      role: 'admin',
      title: 'Frontend Lead & System Architect',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=KhoaPham&backgroundColor=6366f1'
    },
    {
      id: 'usr-member-02',
      memberId: 'mem-02',
      email: 'member@taskflow.dev',
      password: 'user123',
      name: 'Thành Viên Nhóm',
      role: 'member',
      title: 'Backend & Cloud Infrastructure Dev',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=MemberTaskFlow&backgroundColor=8b5cf6'
    }
  ];

  /**
   * Các biến trạng thái nội bộ quản lý Heartbeat & Listener (Ngăn chặn Memory Leak)
   */
  let heartbeatTimerId = null;
  let lastThrottledActivityTime = 0;
  let isListenersAttached = false;
  let boundActivityHandler = null;

  /**
   * Helper an toàn tương tác Storage (Ưu tiên TaskFlowStorage nếu đã nạp)
   */
  function safeStorageGet(key, defaultValue = null) {
    if (window.TaskFlowStorage && typeof window.TaskFlowStorage.get === 'function') {
      return window.TaskFlowStorage.get(key, defaultValue);
    }
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch (e) {
      console.error('[Auth.safeStorageGet] Error:', e);
      return defaultValue;
    }
  }

  function safeStorageSet(key, value) {
    if (window.TaskFlowStorage && typeof window.TaskFlowStorage.set === 'function') {
      return window.TaskFlowStorage.set(key, value);
    }
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error('[Auth.safeStorageSet] Error:', e);
      return false;
    }
  }

  function safeStorageRemove(key) {
    if (window.TaskFlowStorage && typeof window.TaskFlowStorage.remove === 'function') {
      return window.TaskFlowStorage.remove(key);
    }
    try {
      window.localStorage.removeItem(key);
      return true;
    } catch (e) {
      console.error('[Auth.safeStorageRemove] Error:', e);
      return false;
    }
  }

  /**
   * Helper hiển thị Toast Notification đồng bộ giao diện Glassmorphism (styles.css)
   * @param {string} message - Nội dung thông báo
   * @param {'info'|'success'|'warning'|'error'} type - Loại thông báo
   * @param {number} durationMs - Thời gian hiển thị (mặc định 3500ms)
   */
  function showToast(message, type = 'info', durationMs = 3500) {
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'toast-item';
    toast.setAttribute('role', 'alert');

    // Biểu tượng SVG tối giản theo loại thông báo
    let iconSvg = '';
    if (type === 'error' || type === 'warning') {
      iconSvg = `<svg class="w-5 h-5 text-rose-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>`;
    } else if (type === 'success') {
      iconSvg = `<svg class="w-5 h-5 text-emerald-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>`;
    } else {
      iconSvg = `<svg class="w-5 h-5 text-indigo-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`;
    }

    toast.innerHTML = `
      ${iconSvg}
      <span class="text-sm font-medium text-slate-100">${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('is-dismissing');
      toast.addEventListener('animationend', () => {
        if (toast.parentElement) {
          toast.remove();
        }
      });
    }, durationMs);
  }

  /**
   * Khởi tạo bảng danh sách tài khoản người dùng nếu chưa có
   */
  function initDefaultAccounts() {
    const existingUsers = safeStorageGet(AUTH_STORAGE_KEYS.USERS);
    if (!existingUsers || !Array.isArray(existingUsers) || existingUsers.length === 0) {
      safeStorageSet(AUTH_STORAGE_KEYS.USERS, DEFAULT_ACCOUNTS);
      console.info('%c[TaskFlowAuth]%c Đã cài đặt 2 tài khoản mặc định (admin & member).', 'color: #6366F1; font-weight: bold;', 'color: inherit;');
    }
  }

  /**
   * ==========================================================================
   * 2. BANKING-GRADE SESSION HEARTBEAT & THROTTLED ACTIVITY LISTENER
   * ==========================================================================
   */

  /**
   * Xử lý tương tác người dùng có Throttle 15 giây
   * Nếu thời gian còn lại dưới 2 phút, tự động gia hạn thêm 2 phút (tối đa trần 60 phút).
   */
  function handleUserActivity() {
    const now = Date.now();

    // Áp dụng kỹ thuật Throttle: bỏ qua nếu tương tác quá dày đặc (< 15 giây)
    if (now - lastThrottledActivityTime < AUTH_CONFIG.THROTTLE_ACTIVITY_MS) {
      return;
    }
    lastThrottledActivityTime = now;

    const session = safeStorageGet(AUTH_STORAGE_KEYS.SESSION);
    if (!session || !session.expiresAt) {
      return;
    }

    const remainingMs = session.expiresAt - now;

    // Cơ chế tự gia hạn ngân hàng: Nếu còn dưới 2 phút và phiên vẫn hợp lệ
    if (remainingMs > 0 && remainingMs < AUTH_CONFIG.EXTENSION_THRESHOLD_MS) {
      const maxAllowedExpiry = session.loginTime + AUTH_CONFIG.MAX_SESSION_CEILING_MS;
      const proposedExpiry = session.expiresAt + AUTH_CONFIG.EXTENSION_AMOUNT_MS;
      const finalExpiry = Math.min(proposedExpiry, maxAllowedExpiry);

      if (finalExpiry > session.expiresAt) {
        session.expiresAt = finalExpiry;
        session.lastActivity = now;
        safeStorageSet(AUTH_STORAGE_KEYS.SESSION, session);

        // Bắn sự kiện tùy biến sessionExtended để UI (nếu có thanh đếm ngược) cập nhật
        window.dispatchEvent(
          new CustomEvent('sessionExtended', {
            detail: {
              remainingSeconds: Math.round((finalExpiry - now) / 1000),
              expiresAt: finalExpiry
            }
          })
        );
      }
    } else if (remainingMs > 0) {
      // Cập nhật mốc thời gian hoạt động cuối cùng
      session.lastActivity = now;
      safeStorageSet(AUTH_STORAGE_KEYS.SESSION, session);
    }
  }

  /**
   * Bật lắng nghe các sự kiện hoạt động người dùng
   */
  function attachActivityListeners() {
    if (isListenersAttached) return;

    boundActivityHandler = handleUserActivity;
    const events = ['mousemove', 'keydown', 'click', 'touchstart'];

    events.forEach((eventType) => {
      window.addEventListener(eventType, boundActivityHandler, { passive: true });
    });

    isListenersAttached = true;
  }

  /**
   * Tháo gỡ toàn bộ Event Listeners để chống rò rỉ bộ nhớ (Memory Leak Cleanup)
   */
  function detachActivityListeners() {
    if (!isListenersAttached || !boundActivityHandler) return;

    const events = ['mousemove', 'keydown', 'click', 'touchstart'];
    events.forEach((eventType) => {
      window.removeEventListener(eventType, boundActivityHandler);
    });

    isListenersAttached = false;
    boundActivityHandler = null;
  }

  /**
   * Nhịp tim kiểm tra phiên đăng nhập mỗi 1 giây (Heartbeat loop)
   */
  function startSessionHeartbeat() {
    stopSessionHeartbeat(); // Đảm bảo không trùng lặp interval

    heartbeatTimerId = window.setInterval(() => {
      const session = safeStorageGet(AUTH_STORAGE_KEYS.SESSION);

      if (!session || !session.expiresAt) {
        stopSessionHeartbeat();
        return;
      }

      const now = Date.now();
      const remainingMs = session.expiresAt - now;

      // Hết hạn phiên làm việc (Idle Timeout sau 5 phút không tương tác)
      if (remainingMs <= 0) {
        stopSessionHeartbeat();
        handleSessionExpiration();
        return;
      }

      // Phát sự kiện sessionTick định kỳ mỗi giây để các component UI hiển thị thời gian còn lại
      window.dispatchEvent(
        new CustomEvent('sessionTick', {
          detail: {
            remainingSeconds: Math.max(0, Math.round(remainingMs / 1000)),
            expiresAt: session.expiresAt
          }
        })
      );
    }, AUTH_CONFIG.HEARTBEAT_INTERVAL_MS);

    attachActivityListeners();
  }

  /**
   * Dừng nhịp tim kiểm tra phiên (Cleanup timer)
   */
  function stopSessionHeartbeat() {
    if (heartbeatTimerId !== null) {
      window.clearInterval(heartbeatTimerId);
      heartbeatTimerId = null;
    }
  }

  /**
   * Xử lý khi phiên hết hạn: Hủy phiên, lưu flash message và điều hướng về login.html
   */
  function handleSessionExpiration() {
    detachActivityListeners();
    safeStorageRemove(AUTH_STORAGE_KEYS.SESSION);
    safeStorageRemove(AUTH_STORAGE_KEYS.CURRENT_USER);

    const message = 'Phiên làm việc đã hết hạn do bạn không hoạt động.';

    // Lưu thông điệp flash để trang login.html hiển thị khi chuyển hướng
    try {
      window.sessionStorage.setItem(AUTH_STORAGE_KEYS.FLASH_MESSAGE, message);
    } catch (e) {
      safeStorageSet(AUTH_STORAGE_KEYS.FLASH_MESSAGE, message);
    }

    // Hiển thị toast ngay trên màn hình hiện tại trước khi chuyển hướng
    showToast(message, 'warning', 2500);

    setTimeout(() => {
      window.location.href = AUTH_CONFIG.LOGIN_PAGE_URL;
    }, 1200);
  }

  /**
   * ==========================================================================
   * 3. AUTH SERVICE (LOGIN, LOGOUT, RBAC & ROUTE GUARDS)
   * ==========================================================================
   */
  const Auth = {
    /**
     * Xác thực thông tin đăng nhập và tạo phiên làm việc mới chuẩn ngân hàng
     * @param {string} email
     * @param {string} password
     * @returns {{ success: boolean, message: string, user?: object }}
     */
    login(email, password) {
      if (!email || !password) {
        return { success: false, message: 'Vui lòng nhập đầy đủ email và mật khẩu.' };
      }

      initDefaultAccounts();
      const users = safeStorageGet(AUTH_STORAGE_KEYS.USERS, DEFAULT_ACCOUNTS);
      const cleanEmail = email.trim().toLowerCase();

      const user = users.find(
        (u) => u.email.toLowerCase() === cleanEmail && u.password === password
      );

      if (!user) {
        return {
          success: false,
          message: 'Tài khoản hoặc mật khẩu không chính xác. Vui lòng kiểm tra lại.'
        };
      }

      const now = Date.now();
      const sessionData = {
        userId: user.id,
        memberId: user.memberId,
        email: user.email,
        name: user.name,
        role: user.role,
        avatar: user.avatar,
        title: user.title,
        loginTime: now,
        lastActivity: now,
        expiresAt: now + AUTH_CONFIG.SESSION_DURATION_MS,
        maxSessionExpiresAt: now + AUTH_CONFIG.MAX_SESSION_CEILING_MS
      };

      // Bảo mật: Không lưu trường password vào session và current_user
      const safeUser = { ...user };
      delete safeUser.password;

      safeStorageSet(AUTH_STORAGE_KEYS.CURRENT_USER, safeUser);
      safeStorageSet(AUTH_STORAGE_KEYS.SESSION, sessionData);

      // Kích hoạt Heartbeat ngay sau khi đăng nhập thành công
      startSessionHeartbeat();

      return {
        success: true,
        message: `Chào mừng ${user.name} đã quay trở lại hệ thống TaskFlow!`,
        user: safeUser
      };
    },

    /**
     * Đăng xuất chủ động: Dọn dẹp Timer, tháo gỡ Event Listeners và xóa Storage
     */
    logout(redirect = true) {
      stopSessionHeartbeat();
      detachActivityListeners();

      safeStorageRemove(AUTH_STORAGE_KEYS.SESSION);
      safeStorageRemove(AUTH_STORAGE_KEYS.CURRENT_USER);

      if (redirect) {
        window.location.href = AUTH_CONFIG.LOGIN_PAGE_URL;
      }
    },

    /**
     * Lấy thông tin người dùng đang đăng nhập
     * @returns {object|null}
     */
    getCurrentUser() {
      const session = safeStorageGet(AUTH_STORAGE_KEYS.SESSION);
      if (!session || !session.expiresAt || Date.now() >= session.expiresAt) {
        return null;
      }
      return safeStorageGet(AUTH_STORAGE_KEYS.CURRENT_USER, null);
    },

    /**
     * Kiểm tra trạng thái đăng nhập
     * @returns {boolean}
     */
    isAuthenticated() {
      const session = safeStorageGet(AUTH_STORAGE_KEYS.SESSION);
      if (!session || !session.expiresAt) {
        return false;
      }
      return Date.now() < session.expiresAt;
    },

    /**
     * Phân quyền RBAC: Kiểm tra xem người dùng hiện tại có vai trò chỉ định hay không
     * @param {'admin'|'member'} role
     * @returns {boolean}
     */
    hasRole(role) {
      const user = this.getCurrentUser();
      if (!user || !user.role) return false;
      return user.role.toLowerCase() === String(role).toLowerCase();
    },

    /**
     * Lấy số giây còn lại của phiên hiện tại (phục vụ hiển thị đồng hồ ngân hàng trên Header)
     * @returns {number} Số giây còn lại (0 nếu đã hết hạn hoặc chưa đăng nhập)
     */
    getSessionTimeRemaining() {
      const session = safeStorageGet(AUTH_STORAGE_KEYS.SESSION);
      if (!session || !session.expiresAt) return 0;
      return Math.max(0, Math.round((session.expiresAt - Date.now()) / 1000));
    },

    /**
     * Route Guard bảo vệ các trang quản trị:
     * - Nếu chưa đăng nhập hoặc phiên hết hạn: lập tức chuyển hướng về login.html
     * - Nếu role không đạt yêu cầu: chuyển hướng hoặc cảnh báo
     * - Nếu hợp lệ: khởi chạy Heartbeat và trả về user
     * @param {string|null} requiredRole - Vai trò bắt buộc (vd: 'admin')
     * @returns {object|null}
     */
    requireAuth(requiredRole = null) {
      if (!this.isAuthenticated()) {
        const message = 'Vui lòng đăng nhập để truy cập TaskFlow.';
        try {
          window.sessionStorage.setItem(AUTH_STORAGE_KEYS.FLASH_MESSAGE, message);
        } catch (e) {
          safeStorageSet(AUTH_STORAGE_KEYS.FLASH_MESSAGE, message);
        }
        window.location.href = AUTH_CONFIG.LOGIN_PAGE_URL;
        return null;
      }

      const currentUser = this.getCurrentUser();

      // Kiểm tra quyền hạn chuyên biệt nếu có yêu cầu
      if (requiredRole && !this.hasRole(requiredRole)) {
        showToast('Bạn không có quyền thực hiện hành động này.', 'error', 3000);
        return null;
      }

      // Kích hoạt lại nhịp tim phiên khi tải trang quản trị
      startSessionHeartbeat();

      return currentUser;
    },

    /**
     * Route Guard dành cho trang Login:
     * Nếu đã đăng nhập còn hạn phiên, tự động chuyển thẳng vào Dashboard
     */
    redirectIfAuthenticated() {
      if (this.isAuthenticated()) {
        window.location.href = AUTH_CONFIG.DASHBOARD_PAGE_URL;
      }
    },

    /**
     * Kiểm tra và hiển thị các thông báo flash (nếu có từ lần chuyển hướng trước)
     */
    checkFlashMessages() {
      let flashMessage = null;
      try {
        flashMessage = window.sessionStorage.getItem(AUTH_STORAGE_KEYS.FLASH_MESSAGE);
        if (flashMessage) {
          window.sessionStorage.removeItem(AUTH_STORAGE_KEYS.FLASH_MESSAGE);
        }
      } catch (e) {
        flashMessage = safeStorageGet(AUTH_STORAGE_KEYS.FLASH_MESSAGE);
        if (flashMessage) {
          safeStorageRemove(AUTH_STORAGE_KEYS.FLASH_MESSAGE);
        }
      }

      if (flashMessage) {
        // Trì hoãn nhẹ để DOM render đầy đủ
        setTimeout(() => {
          showToast(flashMessage, 'warning', 4000);
        }, 150);
      }
    },

    // Xuất cấu hình và bộ khóa
    CONFIG: AUTH_CONFIG,
    KEYS: AUTH_STORAGE_KEYS,
    showToast
  };

  /**
   * ==========================================================================
   * 4. TỰ ĐỘNG KHỞI TẠO TÀI KHOẢN VÀ KIỂM TRA FLASH MESSAGE
   * ==========================================================================
   */
  initDefaultAccounts();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      Auth.checkFlashMessages();
    });
  } else {
    Auth.checkFlashMessages();
  }

  // Đóng gói vào namespace toàn cục (hỗ trợ cả TaskFlowAuth và Auth alias)
  window.TaskFlowAuth = Auth;
  window.Auth = Auth;

})(window, document);
