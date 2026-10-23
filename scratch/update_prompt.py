# -*- coding: utf-8 -*-
with open('PROMPT_NguyenDangNhat.md', 'r', encoding='utf-8') as f:
    text = f.read()

# 1. Update TOC
toc_old = '35. [Turn 21: Bổ sung mục Trao Đổi & Bình Luận Công Việc vào Bảng Timesheet Trang 5 và Đồng bộ Modal với Kanban](#turn-21-bo-sung-muc-trao-doi--binh-luan-cong-viec-vao-bang-timesheet-trang-5-va-dong-bo-modal-voi-kanban)\n\n---'
toc_new = '''35. [Turn 21: Bổ sung mục Trao Đổi & Bình Luận Công Việc vào Bảng Timesheet Trang 5 và Đồng bộ Modal với Kanban](#turn-21-bo-sung-muc-trao-doi--binh-luan-cong-viec-vao-bang-timesheet-trang-5-va-dong-bo-modal-voi-kanban)
36. [Turn 22: Tái thiết kế Thanh điều khiển phạm vi, khắc phục hiện tượng thấu kính thanh Gantt và liên kết 3 trang Kanban (Trang 3) - Timeline (Trang 4) - Reports (Trang 5)](#turn-22-tai-thiet-ke-thanh-dieu-khien-pham-vi-khac-phuc-hien-tuong-thau-kinh-thanh-gantt-va-lien-ket-3-trang-kanban-trang-3---timeline-trang-4---reports-trang-5)

---'''

if toc_old in text:
    text = text.replace(toc_old, toc_new, 1)
    print("TOC updated")
else:
    print("Warning: TOC old not found")

# 2. Append Turn 22 content before the summary table
summary_heading = '## TỔNG KẾT TÀI SẢN MÃ NGUỒN ĐÃ HOÀN THIỆN TOÀN BỘ PHÂN HỆ THÀNH VIÊN B (TRANG 3, 4 & 5)'

turn_22_content = '''### Turn 22: Tái thiết kế Thanh điều khiển phạm vi, khắc phục hiện tượng thấu kính thanh Gantt và liên kết 3 trang Kanban (Trang 3) - Timeline (Trang 4) - Reports (Trang 5)

#### 1. Nguyên văn câu lệnh của người dùng (User Prompt):
```markdown
Tại trang 4 ( timeline.html) bạn hãy điều chỉnh lại các mục mình khoanh đỏ sao cho đúng và có hiệu ứng đẹp mắt. Mục này có liên kết với trang 3 (kanban-page.html) và trang 5 (reports.html), hãy thiết kế lại sao cho đúng bản chất của quản lý công việc 1 cách chuyên nghiệp, khoa học
```
*(Kèm hình ảnh minh họa thực tế giao diện `timeline.html` với 2 vị trí khoanh đỏ: Thanh điều khiển phạm vi ngày ở trên cùng và toàn bộ cột danh sách công việc WBS/Hạn chót bên trái).*

#### 2. Phân tích hình ảnh, lỗi trực quan & Yêu cầu nghiệp vụ:
- **Khu vực khoanh đỏ phía trên (Top Controls Toolbar)**:
  + Bộ nút chuyển phạm vi (`Toàn Bộ Lộ Trình`, `14 Ngày (Sprint)`, `30 Ngày (Tháng)`) bị user gạch chéo đỏ ở nút `14 Ngày (Sprint)` do lỗi giới hạn toán học (clamping math): Các công việc nằm ngoài khoảng hiển thị bị ép thu nhỏ thành các thanh 1 ngày dị dạng nằm đè ở cột đầu tiên, gây hiểu nhầm nghiêm trọng về tiến độ.
  + Thiếu chế độ góc nhìn chuẩn Agile `7 Ngày (Tuần)`, thiếu thanh chỉ báo trượt (pill sliding indicator) và nút `Hôm Nay` chưa có hiệu ứng phát sáng phản hồi trực quan.
- **Khu vực khoanh đỏ bên trái (Cột công việc WBS & Hạn chót)**:
  + **Lỗi thấu kính nghiêm trọng (Visual Bleed-through Bug)**: Cột `.gantt-task-meta` sử dụng màu nền bán trong suốt `var(--bg-surface)` kết hợp `backdrop-filter: blur()`. Khi người dùng cuộn ngang trục thời gian hoặc hệ thống tự động `scrollToToday()`, các thanh tiến độ Gantt trôi ngầm phía dưới và hiện rõ mồn một xuyên qua chữ, gây rối mắt và mất tính thẩm mỹ SaaS cao cấp.
  + Cột quá hẹp (280px), chưa thể hiện rõ trạng thái Kanban (Chờ làm, Đang làm, Hoàn thành) và số giờ thực tế đã tích lũy từ Trang 5 (`reports.html`).
  + Thiếu các nút hành động điều hướng nhanh 1 chạm giữa 3 trang: Mở thẻ trên Bảng Kanban (`board.html#task-id`) và Mở bộ đếm giờ/báo cáo tương ứng trên Trang 5 (`reports.html?taskId=task-id`).

#### 3. Giải pháp kiến trúc & Hiện thực hóa kỹ thuật:
- **Nâng cấp Thanh công cụ điều hướng thời gian (`timeline.html` & `js/timeline.js`)**:
  1. Mở rộng thành 4 chế độ quan sát chuyên nghiệp: `Toàn Bộ` (`all`), `7 Ngày (Tuần)` (`7d`), `14 Ngày (Sprint)` (`14d`), `30 Ngày (Tháng)` (`30d`).
  2. Bổ sung thanh trượt bóng mờ (pill highlight indicator) chuyển động mượt mà bằng CSS Transitions khi chuyển chế độ.
  3. Tái cấu trúc hàm `computeDaysRange()`: Tính toán chính xác dải ngày theo ngày hiện tại và mốc công việc, loại bỏ hoàn toàn lỗi thu gọn thanh giả dị dạng ngoài phạm vi bằng cơ chế phát hiện biên `◀ Bắt đầu trước phạm vi` / `Kết thúc sau phạm vi ▶`.
  4. Nâng cấp nút `Hôm Nay`: Cuộn mượt trục thời gian về chính xác ngày hiện tại, đồng thời kích hoạt hiệu ứng vòng sáng phát quang màu đỏ rực (#EF4444 pulse ring) trong 2.5 giây trên cột Today.
- **Tái thiết kế Cột WBS & Khắc phục triệt để lỗi thấu kính (`css/styles.css` & `timeline.html`)**:
  1. Mở rộng chiều rộng cột WBS lên `360px` chuẩn Enterprise SaaS, tăng không gian thở cho tiêu đề và các thông số phụ trợ.
  2. Áp đặt màu nền đục 100% nguyên khối (`#FFFFFF` ở Light Mode, `#0F172A` ở Dark Mode) với `z-index: 20`, đổ bóng viền phải nổi khối (`box-shadow: 4px 0 12px -2px rgba(0,0,0,0.06)`). Đảm bảo 100% thanh Gantt trôi ngầm phía dưới hoàn toàn biến mất, chữ hiển thị sắc nét tuyệt đối.
  3. Tích hợp huy hiệu trạng thái Kanban 3 màu sinh động (`Chờ làm`, `Đang làm`, `✓ Xong`), hiển thị số giờ thực tế đã ghi nhận từ Trang 5 so với dự toán (`⏱️ Xh / Yh`), và 2 nút liên kết tắt `[📋 Kanban ↗]` và `[⏱️ Báo cáo ↗]`.
- **Xây dựng Modal Chi tiết Công việc Nhanh (`#timelineTaskModal`)**:
  1. Cho phép bấm vào bất kỳ hàng task hoặc thanh Gantt nào để bật Modal soi chiếu toàn diện: Tiến độ %, Khoảng ngày thực tế, Thành viên phụ trách, Số giờ chấm công, và 2 nút điều hướng sâu (Deep Links) sang Bảng việc Kanban và Trang Báo cáo.
- **Liên kết đồng bộ 2 chiều giữa 3 trang (Kanban - Timeline - Reports)**:
  1. **Từ Timeline sang Kanban**: Liên kết `board.html#task-id` tự động kích hoạt `KanbanApp.handleHashNavigation()` trên trang `board.html`, cuộn mượt đến thẻ công việc, phát hiệu ứng viền phát sáng và tự động mở Modal chi tiết.
  2. **Từ Timeline sang Reports**: Liên kết `reports.html?taskId=task-id` tự động nạp `taskId` vào bộ chọn công việc của đồng hồ bấm giờ Stopwatch và biểu mẫu Timesheet, hiển thị Toast chào mừng.
  3. **Hoàn thiện module `DiscussionController` trên Trang 5**: Cột "Trao Đổi & Bình Luận" kết nối trực tiếp với modal thảo luận, cho phép đăng góp ý và đồng bộ tức thì với `task.comments` của Bảng Kanban.

---

'''

if summary_heading in text:
    text = text.replace(summary_heading, turn_22_content + summary_heading, 1)
    print("Turn 22 content inserted")
else:
    print("Warning: summary_heading not found")

# 3. Update summary table at bottom
table_old = '''| **`board.html`** | [`board.html`](file:///d:/_BAOCAO_CK_TKWEB/TRANG5-NHAT/DeTai_TaskFlow_PhamDangKhoa_NguyenDangNhat_CK/board.html) | Hoàn thành 100% | Giao diện Bảng Kanban 3 cột, App Shell động, bộ lọc Glow/Shadow, Modal tạo việc & Thảo luận, Toast container |
| **`kanban-page.html`** | [`kanban-page.html`](file:///d:/_BAOCAO_CK_TKWEB/TRANG5-NHAT/DeTai_TaskFlow_PhamDangKhoa_NguyenDangNhat_CK/kanban-page.html) | Tạo mới Turn 19 | Tệp chuyển hướng tự động tức thời sang `board.html` theo tên gọi Trang 3 |
| **`js/kanban.js`** | [`js/kanban.js`](file:///d:/_BAOCAO_CK_TKWEB/TRANG5-NHAT/DeTai_TaskFlow_PhamDangKhoa_NguyenDangNhat_CK/js/kanban.js) | Hoàn thành 100% | Tự động tính giờ ngầm khi kéo sang "Doing", tự động dừng & chốt giờ khi kéo sang "Done", Activity & Comments Feed 2 chiều |
| **`timeline.html`** | [`timeline.html`](file:///d:/_BAOCAO_CK_TKWEB/TRANG5-NHAT/DeTai_TaskFlow_PhamDangKhoa_NguyenDangNhat_CK/timeline.html) | Hoàn thành 100% | Giao diện Timeline Gantt Chart, Font Roboto, bảng màu Modern SaaS, khung canvas cuộn 2 chiều |
| **`js/timeline.js`** | [`js/timeline.js`](file:///d:/_BAOCAO_CK_TKWEB/TRANG5-NHAT/DeTai_TaskFlow_PhamDangKhoa_NguyenDangNhat_CK/js/timeline.js) | Hoàn thành 100% | Động cơ CSS Grid thuần, kỹ thuật Tone-on-tone progress fill, Milestone Diamond, Today Line #EF4444 |
| **`reports.html`** | [`reports.html`](file:///d:/_BAOCAO_CK_TKWEB/TRANG5-NHAT/DeTai_TaskFlow_PhamDangKhoa_NguyenDangNhat_CK/reports.html) | Cập nhật Turn 21 | Bổ sung cột "Trao Đổi & Bình Luận" và Modal Thảo luận công việc chuẩn 100% Hình 2 |
| **`js/reports.js`** | [`js/reports.js`](file:///d:/_BAOCAO_CK_TKWEB/TRANG5-NHAT/DeTai_TaskFlow_PhamDangKhoa_NguyenDangNhat_CK/js/reports.js) | Cập nhật Turn 21 | Bổ sung module `DiscussionController`, tích hợp bình luận 2 chiều với Kanban & LocalStorage |
| **`css/styles.css`** | [`css/styles.css`](file:///d:/_BAOCAO_CK_TKWEB/TRANG5-NHAT/DeTai_TaskFlow_PhamDangKhoa_NguyenDangNhat_CK/css/styles.css) | Hoàn thành 100% | Ép font Roboto toàn diện form control, Tokens Date Chips, `.comment-bubble` chuẩn Glassmorphism |
| **`PROMPT_NguyenDangNhat.md`** | [`PROMPT_NguyenDangNhat.md`](file:///d:/_BAOCAO_CK_TKWEB/TRANG5-NHAT/DeTai_TaskFlow_PhamDangKhoa_NguyenDangNhat_CK/PROMPT_NguyenDangNhat.md) | Cập nhật Turn 21 | Toàn văn nhật ký hội thoại & giải pháp kỹ thuật chi tiết của Thành viên B (Trang 3, 4 & 5) |'''

table_new = '''| **`board.html`** | [`board.html`](file:///d:/_BAOCAO_CK_TKWEB/TRANG5-NHAT/DeTai_TaskFlow_PhamDangKhoa_NguyenDangNhat_CK/board.html) | Hoàn thành 100% | Giao diện Bảng Kanban 3 cột, App Shell động, bộ lọc Glow/Shadow, Modal tạo việc & Thảo luận, Toast container |
| **`kanban-page.html`** | [`kanban-page.html`](file:///d:/_BAOCAO_CK_TKWEB/TRANG5-NHAT/DeTai_TaskFlow_PhamDangKhoa_NguyenDangNhat_CK/kanban-page.html) | Cập nhật Turn 22 | Tệp chuyển hướng tự động sang `board.html`, bảo toàn trọn vẹn tham số URL hash và query |
| **`js/kanban.js`** | [`js/kanban.js`](file:///d:/_BAOCAO_CK_TKWEB/TRANG5-NHAT/DeTai_TaskFlow_PhamDangKhoa_NguyenDangNhat_CK/js/kanban.js) | Cập nhật Turn 22 | Tự động tính giờ ngầm, Activity feed, hỗ trợ Hash navigation (`#task-id`) cuộn mượt và mở modal từ Timeline |
| **`timeline.html`** | [`timeline.html`](file:///d:/_BAOCAO_CK_TKWEB/TRANG5-NHAT/DeTai_TaskFlow_PhamDangKhoa_NguyenDangNhat_CK/timeline.html) | Cập nhật Turn 22 | 4 chế độ phạm vi (Toàn bộ, Tuần, Sprint, Tháng), cột WBS 360px chống thấu kính, Modal chi tiết task |
| **`js/timeline.js`** | [`js/timeline.js`](file:///d:/_BAOCAO_CK_TKWEB/TRANG5-NHAT/DeTai_TaskFlow_PhamDangKhoa_NguyenDangNhat_CK/js/timeline.js) | Cập nhật Turn 22 | Động cơ Gantt CSS Grid, sửa triệt để lỗi clamping, liên kết trực tiếp sang Trang 3 (`board.html#task-id`) và Trang 5 (`reports.html?taskId=...`) |
| **`reports.html`** | [`reports.html`](file:///d:/_BAOCAO_CK_TKWEB/TRANG5-NHAT/DeTai_TaskFlow_PhamDangKhoa_NguyenDangNhat_CK/reports.html) | Cập nhật Turn 22 | Cột "Trao Đổi & Bình Luận" 9 cột chuẩn, Modal Thảo luận công việc đồng bộ 2 chiều |
| **`js/reports.js`** | [`js/reports.js`](file:///d:/_BAOCAO_CK_TKWEB/TRANG5-NHAT/DeTai_TaskFlow_PhamDangKhoa_NguyenDangNhat_CK/js/reports.js) | Cập nhật Turn 22 | Bổ sung `DiscussionController`, tự động nạp công việc từ URL `?taskId=...` khi bấm từ Timeline |
| **`css/styles.css`** | [`css/styles.css`](file:///d:/_BAOCAO_CK_TKWEB/TRANG5-NHAT/DeTai_TaskFlow_PhamDangKhoa_NguyenDangNhat_CK/css/styles.css) | Cập nhật Turn 22 | Màu nền đục nguyên khối cho `.gantt-task-meta` chống xuyên thấu thanh Gantt, đổ bóng viền phải nổi khối |
| **`PROMPT_NguyenDangNhat.md`** | [`PROMPT_NguyenDangNhat.md`](file:///d:/_BAOCAO_CK_TKWEB/TRANG5-NHAT/DeTai_TaskFlow_PhamDangKhoa_NguyenDangNhat_CK/PROMPT_NguyenDangNhat.md) | Cập nhật Turn 22 | Toàn văn nhật ký hội thoại & giải pháp kỹ thuật chi tiết của Thành viên B (Trang 3, 4 & 5) |'''

if table_old in text:
    text = text.replace(table_old, table_new, 1)
    print("Summary table updated")
else:
    print("Warning: table_old not found")

with open('PROMPT_NguyenDangNhat.md', 'w', encoding='utf-8') as f:
    f.write(text)

print("PROMPT_NguyenDangNhat.md updated successfully!")
