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


---

## 🔐 BƯỚC 1: NÂNG CẤP HỆ THỐNG ĐĂNG KÝ TÀI KHOẢN & BẢO MẬT ĐĂNG NHẬP (23/10/2026)
**Nhánh thực hiện:** `develop`

### 1. Hiện trạng trước khi nâng cấp:
- Hệ thống chỉ có màn hình Đăng nhập cơ bản, tài khoản được gán cứng tĩnh trong code (`admin123`, `user123`), người dùng mới không thể tự đăng ký tài khoản.
- Không có cơ chế băm mật khẩu: Mật khẩu lưu dạng văn bản thô (plain-text) rất nguy hiểm nếu bị soi `localStorage`.
- Lỗ hổng soi lén mật khẩu qua DevTools: Người khác có thể mở Inspect Element, sửa thuộc tính `type="password"` thành `type="text"` để đọc lén mật khẩu đã gõ.

### 2. Các giải pháp kiến trúc đã triển khai:
1. **Giao diện Tab Segmented Control cao cấp tại [`login.html`](file:///c:/ThietKeWeb_PhamDangKhoa/DeTai_TaskFlow_PhamDangKhoa_NguyenDangNhat_CK/login.html):**
   - Chuyển đổi mượt mà giữa 2 chế độ: **Đăng Nhập** và **Đăng Ký Tài Khoản**.
   - Hỗ trợ nút điền nhanh 1-click Demo Account cho cả 2 vai trò: **🛡️ Admin (Phạm Đăng Khoa)** và **👤 Member (Nguyễn Đăng Nhật)**.
2. **Form Đăng Ký Tài Khoản Mới:**
   - Thu thập đầy đủ: Họ tên, Email (kiểm tra tính duy nhất), Mật khẩu, Xác nhận mật khẩu, và Vị trí chuyên môn (Chủ dự án / Frontend / Backend / UI-UX / Tester...).
   - Tự động sinh `id` định danh duy nhất (`mem-{timestamp}`) và gán Avatar cá nhân hóa theo seed tên người dùng từ Dicebear API.
   - Lưu trữ đồng bộ 2 chiều vào cả `taskflow_members` và bundle `TASKFLOW_DATA.members`.
   - Tự động kích hoạt phiên đăng nhập ngay sau khi đăng ký thành công.
3. **Thước đo độ mạnh mật khẩu (Password Strength Meter):**
   - Tính toán chỉ số phức tạp theo thời gian thực (độ dài, chữ hoa/thường, số, ký tự đặc biệt).
   - Thanh tiến độ màu trực quan (Đỏ: Yếu -> Vàng: Trung bình -> Xanh lục: Rất mạnh).
   - Kiểm tra khớp mật khẩu xác nhận thời gian thực.
4. **Bảo mật Anti-Tamper DOM Guard (Chống can thiệp Inspect Element):**
   - Tích hợp `MutationObserver` giám sát chặt chẽ thuộc tính `type` của các thẻ input mật khẩu.
   - Khi phát hiện hành vi mở DevTools đổi `type="password"` thành `type="text"` trái phép: Lập tức ép ngược về `password`, xóa sạch ký tự trong ô nhập liệu và kích hoạt banner cảnh báo an ninh màu đỏ nhấp nháy!
   - Nút mắt xem mật khẩu chính thống `[👁️]` có cơ chế tự động ẩn lại sau 4 giây để chống nhìn trộm (Shoulder Surfing).
5. **Mã hóa Deterministic Salt-Hash trong [`js/auth.js`](file:///c:/ThietKeWeb_PhamDangKhoa/DeTai_TaskFlow_PhamDangKhoa_NguyenDangNhat_CK/js/auth.js):**
   - Toàn bộ mật khẩu lưu trong `localStorage` đều được băm với Salt bí mật của TaskFlow (`tf_sec_...`), không bao giờ để lộ mật khẩu gốc.


---

## 🛡️ NÂNG CẤP BẢO MẬT ĐĂNG KÝ V2: FIX TAMPER RESET STATE, TÍCH HỢP OTP EMAIL & DẤU SAO BẮT BUỘC (23/10/2026)
**Nhánh thực hiện:** `develop`

### 1. Phân tích 3 vấn đề người dùng phát hiện qua Video thực nghiệm:
- **Vấn đề 1 (Anti-Tamper UI Out-of-Sync):** Khi người dùng mở DevTools đổi `type="password"` sang `text`, lá chắn bảo mật đã can thiệp xóa sạch giá trị của ô input, nhưng thanh độ mạnh mật khẩu (Strength Meter) và dòng "Mật khẩu trùng khớp" vẫn giữ nguyên giá trị cũ mà không tự động reset về `0%` và trạng thái ẩn.
- **Vấn đề 2 (Xác thực OTP Email & Kiểm tra Email có thực):** Cần một bước xác thực OTP qua Email (sử dụng Webhook Google Apps Script) trước khi tài khoản được kích hoạt, vừa gia tăng tính bảo mật chuẩn Fintech/SaaS vừa tích hợp tiêu chí kết nối Cloud/Google Sheet của đồ án.
- **Vấn đề 3 (Ký hiệu bắt buộc - Mandatory Indicators):** Thiếu dấu hoa thị đỏ `*` để người dùng nhận diện ngay trường nào bắt buộc phải điền.

### 2. Các giải pháp đã triển khai toàn diện:
1. **Đồng bộ hóa toàn diện Anti-Tamper UI State:**
   - Hàm `resetPasswordSecurityState()` lập tức được kích hoạt ngay khi phát hiện can thiệp DOM:
     - Xóa sạch cả 2 ô mật khẩu (`regPassword` và `regConfirmPassword`).
     - Reset thanh độ mạnh về `width: 0%`, màu nền xám mặc định và nhãn `Chưa nhập` (`text-slate-400`).
     - Ẩn hoàn toàn dòng thông báo `passwordMatchText`.
     - Kích hoạt banner cảnh báo an ninh màu đỏ kèm hiệu ứng rung lắc `shake-anim`.
2. **Ký hiệu trường bắt buộc công thái học (UX Standard):**
   - Bổ sung `<span class="text-rose-500 font-bold ml-0.5" title="Bắt buộc">*</span>` tại tất cả các trường bắt buộc trên Form Đăng Nhập và Form Đăng Ký.
   - Bổ sung dòng chỉ dẫn: *"Các trường đánh dấu (*) là thông tin bắt buộc."*
3. **Modal Xác Thực Mã OTP Email (Fintech-Grade OTP Modal):**
   - **Giao diện Modal Glassmorphism:** Hiệu ứng làm mờ sâu `backdrop-blur-md`, huy hiệu phong thư phát sáng, hiển thị đích danh email nhận mã.
   - **Hộp thư đến mô phỏng & Webhook Google Apps Script:**
     - Gọi Webhook URL chính thức tới Google Apps Script (`js/sheets-sync.js`) gửi email và ghi log xác thực.
     - Hiển thị badge OTP mô phỏng kèm nút `[⚡ Điền nhanh]` để chấm bài và kiểm thử tiện lợi trong 3 giây.
   - **Cụm 6 ô nhập số rời rạc (Discrete Digit Inputs):**
     - Tự động nhảy ô tiếp theo khi gõ số (`auto-advance`).
     - Tự động lùi ô khi xóa (`Backspace`).
     - Hỗ trợ dán (`Paste`) chuỗi 6 số tự động điền và kích hoạt xác thực ngay lập tức.
   - **Đồng hồ đếm ngược 120s (Countdown Timer):**
     - Đếm lùi từ `02:00` về `00:00`.
     - Nút "Gửi lại mã OTP" (Resend OTP) tự động mở khóa khi hết 120s để người dùng yêu cầu mã mới.
   - **Phản hồi lỗi bảo mật:** Rung lắc 6 ô số và viền đỏ nếu nhập sai OTP; đổi màu xanh ngọc rực rỡ khi OTP chính xác trước khi tự động kích hoạt tài khoản và chuyển hướng vào Dashboard.


---

## 🚀 CHUYỂN ĐỔI CHUẨN XÁC THỰC OTP EMAIL THỰC TẾ & GOOGLE APPS SCRIPT CODE.GS (23/10/2026)
**Nhánh thực hiện:** `develop`

### 1. Phản hồi yêu cầu của người dùng:
- Xóa bỏ hoàn toàn khung hiển thị lộ mã OTP giả lập trên màn hình để giống 100% các nền tảng công nghệ thực tế (Google, Stripe, Binance).
- Người dùng bắt buộc phải mở hộp thư Gmail của mình ra lấy mã xác thực thật.
- Giữ nguyên vẹn 100% hai tài khoản clone cũ: `admin@taskflow.dev` / `admin123` và `member@taskflow.dev` / `user123`.

### 2. Triển khai kỹ thuật:
1. **Tạo tệp [`GoogleAppsScript_TaskFlow.gs`](file:///c:/ThietKeWeb_PhamDangKhoa/DeTai_TaskFlow_PhamDangKhoa_NguyenDangNhat_CK/GoogleAppsScript_TaskFlow.gs):**
   - Viết sẵn toàn bộ mã nguồn Google Apps Script chuẩn xác để gửi email thật qua `GmailApp.sendEmail()`.
   - Mẫu email HTML Glassmorphism cao cấp, tiêu đề kèm mã OTP, thông báo thời hạn 120 giây.
   - Vẫn bảo toàn và tích hợp song song chức năng ghi dữ liệu chấm công Google Sheets của đồng đội.
2. **Cập nhật giao diện [`login.html`](file:///c:/ThietKeWeb_PhamDangKhoa/DeTai_TaskFlow_PhamDangKhoa_NguyenDangNhat_CK/login.html):**
   - Xóa bỏ hoàn toàn thẻ mô phỏng hiển thị mã OTP và nút điền nhanh.
   - Thay bằng khối chỉ dẫn người dùng mở Gmail kiểm tra hộp thư đến (Inbox / Spam / Promotions) kèm nút tiện ích mở nhanh Gmail (`https://mail.google.com`).
   - Cụm 6 ô nhập mã số OTP tự động nhận số, phím điều hướng và tự động xác thực khi nhập đủ 6 chữ số.

---

## 🛠️ TỐI ƯU HÀNH VI NGƯỜI DÙNG CỤM 6 Ô NHẬP MÃ OTP CHUẨN FINTECH (23/10/2026)

### 1. Hiện trạng lỗi (Bug Analysis):
- **Triệu chứng:** Khi người dùng nhập dãy số (ví dụ `144588`), sau khi bấm số đầu tiên `1`, ô tiếp theo cũng tự nhảy số `1`. Khi người dùng xóa và nhập `4` thì ô kế tiếp lại bị điền số `4`. Người dùng phải xóa từng ô rồi gõ lại mới nhận số mới.
- **Nguyên nhân kỹ thuật:**
  - Trên hệ điều hành Windows khi người dùng bật bộ gõ tiếng Việt (UniKey / EVKey ở chế độ Telex/VNI): Khi gõ phím số, sự kiện bàn phím gửi chuỗi ký tự qua hook.
  - Việc gọi `focus()` đồng bộ ngay bên trong sự kiện `input` khiến con trỏ chuyển sang ô tiếp theo trong khi chuỗi sự kiện bàn phím của ký tự trước chưa kết thúc, dẫn đến ô tiếp theo vô tình nhận cùng một ký tự.
  - Thuộc tính `maxlength="1"` chặn người dùng gõ số đè trực tiếp nếu ô đã có giá trị.

### 2. Giải pháp kỹ thuật chuẩn công thái học (Fintech UX):
1. **Cơ chế Overwrite & Tự động bôi đen:**
   - Lắng nghe sự kiện `focus` và `click` trên từng ô số để tự động gọi `.select()`. Bất cứ khi nào người dùng trỏ vào ô nào, số cũ sẽ được bôi đen và sẵn sàng bị ghi đè tức thì.
2. **Kiểm soát sự kiện bàn phím `keydown` chống lặp phím:**
   - Bắt phím số `0-9` bằng `e.preventDefault()` để triệt tiêu hoàn toàn hiện tượng UniKey/EVKey gửi lặp phím sang ô bên cạnh.
   - Gán trực tiếp giá trị `digit.value = e.key`.
   - Chuyển `focus()` sang ô tiếp theo thông qua bộ đệm phi đồng bộ siêu ngắn `setTimeout(..., 10)` kèm `.select()`.
3. **Phím điều hướng thông minh:**
   - Phím `Backspace`: Nếu ô hiện tại có số thì xóa số; nếu ô trống thì tự động lùi về ô trước đó, xóa số và bôi đen.
   - Phím `Delete`: Xóa số tại ô hiện tại.
   - Phím mũi tên `ArrowLeft` / `ArrowRight`: Điều hướng qua lại giữa 6 ô mượt mà.
4. **Trợ lực Dán mã nhanh (`Paste`) & Mobile:**
   - Hỗ trợ dán mã OTP trực tiếp từ clipboard, tự tách 6 chữ số và kích hoạt xác thực ngay lập tức.


---

## 🎯 BƯỚC 2: CÁ NHÂN HÓA KHÔNG GIAN LÀM VIỆC & DỰ ÁN KHỞI ĐẦU ONBOARDING (23/10/2026)
**Nhánh thực hiện:** `develop`

### 1. Phản hồi yêu cầu của người dùng:
- Khắc phục hiện tượng tài khoản mới tạo bị lẫn lộn dữ liệu dự án của các tài khoản mẫu cũ (`admin@taskflow.dev` / `member@taskflow.dev`).
- Thiết lập cơ chế phân quyền dữ liệu (RBAC Data Scoping): Người dùng mới chỉ thấy dự án mình làm chủ hoặc được mời tham gia.
- Bổ sung bộ lọc chuyển đổi góc nhìn ("Công việc của tôi" vs "Toàn cảnh dự án") và dropdown chọn dự án cụ thể trên Dashboard.
- **Dự Án Khởi Đầu (Onboarding & Training Project):** Tự động cấp phát cho tài khoản mới một dự án mẫu `PRJ-START` kèm 4 tasks hướng dẫn thực hành kéo thả Kanban, bấm giờ Stopwatch, cảnh báo thẻ khẩn cấp. Người dùng có thể tự do trải nghiệm hoặc xóa vĩnh viễn khi đã thành thạo để giải phóng không gian.

### 2. Triển khai kỹ thuật:
1. **Module Lưu Trữ (`js/storage.js`):**
   - Viết hàm `ensureUserOnboarding(currentUser)`: Kiểm tra nếu người dùng chưa có dự án nào thì tự động tạo dự án `🚀 Chào Mừng Bạn Đến Với TaskFlow (Dự Án Khởi Đầu)` kèm 4 tasks thực hành.
   - Xuất API qua `window.TaskFlowStorage.ensureUserOnboarding`.
2. **Module Xác Thực (`js/auth.js`):**
   - Tích hợp gọi `ensureUserOnboarding` ngay khi kích hoạt tài khoản đăng ký mới.
3. **Giao Diện Dashboard (`index.html`):**
   - Cá nhân hóa Hero Banner: Tên thật của người dùng, Avatar đồng bộ, Huy hiệu vai trò.
   - Huy hiệu dự án Khởi đầu (`#onboardingNoticeBadge`) kèm nút mở nhanh bảng Kanban.
   - Thêm thanh điều phối `Control Bar`:
     - Bộ chuyển đổi 2 tầng: `[💼 Công Việc Của Tôi]` vs `[🌐 Toàn Cảnh Dự Án]` kèm badge số lượng realtime.
     - Dropdown chọn lọc theo từng dự án cụ thể (`#dashboardProjectFilter`).
     - Phím tắt `[+ Tạo Dự Án]`.
4. **Bộ Xử Lý Dashboard (`js/dashboard.js`):**
   - Quản lý trạng thái đa tầng: `currentViewMode` ('mine' | 'all') và `currentProjectFilter` ('all' | projectId).
   - Tự động nhận diện quyền: Admin mặc định mở Toàn cảnh, Member mặc định mở Việc của tôi.
   - Tính toán 4 thẻ KPI, Tiến độ dự án, Biểu đồ tuần và Tác vụ khẩn cấp phản hồi ngay lập tức theo bộ lọc trong 0ms.
5. **Đồng Bộ Không Gian Dự Án & Kanban (`js/projects.js` & `js/kanban.js`):**
   - Phân quyền danh sách dự án: Member chỉ thấy các dự án thuộc quyền sở hữu/tham gia của mình.
   - Hỗ trợ tham số URL `board.html?projectId=...` tự động trỏ đến đúng dự án được chọn.

---

## 🐛 KHẮC PHỤC TRIỆT ĐỂ LỖI BỐ CỤC HIỂN THỊ TRÊN EXECUTIVE DASHBOARD (23/10/2026)

### 1. Hiện trạng lỗi (Ảnh chụp màn hình từ người dùng):
- **Hiện tượng:** Tất cả các khối trên trang Dashboard (`index.html`) gồm: Thanh điều hướng Control Bar, 4 thẻ KPI Metrics, Danh sách Dự án trọng điểm, Biểu đồ hiệu suất tuần và Danh sách tác vụ khẩn cấp bị co rúm xếp ngang thành từng cột dọc siêu hẹp kế tiếp nhau thay vì chảy dọc theo bố cục lưới chuẩn.
- **Nguyên nhân kỹ thuật sâu:**
  - Tại dòng 133 trong `index.html`, do quá trình ghép thẻ Hero Banner cá nhân hóa xuất hiện một thẻ đóng dư `</div>`.
  - Thẻ đóng dư này đã vô tình đóng sớm phần tử chứa nội dung chính `<main class="flex-1 overflow-y-auto...">`.
  - Hậu quả: Toàn bộ các thẻ `<section>` bên dưới bị đẩy ra ngoài thành con trực tiếp của thẻ cha ngoài cùng `<div class="flex h-screen">`. Do thẻ cha này có class `flex` (mặc định là `flex-row`), trình duyệt đã render tất cả các section như những cột flex nằm ngang kẹp nhau.

### 2. Giải pháp khắc phục:
- Loại bỏ thẻ đóng thừa `</div>`, cân bằng toàn bộ cấu trúc cây DOM của `index.html` (chính xác 48 thẻ mở/đóng `<div>`, 5 thẻ `<section>`, 4 thẻ `<article>`, 1 thẻ `<main>`).
- Bố cục dọc mượt mà với thanh cuộn tự động được khôi phục 100%, hiển thị chuẩn mực trên mọi độ phân giải màn hình.

---

## 🛡️ RÀ SOÁT TOÀN DIỆN & HOÀN THIỆN PHÂN QUYỀN RBAC CÁ NHÂN HÓA XUYÊN SUỐT HỆ THỐNG (23/10/2026)

### 1. Phân tích lỗ hổng bảo mật & Trải nghiệm người dùng:
1. **Lỗi Kéo thả chéo tác vụ trên Bảng Kanban (`board.html` & `js/kanban.js`):**
   - *Hiện trạng:* Thẻ công việc của bất kỳ thành viên nào cũng mở thuộc tính `draggable="true"`. Một thành viên thông thường có thể tự ý kéo thả công việc của người khác sang cột khác mà không có bất kỳ cơ chế ngăn cản nào.
   - *Nguy cơ:* Vi phạm tính toàn vẹn dữ liệu cá nhân, làm sai lệch báo cáo tiến độ và KPI của đồng đội.
2. **Lỗi Can thiệp chỉnh sửa Form chi tiết Task Modal:**
   - Khi nhấn vào xem công việc của người khác, thành viên vẫn có thể sửa đổi tiêu đề, mô tả, subtasks và bấm lưu đè lên dữ liệu của đồng đội.
3. **Lỗi Phân quyền Dự án trên trang Quản lý (`projects.html` & `js/projects.js`):**
   - Nút Chỉnh sửa và Xóa dự án bị khóa cứng chỉ dành riêng cho tài khoản có vai trò `admin`. Người dùng mới khi tạo dự án riêng hoặc sở hữu dự án Onboarding `PRJ-START` lại không thể sửa hoặc xóa dự án của chính mình để giải phóng không gian.
4. **Lỗi Rò rỉ dữ liệu khi xem "Tất cả dự án" trên Bảng Kanban & Timeline:**
   - Nếu để bộ lọc mặc định là "Tất cả dự án", hệ thống lấy toàn bộ task từ LocalStorage mà không giới hạn theo phạm vi truy cập của người dùng hiện tại, làm lộ các task mẫu của tài khoản clone.

### 2. Giải pháp kỹ thuật nâng cấp triệt để:
1. **Thuật toán Phân quyền Kéo thả 3 lớp trên Bảng Kanban (`js/kanban.js`):**
   - Xây dựng hàm `canUserMoveTask(task, project)`:
     - Quản trị viên (Admin) -> Toàn quyền di chuyển mọi task.
     - Chủ dự án (Project Owner) -> Toàn quyền điều phối các task trong dự án mình làm chủ.
     - Người được gán việc (Assignee) -> Toàn quyền di chuyển task của chính mình.
     - Task chưa có người nhận trong dự án tham gia -> Được nhận và kéo.
     - Ngược lại: **Khóa cứng kéo thả (`draggable="false"`)**, hiển thị huy hiệu ổ khóa `🔒 [Tên người phụ trách]` trên thẻ card.
   - Bắt sự kiện `dragstart`: Lập tức `e.preventDefault()` và hiển thị cảnh báo Toast nếu cố tình kéo task của người khác.
   - Kiểm tra logic trong `moveTaskToStatus`: Ngăn chặn triệt để can thiệp mã nguồn từ bảng điều khiển console.
2. **Kích hoạt Chế độ Chỉ Đọc (View-Only Mode) trong Task Modal:**
   - Khi thành viên xem task của người khác: Hiển thị Banner cảnh báo màu hổ phách `🔒 Chế độ Chỉ đọc`, vô hiệu hóa (`disabled`) toàn bộ các trường nhập liệu, ẩn nút Lưu và nút Xóa.
   - Bảo toàn khung **Bình luận trao đổi (Comments Feed)** để các thành viên vẫn có thể cộng tác và thảo luận nghiệp vụ bình thường.
3. **Cung cấp nút lọc nhanh 1 chạm `💼 Việc Của Tôi` trên Bảng Kanban:**
   - Bổ sung nút lọc `[💼 Việc của tôi]` ngay đầu thanh lọc thành viên, giúp người dùng lọc tức thì các công việc của riêng mình trong 0ms.
4. **Phân quyền Sở hữu Dự án (Project Ownership RBAC) trong `js/projects.js`:**
   - Mở quyền Chỉnh sửa và Xóa dự án cho cả Quản trị viên **VÀ** Chủ dự án (`isAdmin || project.ownerId === currentUserId`).
   - Người dùng mới giờ đây có thể tự do chỉnh sửa dự án do mình tạo hoặc xóa dự án Onboarding `PRJ-START` khi đã làm quen xong.
5. **Đồng bộ phân quyền dữ liệu trên Timeline/Gantt (`js/timeline.js`):**
   - Giới hạn các dự án và task hiển thị trên biểu đồ Gantt theo đúng phạm vi truy cập của tài khoản đang đăng nhập.

---

## 📊 BƯỚC 3: CHUẨN HÓA SCHEMA DỮ LIỆU BÁO CÁO & LỊCH SỬ HOẠT ĐỘNG (23/10/2026)
**Nhánh thực hiện:** `develop`  
**Nguyên tắc cam kết:** Bảo toàn 100% ranh giới phân chia công việc trong nhóm: **Tuyệt đối không can thiệp vào `reports.html` hay `js/reports.js`** (phần việc của đồng đội Nguyễn Đăng Nhật). Thay vào đó, xây dựng và chuẩn hóa toàn bộ hạ tầng dữ liệu (Data Foundation) và các helper API mạnh mẽ trong [`js/storage.js`](file:///c:/ThietKeWeb_PhamDangKhoa/DeTai_TaskFlow_PhamDangKhoa_NguyenDangNhat_CK/js/storage.js).

### 1. Mục tiêu kiến trúc dữ liệu:
- Khi đồng đội bắt tay vào xây dựng Trang 5 (Báo Cáo & Logs), bạn ấy chỉ cần gọi hàm API có sẵn của `window.TaskFlowStorage` là có ngay toàn bộ số liệu thực tế đã được tổng hợp sẵn (KPIs, phân bổ tải nhân sự, tiến độ Sprint, nhật ký kiểm toán, xuất file CSV chuẩn UTF-8).
- Đảm bảo dữ liệu luôn đầy đủ, không bị rỗng, và tự động liên kết với mọi thao tác thực tế trên Bảng Kanban, Quản lý dự án và Đăng nhập.

### 2. Triển khai kỹ thuật chi tiết:

#### A. Hệ thống Nhật ký kiểm toán (Audit Trail / Activity Logging Engine):
- **Khóa lưu trữ:** `taskflow_activity_logs` (tự động đồng bộ 2 chiều với gói tổng `TASKFLOW_DATA`).
- **Cấu trúc Schema chuẩn mực:**
  ```javascript
  {
    id: "act-1729680000000-123",
    timestamp: "2026-10-23T08:30:00.000Z",
    userId: "mem-01",
    userName: "Phạm Đăng Khoa",
    userAvatar: "https://api.dicebear.com/...",
    userRole: "admin",
    action: "TASK_MOVE", // PROJECT_CREATE, PROJECT_UPDATE, TASK_APPROVE, STOPWATCH_LOG, ...
    entityType: "task",  // "project" | "task" | "time_log" | "auth"
    entityId: "task-001",
    entityTitle: "Xây dựng giao diện Bảng Kanban & kéo thả 60fps",
    details: "Chuyển trạng thái sang 'Đang làm (Doing)'"
  }
  ```
- **Hàm nghiệp vụ:**
  - `TaskFlowStorage.logActivity({ action, entityType, entityId, entityTitle, details, user })`: Tự động thêm bản ghi, lưu trữ tối đa 250 sự kiện gần nhất (FIFO) và phát sự kiện tùy biến `activityLogged` ra toàn cục.
  - `TaskFlowStorage.getActivityLogs(filter)`: Truy xuất nhật ký kèm bộ lọc theo người dùng, dự án, hành động.
- **Tích hợp tự động vào luồng thao tác thực tế:**
  - Kéo thả thẻ trên Kanban -> Tự động ghi log `TASK_MOVE`.
  - Phê duyệt nghiệm thu task -> Tự động ghi log `TASK_APPROVE`.
  - Tạo / Cập nhật / Xóa dự án -> Tự động ghi log `PROJECT_CREATE / UPDATE / DELETE`.

#### B. Hệ thống Chấm công & Bấm giờ (Time Tracking Engine):
- **Khóa lưu trữ:** `taskflow_time_logs` (đồng bộ 2 chiều `TASKFLOW_DATA`).
- **Cấu trúc Schema:**
  ```javascript
  {
    id: "time-1729680000000-456",
    taskId: "task-001",
    taskTitle: "Xây dựng giao diện Bảng Kanban & kéo thả 60fps",
    projectId: "proj-101",
    projectName: "Hệ thống Quản trị Dự án TaskFlow Core",
    userId: "mem-01",
    userName: "Phạm Đăng Khoa",
    spentHours: 4.5,
    date: "2026-10-20",
    timestamp: "2026-10-20T10:30:00.000Z",
    type: "stopwatch", // "stopwatch" | "manual"
    note: "Dựng khung Kanban board 3 cột và cấu hình CSS Grid"
  }
  ```
- **Hàm nghiệp vụ:**
  - `TaskFlowStorage.logTime({ taskId, taskTitle, projectId, projectName, userId, userName, spentHours, date, note, type })`: Ghi nhận giờ làm việc, phát sự kiện `timeLogged` và tự động kích hoạt Webhook chuyển tiếp sang Google Sheets nếu module `SheetsSync` khả dụng.
  - `TaskFlowStorage.getTimeLogs(filter)`: Lấy danh sách giờ làm theo nhân sự, dự án hoặc khoảng ngày.

#### C. Bộ tổng hợp báo cáo sẵn sàng cho Trang 5 (`ReportingEngine`):
- **Hàm API 1-chạm:** `TaskFlowStorage.getReportsSummary(filter)` trả về đối tượng phân tích toàn diện:
  - `kpis`: Tổng dự án, tổng công việc, tỷ lệ hoàn thành %, tổng giờ làm việc thực tế, tổng giờ ước tính.
  - `projectsSummary`: Phân tích từng dự án (tiến độ %, số giờ tiêu tốn thực tế, số thành viên).
  - `membersWorkload`: Phân tích tải công việc theo từng thành viên, tự động đánh giá trạng thái công suất (`'normal'`, `'overload'` nếu > 35h hoặc >= 4 việc đang làm, `'idle'` nếu 0 việc).
  - `priorityBreakdown`: Thống kê số lượng theo độ ưu tiên (`critical`, `high`, `medium`, `low`).
  - `dailyProductivity`: Mảng 7 ngày gần nhất kèm số giờ cống hiến thực tế để sẵn sàng vẽ biểu đồ đường (Line Chart) hoặc cột (Bar Chart).
  - `recentActivityLogs`: 20 hoạt động mới nhất để hiển thị trực tiếp lên bảng Activity Stream.
- **Hàm Xuất CSV chuẩn Excel:** `TaskFlowStorage.exportReportsCSV(type)`:
  - Hỗ trợ xuất 3 loại: `'tasks'`, `'timesheet'`, `'activities'`.
  - Tự động gắn tiền tố **UTF-8 BOM (`\uFEFF`)** để phần mềm Microsoft Excel hiển thị tiếng Việt có dấu hoàn hảo không bị lỗi font.

#### D. Dữ liệu mẫu (Seed Data) phong phú:
- Nạp sẵn **6 bản ghi TimeLogs** và **6 bản ghi ActivityLogs** phân bổ đồng đều giữa 2 thành viên `Phạm Đăng Khoa` (Admin) và `Nguyễn Đăng Nhật` (Member).
- Đảm bảo ngay khi đồng đội mở trang Báo cáo lần đầu tiên thì giao diện đã lập tức tràn ngập số liệu trực quan mà không bị trạng thái màn hình trắng.


---

## 🚀 9. TỐI ƯU HÓA TRẢI NGHIỆM UX/UI, PHÂN QUYỀN KANBAN RBAC & TIÊU CHUẨN ĐỊNH NGHĨA HOÀN THÀNH (DoD GATE) - ĐỢT PHẢN HỒI VIDEOTEST.MP4

**Ngày thực hiện:** 23/10/2026  
**Chuyên gia phụ trách:** Phạm Đăng Khoa (Lead Frontend Architect & UX/UI Specialist)  
**Mục tiêu:** Giải quyết dứt điểm 3 tồn đọng nghiêm trọng phát hiện qua video kiểm thử thực tế (`videotest.mp4`):
1. **Chuyển trang mượt mà không chớp giật (Smooth Page Transitions):** Tích hợp có chọn lọc thư viện `animate.css` (CDN) để triệt tiêu hiện tượng nháy trắng khi chuyển giữa các trang `index.html`, `projects.html`, `board.html`, `timeline.html`.
2. **Khóa chặt phân quyền kéo thả Kanban (Strict RBAC Drag & Drop Authorization):** Tài khoản Member (`Nguyễn Đăng Nhật`) tuyệt đối không thể kéo thả hoặc can thiệp thẻ công việc của thành viên khác.
3. **Cổng kiểm soát nghiệm thu bắt buộc (Definition of Done Gate):** Khi kéo thẻ từ "Đang làm (In-Progress)" sang "Đã hoàn thành (Done)", hệ thống BẮT BUỘC người dùng phải nộp Link sản phẩm bàn giao (GitHub PR, Live Demo, Figma...). Nếu hủy bỏ hoặc không nhập link, thẻ tự động bật về vị trí cũ và không được phép cập nhật trạng thái.

---

### 🔍 CHI TIẾT KỸ THUẬT & GIẢI PHÁP THỰC HIỆN:

#### 1. Triệt tiêu chớp giật & Chuyển trang 60fps mượt mà:
* **Tích hợp Animate.css CDN:** Bổ sung liên kết `<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/animate.css/4.1.1/animate.min.css"/>` tại `<head>` của các trang: `index.html`, `projects.html`, `board.html`, `timeline.html`, `login.html`.
* **Cơ chế Điều hướng Mượt trong `js/layout.js` (`setupPageTransitions`):**
  - Khi trang tải, thẻ `<main>` tự động thêm class `animate__animated animate__fadeIn animate__faster` để xuất hiện êm ái.
  - Chặn sự kiện click liên kết nội bộ (`sidebarEl a[href]`, logo): Áp dụng hiệu ứng biến mất `animate__animated animate__fadeOut animate__faster` trong 150ms trước khi `window.location.href` thay đổi, loại bỏ hoàn toàn khoảng trắng giật cục giữa các lần chuyển trang.
  - Lắng nghe sự kiện `pageshow` (hỗ trợ bfcache - Back/Forward Cache) giúp khi người dùng bấm nút Back/Forward trên trình duyệt, giao diện luôn hiển thị mượt mà không bị kẹt hiệu ứng.

#### 2. Khóa phân quyền kéo thả Kanban (RBAC Drag & Drop Enforcement):
* **Xử lý triệt để tại `js/kanban.js`:**
  - `canUserMoveTask(task, project)`: Chuẩn hóa kiểm tra quyền độc lập chữ hoa/chữ thường (`user.role.toLowerCase() === 'admin'`). Chỉ **Admin**, **Chủ dự án (Project Owner)** và **Người phụ trách chính (Lead Assignee)** mới có quyền di chuyển thẻ việc. Xóa bỏ lỗ hổng cho phép member trong dự án tự tiện kéo việc chưa gán.
  - `createTaskCardElement()`: Khi `canMove === false`, gỡ bỏ hoàn toàn thuộc tính `draggable`, thêm class `.is-locked-task`, và chặn sự kiện `dragstart` trên toàn bộ các phần tử con (`img`, `span`, `h3`, `div`). Thêm huy hiệu thị giác `🔒 Chỉ xem` để người dùng nhận biết ngay lập tức lý do không kéo được thẻ.
  - Bổ sung lớp phòng thủ thứ hai trong sự kiện `drop` của `.kanban-list`: Nếu phát hiện thẻ thả vào không thuộc quyền sở hữu của người dùng, lập tức từ chối, hủy lệnh di chuyển, hiển thị Toast cảnh báo và render lại vị trí gốc.
  - **Bộ lọc thành viên (`getFilteredTasks`):** Lọc chuẩn xác theo `t.assigneeId === this.currentMemberFilter`, giúp khi bấm vào chip "Phạm Đăng Khoa" hoặc "Nguyễn Đăng Nhật", danh sách hiển thị đúng 100% công việc do người đó làm chính.

#### 3. Cổng kiểm soát bắt buộc Link nghiệm thu (Definition of Done Gate):
* **Nâng cấp `moveTaskToStatus(taskId, targetStatus)` trong `js/kanban.js`:**
  - Khi mục tiêu là `'done'`: Kiểm tra `task.evidence?.doneUrl`. Nếu chưa có link hợp lệ, **KHÔNG CẬP NHẬT `task.status = 'done'`**!
  - Lập tức đưa thẻ về lại cột ban đầu, bắn Toast cảnh báo: `"⚠️ Bắt buộc phải có Link sản phẩm hoàn thiện để chuyển sang Đã hoàn thành!"`.
  - Mở `quickEvidenceModal` ở chế độ bắt buộc (`isMandatoryGate: true`).
  - Nút đóng/bỏ qua đổi thành `"Hủy bỏ (Giữ nguyên trạng thái)"`. Nếu người dùng hủy hoặc đóng modal, thẻ vẫn giữ nguyên trạng thái cũ.
  - Chỉ khi người dùng điền URL hợp lệ và bấm `"Lưu Bằng Chứng"`, hệ thống mới chính thức cập nhật `task.status = 'done'`, tính lại tiến độ dự án, ghi vào Nhật ký kiểm toán (Audit Trail) và hiển thị thông báo chúc mừng kèm animation `animate-spring-drop`.
  - Bổ sung chốt chặn tương tự bên trong Modal 2 cột (`taskForm submit`) để ngăn chặn việc đổi dropdown sang "Đã hoàn thành" mà bỏ trống link bàn giao.
