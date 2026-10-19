# TASKFLOW COLOR PALETTE & DESIGN TOKENS
**Theme: Deep Slate & Electric Neo-Violet (Xu hướng 2026/2027)**

---

## 1. BẢNG MÃ MÀU CHÍNH (CORE PALETTE)

### A. Dark Mode Tokens (Mặc định)
| Thành phần | Hex Code | Tailwind Equivalent | Ghi chú |
| :--- | :--- | :--- | :--- |
| **Main Background** | `#090D16` | Custom (`bg-[#090D16]`) | Sâu hơn Slate-900, không bị đen tuyệt đối |
| **Surface/Card Kính** | `rgba(15, 23, 42, 0.65)` | `bg-slate-900/65` | Đi kèm `backdrop-blur-md` |
| **Card Border** | `rgba(255, 255, 255, 0.08)` | `border-white/10` | Viền siêu mỏng tạo độ sắc nét |
| **Primary Accent** | `#6366F1` | `bg-indigo-500` | Nút bấm chính, Icon active |
| **Secondary Accent** | `#8B5CF6` | `bg-violet-500` | Nút phụ, Tag nâng cao |
| **Text Primary** | `#F8FAFC` | `text-slate-50` | Tiêu đề, chữ chính |
| **Text Secondary** | `#94A3B8` | `text-slate-400` | Deadline, mô tả phụ |

### B. Light Mode Tokens
| Thành phần | Hex Code | Tailwind Equivalent | Ghi chú |
| :--- | :--- | :--- | :--- |
| **Main Background** | `#F8FAFC` | `bg-slate-50` | Trắng xám dịu mắt |
| **Surface/Card Kính** | `rgba(255, 255, 255, 0.75)` | `bg-white/75` | Đi kèm `backdrop-blur-md` |
| **Card Border** | `rgba(226, 232, 240, 0.8)` | `border-slate-200` | Viền rõ ràng |
| **Primary Accent** | `#4F46E5` | `bg-indigo-600` | Đậm hơn để tương phản tốt trên nền sáng |
| **Text Primary** | `#0F172A` | `text-slate-900` | Đen xám độ tương phản cao |
| **Text Secondary** | `#64748B` | `text-slate-500` | Chữ phụ |

---

## 2. MÀU TRẠNG THÁI KANBAN (KANBAN COLUMNS)
- **To-do (Chờ làm)**:
  - Header badge: `bg-slate-500/10 text-slate-400 border border-slate-500/20`
  - Column border: `border-slate-700/40`
- **In-Progress / Doing (Đang làm)**:
  - Header badge: `bg-sky-500/10 text-sky-400 border border-sky-500/20`
  - Column border: `border-sky-500/30`
- **Done (Hoàn thành)**:
  - Header badge: `bg-emerald-500/10 text-emerald-400 border border-emerald-500/20`
  - Column border: `border-emerald-500/30`

---

## 3. MỨC ĐỘ ƯU TIÊN (PRIORITY BADGES)
- **Critical (Khẩn cấp)**: `bg-rose-500/15 text-rose-400 border border-rose-500/30`
- **High (Cao)**: `bg-amber-500/15 text-amber-400 border border-amber-500/30`
- **Medium (Bình thường)**: `bg-indigo-500/15 text-indigo-400 border border-indigo-500/30`
- **Low (Thấp)**: `bg-slate-500/15 text-slate-400 border border-slate-500/30`

---

## 4. HIỆU ỨNG ÁNH SÁNG NỀN GLASSMORPHISM (AMBIENT ORBS)
Đặt đoạn mã HTML này ngay dưới thẻ `<body>` để tạo lớp ánh sáng mờ 3D phía sau kính:
```html
<div class="fixed inset-0 pointer-events-none overflow-hidden -z-10">
  <div class="absolute -top-40 -left-40 w-96 h-96 bg-indigo-500/20 rounded-full blur-[128px]"></div>
  <div class="absolute top-1/2 -right-40 w-96 h-96 bg-violet-500/15 rounded-full blur-[128px]"></div>
  <div class="absolute -bottom-40 left-1/3 w-96 h-96 bg-sky-500/15 rounded-full blur-[128px]"></div>
</div>