import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const source=readFileSync("assets/studio.js","utf8");

test("Live status save feedback distinguishes customer emails from Sandbox previews",()=>{
  assert.match(source,/const liveEmail=order\.checkoutMode==="live-inline"/);
  assert.match(source,/Resend đã tiếp nhận email thông báo gửi cho khách/);
  assert.match(source,/CẢNH BÁO: Email khách hàng gửi thất bại/);
  assert.match(source,/result\.emailTest==="failed"\?"is-error":"is-success"/);
});

test("Studio shows actual Live status event and distinguishes accepted from delivered",()=>{
  assert.match(source,/e\.event==="live-status"/);
  assert.match(source,/Resend đã tiếp nhận \(chưa xác nhận khách đã mở\)/);
  assert.match(source,/pending:"Đang chờ/);
  assert.match(source,/Sự kiện email đã được ghi nhận; kiểm tra lịch sử/);
});

test("Sandbox preview disclaimer does not appear for Live orders",()=>{
  assert.match(source,/order\.checkoutMode==="live-inline"\?"ĐƠN LIVE:/);
});

test("Studio traffic panel reads real metrics from authenticated backend only",()=>{
 const html=readFileSync("studio.html","utf8");
 const js=readFileSync("assets/studio.js","utf8");
 const api=readFileSync("functions/api/studio-traffic.js","utf8");
 assert.match(html,/id="traffic-visits"/);
 assert.match(html,/id="traffic-views"/);
 assert.match(js,/\/api\/studio-traffic\?days=/);
 assert.match(api,/verifyStudioSession/);
 assert.match(api,/CF_ANALYTICS_TOKEN/);
 assert.match(api,/CF_ANALYTICS_ACCOUNT_ID/);
 assert.doesNotMatch(html,/CF_ANALYTICS_TOKEN/);
});

test("Live Studio summary uses verified PayPal ledger and respects 100% payment plan",()=>{
 assert.match(source,/o\.checkoutMode==="live-inline" \? Boolean\(o\.livePayment\?\.full/);
 assert.match(source,/inlineLive\?"Thanh toán PayPal Live · "/);
 assert.match(source,/const ledger=order\.livePayment\|\|\{\}/);
 assert.match(source,/Thanh toán qua PayPal Live được xác minh tự động/);
 assert.match(source,/Khách chọn thanh toán toàn bộ 100%/);
});
