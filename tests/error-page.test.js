const { test } = require("node:test");
const assert = require("node:assert/strict");
require("dotenv").config({quiet:true});
process.env.SESSION_SECRET = "error-page-test-secret-at-least-32-characters";
process.env.NODE_ENV = "development";
const Store = require("../lib/mysql-session-store");
const originalGet = Store.prototype.get;
Store.prototype.get = function(id, callback) {
  callback(Object.assign(new Error("Database unavailable"), {code:"ECONNREFUSED"}));
};
const pool = require("../config/database");
const app = require("../app");
const signature = require("cookie-signature");

test("Trang lỗi vẫn render khi lỗi xảy ra trước middleware session/locals", async (t) => {
  const server = app.listen(0,"127.0.0.1");
  await new Promise(resolve=>server.once("listening",resolve));
  t.after(async()=>{
    Store.prototype.get=originalGet;
    await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});
    await pool.end();
  });
  const base="http://127.0.0.1:"+server.address().port;
  const cookie=require("../lib/session-name")+"="+encodeURIComponent("s:"+signature.sign("test-session",process.env.SESSION_SECRET));
  for (const path of ["/", "/login", "/support/room/1"]) {
    const response=await fetch(base+path,{headers:{cookie}});
    const html=await response.text();
    assert.equal(response.status,503);
    assert.match(html,/Chưa kết nối được cơ sở dữ liệu/);
    assert.match(html,/Kết nối cứu hộ/);
    assert.doesNotMatch(html,/ReferenceError|currentPath is not defined|node_modules/);
    assert.doesNotMatch(html,/Tiếp nhận &amp; điều phối/);
  }
  const json=await fetch(base+"/support/api/guest/1",{headers:{cookie}});
  assert.equal(json.status,500);
  assert.equal(typeof (await json.json()).error,"string");
  const malformed=await fetch(base+"/login",{
    method:"POST",headers:{"content-type":"application/json"},body:"{broken"
  });
  assert.equal(malformed.status,400);
  assert.match(await malformed.text(),/Không thể thực hiện thao tác/);
});
