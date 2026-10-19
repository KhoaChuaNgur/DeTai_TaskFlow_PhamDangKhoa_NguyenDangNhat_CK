// js/sheets-sync.js - Module đồng bộ Google Sheets cho TaskFlow
const GOOGLE_SHEETS_CONFIG = {
  WEBHOOK_URL: "https://script.google.com/macros/s/AKfycbyoE6RzCCyIZuDvs34i9FcUNeu3UAPK9f5CvDsXoLKk40B8118brJcjRTpvu_u7ZTpmzA/exec"
};

const SheetsSync = {
  /**
   * Gửi dữ liệu báo cáo/log giờ lên Google Sheets
   * @param {Object} logData - Dữ liệu báo cáo
   * @returns {Promise<boolean>}
   */
  async sendTimeLog(logData) {
    if (!GOOGLE_SHEETS_CONFIG.WEBHOOK_URL) {
      console.warn("Chưa cấu hình Webhook URL!");
      return false;
    }

    try {
      // Dùng fetch với mode: 'no-cors' để Google Apps Script tiếp nhận không bị lỗi CORS
      await fetch(GOOGLE_SHEETS_CONFIG.WEBHOOK_URL, {
        method: "POST",
        mode: "no-cors",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(logData)
      });

      console.log("Dữ liệu đã được chuyển tiếp đến Google Sheets.");
      return true;
    } catch (error) {
      console.error("Lỗi khi gửi sang Google Sheets:", error);
      return false;
    }
  }
};

window.SheetsSync = SheetsSync;