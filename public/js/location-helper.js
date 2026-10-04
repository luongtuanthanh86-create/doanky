(function (root) {
  function locate(geo, secure = true) {
    if (!secure) return Promise.reject(new Error('Định vị cần HTTPS hoặc localhost.'));
    if (!geo) return Promise.reject(new Error('Trình duyệt không hỗ trợ định vị.'));
    return new Promise((resolve, reject) => {
      let finished = false, attempt = 0, timer;
      const finish = (error, position) => {
        if (finished) return;
        finished = true; clearTimeout(timer);
        error ? reject(error) : resolve(position);
      };
      const run = highAccuracy => {
        const current = ++attempt;
        const fail = error => {
          if (finished || current !== attempt) return;
          clearTimeout(timer);
          if (error.code === 1) return finish(new Error('Bạn chưa cho phép vị trí. Mở quyền Vị trí của website rồi thử lại.'));
          if (!highAccuracy) return run(true);
          finish(new Error('Thiết bị chưa xác định được vị trí. Bạn có thể chọn điểm trên bản đồ hoặc nhập địa chỉ.'));
        };
        timer = setTimeout(() => fail({ code: 3 }), highAccuracy ? 11000 : 9000);
        try {
          geo.getCurrentPosition(p => {
            if (finished || current !== attempt) return;
            if (!Number.isFinite(p.coords.latitude) || !Number.isFinite(p.coords.longitude)) return fail({code:2});
            finish(null, p);
          }, fail, { enableHighAccuracy: highAccuracy, timeout: highAccuracy ? 10000 : 8000, maximumAge: 0 });
        } catch (e) { finish(new Error('Không truy cập được định vị: ' + e.message)); }
      };
      run(false);
    });
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = locate;
  else root.locateRescuePosition = locate;
})(typeof window !== 'undefined' ? window : globalThis);
