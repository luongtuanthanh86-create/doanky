const {test} = require('node:test');
const assert = require('node:assert/strict');
const locate = require('../public/js/location-helper');
test('Định vị thành công trả đúng tọa độ và sai số', async () => {
  const point = {coords:{latitude:21.02,longitude:105.85,accuracy:50}};
  assert.equal(await locate({getCurrentPosition(ok,fail,options){assert.equal(options.enableHighAccuracy,false);ok(point);}}),point);
});
test('Thử phương thức chính xác cao khi lần đầu không xác định được', async () => {
  let attempts=0;
  const result=await locate({getCurrentPosition(ok,fail,options){
    attempts++; if(attempts===1) fail({code:2}); else {assert.equal(options.enableHighAccuracy,true);ok({coords:{latitude:10,longitude:106}});}
  }});
  assert.equal(attempts,2);assert.equal(result.coords.longitude,106);
});
test('Từ chối quyền không tiếp tục hỏi lại', async () => {
  let attempts=0;
  await assert.rejects(locate({getCurrentPosition(ok,fail){attempts++;fail({code:1});}}),/chưa cho phép/);
  assert.equal(attempts,1);
});
test('Không có định vị hoặc môi trường không an toàn phải báo lỗi', async () => {
  await assert.rejects(locate(null),/không hỗ trợ/);
  await assert.rejects(locate({},false),/HTTPS/);
});
