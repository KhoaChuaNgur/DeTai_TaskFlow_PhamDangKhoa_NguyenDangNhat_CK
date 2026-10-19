# HUMAN-CRAFTED DESIGN & ANTI-AI DETECTED GUIDELINES

Tài liệu này đưa ra các quy tắc thiết kế và lập trình nhằm loại bỏ cảm giác "sản phẩm dựng vội từ template AI", đảm bảo tính tự nhiên, tinh tế và đạt chuẩn sản phẩm thương mại.

---

## 1. LOẠI BỎ CÁC DẤU VẾT "AI NHẬN DIỆN" VỀ GIAO DIỆN (UI)
- **Cấm Gradient sặc sỡ tràn lan**: AI thường lạm dụng tím/hồng neon khắp trang. Quy chuẩn: Nền trang phải trầm và sạch, chỉ dùng hiệu ứng phát sáng (glow) kín đáo ở các nút quan trọng (CTA) hoặc badge trạng thái.
- **Tránh Glassmorphism quá đà (Over-blur)**: Không phủ kính mờ mịt lên mọi khối.
  - Chỉ áp dụng kính mờ cho: Navbar nổi, Modal popup, Task Card nổi trên nền Kanban, Floating Control Panel.
  - Vùng nội dung đọc nhiều (Bảng báo cáo, form nhập liệu) phải giữ nền phẳng tương phản cao để đảm bảo độ đọc tốt (WCAG AAA).
- **Tránh viền phát sáng quá gắt**: Viền kính phải thanh mảnh (`border border-white/10 dark:border-white/5`), không dùng viền neon đậm viền quanh mọi thẻ.

---

## 2. LOẠI BỎ NỘI DUNG VÀ MOCKUP "RẬP KHUÔN" (CONTENT & DATA)
- **Tên và dữ liệu thực tế**:
  - ❌ CẤM: Task 1, Task 2, "Lorem Ipsum dolor", John Doe, Jane Doe.
  - ✅ BẮT BUỘC: Dữ liệu thực tế của một dự án công nghệ (VD: "Tối ưu hóa Database Query Indexing", "Thiết kế luồng thanh toán VNPay", "Phạm Đăng Khoa - Frontend Lead", "Nguyễn Văn An - Backend Dev").
- **Avatar thành viên tự nhiên**:
  - Không dùng các icon đầu người SVG mặc định của AI. Sử dụng avatar Dicebear styled chân thực hoặc ảnh profile thật kèm chỉ báo trạng thái online/offline (chấm xanh).

---

## 3. QUY TẮC MÃ NGUỒN "VIẾT TAY" (CODE PATTERNS)
- **Cấu trúc hàm có chủ đích & chú thích thực tế**:
  - Tránh các chú thích ngô nghê kiểu AI: `// This function calculates progress` cho hàm `calculateProgress()`.
  - Thay bằng chú thích nghiệp vụ: `// Tính tỷ lệ % hoàn thành dự án dựa trên số task 'done' theo Rubric Phân hệ 4`.
- **Xử lý vi mô (Micro-interactions) của con người**:
  - Có trạng thái rỗng (Empty State) chỉn chu với hình minh họa khi cột Kanban không có việc: "Không có công việc nào trong danh sách. Kéo việc vào đây hoặc bấm + để tạo".
  - Có Toast Notification nhẹ nhàng góc dưới màn hình khi lưu dữ liệu hoặc sao chép ID task.
  - Hiệu ứng nảy nhẹ (spring curve) khi thả card vào cột Done.