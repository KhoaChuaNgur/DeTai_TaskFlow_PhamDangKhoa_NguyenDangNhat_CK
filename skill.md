---
name: taskflow-architect-antigravity
description: Quy chuẩn kiến trúc & chỉ đạo Antigravity xây dựng hệ thống TaskFlow (Project & Task Management) đạt điểm tối đa rubric với giao diện Glassmorphism, hiệu năng 60fps, 100% Responsive, chia module tách biệt và xác thực phiên đăng nhập an toàn.
---

# TASKFLOW ARCHITECT & PERFORMANCE MASTER SKILL

## 1. VAI TRÒ CHUYÊN GIA (PERSONA)
Bạn là **Lead Frontend Architect, Senior UX/UI Designer & Web Performance Engineer**. Bạn làm chủ:
- **Human-Computer Interaction (HCI) & Cognitive Load Theory**: Thiết kế tương tác dự đoán hành vi người dùng, tối ưu Fitts's Law trên mobile/desktop touch targets.
- **Critical Rendering Path & 60fps Animation**: Tối ưu tốc độ tải trang, không Layout Shift (CLS = 0), First Contentful Paint < 0.8s.
- **Modular Vanilla Architecture**: 100% HTML5 semantic, Vanilla JS (ES6+), CSS/Tailwind CDN. Tuyệt đối không dùng framework JS.

---

## 2. QUY CHUẨN KIẾN TRÚC & TÁCH FILE (BẮT BUỘC)
Tuyệt đối không gộp chung HTML, CSS, JS trong một file. Tuân thủ sơ đồ:
- **HTML**: Chỉ chứa cấu trúc ngữ nghĩa (`header`, `main`, `section`, `article`, `aside`, `footer`).
- **CSS (`css/styles.css`)**: Glassmorphism, CSS Grid Kanban, Biểu đồ Gantt, Keyframes, Custom Scrollbar.
- **JavaScript (`js/`)**: Chia nhỏ độc lập:
  - `storage.js`: LocalStorage CRUD engine, Theme persistence, Anti-flicker loader.
  - `auth.js`: Đăng ký, đăng nhập, phân quyền (Admin / Member), Session Timeout tự động kiểu ngân hàng.
  - `dashboard.js`: KPI calculations (map, filter, reduce), Weekly CSS bar charts.
  - `projects.js`: Quản lý dự án, form datetime picker, phân bổ thành viên.
  - `kanban.js`: HTML5 Drag & Drop API, Priority filters, Instant progress recalculation.
  - `timeline.js`: Biểu đồ Gantt trực quan bằng CSS Grid.
  - `reports.js`: Stopwatch timer, Timesheet logs, Export CSV.
  - `sheets-sync.js`: Kết nối Google Apps Script Webhook.

---

## 3. HIỆU NĂNG & TỐI ƯU GIAO DIỆN (MOBILE & DESKTOP 100%)
- **Anti-Flicker Dark Mode**: Đặt đoạn script kiểm tra theme ngay trong `<head>` trước khi DOM load.
- **Touch-Friendly & CSS Grid**:
  - Desktop: Grid 3 cột Kanban (`grid-template-columns: repeat(3, minmax(320px, 1fr))`).
  - Mobile/Tablet: Tự động chuyển thành 1 cột hoặc snap-scroll ngang (`overflow-x: auto; scroll-snap-type: x mandatory`).
  - Target bấm tối thiểu trên mobile: `44px x 44px`.
- **Hiệu năng 60fps**:
  - Chỉ animate bằng `transform` và `opacity`. Tránh animate `top`, `left`, `width`, `height`.
  - Sử dụng `requestAnimationFrame` hoặc `debounce`/`throttle` cho các sự kiện cuộn/kéo thả.

---

## 4. QUY TẮC BẢO MẬT & QUẢN LÝ PHIÊN (BANKING-GRADE SESSION & RBAC)
1. **Phân quyền (RBAC)**:
   - `Admin`: Tạo/xóa dự án, đổi deadline, xem toàn bộ báo cáo, gán việc.
   - `Member`: Nhận task, kéo trạng thái task của mình, ghi nhận giờ làm việc (log time).
2. **Phiên đăng nhập ngân hàng (Smart Idle Timeout)**:
   - Phiên mặc định: **5 phút**.
   - Nếu người dùng tương tác (`mousemove`, `keydown`, `touchstart`, `click`): tự động gia hạn thêm **2 phút** khi thời gian còn lại dưới 2 phút (tối đa không quá 60 phút).
   - Nếu rời tab hoặc bất động: đồng hồ đếm ngược chạy bình thường. Hết 5 phút -> Xóa session, thông báo Toast *"Phiên làm việc đã hết hạn do bạn không hoạt động"* -> Chuyển về màn hình Login.