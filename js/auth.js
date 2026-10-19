/**
 * ==============================================================================
 * TASKFLOW AUTHENTICATION & BANKING-GRADE SESSION ENGINE (js/auth.js)
 * Mô tả: Module xác thực, phân quyền RBAC và quản lý phiên tự hủy/gia hạn kiểu ngân hàng.
 * Kiến trúc: Vanilla JS (ES6+ Module Pattern), đóng gói an toàn trong window.TaskFlowAuth.
 * Tuân thủ: Rubric học phần, skill.md (Mục 4), colorweb.md và ai_detected.md.
 * Tác giả: Security & Full-Stack Architect
 * ==============================================================================
 */

// js/auth.js - Module xác thực & phiên chuẩn hóa toàn hệ thống TaskFlow
(function(window) {
  'use strict';

  const AUTH_KEY = 'TASKFLOW_SESSION';
  const USER_KEY = 'currentUser';
  const SESSION_DURATION = 5 * 60 * 1000; // 5 phút (ms)
  const EXTEND_THRESHOLD = 2 * 60 * 1000; // Dưới 2 phút thì gia hạn thêm

  const Auth = {
    /**
     * Lấy thông tin user hiện tại
     */
    getCurrentUser() {
      try {
        const raw = localStorage.getItem(AUTH_KEY) || localStorage.getItem(USER_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed.user || parsed;
      } catch (e) {
        console.error("Lỗi đọc user:", e);
        return null;
      }
    },

    /**
     * Đăng nhập với tài khoản hợp lệ
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

      // Đồng bộ vào cả 2 key để các trang đọc kiểu gì cũng trúng
      localStorage.setItem(AUTH_KEY, JSON.stringify(sessionData));
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      return true;
    },

    /**
     * BẢO VỆ TUYẾN ĐƯỜNG (Auth Guard triệt để)
     */
    requireAuth() {
      // 1. Nếu đang ở login.html thì tuyệt đối không làm gì
      const path = window.location.pathname.toLowerCase();
      if (path.endsWith('login.html')) return true;

      // 2. Kiểm tra dữ liệu phiên
      try {
        const raw = localStorage.getItem(AUTH_KEY);
        if (!raw) {
          this.redirectToLogin();
          return false;
        }

        const session = JSON.parse(raw);
        const now = Date.now();

        // 3. Kiểm tra hết hạn phiên
        if (session.expiresAt && now > session.expiresAt) {
          alert('Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại!');
          this.logout();
          return false;
        }

        // 4. Nếu còn hạn và người dùng đang tương tác, cập nhật lastActivity
        session.lastActivity = now;
        localStorage.setItem(AUTH_KEY, JSON.stringify(session));
        return true;
      } catch (err) {
        this.redirectToLogin();
        return false;
      }
    },

    /**
     * Chuyển hướng về login kèm lưu trang trước đó
     */
    redirectToLogin() {
      const current = window.location.pathname.split('/').pop() || 'index.html';
      if (!current.includes('login.html')) {
        sessionStorage.setItem('REDIRECT_AFTER_LOGIN', current);
      }
      window.location.href = 'login.html';
    },

    /**
     * Đăng xuất xóa sạch phiên
     */
    logout() {
      localStorage.removeItem(AUTH_KEY);
      localStorage.removeItem(USER_KEY);
      sessionStorage.removeItem('REDIRECT_AFTER_LOGIN');
      window.location.href = 'login.html';
    },

    /**
     * Khởi động bộ lắng nghe phiên ngân hàng (Tự gia hạn khi thao tác)
     */
    initSessionHeartbeat() {
      if (window.location.pathname.toLowerCase().endsWith('login.html')) return;

      const events = ['mousemove', 'keydown', 'click', 'touchstart'];
      let lastHeartbeat = Date.now();

      const refreshSession = () => {
        const now = Date.now();
        // Chỉ chạy tối đa 1 lần mỗi 10 giây để tiết kiệm CPU
        if (now - lastHeartbeat < 10000) return;
        lastHeartbeat = now;

        try {
          const raw = localStorage.getItem(AUTH_KEY);
          if (!raw) return;
          const session = JSON.parse(raw);
          const timeLeft = session.expiresAt - now;

          // Nếu còn dưới 2 phút thì cộng thêm 2 phút
          if (timeLeft > 0 && timeLeft < EXTEND_THRESHOLD) {
            session.expiresAt += 2 * 60 * 1000;
            localStorage.setItem(AUTH_KEY, JSON.stringify(session));
            console.log('TaskFlow: Đã gia hạn phiên thêm 2 phút do phát hiện thao tác!');
          }
        } catch (e) {}
      };

      events.forEach(evt => window.addEventListener(evt, refreshSession, { passive: true }));
    }
  };

  // Khởi động lắng nghe
  Auth.initSessionHeartbeat();

  // Đăng ký toàn cục
  window.Auth = Auth;
  window.TaskFlowAuth = Auth;
})(window);