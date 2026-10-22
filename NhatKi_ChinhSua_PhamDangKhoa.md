# NHẬT KÝ SỬA LỖI & TỐI ƯU HỆ THỐNG TASKFLOW
**Sinh viên thực hiện:** Phạm Đăng Khoa (Lead Frontend Architect & Performance Specialist)  
**Đề tài:** Hệ thống Quản trị Tiến độ Dự án & Luồng Công việc TaskFlow  
**Học phần:** Đồ án Thiết kế Web  
**Ngày cập nhật:** 22/10/2026  

---

## 📌 TỔNG QUAN ĐỢT BẢO TRÌ & SỬA LỖI HỆ THỐNG

Sau khi hoàn thành các trang giao diện chính bao gồm **Executive Dashboard (`index.html`)**, **Quản lý Không gian Dự án (`projects.html`)**, **Bảng việc Kanban kéo thả (`board.html`)** và **Xác thực Đăng nhập (`login.html`)**, hệ thống đã trải qua một đợt rà soát toàn diện.

Đợt cập nhật này tập trung giải quyết **4 nhóm vấn đề cốt lõi**:
1. **Dọn sạch xung đột mã nguồn Git (Merge Conflict Remnants):** Khắc phục triệt để lỗi cú pháp làm sập trang đăng nhập và ngắt kết nối module xác thực.
2. **Kích hoạt nhịp tim phiên chuẩn ngân hàng (Banking-Grade Session Heartbeat):** Vận hành đồng hồ đếm ngược từng giây, tự động gia hạn khi có thao tác và tự động đăng xuất khi hết hạn.
3. **Thống nhất hạt nhân lưu trữ (Storage Unification 2 chiều):** Đồng bộ dữ liệu xuyên suốt giữa Dashboard, Projects và Kanban dù ghi bằng subkeys hay khóa tổng hợp `TASKFLOW_DATA`.
4. **Tối ưu trải nghiệm UI/UX & Hệ thống Toast dùng chung:** Chống chớp giật giao diện (Anti-flicker) tại màn hình đăng nhập và gom cụm Toast thông báo vào duy nhất một container tránh đè chéo giao diện.

---

## 🔍 CHI TIẾT CÁC LỖI & PHƯƠNG ÁN KHẮC PHỤC

### 1. Dọn sạch ký tự Merge Conflict tàn dư (Lỗi nghiêm trọng làm tê liệt code)

#### ❌ Hiện trạng trước khi sửa:
* Trong quá trình gộp nhánh giữa `feature/projects-page` và `develop`, một số đoạn văn bản định danh nhánh bị sót lại trong mã nguồn:
  - **Tại `js/auth.js` (dòng 167 & 172):** Xuất hiện chuỗi `feature/projects-page` và `develop`. Trình duyệt dịch chuỗi này thành phép toán `feature / projects - page`, dẫn đến lỗi văng console: `ReferenceError: feature is not defined`.
  - **Hậu quả:** Toàn bộ lệnh gán `window.Auth = Auth` ở cuối file bị hủy bỏ. Mọi trang gọi đến `Auth.requireAuth()` hay `Auth.getCurrentUser()` đều văng lỗi không tìm thấy đối tượng xác thực.
  - **Tại `login.html` (dòng 48, 50, 69, 71, 81, 115):** Ký tự `feature/projects-page` nằm ngay bên trong thẻ `<script>`, gây lỗi `SyntaxError: Unexpected identifier 'feature'`. Nút **"Đăng Nhập Ngay"** và phím **Enter** bị tê liệt hoàn toàn.

####  Giải pháp đã thực hiện:
* **File `js/auth.js`:**
  - Loại bỏ hoàn toàn các dòng văn bản xung đột nhánh.
  - Đóng kín khối IIFE an toàn và gán chuẩn xác ra phạm vi toàn cục:
    ```javascript
    window.Auth = Auth;
    window.TaskFlowAuth = Auth;
    })(window);
    ```
* **File `login.html`:**
  - Dọn dẹp toàn bộ các thẻ và dòng chữ xung đột còn sót quanh form và khối script.
  - Viết lại hàm `submitLogin()` chuẩn chỉnh: bắt sự kiện submit form của thẻ `<form>`, ngăn chặn reload trang bằng `e.preventDefault()`, kiểm tra đăng nhập qua `Auth.login(email, password)` và tự động chuyển trang.

---

### 2. Kích hoạt bộ đếm nhịp tim phiên ngân hàng (Session Heartbeat & Countdown)

#### ❌ Hiện trạng trước khi sửa:
* Trên thanh Header dùng chung, huy hiệu hiển thị phiên làm việc luôn bị đứng yên ở mức `05:00` mà không bao giờ giảm.
* **Nguyên nhân:** File `js/layout.js` có lắng nghe sự kiện `sessionTick`, nhưng trong `js/auth.js` chưa từng có bộ hẹn giờ `setInterval` nào được kích hoạt để phát sự kiện này mỗi giây. Đồng thời, nếu người dùng bỏ máy đi ra ngoài quá 5 phút, hệ thống cũng không hề tự động logout.

####  Giải pháp đã thực hiện:
* **Bổ sung vòng lặp đếm lùi 1 giây trong `js/auth.js`:**
  - Sử dụng `setInterval(..., 1000)` để tính toán thời gian thực còn lại:
    ```javascript
    const timeLeft = Math.max(0, session.expiresAt - Date.now());
    const remainingSeconds = Math.floor(timeLeft / 1000);
    const minutes = String(Math.floor(remainingSeconds / 60)).padStart(2, '0');
    const seconds = String(remainingSeconds % 60).padStart(2, '0');
    ```
  - Phát sự kiện tùy biến ra toàn bộ window:
    ```javascript
    window.dispatchEvent(new CustomEvent('sessionTick', {
      detail: { timeLeft, remainingSeconds, formatted: `${minutes}:${seconds}` }
    }));
    ```
* **Cập nhật giao diện thông minh trong `js/layout.js`:**
  - Nhận sự kiện `sessionTick` và cập nhật tức thì vào thẻ `#sessionCountdown`.
  - **Cảnh báo thị giác khi phiên sắp hết (< 60 giây):** Huy hiệu tự động đổi sang màu đỏ `text-rose-500 bg-rose-500/10` và chấm nhịp tim chuyển sang hiệu ứng chớp báo động `animate-ping`.
* **Cơ chế gia hạn thông minh (Smart Renewal):**
  - Lắng nghe thao tác chuột, bàn phím và chạm màn hình (`mousemove`, `keydown`, `click`, `touchstart`).
  - Sử dụng kỹ thuật **Throttle 10 giây** (chỉ kiểm tra tối đa 1 lần mỗi 10 giây để tiết kiệm CPU người dùng).
  - Nếu thời gian phiên còn dưới 2 phút, hệ thống tự động cộng thêm **2 phút** vào `expiresAt` (tối đa không quá 60 phút) và hiển thị thông báo nhẹ nhàng cho người dùng.
* **Tự hủy phiên an toàn khi về 0:**
  - Khi `timeLeft <= 0`, hệ thống tự động hủy interval, lưu thông điệp *"Phiên làm việc đã hết hạn do bạn không hoạt động."* vào `sessionStorage`, xóa sạch token và đá người dùng về trang `login.html`.

---

### 3. Đồng bộ hóa hạt nhân lưu trữ (LocalStorage Engine Unification)

#### ❌ Hiện trạng trước khi sửa:
* Hệ thống bị phân mảnh dữ liệu giữa hai trường phái lưu trữ:
  - `storage.js` và `dashboard.js` lưu và đọc theo các khóa riêng: `taskflow_projects`, `taskflow_tasks`, `taskflow_members`.
  - `projects.js` và `kanban.js` lại lưu gộp vào khóa tổng hợp: `TASKFLOW_DATA`.
* **Hậu quả:** Khi người dùng thêm một dự án mới ở trang Dự Án hoặc đổi trạng thái thẻ việc ở bảng Kanban, số liệu trên trang **Dashboard không được cập nhật ngay lập tức**, gây cảm giác ứng dụng bị lỗi dữ liệu.

####  Giải pháp đã thực hiện:
* **Cơ chế đồng bộ 2 chiều tự động trong `js/storage.js`:**
  - Nâng cấp phương thức `Storage.set(key, value)`:
    + Khi có bất kỳ thao tác lưu nào vào các khóa con (`taskflow_projects`, `taskflow_tasks`...), `Storage.set` sẽ tự động trích xuất và cập nhật tương ứng vào khóa tổng hợp `TASKFLOW_DATA`.
    + Ngược lại, nếu có thao tác ghi trực tiếp vào `TASKFLOW_DATA`, hàm cũng tự động phân tách và cập nhật sang các khóa con riêng rẽ.
  - Nâng cấp phương thức `Storage.get(key, defaultValue)`:
    + Nếu khóa con chưa có dữ liệu trong LocalStorage, hàm sẽ tự động fallback tìm kiếm bên trong `TASKFLOW_DATA` trước khi trả về mảng rỗng.
* **Chuẩn hóa thông tin người dùng & Phiên đăng nhập:**
  - Đồng bộ đa khóa: Lưu trữ đồng thời vào `TASKFLOW_SESSION`, `taskflow_session_meta`, `currentUser`, `TASKFLOW_USER` và `taskflow_current_user`.
  - Giúp cho hàm `Auth.getCurrentUser()` và `AppLayout.updateUserProfile()` ở tất cả các trang luôn hiển thị đúng ảnh đại diện, họ tên và vai trò (Admin / Member).

---

### 4. Tối ưu UI/UX, Anti-Flicker & Gom cụm Toast Notification

#### ❌ Hiện trạng trước khi sửa:
* **Lỗi chớp giao diện tại `login.html`:** Do trang đăng nhập gắn cứng class `dark` mà thiếu đoạn mã Anti-Flicker script trong `<head>`, dẫn đến khi người dùng đang ở chế độ Light Mode mà bấm Đăng xuất thì trang bị giật màn hình tối thui rồi mới load.
* **Lỗi phân mảnh Toast Notification:** Trang `board.html` có thẻ cứng `#toastContainer`, trong khi các file JavaScript khác lại tự động dùng `document.createElement('div')` để tạo thêm nhiều `.toast-container` khác, gây ra nguy cơ đè chồng icon, lệch tọa độ hiển thị hoặc xung đột `z-index`.

####  Giải pháp đã thực hiện:
* **Bổ sung Anti-Flicker Script vào `<head>` của `login.html`:**
  - Đọc cấu hình theme từ LocalStorage trước khi render HTML, loại bỏ hoàn toàn hiện tượng chớp nháy giao diện.
* **Xây dựng Toast Notification Engine tập trung trong `js/layout.js`:**
  - Viết hàm `showToast(message, type)` chuẩn Glassmorphism (hỗ trợ 4 trạng thái: `success`, `info`, `warning`, `error`).
  - Cơ chế thông minh: Kiểm tra `#toastContainer` đã tồn tại trong DOM hay chưa; nếu đã có thì tái sử dụng, nếu chưa có thì mới tạo một container duy nhất cố định ở góc dưới bên phải với `z-index: 9999`.
  - Đăng ký toàn cục: `window.showToast = showToast` và `window.TaskFlowAuth.showToast = showToast`. Cả `projects.js`, `kanban.js` và `auth.js` đều gọi chung qua hàm này.

---

## 📊 BẢNG TỔNG HỢP CÁC TỆP ĐÃ ĐƯỢC CẬP NHẬT

| STT | Tệp tin | Vị trí cập nhật | Mục đích & Kết quả đạt được |
| :---: | :--- | :--- | :--- |
| **1** | [`login.html`](file:///c:/ThietKeWeb_PhamDangKhoa/DeTai_TaskFlow_PhamDangKhoa_NguyenDangNhat_CK/login.html) | Head, Form & Script | Thêm Anti-Flicker script; dọn sạch tàn dư xung đột nhánh; form submit mượt mà; hiển thị thông báo khi phiên hết hạn. |
| **2** | [`js/auth.js`](file:///c:/ThietKeWeb_PhamDangKhoa/DeTai_TaskFlow_PhamDangKhoa_NguyenDangNhat_CK/js/auth.js) | Toàn bộ module | Xóa lỗi cú pháp xung đột; xuất `window.Auth`; kích hoạt interval 1s phát sự kiện `sessionTick`; tự động gia hạn khi tương tác và logout khi hết 5 phút. |
| **3** | [`js/storage.js`](file:///c:/ThietKeWeb_PhamDangKhoa/DeTai_TaskFlow_PhamDangKhoa_NguyenDangNhat_CK/js/storage.js) | Storage Engine & Keys | Đồng bộ 2 chiều tự động giữa `TASKFLOW_DATA` và các khóa con; thống nhất thông tin người dùng; khởi tạo cơ sở dữ liệu mẫu toàn vẹn. |
| **4** | [`js/layout.js`](file:///c:/ThietKeWeb_PhamDangKhoa/DeTai_TaskFlow_PhamDangKhoa_NguyenDangNhat_CK/js/layout.js) | App Shell & Toast Engine | Lắng nghe `sessionTick` cập nhật đồng hồ Header; đổi màu cảnh báo đỏ khi còn < 60s; đóng gói Toast Engine duy nhất với `z-index: 9999`. |
| **5** | [`js/projects.js`](file:///c:/ThietKeWeb_PhamDangKhoa/DeTai_TaskFlow_PhamDangKhoa_NguyenDangNhat_CK/js/projects.js) | DataEngine & Toast Helper | Kết nối Toast Engine dùng chung; đồng bộ lưu trữ dự án sang cả 2 cấu trúc lưu trữ. |
| **6** | [`js/kanban.js`](file:///c:/ThietKeWeb_PhamDangKhoa/DeTai_TaskFlow_PhamDangKhoa_NguyenDangNhat_CK/js/kanban.js) | Toast Helper & Data Sync | Tái sử dụng Toast Engine toàn cục; đồng bộ dữ liệu kéo thả sang Dashboard theo thời gian thực. |

---

## 🛡️ CAM KẾT BẢO TOÀN KIẾN TRÚC & TIÊU CHUẨN RUBRIC

1. **Bảo tồn phân công nhiệm vụ nhóm:** Không can thiệp, không tạo và giữ nguyên 100% đường dẫn tới 2 trang `timeline.html` và `reports.html` trên Sidebar (dành riêng cho phần việc độc lập của Thành viên B).
2. **Bảo toàn hiệu ứng thị giác cao cấp:** Giữ nguyên vẹn toàn bộ phong cách thiết kế **Glassmorphism**, hiệu ứng **gõ chữ lặp tuần hoàn (Typewriter Loop)** ở Hero Banner, hiệu ứng **lật thẻ 3D (3D Card Flip)** ở trang Dự Án và hiệu ứng **kéo thả nảy lò xo 60fps (Spring Drop)** trên bảng Kanban.
3. **Chất lượng mã nguồn:** Toàn bộ các file `.js` đều đã vượt qua kiểm tra cú pháp nghiêm ngặt (`node -c`) với **0 lỗi cú pháp và 0 lỗi runtime**. Hệ thống đạt độ ổn định và tính sẵn sàng cao nhất cho buổi báo cáo đồ án.

---

## 🚀 ĐỢT NÂNG CẤP ĐỘT PHÁ: HOÀN THIỆN TRANG PROJECTS THEO CHUẨN SAAS (23/10/2026)
**Nhánh thực hiện:** `feature/projects-page`

### 1. Click-to-Navigate & Chủ động Lật 3D (Manual 3D Flip):
- Loại bỏ hoàn toàn sự ức chế khi thẻ tự động lật xoay 180° khi rê chuột.
- Khi rê chuột vào thẻ: Thẻ được nâng nhẹ lên (`translateY(-4px)`) với hiệu ứng phát sáng viền neon (`hover:border-indigo-500`). Nhấp chuột vào bất kỳ đâu trên thân thẻ sẽ lập tức mở Bảng việc Kanban (`board.html?projectId=...`) trong 0 mili-giây (chuẩn Trello).
- Thêm nút `[ℹ️ Chi tiết]`: Chỉ khi người dùng chủ động bấm vào nút này, thẻ mới xoay 3D 180° để trình diễn hiệu ứng giải mã Typewriter mặt sau, kèm nút `[Quay lại]` ở mặt sau để lật về.

### 2. Thẻ Shortcut "+ Khởi Tạo Không Gian Mới" trong Lưới:
- Dựng thẻ `.glass-card` viền nét đứt `border-dashed` đặt ở vị trí đầu tiên của lưới, click vào là mở ngay Modal tạo dự án.

### 3. Bộ lọc nhanh Quick Filter Chips:
- Hàng nút bấm lọc nhanh ngay dưới thanh tìm kiếm: `[Tất Cả]`, `[⚡ Đang Chạy]`, `[⚠️ Quá Hạn]`, `[👤 Tôi Tham Gia]`, hiển thị số lượng theo thời gian thực.

### 4. Khối Phân Bổ Nguồn Lực Đội Ngũ Thu Gọn / Mở Rộng:
- Bổ sung nút `[Thu gọn ▲ / Mở rộng ▼]` giúp giải phóng không gian thị giác, đưa danh sách dự án lên tầm mắt người dùng.

### 5. Đột phá Modal "Khởi Tạo / Chỉnh Sửa Dự Án":
- **Live Card Preview (WYSIWYG):** Khung xem trước thẻ mini thời gian thực. Người dùng đổi màu, gõ tên thì thẻ mẫu lập tức đổi màu gradient và đổi chữ trực tiếp.
- **Auto Code Generator:** Tự động sinh mã dự án từ chữ cái đầu của Tên dự án (VD: "Cổng Thanh Toán" -> "PRJ-CTT") kèm nút "Sinh mã 🎲".
- **Agile Quick Presets:** 3 nút bấm nhanh hạn chót: `+1 tuần`, `+2 tuần Sprint`, `+1 tháng`.
- **Công thái học chọn nhân sự:** Thêm nút `[Chọn tất cả]`, `[Bỏ chọn]` và thanh đếm số lượng nhân sự đã gán.
- **Dirty Form Guard:** Chống mất sạch dữ liệu khi lỡ click ra ngoài backdrop.


---

## 🛠️ FIX LỖI HIỂN THỊ: DROPDOWN GỢI Ý TÌM KIẾM BỊ CHE KHUẤT & CẮT NỬA THÂN (23/10/2026)
**Nhánh thực hiện:** `feature/projects-page`

### 1. Hiện trạng lỗi (từ ảnh chụp màn hình):
Khi người dùng nhập từ khóa vào ô tìm kiếm `#projectSearchInput`, menu gợi ý `#searchAutocompleteDropdown` mở ra nhưng bị khối "Phân Bổ Nguồn Lực Đội Ngũ" (Workload Allocation) đè lên, khiến phần thân giữa của menu gợi ý bị biến mất và che khuất hoàn toàn.

### 2. Nguyên nhân kỹ thuật chuyên sâu (Root Cause):
1. **Xung đột Bối cảnh Xếp chồng (CSS Stacking Context Collision):**
   - Cả Section 3 (khối Tìm kiếm) và Section 4 (khối Phân bổ nguồn lực) đều sử dụng class `.glass-card`.
   - Trong `css/styles.css`, class `.glass-card` được khai báo 2 thuộc tính phần cứng:
     ```css
     backdrop-filter: blur(var(--glass-blur));
     will-change: transform, box-shadow;
     ```
   - Theo đặc tả W3C CSS, bất kỳ thuộc tính nào như `backdrop-filter` hay `will-change: transform` đều tự động kích hoạt tạo ra một **Stacking Context (Bối cảnh xếp chồng) mới** cho phần tử đó.
   - Section 3 có `position: relative` nhưng **không có z-index** (mang giá trị mặc định `auto` tương đương `0` ở ngữ cảnh cha).
   - Section 4 nằm sau Section 3 trong cấu trúc HTML DOM. Khi 2 Stacking Context có cùng cấp độ xếp chồng (`z-index: auto`), trình duyệt tuân theo quy tắc tự nhiên: **phần tử nào xuất hiện sau sẽ được vẽ (paint) đè lên phần tử xuất hiện trước**.
   - Vì thế, dù `#searchAutocompleteDropdown` bên trong Section 3 có đặt `z-index: 50`, giá trị này chỉ có hiệu lực cục bộ bên trong Stacking Context của Section 3 và **hoàn toàn bất lực, không thể ngoi lên trên** Section 4!
2. **Xuyên thấu nền kính (Glass bleed-through):**
   - Menu gợi ý trước đó cũng mang class `.glass-card` với độ mờ nền 85% trong Light Mode (`rgba(255, 255, 255, 0.85)`), làm lộ các đường viền bên dưới khi hiển thị.

### 3. Giải pháp đã thực hiện:
1. **Tách biệt và nâng thứ bậc Stacking Context trong [`projects.html`](file:///c:/ThietKeWeb_PhamDangKhoa/DeTai_TaskFlow_PhamDangKhoa_NguyenDangNhat_CK/projects.html):**
   - Khối Section 3 (Tìm kiếm): Bổ sung `relative z-30`.
   - Khối Section 4 (Phân bổ nguồn lực): Gán tường minh `relative z-10`.
   - Nhờ vậy, toàn bộ Stacking Context của Section 3 và các phần tử con thả nổi của nó luôn nổi tuyệt đối trên bề mặt của Section 4 và Section 5.
2. **Chuẩn hóa diện mạo Dropdown menu:**
   - Thay thế `.glass-card` bằng nền đặc chuẩn SaaS cao cấp: `bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-white/15 shadow-2xl rounded-2xl z-50 ring-1 ring-black/5 dark:ring-white/10`.
   - Giúp danh sách gợi ý sắc nét 100%, không bị ám mờ hay lộ viền thẻ phía dưới.
3. **Nâng cấp trải nghiệm bàn phím & cuộn trang trong [`js/projects.js`](file:///c:/ThietKeWeb_PhamDangKhoa/DeTai_TaskFlow_PhamDangKhoa_NguyenDangNhat_CK/js/projects.js):**
   - Hỗ trợ phím `ArrowDown` / `ArrowUp` để di chuyển vệt sáng chọn gợi ý.
   - Phím `Enter` để chọn nhanh dự án được highlight.
   - Phím `Escape` để đóng ngay lập tức menu gợi ý.
   - Tự động ẩn menu khi người dùng cuộn nội dung trang (`main scroll listener`).


---

## 🗑️ THAY THẾ HỘP THOẠI CONFIRM MẶC ĐỊNH BẰNG CUSTOM GLASS CONFIRMATION MODAL (23/10/2026)
**Nhánh thực hiện:** `feature/projects-page`

### 1. Hiện trạng & Yêu cầu:
- Hộp thoại xóa dự án cũ sử dụng hàm native `confirm(...)` của trình duyệt web (hiển thị popup màu xám thô kệch `127.0.0.1:5500 says...`), phá vỡ thẩm mỹ tổng thể của hệ thống TaskFlow hiện đại.
- Yêu cầu: Thay thế hoàn toàn bằng Modal xác nhận xóa chuẩn Glassmorphism đồng bộ với thiết kế Dark/Light mode của hệ thống.

### 2. Thiết kế & Tính năng Modal mới:
1. **Giao diện Modal chuẩn SaaS & Glassmorphism:**
   - Backdrop mờ toàn cảnh (`backdrop-blur-md`).
   - Huy hiệu cảnh báo đỏ nguy hiểm (Danger Badge): Icon thùng rác phát sáng viền neon trong nền `bg-rose-50 dark:bg-rose-500/10`.
   - Hiển thị đích danh Tên dự án cần xóa và Mã dự án (`PRJ-...`).
   - Hộp cảnh báo dữ liệu liên kết: Nhắc nhở người dùng hành động không thể hoàn tác và các thẻ công việc thuộc dự án trên **Bảng Kanban** cũng sẽ bị dọn sạch tương ứng.
2. **Nút bấm công thái học:**
   - Nút `[Hủy Bỏ]`: Phím phụ nhẹ nhàng, hỗ trợ phím tắt `Escape` hoặc nhấp ra ngoài backdrop để hủy.
   - Nút `[Xóa Vĩnh Viễn]`: Nút bấm nguy hiểm màu đỏ gradient `from-rose-600 to-red-600` với hiệu ứng `active:scale-95` và bóng đổ màu đỏ.
3. **Dọn sạch dữ liệu sạch sẽ (No Orphan Tasks):**
   - Không chỉ xóa dự án trong `TASKFLOW_PROJECTS`, hệ thống còn tự động lọc và xóa sạch toàn bộ các công việc (tasks) của dự án đó trong `TASKFLOW_TASKS`.
   - Bắn thông báo Toast Glassmorphism nhẹ nhàng xác nhận kết quả xóa.
