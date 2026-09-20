'use strict';
(() => {
  const element = document.getElementById('map');
  if (!element) return;
  const message = document.getElementById('location-message');
  const latitude = document.getElementById('ViDo');
  const longitude = document.getElementById('KinhDo');
  const button = document.getElementById('locate-button');
  const diagnostics = document.getElementById('location-diagnostics');
  const diagnosticInfo = {};
  function diagnose(key, value) {
    diagnosticInfo[key] = value;
    if (diagnostics)
      diagnostics.textContent = Object.entries(diagnosticInfo)
        .map(([label, detail]) => `${label}: ${detail}`)
        .join('\n');
  }
  const editable = element.dataset.mode === 'pick';
  const valid = (lat, lng) =>
    lat !== '' &&
    lng !== '' &&
    Number.isFinite(Number(lat)) &&
    Number.isFinite(Number(lng)) &&
    Math.abs(Number(lat)) <= 90 &&
    Math.abs(Number(lng)) <= 180;
  const notify = (text) => {
    if (message) message.textContent = text;
  };
  let map = null,
    marker = null;
  function setBusy(busy) {
    button.disabled = busy;
    button.textContent = busy ? 'Đang tìm vị trí…' : '⌖ Lấy vị trí hiện tại';
  }
  // Leaflet không tải được vẫn cho nhập tọa độ và lấy GPS; không gây lỗi trang.
  try {
    if (typeof L !== 'undefined') {
      map = L.map(element).setView([10.7769, 106.7009], 13);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      })
        .on('tileerror', () =>
          notify(
            'Không tải được nền bản đồ. Bạn vẫn có thể lấy GPS hoặc nhập tọa độ.',
          ),
        )
        .addTo(map);
    } else
      notify('Chưa tải được bản đồ. Vui lòng tải lại trang hoặc nhập tọa độ.');
  } catch (error) {
    map = null;
    diagnose('Bản đồ', error.message || String(error));
    notify('Bản đồ chưa khởi tạo được. Nút lấy vị trí vẫn có thể sử dụng.');
  }
  function setPosition(lat, lng, updateInputs = true) {
    if (!valid(lat, lng)) return;
    lat = Number(lat);
    lng = Number(lng);
    if (map) {
      if (!marker) {
        marker = L.marker([lat, lng], { draggable: editable }).addTo(map);
        if (editable)
          marker.on('dragend', () => {
            const p = marker.getLatLng();
            setPosition(p.lat, p.lng);
            notify('Đã cập nhật vị trí theo marker.');
          });
      } else marker.setLatLng([lat, lng]);
      map.setView([lat, lng], 16);
    }
    if (editable && updateInputs) {
      latitude.value = lat.toFixed(8);
      longitude.value = lng.toFixed(8);
    }
  }
  if (valid(element.dataset.lat, element.dataset.lng)) {
    setPosition(element.dataset.lat, element.dataset.lng);
    if (editable) notify('Đã chọn vị trí. Hãy kiểm tra trước khi gửi.');
  } else if (!editable) notify('Không có tọa độ hợp lệ để hiển thị.');
  if (editable) {
    diagnose('JavaScript', 'Đã tải và gắn nút định vị');
    if (map)
      map.on('click', (event) => {
        setPosition(event.latlng.lat, event.latlng.lng);
        notify('Đã chọn vị trí trên bản đồ.');
      });
    for (const input of [latitude, longitude])
      input.addEventListener('change', () => {
        if (valid(latitude.value, longitude.value)) {
          setPosition(latitude.value, longitude.value, false);
          notify('Đã cập nhật vị trí theo tọa độ.');
        } else
          notify(
            'Vui lòng nhập vĩ độ từ -90 đến 90 và kinh độ từ -180 đến 180.',
          );
      });
    button.addEventListener('click', () => {
      diagnose('Kết quả', 'Đang kiểm tra');
      diagnose('Lỗi trình duyệt', 'Chưa có');
      diagnose(
        'Kết nối an toàn',
        globalThis.isSecureContext === false ? 'Không' : 'Có',
      );
      diagnose('Hỗ trợ định vị', navigator.geolocation ? 'Có' : 'Không');
      diagnose('Quyền vị trí', 'Không đọc được trạng thái quyền');
      // Chỉ đọc quyền hiện tại, không tự thay đổi cài đặt quyền của người dùng.
      if (navigator.permissions?.query) {
        try {
          navigator.permissions
            .query({ name: 'geolocation' })
            .then((permission) => {
              const labels = {
                granted: 'Đã cho phép',
                denied: 'Bị chặn',
                prompt: 'Chưa cấp quyền',
              };
              diagnose(
                'Quyền vị trí',
                labels[permission.state] || permission.state,
              );
            })
            .catch(() => {});
        } catch {
          /* Một số trình duyệt không hỗ trợ truy vấn quyền geolocation. */
        }
      }
      if (globalThis.isSecureContext === false)
        return notify(
          'Định vị cần HTTPS hoặc localhost. Hãy mở http://localhost:3000 trên máy chạy website, hoặc dùng HTTPS nếu truy cập từ điện thoại.',
        );
      if (!navigator.geolocation)
        return notify(
          'Trình duyệt không hỗ trợ định vị. Hãy chọn trên bản đồ hoặc nhập tọa độ.',
        );
      setBusy(true);
      notify('Đang lấy vị trí, vui lòng cho phép trình duyệt truy cập vị trí…');
      // Máy tính có thể không trả được vị trí chính xác cao. Nếu timeout hoặc
      // không có vị trí, thử lại chế độ thường; không tự gán tọa độ demo.
      function locate(highAccuracy) {
        try {
          navigator.geolocation.getCurrentPosition(
            (position) => {
              diagnose('Kết quả', 'Trình duyệt đã trả vị trí');
              setPosition(position.coords.latitude, position.coords.longitude);
              notify(
                `Lấy vị trí thành công (độ chính xác khoảng ${Math.round(position.coords.accuracy)} m). Hãy kiểm tra marker.`,
              );
              setBusy(false);
            },
            (error) => {
              diagnose(
                'Lỗi trình duyệt',
                `${error.code}: ${error.message || 'Không có mô tả'} (${highAccuracy ? 'chính xác cao' : 'chế độ thường'})`,
              );
              if (highAccuracy && [2, 3].includes(error.code)) {
                notify(
                  'Chưa lấy được vị trí chính xác cao. Đang thử định vị thường, vui lòng chờ…',
                );
                locate(false);
                return;
              }
              const errors = {
                1: 'Quyền vị trí bị từ chối hoặc bị trình duyệt/hệ điều hành chặn. Hãy cho phép vị trí cho website và bật dịch vụ vị trí trên máy, rồi thử lại.',
                2: 'Trình duyệt chưa cung cấp được vị trí. Hãy kiểm tra dịch vụ vị trí trên máy hoặc mở website bằng Chrome/Edge. Bạn vẫn có thể chọn vị trí trên bản đồ.',
                3: 'Đã hết thời gian ở cả hai chế độ định vị. Hãy thử mở website bằng Chrome/Edge, bật dịch vụ vị trí trên máy và cho phép website truy cập vị trí. Hoặc chọn trực tiếp trên bản đồ.',
              };
              notify(
                errors[error.code] ||
                  'Không lấy được vị trí. Hãy thử lại hoặc chọn trên bản đồ.',
              );
              setBusy(false);
              diagnose('Kết quả', 'Chưa lấy được vị trí');
            },
            {
              enableHighAccuracy: highAccuracy,
              timeout: highAccuracy ? 10000 : 20000,
              maximumAge: 0,
            },
          );
        } catch (error) {
          diagnose('Kết quả', 'Lỗi khi gọi chức năng định vị');
          diagnose('Lỗi trình duyệt', error.message || String(error));
          setBusy(false);
          notify(
            'Trình duyệt không thực hiện được định vị. Hãy mở website bằng Chrome/Edge hoặc chọn vị trí trên bản đồ.',
          );
        }
      }
      locate(true);
    });
    document
      .getElementById('rescue-form')
      .addEventListener('submit', (event) => {
        if (!valid(latitude.value, longitude.value)) {
          event.preventDefault();
          notify('Vui lòng xác định vị trí trước khi gửi.');
          latitude.focus();
        }
      });
  }
})();
