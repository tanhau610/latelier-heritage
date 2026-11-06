// Cloudflare Worker: delayed admin-only Sandbox checkout alerts.
// Deploy as a separate Worker with a cron trigger every minute.
// Bind the SAME private R2 bucket as the Pages PORTRAIT_UPLOADS binding.
// Secrets: RESEND_API_KEY, NOTIFICATION_EMAIL; optional RESEND_FROM.
// This Worker never sends customer email, charges money or processes live orders.

const PREFIX = "pending-checkouts/";
const MAX_PER_RUN = 100;
const DELAY_MS = 10 * 60 * 1000;
const validId = id => /^LH-\d{8}-[A-F0-9]{8}$/.test(id || "");
const orderPath = (id, file) => "enquiries/" + id + "/" + file;
const aud = value => "A$" + Number(value).toLocaleString("vi-VN", {minimumFractionDigits:2, maximumFractionDigits:2});

async function read(bucket, key) {
  const object = await bucket.get(key);
  if (!object) return null;
  try { return await object.json(); } catch { return null; }
}

async function notify(env, id, order, payment) {
  const lines = [
    "L’ATELIER HERITAGE — THÔNG BÁO QUẢN TRỊ",
    "CHẾ ĐỘ THỬ NGHIỆM SANDBOX — KHÔNG CÓ TIỀN THẬT.",
    "",
    "TRẠNG THÁI: CHƯA THANH TOÁN SAU 10 PHÚT.",
    "Khách đã cung cấp thông tin đặt tranh nhưng hệ thống chưa ghi nhận thanh toán thành công.",
    "Đây chưa phải đơn hàng đã thanh toán. Không bắt đầu vẽ hoặc gửi hàng.",
    "Nếu khách thanh toán sau email này, hệ thống sẽ gửi email xác nhận thanh toán riêng.",
    "",
    "Mã đơn: " + id,
    "Khách hàng: " + (order.name || "Chưa cung cấp"),
    "Email khách: " + (order.email || "Chưa cung cấp"),
    "Tên thú cưng: " + (order.petName || "Chưa cung cấp"),
    "Kích thước: " + order.size + " cm",
    "Số thú cưng: " + order.pets,
    "Quốc gia giao hàng: " + order.country,
    "Thiệp viết tay: " + (order.card ? "Có" : "Không"),
    "Giá trị đơn: " + aud(payment.totalCents / 100),
    "Hình thức dự kiến: " + (order.checkoutPlan === "deposit" ? "Đặt cọc 50%" : "Thanh toán toàn bộ"),
    "Số ảnh tham khảo: " + (order.photos?.length || 0),
    "",
    "Xem chi tiết và ảnh tham khảo trong trang Studio.",
    "Chỉ liên hệ hỗ trợ khách khi phù hợp; không coi đây là đơn đã xác nhận."
  ];
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {"Authorization": "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json; charset=utf-8"},
    body: JSON.stringify({
      from: env.RESEND_FROM || "L'Atelier Heritage <onboarding@resend.dev>",
      to: [env.NOTIFICATION_EMAIL],
      subject: "[SANDBOX] [CHƯA THANH TOÁN SAU 10 PHÚT] Đơn tranh " + id,
      text: lines.join("\n")
    })
  });
  if (!response.ok) throw new Error("Resend failed with HTTP " + response.status);
}

async function checkOne(env, key, now) {
  const bucket = env.PORTRAIT_UPLOADS;
  const marker = await read(bucket, key);
  if (!marker) return;
  const id = marker.id;
  if (!validId(id) || key !== PREFIX + id + ".json") {
    console.error("Unexpected pending-checkout marker", key);
    return;
  }
  const due = Date.parse(marker.notifyAfter);
  if (!Number.isFinite(due) || due > now || now - Date.parse(marker.createdAt) < DELAY_MS) return;
  const [order, payment, ledger] = await Promise.all([
    read(bucket, orderPath(id, "details.json")),
    read(bucket, orderPath(id, "payment.json")),
    read(bucket, orderPath(id, "paypal-sandbox-payments.json"))
  ]);
  if (!order || !payment || order.checkoutMode !== "sandbox-inline" || payment.sandbox !== true) {
    console.error("Missing or non-sandbox checkout record", id);
    return;
  }
  // A verified capture wins over the unpaid alert, even if marker deletion failed.
  const paid = ledger?.quotedAt === payment.quotedAt && !!(ledger.deposit || ledger.full || ledger.balance);
  if (paid || ["Cancelled", "Shipped", "Completed"].includes(order.status)) {
    await bucket.delete(key);
    return;
  }
  // Re-read immediately before sending to reduce the PayPal capture race window.
  const latest = await read(bucket, orderPath(id, "paypal-sandbox-payments.json"));
  if (latest?.quotedAt === payment.quotedAt && (latest.deposit || latest.full || latest.balance)) {
    await bucket.delete(key);
    return;
  }
  const latestMarker = await read(bucket, key);
  if (!latestMarker || Date.parse(latestMarker.notifyAfter) > Date.now()) return;
  await notify(env, id, order, payment);
  await bucket.delete(key);
}

export default {
  async scheduled(_event, env, ctx) {
    if (!env.PORTRAIT_UPLOADS || !env.RESEND_API_KEY || !env.NOTIFICATION_EMAIL) {
      throw new Error("Missing R2 or Resend configuration for delayed notifications.");
    }
    ctx.waitUntil((async () => {
      let cursor;
      let processed = 0;
      const now = Date.now();
      do {
        const page = await env.PORTRAIT_UPLOADS.list({prefix:PREFIX, limit:Math.min(100, MAX_PER_RUN - processed), ...(cursor ? {cursor} : {})});
        for (const item of page.objects) {
          try { await checkOne(env, item.key, now); }
          catch (error) { console.error("Delayed checkout check failed", item.key, String(error)); }
          processed++;
          if (processed >= MAX_PER_RUN) break;
        }
        if (processed >= MAX_PER_RUN || page.truncated === false) break;
        cursor = page.cursor;
      } while (cursor);
    })());
  }
};
