# L’Atelier Heritage — thông báo đơn chưa thanh toán sau 10 phút (SANDBOX)

## Trạng thái
Mã nguồn đã được chuẩn bị trên nhánh `feature/delayed-checkout-notifications`. **Chưa hoạt động** cho đến khi Cloudflare Pages triển khai bản Preview của nhánh này **và** Cloudflare Worker chạy lịch được cấu hình. Không áp dụng cho website production.

## Vì sao cần Worker riêng?
Cloudflare Pages Functions không tự chạy lại sau 10 phút khi khách đóng trang. Worker với Cron Trigger chạy độc lập mỗi phút, đọc danh sách đơn chờ trong R2 và gửi email quản trị bằng tiếng Việt nếu đủ điều kiện.

## Thiết lập trong Cloudflare (không chia sẻ API key trong chat)
1. Mở **Workers & Pages → Create → Worker**, tạo Worker tên gợi ý `latelier-checkout-notifications-sandbox`.
2. Dán mã từ `workers/checkout-notifications/index.js` vào trình sửa mã Worker rồi Deploy.
3. Trong Worker → **Settings → Bindings**, thêm **R2 bucket binding**: tên biến **`PORTRAIT_UPLOADS`**, chọn **đúng bucket R2** mà website Pages đang dùng (không tạo bucket khác).
4. Trong Worker → **Settings → Variables and Secrets**, thêm secret **`RESEND_API_KEY`**, **`NOTIFICATION_EMAIL`** và nếu đã dùng địa chỉ gửi riêng thì **`RESEND_FROM`**. Chúng phải trùng cấu hình gửi email của Pages Preview. Không dán secret lên GitHub.
5. Trong Worker → **Settings → Triggers → Cron Triggers**, thêm `* * * * *` (mỗi phút). Tùy giao diện Cloudflare, mục có thể nằm ở **Settings → Triggers**.
6. Mở Cloudflare Pages và kiểm tra nhánh `feature/delayed-checkout-notifications` đã có **Preview deployment** thành công; thử bằng URL Preview của nhánh, không dùng domain production.

## Kiểm thử
- **Ca A — không trả tiền:** nhập đơn mới, hoàn thành các bước và đến PayPal nhưng không thanh toán. Không có email chưa thanh toán ngay. Sau khoảng **10–11 phút** (Cron mỗi phút), nhận **một email** `[CHƯA THANH TOÁN SAU 10 PHÚT]`.
- **Ca B — thanh toán trước 10 phút:** nhập đơn mới, thanh toán thành công trong PayPal Sandbox. Nhận email tiếng Việt `[ĐÃ THANH TOÁN CỌC 50%]` hoặc `[ĐÃ THANH TOÁN TOÀN BỘ]` ngay sau xác minh. Không có email chưa thanh toán sau đó.
- **Ca C — bắt đầu PayPal gần phút thứ 10:** hệ thống gia hạn thời điểm nhắc tới 10 phút tính từ khi tạo phiên thanh toán PayPal. Thanh toán thành công thì bỏ nhắc.
- **Ca D — thanh toán sau khi email chưa thanh toán đã gửi:** nhận email thanh toán thành công mới; email cũ không thể thu hồi, nhưng trạng thái mới trong Studio/ledger là căn cứ chính xác.

## Lưu ý vận hành
- Đây chỉ là **Sandbox**. Không có tiền thật.
- Email chưa thanh toán là thông báo về một **yêu cầu đặt tranh chưa hoàn tất**, không phải đơn được xác nhận.
- Cron Worker đọc R2 để hoạt động cả khi khách đóng trình duyệt.
- Email có thể chậm thêm ~1 phút vì Cron; lỗi Resend sẽ được thử lại trong lượt chạy sau.
- Khi lưu lượng lớn hoặc cần bảo đảm tuyệt đối một email duy nhất trong mọi tình huống lỗi/đồng thời, nên nâng cấp sang Cloudflare Queues + cơ chế idempotency giao dịch. R2 + Cron là phương án thử nghiệm chi phí thấp, không cam kết exactly-once trong trường hợp Worker chạy đồng thời hoặc lỗi sau khi gửi email.
- Không nên đưa mã Sandbox này vào nhánh `main` cho đến khi hoàn tất kiểm thử và xây dựng luồng thanh toán thật riêng.
