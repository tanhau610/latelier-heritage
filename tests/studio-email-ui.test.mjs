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
