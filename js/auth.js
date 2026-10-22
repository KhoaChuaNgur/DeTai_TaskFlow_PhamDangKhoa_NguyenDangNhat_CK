/**
 * ==============================================================================
 * TASKFLOW AUTHENTICATION & BANKING-GRADE SESSION ENGINE (js/auth.js)
 * Mô tả: Module xác thực, phân quyền RBAC và quản lý phiên tự hủy/gia hạn chuẩn ngân hàng.
 * Kiến trúc: Vanilla JS (ES6+ Module Pattern), đóng gói an toàn trong window.TaskFlowAuth.
 * Tuân thủ: Rubric học phần, skill.md (Mục 4), colorweb.md và ai_detected.md.
 * Tác giả: Security & Full-Stack Architect
 * ==============================================================================
 */

(function(window) {
  'use strict';

  // Bộ khóa đồng bộ phiên và thông tin người dùng
  const STORAGE_KEYS = {
    SESSION: 'TASKFLOW_SESSION',
    SESSION_META: 'taskflow_session_meta',
    CURRENT_USER: 'currentUser',
    LEGACY_USER: 'TASKFLOW_USER',
    NAMESPACED_USER: 'taskflow_current_user'
  };

  const SESSION_DURATION = 5 * 60 * 1000;    // 5 phút (300.000 ms)
  const EXTEND_THRESHOLD = 2 * 60 * 1000;    // Dưới 2 phút còn lại thì kích hoạt gia hạn
  const EXTEND_AMOUNT = 2 * 60 * 1000;       // Cộng thêm 2 phút mỗi lần gia hạn
  const MAX_SESSION_DURATION = 60 * 60 * 1000; // Tối đa phiên không vượt quá 60 phút

  let countdownInterval = null;

  const Auth = {
    /**
     * Lấy thông tin người dùng hiện tại (Hỗ trợ tra cứu tất cả các khóa lưu trữ)
     * @returns {Object|null}
     */
    getCurrentUser() {
      try {
        const rawSession = localStorage.getItem(STORAGE_KEYS.SESSION) || localStorage.getItem(STORAGE_KEYS.SESSION_META);
        if (rawSession) {
          const parsed = JSON.parse(rawSession);
          if (parsed && parsed.user) return parsed.user;
        }

        const rawUser = localStorage.getItem(STORAGE_KEYS.CURRENT_USER) 
                     || localStorage.getItem(STORAGE_KEYS.LEGACY_USER)
                     || localStorage.getItem(STORAGE_KEYS.NAMESPACED_USER);
        if (rawUser) {
          const parsed = JSON.parse(rawUser);
          return parsed.user || parsed;
        }
      } catch (e) {
        console.error('[Auth.getCurrentUser] Lỗi đọc user:', e);
      }
      return null;
    },

    /**
     * Kiểm tra người dùng có quyền cụ thể hay không (RBAC)
     * @param {string} role - 'admin' hoặc 'member'
     * @returns {boolean}
     */
    hasRole(role) {
      const user = this.getCurrentUser();
      if (!user || !user.role) return false;
      return user.role.toLowerCase() === role.toLowerCase();
    },

    /**
     * Đăng nhập với tài khoản hợp lệ
     * @param {string} email
     * @param {string} password
     * @returns {boolean}
     */
    login(email, password) {
      let user = null;
      if (email === 'admin@taskflow.dev' && password === 'admin123') {
        user = {
          name: 'Phạm Đăng Khoa',
          email: email,
          role: 'admin',
          avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Khoa'
        };
      } else if (email === 'member@taskflow.dev' && password === 'user123') {
        user = {
          name: 'Nguyễn Đăng Nhật',
          email: email,
          role: 'member',
          avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Nhat'
        };
      }

      if (!user) return false;

      const now = Date.now();
      const sessionData = {
        user: user,
        loginTime: now,
        lastActivity: now,
        expiresAt: now + SESSION_DURATION
      };

      // Đồng bộ vào TẤT CẢ các khóa lưu trữ để mọi module đều đọc được
      localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(sessionData));
      localStorage.setItem(STORAGE_KEYS.SESSION_META, JSON.stringify(sessionData));
      localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(user));
      localStorage.setItem(STORAGE_KEYS.LEGACY_USER, JSON.stringify(user));
      localStorage.setItem(STORAGE_KEYS.NAMESPACED_USER, JSON.stringify(user));

      return true;
    },

    /**
     * BẢO VỆ TUYẾN ĐƯỜNG (Auth Guard)
     * Ngăn chặn người dùng chưa xác thực hoặc phiên đã quá hạn
     * @returns {boolean}
     */
    requireAuth() {
      const path = window.location.pathname.toLowerCase();
      if (path.endsWith('login.html')) return true;

      try {
        const raw = localStorage.getItem(STORAGE_KEYS.SESSION);
        if (!raw) {
          this.redirectToLogin();
          return false;
        }

        const session = JSON.parse(raw);
        const now = Date.now();

        // Kiểm tra hết hạn phiên
        if (!session.expiresAt || now > session.expiresAt) {
          sessionStorage.setItem('SESSION_EXPIRED_MSG', 'Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại!');
          this.logout();
          return false;
        }

        // Cập nhật lastActivity
        session.lastActivity = now;
        localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(session));
        localStorage.setItem(STORAGE_KEYS.SESSION_META, JSON.stringify(session));
        return true;
      } catch (err) {
        console.error('[Auth.requireAuth] Lỗi kiểm tra phiên:', err);
        this.redirectToLogin();
        return false;
      }
    },

    /**
     * Chuyển hướng về trang login kèm lưu lại trang hiện tại để redirect sau
     */
    redirectToLogin() {
      const current = window.location.pathname.split('/').pop() || 'index.html';
      if (!current.includes('login.html')) {
        sessionStorage.setItem('REDIRECT_AFTER_LOGIN', current);
      }
      window.location.href = 'login.html';
    },

    /**
     * Đăng xuất và dọn dẹp sạch sẽ toàn bộ phiên trên LocalStorage
     */
    logout() {
      if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
      }

      localStorage.removeItem(STORAGE_KEYS.SESSION);
      localStorage.removeItem(STORAGE_KEYS.SESSION_META);
      localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
      localStorage.removeItem(STORAGE_KEYS.LEGACY_USER);
      localStorage.removeItem(STORAGE_KEYS.NAMESPACED_USER);

      const path = window.location.pathname.toLowerCase();
      if (!path.endsWith('login.html')) {
        const current = window.location.pathname.split('/').pop() || 'index.html';
        sessionStorage.setItem('REDIRECT_AFTER_LOGIN', current);
        window.location.href = 'login.html';
      }
    },

    /**
     * KÍCH HOẠT NHỊP ĐẾM PHIÊN NGÂN HÀNG (Banking-Grade Session Heartbeat)
     * 1. Đồng hồ đếm lùi từng giây và phát sự kiện 'sessionTick'
     * 2. Lắng nghe thao tác người dùng để tự động gia hạn thêm 2 phút
     * 3. Tự động logout khi thời gian về 0
     */
    initSessionHeartbeat() {
      if (window.location.pathname.toLowerCase().endsWith('login.html')) return;

      if (countdownInterval) {
        clearInterval(countdownInterval);
      }

      // Vòng lặp đếm lùi 1000ms
      countdownInterval = setInterval(() => {
        try {
          const raw = localStorage.getItem(STORAGE_KEYS.SESSION);
          if (!raw) return;

          const session = JSON.parse(raw);
          const now = Date.now();
          const timeLeft = Math.max(0, (session.expiresAt || 0) - now);
          const remainingSeconds = Math.floor(timeLeft / 1000);

          const minutes = String(Math.floor(remainingSeconds / 60)).padStart(2, '0');
          const seconds = String(remainingSeconds % 60).padStart(2, '0');
          const formatted = `${minutes}:${seconds}`;

          // Phát sự kiện tùy biến ra toàn window cho Layout cập nhật UI
          window.dispatchEvent(new CustomEvent('sessionTick', {
            detail: {
              timeLeft,
              remainingSeconds,
              formatted
            }
          }));

          // Phiên đã hết hạn
          if (timeLeft <= 0) {
            clearInterval(countdownInterval);
            countdownInterval = null;
            sessionStorage.setItem('SESSION_EXPIRED_MSG', 'Phiên làm việc đã hết hạn do bạn không hoạt động.');
            Auth.logout();
          }
        } catch (e) {
          console.error('[Session Countdown] Lỗi nhịp tim phiên:', e);
        }
      }, 1000);

      // Lắng nghe hoạt động người dùng (Throttle 10s để tối ưu hiệu năng)
      const events = ['mousemove', 'keydown', 'click', 'touchstart'];
      let lastHeartbeat = Date.now();

      const refreshSession = () => {
        const now = Date.now();
        if (now - lastHeartbeat < 10000) return; // Tiết kiệm CPU
        lastHeartbeat = now;

        try {
          const raw = localStorage.getItem(STORAGE_KEYS.SESSION);
          if (!raw) return;

          const session = JSON.parse(raw);
          const timeLeft = (session.expiresAt || 0) - now;

          // Nếu phiên còn dưới 2 phút thì tự động gia hạn thêm 2 phút (tối đa không quá 60 phút)
          if (timeLeft > 0 && timeLeft < EXTEND_THRESHOLD) {
            const loginTime = session.loginTime || now;
            const maxAllowed = loginTime + MAX_SESSION_DURATION;
            const newExpiresAt = Math.min(session.expiresAt + EXTEND_AMOUNT, maxAllowed);

            if (newExpiresAt > session.expiresAt) {
              session.expiresAt = newExpiresAt;
              session.lastActivity = now;
              localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(session));
              localStorage.setItem(STORAGE_KEYS.SESSION_META, JSON.stringify(session));

              console.log('%c[TaskFlow Session]%c Đã tự động gia hạn thêm 2 phút do phát hiện thao tác!', 'color: #6366F1; font-weight: bold;', 'color: inherit;');

              if (typeof window.showToast === 'function') {
                window.showToast('Phiên làm việc đã được gia hạn thêm 2 phút.', 'info');
              }
            }
          }
        } catch (e) {
          console.error('[Session Refresh] Lỗi gia hạn phiên:', e);
        }
      };

      events.forEach(evt => window.addEventListener(evt, refreshSession, { passive: true }));
    },

    /**
     * Helper hiển thị Toast thông báo qua hệ thống Toast dùng chung
     */
    showToast(message, type = 'success') {
      if (typeof window.showToast === 'function') {
        window.showToast(message, type);
      } else {
        console.info(`[Toast ${type}]: ${message}`);
      }
    }
  };

  // Khởi động lắng nghe nhịp tim phiên
  Auth.initSessionHeartbeat();

  // Đăng ký toàn cục an toàn
  window.Auth = Auth;
  window.TaskFlowAuth = Auth;

})(window);
