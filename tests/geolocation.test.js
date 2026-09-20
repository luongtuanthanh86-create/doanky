const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(
  path.join(__dirname, '../public/js/app.js'),
  'utf8',
);
function setup(geolocation, leaflet = true, mode = 'pick', secure = true) {
  const nodes = Object.fromEntries(
    [
      'map',
      'location-message',
      'ViDo',
      'KinhDo',
      'locate-button',
      'rescue-form',
      'location-diagnostics',
    ].map((id) => [
      id,
      {
        value: '',
        dataset: { mode, lat: '', lng: '' },
        handlers: {},
        addEventListener(event, fn) {
          this.handlers[event] = fn;
        },
        focus() {},
      },
    ]),
  );
  const map = {
    handlers: {},
    setView() {
      return this;
    },
    on(event, fn) {
      this.handlers[event] = fn;
      return this;
    },
  };
  const layer = {
    on() {
      return this;
    },
    addTo() {
      return this;
    },
  };
  const marker = {
    ...layer,
    setLatLng() {},
    getLatLng() {
      return { lat: 10, lng: 106 };
    },
  };
  const context = {
    isSecureContext: secure,
    document: { getElementById: (id) => nodes[id] },
    navigator: { geolocation },
    ...(leaflet
      ? {
          L: {
            map: () => {
              if (leaflet === 'broken')
                throw new Error('Map initialization failed');
              return map;
            },
            tileLayer: () => layer,
            marker: () => marker,
          },
        }
      : {}),
  };
  vm.runInNewContext(source, context);
  return { nodes, map };
}
test('GPS thành công gán tọa độ và mở lại nút', () => {
  const { nodes } = setup({
    getCurrentPosition(ok) {
      ok({ coords: { latitude: 10.123, longitude: 106.234, accuracy: 20 } });
    },
  });
  nodes['locate-button'].handlers.click();
  assert.equal(nodes.ViDo.value, '10.12300000');
  assert.equal(nodes.KinhDo.value, '106.23400000');
  assert.match(nodes['location-message'].textContent, /thành công/);
  assert.equal(nodes['locate-button'].disabled, false);
});
test('Bản đồ lỗi khởi tạo vẫn gắn nút định vị và hiện trạng thái tìm kiếm', () => {
  let success;
  const { nodes } = setup(
    {
      getCurrentPosition(ok) {
        success = ok;
      },
    },
    'broken',
  );
  assert.match(nodes['location-diagnostics'].textContent, /Đã tải và gắn nút/);
  nodes['locate-button'].handlers.click();
  assert.equal(nodes['locate-button'].textContent, 'Đang tìm vị trí…');
  assert.match(nodes['location-message'].textContent, /Đang lấy vị trí/);
  success({ coords: { latitude: 21, longitude: 105, accuracy: 30 } });
  assert.equal(nodes.ViDo.value, '21.00000000');
  assert.equal(nodes['locate-button'].disabled, false);
});
test('Timeout chính xác cao tự thử chế độ thường và cập nhật vị trí thật', () => {
  const optionsUsed = [];
  const { nodes } = setup({
    getCurrentPosition(ok, fail, options) {
      optionsUsed.push(options);
      if (options.enableHighAccuracy) fail({ code: 3 });
      else
        ok({ coords: { latitude: 21.028, longitude: 105.834, accuracy: 500 } });
    },
  });
  nodes['locate-button'].handlers.click();
  assert.deepEqual(
    optionsUsed.map((options) => options.enableHighAccuracy),
    [true, false],
  );
  assert.equal(nodes.ViDo.value, '21.02800000');
  assert.equal(nodes['locate-button'].disabled, false);
});
test('Quyền bị từ chối không tự gọi lại; hai lần thất bại không gán vị trí giả', () => {
  for (const code of [1, 2, 3]) {
    let count = 0;
    const { nodes } = setup({
      getCurrentPosition(ok, fail) {
        count++;
        fail({ code });
      },
    });
    nodes['locate-button'].handlers.click();
    assert.equal(count, code === 1 ? 1 : 2);
    assert.equal(nodes.ViDo.value, '');
    assert.equal(nodes.KinhDo.value, '');
    assert.equal(nodes['locate-button'].disabled, false);
  }
});
test('HTTP không an toàn và ngoại lệ định vị có thông báo, không khóa nút', () => {
  const insecure = setup(
    {
      getCurrentPosition() {
        assert.fail('Không được gọi trên HTTP không an toàn');
      },
    },
    true,
    'pick',
    false,
  );
  insecure.nodes['locate-button'].handlers.click();
  assert.match(insecure.nodes['location-message'].textContent, /HTTPS/);
  const thrown = setup({
    getCurrentPosition() {
      throw new Error('Unavailable');
    },
  });
  thrown.nodes['locate-button'].handlers.click();
  assert.equal(thrown.nodes['locate-button'].disabled, false);
});
test('Từ chối GPS, không có GPS, hết thời gian và thiếu Leaflet không crash', () => {
  for (const code of [1, 2, 3, 9]) {
    const { nodes } = setup({
      getCurrentPosition(ok, fail) {
        fail({ code });
      },
    });
    nodes['locate-button'].handlers.click();
    assert.equal(nodes['locate-button'].disabled, false);
    assert.ok(nodes['location-message'].textContent);
    if (code === 1)
      assert.match(nodes['location-message'].textContent, /từ chối/);
  }
  const { nodes } = setup(undefined, false);
  nodes['locate-button'].handlers.click();
  assert.match(nodes['location-message'].textContent, /không hỗ trợ/);
});
test('Chọn bản đồ gán tọa độ, chặn submit khi chưa có vị trí, trang chi tiết thiếu tọa độ', () => {
  const { nodes, map } = setup(undefined);
  let prevented = false;
  nodes['rescue-form'].handlers.submit({
    preventDefault() {
      prevented = true;
    },
  });
  assert.equal(prevented, true);
  map.handlers.click({ latlng: { lat: 10.5, lng: 106.5 } });
  assert.equal(nodes.ViDo.value, '10.50000000');
  assert.match(
    setup(undefined, true, 'view').nodes['location-message'].textContent,
    /Không có tọa độ/,
  );
});
