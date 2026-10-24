// js/layout.js - Quản lý App Shell (Sidebar, Header, Active Nav, Session Countdown & Unified Toast)
const AppLayout = {
  // Cấu hình danh sách menu (Giữ nguyên theo quy chuẩn phân chia nhiệm vụ của nhóm)
  navItems: [
    { title: "Dashboard", href: "index.html", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
    { title: "Dự Án", href: "projects.html", icon: "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" },
    { title: "Bảng Kanban", href: "board.html", icon: "M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" },
    { title: "Timeline / Gantt", href: "timeline.html", icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" },
    { title: "Báo Cáo & Logs", href: "reports.html", icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" }
  ],

  /**
   * Khởi chạy render Sidebar và Header
   */
  init(pageTitle = "TaskFlow Workspace", pageDesc = "Hệ thống quản lý tiến độ chuẩn Agile") {
    this.renderSidebar();
    this.renderHeader(pageTitle, pageDesc);
    this.bindEvents();
    this.updateUserProfile();
    this.setupPageTransitions();
  },

  renderSidebar() {
    const sidebarEl = document.getElementById("app-sidebar");
    if (!sidebarEl) return;

    const currentPath = window.location.pathname.split("/").pop() || "index.html";

    sidebarEl.className = "w-64 flex-shrink-0 glass-nav border-r border-slate-200 dark:border-white/10 flex flex-col justify-between hidden md:flex z-20 bg-white/90 dark:bg-slate-900/65 text-slate-800 dark:text-slate-100";
    
    const navLinksHtml = this.navItems.map(item => {
      const isActive = currentPath === item.href;
      const activeClass = isActive 
        ? "bg-indigo-50 text-indigo-600 font-bold border border-indigo-200/60 shadow-xs dark:bg-indigo-500/10 dark:text-indigo-400 dark:border-indigo-500/20 dark:shadow-sm"
        : "text-slate-600 dark:text-slate-400 hover:bg-slate-100/80 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white transition-all";

      return `
        <a href="${item.href}" class="flex items-center gap-3 px-3.5 py-2.5 rounded-xl ${activeClass}">
          <svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${item.icon}"/>
          </svg>
          <span>${item.title}</span>
        </a>
      `;
    }).join("");

    sidebarEl.innerHTML = `
      <div>
        <!-- Logo -->
        <div class="h-16 flex items-center px-6 gap-3 border-b border-slate-200 dark:border-white/5">
          <div class="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-500 flex items-center justify-center text-white font-bold shadow-lg shadow-indigo-500/30">
            T
          </div>
          <span class="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 via-violet-600 to-sky-500 dark:from-indigo-400 dark:via-violet-400 dark:to-sky-400">TaskFlow</span>
        </div>

        <!-- Menu -->
        <nav class="p-4 space-y-1.5 text-sm font-medium">
          ${navLinksHtml}
        </nav>
      </div>

      <!-- User Profile Card -->
      <div class="p-4 border-t border-slate-200 dark:border-white/5">
        <div class="flex items-center gap-3 p-2.5 rounded-xl bg-slate-100/90 dark:bg-white/5 border border-slate-200 dark:border-white/5">
          <img id="userAvatar" src="https://api.dicebear.com/7.x/avataaars/svg?seed=Khoa" alt="Avatar" class="w-9 h-9 rounded-lg bg-indigo-500/20 object-cover">
          <div class="flex-1 min-w-0">
            <p id="userName" class="text-xs font-bold text-slate-900 dark:text-white truncate">Phạm Đăng Khoa</p>
            <p id="userRole" class="text-[10px] text-indigo-600 dark:text-indigo-400 uppercase tracking-wider font-bold">Admin</p>
          </div>
          <button id="btnLogout" title="Đăng xuất" class="text-slate-400 hover:text-rose-500 transition-colors p-1 cursor-pointer">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
          </button>
        </div>
      </div>
    `;
  },

  renderHeader(title, desc) {
    const headerEl = document.getElementById("app-header");
    if (!headerEl) return;

    headerEl.className = "h-16 glass-nav border-b border-slate-200 dark:border-white/10 flex items-center justify-between px-6 z-10 bg-white/90 dark:bg-slate-900/65 text-slate-800 dark:text-slate-100";
    headerEl.innerHTML = `
      <div>
        <h1 class="text-lg font-bold text-slate-900 dark:text-white">${title}</h1>
        <p class="text-xs text-slate-600 dark:text-slate-400">${desc}</p>
      </div>

      <div class="flex items-center gap-4">
        <!-- Session Countdown (Banking style) -->
        <div id="sessionBadge" class="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full text-xs bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/20 font-medium transition-all">
          <span id="sessionPulseDot" class="w-2 h-2 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse"></span>
          <span>Phiên: <b id="sessionCountdown" class="font-bold">05:00</b></span>
        </div>

        <!-- Dark/Light Theme Button -->
        <button id="themeToggleBtn" aria-label="Đổi giao diện" class="p-2 rounded-xl border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/5 transition-all text-slate-700 dark:text-slate-300 cursor-pointer">
          <svg id="sunIcon" class="w-4 h-4 hidden dark:block text-amber-400" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clip-rule="evenodd"/></svg>
          <svg id="moonIcon" class="w-4 h-4 block dark:hidden text-indigo-600" fill="currentColor" viewBox="0 0 20 20"><path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"/></svg>
        </button>
      </div>
    `;
  },

  updateUserProfile() {
    const authService = window.Auth || window.TaskFlowAuth;
    if (authService && typeof authService.getCurrentUser === 'function') {
      const currentUser = authService.getCurrentUser();
      if (currentUser) {
        const nameEl = document.getElementById("userName");
        const roleEl = document.getElementById("userRole");
        const avatarEl = document.getElementById("userAvatar");
        if (nameEl && currentUser.name) nameEl.textContent = currentUser.name;
        if (roleEl && currentUser.role) roleEl.textContent = currentUser.role.toUpperCase();
        if (avatarEl && currentUser.avatar) avatarEl.src = currentUser.avatar;
      }
    }
  },

  setupPageTransitions() {
    const mainEl = document.querySelector('main');
    if (mainEl) {
      mainEl.classList.add('animate__animated', 'animate__fadeIn', 'animate__faster');
    }

    // Xử lý khi trang được khôi phục từ bfcache (Back/Forward Cache)
    window.addEventListener('pageshow', () => {
      const activeMain = document.querySelector('main');
      if (activeMain) {
        activeMain.classList.remove('animate__fadeOut');
        activeMain.classList.add('animate__animated', 'animate__fadeIn', 'animate__faster');
      }
    });

    // Chặn click các liên kết nội bộ để tạo hiệu ứng chuyển cảnh mượt mà
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a');
      if (!link) return;

      const href = link.getAttribute('href');
      if (!href) return;
      if (href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:')) {
        return;
      }
      if (link.target === '_blank' || link.hasAttribute('download')) return;

      const currentPath = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
      const cleanHref = href.split('?')[0].split('#')[0].toLowerCase();

      // Nếu đang ở chính trang đó mà không có tham số query mới
      if (cleanHref === currentPath && !href.includes('?')) {
        return;
      }

      const internalPages = ['index.html', 'projects.html', 'board.html', 'timeline.html', 'reports.html', 'login.html'];
      const isInternal = internalPages.some(p => cleanHref === p || cleanHref.endsWith('/' + p));
      if (!isInternal) return;

      e.preventDefault();
      const targetMain = document.querySelector('main') || document.body;
      targetMain.classList.remove('animate__fadeIn');
      targetMain.classList.add('animate__animated', 'animate__fadeOut', 'animate__faster');

      setTimeout(() => {
        window.location.href = href;
      }, 150);
    });
  },

  bindEvents() {
    this.updateUserProfile();
    this.setupPageTransitions();

    // Lắng nghe đếm ngược nhịp tim phiên ngân hàng từ auth.js
    window.addEventListener("sessionTick", (e) => {
      const countdownEl = document.getElementById("sessionCountdown");
      const sessionBadge = document.getElementById("sessionBadge");
      const pulseDot = document.getElementById("sessionPulseDot");

      if (countdownEl && e.detail) {
        if (e.detail.formatted) {
          countdownEl.textContent = e.detail.formatted;
        } else if (typeof e.detail.remainingSeconds === "number") {
          const mins = String(Math.floor(e.detail.remainingSeconds / 60)).padStart(2, "0");
          const secs = String(e.detail.remainingSeconds % 60).padStart(2, "0");
          countdownEl.textContent = `${mins}:${secs}`;
        }

        // Cảnh báo thị giác khi phiên còn dưới 1 phút (60 giây)
        if (typeof e.detail.remainingSeconds === "number" && e.detail.remainingSeconds <= 60) {
          if (sessionBadge) {
            sessionBadge.className = "hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full text-xs bg-rose-500/10 text-rose-500 border border-rose-500/30 font-bold transition-all";
          }
          if (pulseDot) {
            pulseDot.className = "w-2 h-2 rounded-full bg-rose-500 animate-ping";
          }
        }
      }
    });

    const btnTheme = document.getElementById("themeToggleBtn");
    if (btnTheme) {
      btnTheme.addEventListener("click", () => {
        if (window.TaskFlowStorage && typeof TaskFlowStorage.toggleTheme === "function") {
          TaskFlowStorage.toggleTheme();
        } else {
          const isDark = document.documentElement.classList.toggle("dark");
          localStorage.setItem("taskflow_theme", isDark ? "dark" : "light");
          localStorage.setItem("TASKFLOW_THEME", isDark ? "dark" : "light");
        }
      });
    }

    const btnLogout = document.getElementById("btnLogout");
    if (btnLogout) {
      btnLogout.addEventListener("click", () => {
        const auth = window.Auth || window.TaskFlowAuth;
        if (auth && typeof auth.logout === 'function') {
          auth.logout();
        }
      });
    }
  }
};

/**
 * ==============================================================================
 * UNIFIED GLASSMORPHISM TOAST NOTIFICATION ENGINE
 * Duy nhất một Toast Container trong DOM (tái sử dụng #toastContainer nếu có)
 * ==============================================================================
 */
function showToast(message, type = 'success') {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    container.setAttribute('aria-live', 'polite');
    container.style.zIndex = '9999';
    document.body.appendChild(container);
  } else {
    container.style.zIndex = '9999';
  }

  const toast = document.createElement('div');
  toast.className = 'toast-item';

  const icons = {
    success: `<span class="text-emerald-500 flex-shrink-0"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg></span>`,
    info: `<span class="text-indigo-500 flex-shrink-0"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></span>`,
    warning: `<span class="text-amber-500 flex-shrink-0"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg></span>`,
    error: `<span class="text-rose-500 flex-shrink-0"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg></span>`
  };

  toast.innerHTML = `
    ${icons[type] || icons.success}
    <div class="flex-1 text-xs sm:text-sm font-medium text-slate-800 dark:text-slate-100">
      ${message}
    </div>
    <button type="button" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 transition-colors cursor-pointer" title="Đóng">
      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
    </button>
  `;

  const closeBtn = toast.querySelector('button');
  const dismissToast = () => {
    toast.classList.add('is-dismissing');
    setTimeout(() => toast.remove(), 280);
  };

  if (closeBtn) closeBtn.addEventListener('click', dismissToast);
  container.appendChild(toast);

  setTimeout(() => {
    if (toast.parentElement) dismissToast();
  }, 3800);
}

// Đăng ký toàn cục Toast Engine
window.showToast = showToast;
window.TaskFlowToast = { show: showToast };
AppLayout.showToast = showToast;
window.AppLayout = AppLayout;
