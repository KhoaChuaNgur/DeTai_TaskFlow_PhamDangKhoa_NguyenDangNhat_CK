/**
 * ==============================================================================
 * GOOGLE APPS SCRIPT CHO HỆ THỐNG TASKFLOW (Code.gs)
 * Tính năng:
 *   1. Gửi Email thật chứa mã OTP xác thực đăng ký tài khoản qua GmailApp.
 *   2. Ghi nhận dữ liệu chấm công / log báo cáo vào Google Sheets (do đồng đội làm).
 * Hướng dẫn triển khai:
 *   - Mở Google Sheet dự án -> Tiện ích mở rộng (Extensions) -> Apps Script.
 *   - Dán toàn bộ mã này vào tệp Code.gs.
 *   - Nhấn "Triển khai" (Deploy) -> "Quản lý bản triển khai" (Manage deployments)
 *     hoặc "Triển khai mới" (New deployment).
 *   - Chọn loại: Ứng dụng web (Web app).
 *   - Thực thi dưới dạng: "Tôi" (Me).
 *   - Người có quyền truy cập: "Bất kỳ ai" (Anyone).
 *   - Nhấn "Triển khai" và cấp quyền truy cập Gmail khi được hỏi.
 * ==============================================================================
 */

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "No post data received" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var data = JSON.parse(e.postData.contents);

    // ==========================================================================
    // 1. XỬ LÝ GỬI EMAIL XÁC THỰC MÃ OTP ĐĂNG KÝ TÀI KHOẢN THẬT
    // ==========================================================================
    if (data.action === "SEND_OTP" || data.action === "OTP_EMAIL_VERIFICATION" || data.action === "VERIFY_REGISTER_OTP") {
      var recipient = data.email;
      var name = data.name || "Quý khách";
      var otpCode = data.otp || "000000";

      var subject = "🔒 Mã xác thực OTP đăng ký tài khoản TaskFlow: " + otpCode;

      var htmlBody = '<div style="font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; background-color: #090D16; border-radius: 20px; color: #F8FAFC; border: 1px solid rgba(255,255,255,0.1);">'
        + '<div style="text-align: center; margin-bottom: 28px;">'
        + '<div style="display: inline-block; width: 52px; height: 52px; line-height: 52px; background: linear-gradient(135deg, #6366F1, #8B5CF6); border-radius: 14px; color: #ffffff; font-size: 26px; font-weight: 800; box-shadow: 0 8px 20px rgba(99, 102, 241, 0.4);">T</div>'
        + '<h1 style="color: #FFFFFF; margin: 14px 0 4px 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px;">TaskFlow Platform</h1>'
        + '<p style="color: #94A3B8; font-size: 13px; margin: 0;">Nền Tảng Quản Trị Dự Án & Tiến Độ Công Việc Chuẩn SaaS</p>'
        + '</div>'
        + '<div style="background-color: #0F172A; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 16px; padding: 28px 24px; text-align: center; margin-bottom: 24px; box-shadow: 0 4px 16px rgba(0,0,0,0.3);">'
        + '<p style="color: #CBD5E1; font-size: 15px; margin-top: 0; font-weight: 600;">Xin chào <strong>' + name + '</strong>,</p>'
        + '<p style="color: #94A3B8; font-size: 13px; line-height: 1.6; margin: 8px 0 20px 0;">Bạn vừa thực hiện đăng ký tài khoản mới trên hệ thống <b>TaskFlow</b>. Vui lòng sử dụng mã xác thực OTP dùng một lần dưới đây để hoàn tất kích hoạt tài khoản:</p>'
        + '<div style="margin: 24px 0;">'
        + '<span style="font-family: monospace; font-size: 36px; font-weight: 900; letter-spacing: 8px; color: #818CF8; background-color: rgba(99, 102, 241, 0.12); padding: 14px 28px; border-radius: 14px; border: 1px solid rgba(99, 102, 241, 0.35); display: inline-block;">' + otpCode + '</span>'
        + '</div>'
        + '<p style="color: #FB7185; font-size: 12px; font-weight: 700; margin-bottom: 0;">⏳ Mã OTP này có hiệu lực trong vòng 2 phút (120 giây). Tuyệt đối không chia sẻ mã này cho bất kỳ ai.</p>'
        + '</div>'
        + '<p style="color: #64748B; font-size: 11px; text-align: center; margin: 0; line-height: 1.5;">Nếu bạn không yêu cầu mã này, vui lòng bỏ qua email. Mật khẩu và tài khoản của bạn luôn được bảo vệ bởi TaskFlow Anti-Tamper Shield.<br>© 2026 TaskFlow Platform. All rights reserved.</p>'
        + '</div>';

      GmailApp.sendEmail(recipient, subject, "Mã OTP của bạn là: " + otpCode, {
        htmlBody: htmlBody,
        name: "TaskFlow Security"
      });

      return ContentService.createTextOutput(JSON.stringify({ 
        status: "success", 
        message: "Email OTP sent successfully to " + recipient 
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // ==========================================================================
    // 2. XỬ LÝ GHI DỮ LIỆU CHẤM CÔNG / TIME LOGS VÀO GOOGLE SHEETS (ĐỒNG ĐỘI)
    // ==========================================================================
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss) {
      var sheet = ss.getActiveSheet();
      sheet.appendRow([
        new Date(),
        data.email || "",
        data.name || "",
        data.taskTitle || data.action || "",
        data.spentHours || "",
        data.status || "Completed"
      ]);
    }

    return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "Log saved" }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({ 
    status: "online", 
    service: "TaskFlow Google Apps Script Webhook Service",
    timestamp: new Date().toISOString()
  })).setMimeType(ContentService.MimeType.JSON);
}
