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
     * Thuật toán băm mật khẩu có Salt chống soi lén (Deterministic Salt-Hash)
     * Đảm bảo không lưu mật khẩu dạng plain-text trên LocalStorage
     * @param {string} password
     * @returns {string}
     */
    hashPassword(password) {
      if (!password) return '';
      let hash = 0x811c9dc5;
      const salt = 'TaskFlow_Secure_Salt_2026';
      const combined = salt + password + salt;
      for (let i = 0; i < combined.length; i++) {
        hash ^= combined.charCodeAt(i);
        hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
      }
      return 'tf_sec_' + (hash >>> 0).toString(16);
    },

    /**
     * Lấy danh sách toàn bộ người dùng trong cơ sở dữ liệu
     * @returns {Array}
     */
    getUsers() {
      try {
        if (window.TaskFlowStorage && typeof window.TaskFlowStorage.get === 'function') {
          const list = window.TaskFlowStorage.get(window.TaskFlowStorage.KEYS.MEMBERS, []);
          if (Array.isArray(list) && list.length > 0) return list;
        }
        const raw = localStorage.getItem('TASKFLOW_DATA');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && Array.isArray(parsed.members) && parsed.members.length > 0) {
            return parsed.members;
          }
        }
      } catch (e) {
        console.error('[Auth.getUsers] Lỗi đọc danh sách người dùng:', e);
      }
      return [
        {
          id: 'mem-01',
          name: 'Phạm Đăng Khoa',
          role: 'Admin',
          title: 'Frontend Lead & System Architect',
          email: 'admin@taskflow.dev',
          passwordHash: 'tf_sec_fc762ef4',
          avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Khoa',
          status: 'online'
        },
        {
          id: 'mem-02',
          name: 'Nguyễn Đăng Nhật',
          role: 'Member',
          title: 'Backend & Cloud Infrastructure Dev',
          email: 'member@taskflow.dev',
          passwordHash: 'tf_sec_76564790',
          avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Nhat',
          status: 'online'
        }
      ];
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
     * Hỗ trợ xác thực qua Database LocalStorage lẫn tài khoản Demo
     * @param {string} email
     * @param {string} password
     * @returns {boolean}
     */
    login(email, password) {
      this.lastError = '';
      if (!email || !password) {
        this.lastError = 'Vui lòng nhập đầy đủ Email và Mật khẩu!';
        return false;
      }

      const normalizedEmail = email.trim().toLowerCase();
      const inputHash = this.hashPassword(password);
      const allUsers = this.getUsers();

      // Tìm kiếm người dùng khớp email và mật khẩu (hỗ trợ hash hoặc demo credential)
      let matchedUser = allUsers.find((u) => {
        if (!u.email || u.email.toLowerCase() !== normalizedEmail) return false;
        if (u.passwordHash && u.passwordHash === inputHash) return true;
        // Hỗ trợ đăng nhập tài khoản demo mặc định
        if (normalizedEmail === 'admin@taskflow.dev' && password === 'admin123') return true;
        if (normalizedEmail === 'member@taskflow.dev' && password === 'user123') return true;
        return false;
      });

      if (!matchedUser) {
        this.lastError = 'Email hoặc mật khẩu không chính xác!';
        return false;
      }

      const now = Date.now();
      const sessionUser = {
        id: matchedUser.id || ('mem-' + now),
        name: matchedUser.name || 'Người Dùng',
        email: matchedUser.email,
        role: (matchedUser.role || 'member').toLowerCase(),
        title: matchedUser.title || 'Thành viên dự án',
        avatar: matchedUser.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(matchedUser.name || 'User')}`
      };

      const sessionData = {
        user: sessionUser,
        loginTime: now,
        lastActivity: now,
        expiresAt: now + SESSION_DURATION
      };

      // Đồng bộ vào TẤT CẢ các khóa lưu trữ để mọi module đều đọc được
      localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(sessionData));
      localStorage.setItem(STORAGE_KEYS.SESSION_META, JSON.stringify(sessionData));
      localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(sessionUser));
      localStorage.setItem(STORAGE_KEYS.LEGACY_USER, JSON.stringify(sessionUser));
      localStorage.setItem(STORAGE_KEYS.NAMESPACED_USER, JSON.stringify(sessionUser));

      return true;
    },

    /**
     * ĐĂNG KÝ TÀI KHOẢN MỚI TRÊN HỆ THỐNG TASKFLOW
     * @param {Object} payload { name, email, password, role, title }
     * @returns {Object} { success: boolean, message: string, user?: Object }
     */
    register({ name, email, password, role = 'member', title = 'Thành viên dự án' }) {
      if (!name || name.trim().length < 2) {
        return { success: false, message: 'Họ và tên phải có ít nhất 2 ký tự!' };
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!email || !emailRegex.test(email.trim())) {
        return { success: false, message: 'Định dạng Email không hợp lệ!' };
      }

      if (!password || password.length < 6) {
        return { success: false, message: 'Mật khẩu phải có độ dài tối thiểu 6 ký tự!' };
      }

      const normalizedEmail = email.trim().toLowerCase();
      const allUsers = this.getUsers();

      // Kiểm tra trùng lặp email
      const isDuplicate = allUsers.some((u) => u.email && u.email.toLowerCase() === normalizedEmail);
      if (isDuplicate) {
        return { success: false, message: 'Tài khoản Email này đã được đăng ký. Vui lòng đăng nhập!' };
      }

      const newId = 'mem-' + Date.now();
      const newMember = {
        id: newId,
        name: name.trim(),
        email: normalizedEmail,
        passwordHash: this.hashPassword(password),
        role: role.toLowerCase() === 'admin' ? 'Admin' : 'Member',
        title: (title || 'Thành viên dự án').trim(),
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name.trim())}`,
        status: 'online',
        createdAt: new Date().toISOString()
      };

      allUsers.push(newMember);

      // Lưu trữ đồng bộ 2 chiều qua Storage
      if (window.TaskFlowStorage && typeof window.TaskFlowStorage.set === 'function') {
        window.TaskFlowStorage.set(window.TaskFlowStorage.KEYS.MEMBERS, allUsers);
      } else {
        localStorage.setItem('taskflow_members', JSON.stringify(allUsers));
      }

      try {
        const rawBundle = localStorage.getItem('TASKFLOW_DATA');
        const bundle = rawBundle ? JSON.parse(rawBundle) : {};
        bundle.members = allUsers;
        localStorage.setItem('TASKFLOW_DATA', JSON.stringify(bundle));
      } catch (e) {
        console.error('[Auth.register] Lỗi đồng bộ TASKFLOW_DATA:', e);
      }

      // Tự động khởi tạo Dự Án Khởi Đầu (Onboarding) riêng biệt cho người dùng mới
      if (window.TaskFlowStorage && typeof window.TaskFlowStorage.ensureUserOnboarding === 'function') {
        window.TaskFlowStorage.ensureUserOnboarding(newMember);
      }

      // Tự động đăng nhập luôn cho người dùng mới
      this.login(newMember.email, password);

      return {
        success: true,
        message: 'Đăng ký tài khoản thành công! Đang chuyển hướng...',
        user: newMember
      };
    },

    /**
     * ĐO ĐỘ MẠNH CỦA MẬT KHẨU (Password Strength Meter)
     * @param {string} password
     * @returns {Object} { score, label, colorClass, widthPercent }
     */
    checkPasswordStrength(password) {
      if (!password) {
        return { score: 0, label: 'Chưa nhập', colorClass: 'bg-slate-300 dark:bg-white/10', widthPercent: '0%' };
      }

      let score = 0;
      if (password.length >= 6) score++;
      if (password.length >= 8) score++;
      if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
      if (/[0-9]/.test(password)) score++;
      if (/[^A-Za-z0-9]/.test(password)) score++;

      if (score <= 1) {
        return { score: 1, label: 'Yếu', colorClass: 'bg-rose-500', widthPercent: '25%' };
      } else if (score <= 3) {
        return { score: 2, label: 'Trung bình', colorClass: 'bg-amber-500', widthPercent: '60%' };
      } else {
        return { score: 3, label: 'Rất mạnh', colorClass: 'bg-emerald-500', widthPercent: '100%' };
      }
    },

    /**
     * BẢO MẬT CHỐNG SOI LÉN / CAN THIỆP DOM (Anti-Tamper DOM Guard)
     * Ngăn chặn hành vi vào Inspect Element đổi thuộc tính password thành text
     * @param {HTMLInputElement} inputElement
     * @param {Function} onTamperDetected Callback khi phát hiện can thiệp trái phép
     */
    setupAntiTamperGuard(inputElement, onTamperDetected) {
      if (!inputElement) return;

      const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
          if (m.type === 'attributes' && m.attributeName === 'type') {
            const currentType = inputElement.getAttribute('type');
            // Nếu thuộc tính type bị đổi sang text mà không có cờ cho phép chính thức
            if (currentType !== 'password' && !inputElement.dataset.authorizedToggle) {
              // 1. Lập tức ép ngược về password
              inputElement.setAttribute('type', 'password');
              // 2. Xóa sạch giá trị ô nhập liệu để chống lộ ký tự
              inputElement.value = '';
              // 3. Kích hoạt cảnh báo bảo mật
              if (typeof onTamperDetected === 'function') {
                onTamperDetected(inputElement);
              }
            }
          }
        }
      });

      observer.observe(inputElement, { attributes: true });
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
