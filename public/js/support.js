"use strict";
(() => {
  const app = document.getElementById("support-app");
  if (!app) return;
  const $ = (id) => document.getElementById(id),
    csrf = app.dataset.csrf,
    staff = app.dataset.staff === "true";
  const id = app.dataset.id,
    prefix = "/support/api/" + (staff ? "staff" : "guest") + "/" + id;
  let sessionLost = false,
    source;
  const terminal = (s) => ["complete", "cancelled"].includes(s);
  const el = (tag, text, cls) => {
    const n = document.createElement(tag);
    if (text != null) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  };
  const error = (e) => {
    const n = $("support-error");
    n.textContent = e?.message || e || "";
    n.className = n.textContent ? "support-error" : "";
  };
  async function api(url, body) {
    const r = await fetch(url, {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify({ ...body, _csrf: csrf }) : undefined,
      signal: AbortSignal.timeout(20000),
    });
    const data = await r.json().catch(() => ({
      error: "Phiên đã hết hạn hoặc dịch vụ chưa sẵn sàng. Hãy tải lại trang.",
    }));
    if (!r.ok) {
      if (
        r.status === 401 ||
        r.status === 404 ||
        (r.status === 403 && /hết hạn/.test(data.error || ""))
      ) {
        const recovery = $("session-recovery");
        if (recovery) recovery.hidden = false;
        sessionLost = true;
        source?.close();
        for (const control of app.querySelectorAll(
          "button, textarea, input, select",
        ))
          control.disabled = true;
      }
      throw new Error(data.error || "Không thể thực hiện thao tác.");
    }
    return data;
  }
  async function busy(button, fn) {
    if (button.disabled) return;
    button.disabled = true;
    error("");
    try {
      await fn();
    } catch (e) {
      error(
        e.name === "TimeoutError"
          ? "Kết nối chậm. Vui lòng kiểm tra lại trước khi thử tiếp."
          : e,
      );
    } finally {
      button.disabled = sessionLost;
    }
  }
  const money = (n) => Number(n).toLocaleString("vi-VN") + " đ";
  const date = (s) =>
    new Date(s.replace(" ", "T")).toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  function actionButton(container, label, action, version) {
    const b = el("button", label, "btn btn-outline-primary me-2");
    b.type = "button";
    b.onclick = () =>
      busy(b, async () => {
        if (action === "cancel" && !confirm("Bạn muốn hủy yêu cầu cứu hộ này?"))
          return;
        await api(prefix + "/action", { action, version });
        await refresh();
      });
    container.append(b);
  }
  if (app.dataset.view === "home") {
    $("start-support").onclick = () =>
      busy($("start-support"), async () => {
        const d = await api("/support/api/start", {});
        location.href = "/support/room/" + d.id;
      });
    return;
  }
  let loading = false,
    again = false,
    lastData,
    map,
    marker,
    dirty = false,
    initialized = false,
    lastMessages = "",
    sound = null,
    known = null;
  function connection(ok) {
    if (sessionLost) {
      $("connection").textContent = "Phiên không còn hợp lệ · cần kết nối lại";
      $("connection").classList.add("offline");
      return;
    }
    $("connection").textContent = ok
      ? "● Cập nhật trực tiếp đang bật"
      : "○ Mất kết nối · đang thử lại";
    $("connection").classList.toggle("offline", !ok);
  }
  async function refresh() {
    if (sessionLost) return;
    if (loading) {
      again = true;
      return;
    }
    loading = true;
    try {
      if (app.dataset.view === "desk")
        renderDesk(await api("/support/api/desk"));
      else renderRoom(await api(prefix));
    } catch (e) {
      error(e);
      connection(false);
    } finally {
      loading = false;
      if (again) {
        again = false;
        refresh();
      }
    }
  }
  source = new EventSource("/support/events" + (id ? "?id=" + id : ""));
  source.addEventListener("update", () => {
    connection(true);
    refresh();
  });
  source.onopen = () => connection(true);
  source.onerror = () => connection(false);
  const fallback = setInterval(() => {
    if (document.visibilityState === "visible") refresh();
  }, 15000);
  window.addEventListener("pagehide", () => {
    source.close();
    clearInterval(fallback);
  });
  if (staff || app.dataset.view === "desk") {
    const heartbeat = setInterval(
      () =>
        !sessionLost &&
        api("/support/api/heartbeat", {}).catch(() => connection(false)),
      20000,
    );
    window.addEventListener("pagehide", () => clearInterval(heartbeat));
  }
  function renderDesk(data) {
    lastData = data;
    $("desk-title").textContent = data.actor.stationId
      ? "Yêu cầu giao cho trạm của bạn"
      : "Tiếp nhận và điều phối trạm";
    $("desk-guidance").textContent = data.actor.stationId
      ? data.actor.stationManager
        ? "Tiếp nhận yêu cầu, chọn xe và nhân viên của trạm."
        : "Xem yêu cầu được giao và cập nhật hành trình của bạn."
      : "Tiếp nhận khách, kiểm tra vị trí rồi giao cho trạm phù hợp gần nhất.";
    const active = data.requests.filter((r) => !terminal(r.state));
    $("desk-summary").replaceChildren(
      ...[
        [
          "Chờ tiếp nhận",
          active.filter((r) => ["waiting", "station_pending"].includes(r.state))
            .length,
        ],
        [
          "Đang hỗ trợ",
          active.filter(
            (r) => !["waiting", "station_pending"].includes(r.state),
          ).length,
        ],
        [
          "Sẵn sàng điều phối",
          data.team.filter((t) => t.available && !t.busy).length,
        ],
      ].map(([s, n]) => {
        const d = el("div", null, "summary-item");
        d.append(el("b", n), el("span", s));
        return d;
      }),
    );
    const waiting = new Set(
      active
        .filter(
          (r) =>
            r.state === "waiting" || r.state === "station_pending" || r.ringing,
        )
        .map((r) => r.id + (r.ringing ? "-call" : "")),
    );
    if (known && [...waiting].some((i) => !known.has(i)) && sound) {
      const o = sound.createOscillator(),
        g = sound.createGain();
      o.connect(g);
      g.connect(sound.destination);
      g.gain.value = 0.07;
      o.frequency.value = 740;
      o.start();
      o.stop(sound.currentTime + 0.25);
    }
    known = waiting;
    const filter = $("desk-filter").value;
    const rows = data.requests.filter(
      (r) =>
        filter === "all" ||
        (filter === "waiting" &&
          ["waiting", "station_pending"].includes(r.state)) ||
        (filter === "mine" &&
          ([r.dispatcher, r.technician].includes(data.actor.id) ||
            r.stationId === data.actor.stationId) &&
          !terminal(r.state)) ||
        (filter === "active" && !terminal(r.state)),
    );
    $("desk-requests").replaceChildren(
      ...rows.map((r) => {
        const a = el("a", null, "request-card");
        a.href = "/support/desk/" + r.id;
        a.append(
          el("span", data.labels[r.state], "request-badge " + r.state),
          el("h3", "#" + r.id + " · " + (r.vehicle || "Chưa xác định loại xe")),
          el(
            "p",
            r.ringing
              ? "☎ Khách đang gọi · Mở phòng để nghe"
              : r.issue || "Khách đang chờ trao đổi",
          ),
          el(
            "small",
            r.locationText ||
              (r.lat !== null ? "Đã chia sẻ tọa độ" : "Chưa xác minh vị trí"),
          ),
          el(
            "small",
            "Tiếp nhận: " +
              (r.dispatcherName || "Chưa có") +
              " · " +
              date(r.createdAt),
          ),
        );
        if (r.stationName)
          a.append(
            el(
              "small",
              "Trạm: " +
                r.stationName +
                (r.technicianName ? " · Người đi: " + r.technicianName : ""),
            ),
          );
        return a;
      }),
    );
    if (!rows.length)
      $("desk-requests").append(
        el("p", "Chưa có yêu cầu trong bộ lọc này.", "muted"),
      );
    $("team-list").replaceChildren(
      ...data.team.map((t) => {
        const d = el("div", null, "team-member");
        d.append(
          el("strong", t.name),
          el(
            "p",
            t.busy
              ? "Đã được điều phối"
              : t.available
                ? "● Sẵn sàng"
                : "○ Không trực",
          ),
          el(
            "small",
            (t.area || "Chưa cập nhật khu vực") +
              " · " +
              (t.capability || "Chưa cập nhật khả năng"),
          ),
        );
        return d;
      }),
    );
    if (!initialized) {
      const me = data.team.find((t) => t.id === data.actor.id);
      if (me) {
        $("duty-form").elements.area.value = me.area || "";
        $("duty-form").elements.capability.value = me.capability || "";
        $("duty-form").elements.available.checked = !!me.available;
      }
      initialized = true;
    }
  }
  if (app.dataset.view === "desk") {
    $("desk-filter").onchange = () => lastData && renderDesk(lastData);
    $("duty-form").onsubmit = (e) => {
      e.preventDefault();
      const f = e.target;
      busy(f.querySelector("button"), async () => {
        await api("/support/api/duty", {
          area: f.elements.area.value,
          capability: f.elements.capability.value,
          available: f.elements.available.checked,
        });
        await refresh();
      });
    };
    $("enable-sound").onclick = () =>
      busy($("enable-sound"), async () => {
        sound =
          sound || new (window.AudioContext || window.webkitAudioContext)();
        await sound.resume();
        $("enable-sound").textContent = "Âm báo đã bật";
      });
    refresh();
    return;
  }
  const details = $("details-form");
  let stations = [],
    stationLayer,
    stationViewKey = "",
    nearestBounds = null;
  function updateNearest(lat, lng) {
    if (!window.RescueStations) return;
    const available = RescueStations.eligible(stations);
    const chosen = RescueStations.nearest(stations, lat, lng);
    const box = $("nearest-station");
    box.replaceChildren();
    if (!available.length)
      box.append(
        el(
          "p",
          "Chưa có điểm cứu hộ đang hoạt động. Nhân viên sẽ hỗ trợ qua phòng này.",
        ),
      );
    else if (!chosen)
      box.append(
        el(
          "p",
          "Bấm lấy vị trí hoặc chọn điểm trên bản đồ để tự tìm cơ sở gần nhất.",
        ),
      );
    else {
      box.append(el("p", chosen.name, "station-name"), el("p", chosen.address));
      box.append(
        el(
          "p",
          "Cách khoảng " +
            chosen.distanceKm.toLocaleString("vi-VN", {
              maximumFractionDigits: 2,
            }) +
            " km theo đường thẳng.",
        ),
      );
      if (Number(chosen.isDemo))
        box.append(
          el(
            "p",
            "DỮ LIỆU MẪU · Đây chưa phải cơ sở cứu hộ thực.",
            "station-demo",
          ),
        );
      box.append(
        el(
          "small",
          dirty
            ? "Điểm được chọn cho vị trí đang xem. Bấm gửi vị trí để nhân viên nhận."
            : "Gợi ý theo vị trí đã gửi. Điều phối viên sẽ giao yêu cầu cho trạm phù hợp.",
        ),
      );
      if (chosen.phone && !Number(chosen.isDemo)) {
        const a = el("a", "Gọi điểm cứu hộ", "btn btn-outline-primary");
        a.href = "tel:" + chosen.phone;
        box.append(a);
      }
    }
    if (!map) return;
    const key = JSON.stringify([available, chosen?.id, lat, lng]);
    if (key === stationViewKey) return;
    stationViewKey = key;
    if (!stationLayer) stationLayer = L.layerGroup().addTo(map);
    stationLayer.clearLayers();
    for (const s of available) {
      const popup = el("div");
      popup.append(el("strong", s.name), el("p", s.address));
      if (Number(s.isDemo)) popup.append(el("small", "Điểm minh họa"));
      L.circleMarker([Number(s.lat), Number(s.lng)], {
        radius: s.id === chosen?.id ? 12 : 8,
        color: "#fff",
        weight: 3,
        fillColor: s.id === chosen?.id ? "#155e52" : "#3978b8",
        fillOpacity: 1,
      })
        .bindPopup(popup)
        .addTo(stationLayer);
    }
    nearestBounds = chosen
      ? [
          [Number(lat), Number(lng)],
          [Number(chosen.lat), Number(chosen.lng)],
        ]
      : null;
    if (nearestBounds)
      map.fitBounds(nearestBounds, { padding: [35, 35], maxZoom: 14 });
    else if (available.length)
      map.fitBounds(
        available.map((s) => [Number(s.lat), Number(s.lng)]),
        { padding: [30, 30], maxZoom: 12 },
      );
  }
  if ($("claim-top"))
    $("claim-top").onclick = () =>
      busy($("claim-top"), async () => {
        await api(prefix + "/action", { action: "claim" });
        await refresh();
      });
  details.oninput = (e) => {
    dirty = true;
    if (e.target.name === "lat" || e.target.name === "lng") {
      const lat = details.elements.lat.value,
        lng = details.elements.lng.value;
      if (window.RescueStations.valid(lat, lng))
        showMarker(Number(lat), Number(lng));
      updateNearest(lat, lng);
    }
  };
  function setPosition(lat, lng) {
    details.elements.lat.value = Number(lat).toFixed(6);
    details.elements.lng.value = Number(lng).toFixed(6);
    dirty = true;
    showMarker(Number(lat), Number(lng));
    updateNearest(Number(lat), Number(lng));
    $("location-status").textContent =
      "Điểm đã chọn nhưng chưa gửi. Bấm nút gửi bên dưới để nhân viên nhận vị trí.";
  }
  function showMarker(lat, lng) {
    if (!map) return;
    const moved =
      !marker ||
      marker.getLatLng().lat !== Number(lat) ||
      marker.getLatLng().lng !== Number(lng);
    if (!marker) {
      marker = L.circleMarker([lat, lng], {
        radius: 10,
        color: "#fff",
        weight: 3,
        fillColor: "#d94724",
        fillOpacity: 1,
      }).addTo(map);
    } else marker.setLatLng([lat, lng]);
    map.invalidateSize();
    if (moved) map.setView([lat, lng], 16);
  }
  try {
    if (window.L) {
      map = L.map("support-map").setView([21.0285, 105.8542], 12);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      })
        .on("tileerror", () => {
          $("location-status").textContent =
            "Nền bản đồ chưa tải được. Bạn vẫn có thể nhập địa chỉ hoặc dùng GPS.";
        })
        .addTo(map);
      map.on("click", (e) => {
        if (!details.elements.lat.disabled)
          setPosition(e.latlng.lat, e.latlng.lng);
      });
    } else
      $("location-status").textContent =
        "Bản đồ chưa tải được. Bạn có thể nhập địa chỉ bên dưới.";
  } catch {
    $("location-status").textContent =
      "Không mở được bản đồ. Vui lòng mô tả địa chỉ.";
  }
  let geoPending = false;
  $("open-location").onclick = () => {
    $("location-panel").open = true;
    $("location-panel").scrollIntoView({ behavior: "smooth", block: "start" });
  };
  $("location-panel")?.addEventListener("toggle", () => {
    if ($("location-panel").open && map)
      requestAnimationFrame(() => {
        map.invalidateSize();
        if (nearestBounds)
          map.fitBounds(nearestBounds, { padding: [35, 35], maxZoom: 14 });
        else if (marker) map.setView(marker.getLatLng(), 16);
      });
  });
  let callLocationPending;
  if (!staff) window.sendRescueLocationForCall = () => {
    if (callLocationPending) return callLocationPending;
    const notice = $("call-location-status");
    const run = async () => {
      try {
        if (sessionLost) throw new Error("Phiên đã hết hạn. Về trang chủ để kết nối lại.");
        if (lastData?.request?.stationId) {
          notice.textContent = "Vị trí đã gửi cho trạm. Xe sẽ đến điểm đã được điều phối.";
          return;
        }
        if (geoPending) throw new Error("Đang lấy vị trí thủ công. Hãy bấm Gửi vị trí khi bản đồ đánh dấu xong.");
        geoPending = true;
        $("locate").disabled = true;
        notice.textContent = "Đang lấy và gửi vị trí… Hãy cho phép định vị khi trình duyệt hỏi.";
        const p = await window.locateRescuePosition(navigator.geolocation, window.isSecureContext);
        if (sessionLost) throw new Error("Phiên đã hết hạn. Về trang chủ để kết nối lại.");
        const result = await api(prefix + "/location", { lat: p.coords.latitude, lng: p.coords.longitude });
        const wasDirty = dirty;
        if (result.lat != null && result.lng != null) setPosition(result.lat, result.lng);
        dirty = wasDirty;
        notice.textContent = result.kept
          ? "Giữ vị trí đã giao cho trạm. Liên hệ điều phối nếu cần đổi điểm."
          : "Đã tự gửi vị trí cho người tiếp nhận · sai số khoảng " + Math.round(p.coords.accuracy) + " m.";
        $("location-status").textContent = notice.textContent;
        await refresh();
      } catch (e) {
        notice.textContent = "Chưa gửi được vị trí: " + e.message + " Bạn vẫn có thể gọi và gửi vị trí trên bản đồ.";
      } finally {
        // A manual request owns its own pending state.
        if (ownsGeo) {
          geoPending = false;
          $("locate").disabled = sessionLost || details.elements.lat.disabled;
        }
      }
    };
    const ownsGeo = !geoPending;
    callLocationPending = run().finally(() => { callLocationPending = null; });
    return callLocationPending;
  };
  $("locate").onclick = async () => {
    const b = $("locate");
    if (geoPending) return;
    geoPending = true;
    b.disabled = true;
    b.textContent = "Đang tìm vị trí…";
    $("location-panel").open = true;
    $("location-status").textContent =
      "Đang tìm vị trí (tối đa 20 giây). Hãy chọn Cho phép khi trình duyệt hỏi.";
    try {
      const p = await window.locateRescuePosition(
        navigator.geolocation,
        window.isSecureContext,
      );
      if (!sessionLost) {
        setPosition(p.coords.latitude, p.coords.longitude);
        $("location-status").textContent =
          "Đã đánh dấu vị trí, sai số khoảng " +
          Math.round(p.coords.accuracy) +
          " m. Kiểm tra điểm rồi bấm “2. Gửi vị trí / thông tin cho nhân viên”.";
      }
    } catch (e) {
      $("location-status").textContent =
        e.message +
        " Nếu không thấy hộp cấp quyền, thử mở bằng Chrome/Edge. Bạn vẫn có thể chọn điểm trên bản đồ hoặc nhập địa chỉ.";
    } finally {
      geoPending = false;
      b.disabled = sessionLost || details.elements.lat.disabled;
      b.textContent = "1. Lấy vị trí hiện tại";
    }
  };
  details.onsubmit = (e) => {
    e.preventDefault();
    busy(details.querySelector("button"), async () => {
      await api(prefix + "/details", Object.fromEntries(new FormData(details)));
      dirty = false;
      await refresh();
      $("location-status").textContent =
        "Đã chia sẻ thông tin và vị trí với người tiếp nhận.";
    });
  };
  let selectedFile = null,
    recorder,
    stream,
    recordTimer;
  function fileStatus(file) {
    selectedFile = file;
    $("attachment-preview").textContent = file
      ? "Sẵn sàng gửi: " +
        file.name +
        " (" +
        Math.ceil(file.size / 1024) +
        " KB)"
      : "";
    $("remove-attachment").hidden = !file;
  }
  $("attachment").onchange = async (e) => {
    try {
      let f = e.target.files[0];
      if (f?.type.startsWith("image/") && f.size > 450000) {
        if (f.size > 20 * 1024 * 1024) throw new Error("Ảnh gốc tối đa 20 MB.");
        const bitmap = await createImageBitmap(f);
        const canvas = document.createElement("canvas");
        const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
        canvas.width = Math.round(bitmap.width * scale);
        canvas.height = Math.round(bitmap.height * scale);
        canvas
          .getContext("2d")
          .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();
        let blob;
        for (const quality of [0.8, 0.6, 0.4, 0.25]) {
          blob = await new Promise((resolve) =>
            canvas.toBlob(resolve, "image/jpeg", quality),
          );
          if (blob && blob.size <= 524288) break;
        }
        if (!blob) throw new Error("Không đọc được ảnh.");
        f = new File([blob], "anh-su-co.jpg", { type: "image/jpeg" });
      }
      if (f && f.size > 524288)
        throw new Error(
          "Tệp tối đa 512 KB. Hãy chọn ảnh nhỏ hơn hoặc ghi âm ngắn hơn.",
        );
      fileStatus(f || null);
    } catch (err) {
      error(err);
      e.target.value = "";
      fileStatus(null);
    }
  };
  $("remove-attachment").onclick = () => {
    fileStatus(null);
    $("attachment").value = "";
  };
  $("record-audio").onclick = async () => {
    try {
      if (recorder?.state === "recording") {
        recorder.stop();
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)
        throw new Error(
          "Trình duyệt chưa hỗ trợ ghi âm tại địa chỉ này. Hãy dùng localhost/HTTPS, tải tệp âm thanh hoặc nhắn tin.",
        );
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recorder = new MediaRecorder(stream, { audioBitsPerSecond: 24000 });
      const chunks = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      recorder.onstop = () => {
        clearTimeout(recordTimer);
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: recorder.mimeType });
        if (blob.size > 524288)
          error("Ghi âm vượt 512 KB. Hãy ghi đoạn ngắn hơn.");
        else
          fileStatus(
            new File(
              [blob],
              "ghi-am." + (recorder.mimeType.includes("mp4") ? "m4a" : "webm"),
              { type: recorder.mimeType },
            ),
          );
        $("record-audio").textContent = "● Ghi âm";
      };
      recorder.start();
      $("record-audio").textContent = "■ Dừng ghi âm";
      recordTimer = setTimeout(() => {
        if (recorder.state === "recording") recorder.stop();
      }, 45000);
    } catch (e) {
      stream?.getTracks().forEach((t) => t.stop());
      error(
        e.name === "NotAllowedError"
          ? "Bạn chưa cho phép microphone. Có thể nhắn tin hoặc gửi ảnh."
          : e,
      );
    }
  };
  window.addEventListener("pagehide", () => {
    clearTimeout(recordTimer);
    stream?.getTracks().forEach((t) => t.stop());
  });
  const base64 = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  $("message-form").onsubmit = (e) => {
    e.preventDefault();
    busy($("send-message"), async () => {
      if (recorder?.state === "recording")
        throw new Error("Dừng ghi âm trước khi gửi.");
      await api(prefix + "/message", {
        text: $("chat-text").value,
        media: selectedFile ? await base64(selectedFile) : undefined,
      });
      $("chat-text").value = "";
      fileStatus(null);
      $("attachment").value = "";
      await refresh();
    });
  };
  async function teamOptions() {
    const data = await api("/support/api/desk");
    const select = $("technician-select"),
      previous = select.value;
    select.replaceChildren(
      el("option", "Chọn người phù hợp khu vực và khả năng"),
    );
    select.options[0].value = "";
    data.team
      .filter((t) => t.available && !t.busy)
      .forEach((t) => {
        const o = el(
          "option",
          t.name +
            " · " +
            (t.area || "chưa ghi khu vực") +
            " · " +
            (t.capability || "chưa ghi khả năng"),
        );
        o.value = t.id;
        select.append(o);
      });
    select.value = previous;
  }
  if (staff) {
    $("dispatch-form").onsubmit = (e) => {
      e.preventDefault();
      busy(e.target.querySelector("button"), async () => {
        await api(
          prefix + "/dispatch",
          Object.fromEntries(new FormData(e.target)),
        );
        await refresh();
      });
    };
    $("station-decline-form").onsubmit = (e) => {
      e.preventDefault();
      busy(e.target.querySelector("button"), async () => {
        await api(prefix + "/action", {
          action: "station_decline",
          reason: e.target.elements.reason.value,
        });
        await refresh();
      });
    };
  }
  if (staff)
    $("proposal-form").onsubmit = (e) => {
      e.preventDefault();
      busy(e.target.querySelector("button"), async () => {
        await api(
          prefix + "/proposal",
          Object.fromEntries(new FormData(e.target)),
        );
        await refresh();
      });
    };
  function renderRoom(data) {
    const r = data.request;
    lastData = data;
    $("room-state").textContent = data.labels[r.state];
    if ($("claim-notice"))
      $("claim-notice").hidden =
        r.state !== "waiting" || !!data.actor?.stationId;
    $("chat-guidance").textContent = staff
      ? "Phòng #" +
        id +
        " · Chỉ trả lời khách trong phòng này. Về bảng điều phối để xem yêu cầu khác."
      : r.dispatcherName
        ? "Bạn đang trao đổi với " +
          r.dispatcherName +
          " trong phòng #" +
          id +
          "."
        : "Phòng #" +
          id +
          " · Chưa có nhân viên tiếp nhận. Tin nhắn được lưu để nhân viên đọc và trả lời; đây không phải chatbot tự động.";
    $("room-subtitle").textContent = terminal(r.state)
      ? "Phiên hỗ trợ đã kết thúc. Bạn có thể tạo phiên mới từ trang chủ."
      : "Mã hỗ trợ #" +
        r.id +
        " · " +
        (r.technicianName
          ? "Nhân viên hiện trường: " + r.technicianName
          : "Chưa có nhân viên xuất phát");
    $("dispatcher-name").textContent = r.dispatcherName
      ? "Người tiếp nhận: " + r.dispatcherName
      : "Chờ người tiếp nhận";
    $("wait-notice").hidden = !(
      r.state === "waiting" &&
      Date.now() - new Date(r.createdAt.replace(" ", "T")).getTime() > 30000
    );
    const steps = ['Yêu cầu','Giao trạm','Cử xe','Đang hỗ trợ','Hoàn thành'];
    const stage = ({waiting:0,connected:0,station_pending:1,station_ready:1,proposed:2,accepted:2,enroute:2,helping:3,complete:4})[r.state] ?? -1;
    $('progress-steps').replaceChildren(...steps.map((label,i)=>el('span',label,i<=stage?'done':'')));
    const hasLocation =
      r.lat !== null &&
      r.lng !== null &&
      Number.isFinite(Number(r.lat)) &&
      Number.isFinite(Number(r.lng));
    stations = window.RescueStations.eligible(data.stations || []).filter(
      (s) => !(data.declined || []).some((d) => d.stationId === s.id),
    );
    const assignment = $("assigned-station");
    assignment.replaceChildren(
      el(
        "p",
        r.stationName
          ? "Trạm: " + r.stationName
          : "Điều phối đang xác minh và chọn trạm.",
      ),
    );
    if (r.stationName) assignment.append(el("p", data.labels[r.state]));
    if (r.technicianName)
      assignment.append(
        el("p", "Nhân viên đến hiện trường: " + r.technicianName),
      );
    if (r.rescueVehicleName)
      assignment.append(
        el("p", "Xe: " + r.rescueVehicleName + " · " + r.rescueVehiclePlate),
      );
    $("shared-location").textContent = hasLocation
      ? (staff ? "Khách đã gửi vị trí: " : "Vị trí đã gửi: ") +
        Number(r.lat).toFixed(6) +
        ", " +
        Number(r.lng).toFixed(6) +
        (r.locationText ? " · " + r.locationText : "")
      : r.locationText
        ? "Địa chỉ đã gửi: " + r.locationText
        : "Chưa có vị trí được gửi.";
    const directions = $("location-directions");
    directions.hidden = !hasLocation;
    if (hasLocation)
      directions.href =
        "https://www.google.com/maps/dir/?api=1&destination=" +
        encodeURIComponent(r.lat + "," + r.lng);
    else directions.removeAttribute("href");
    if (!dirty) {
      for (const k of [
        "lat",
        "lng",
        "locationText",
        "phone",
        "vehicle",
        "issue",
      ])
        details.elements[k].value = r[k] ?? "";
      if (r.lat !== null) showMarker(r.lat, r.lng);
    }
    updateNearest(
      dirty ? details.elements.lat.value : r.lat,
      dirty ? details.elements.lng.value : r.lng,
    );
    const canEdit =
      ["waiting", "connected", "station_pending", "station_ready"].includes(
        r.state,
      ) &&
      (!staff ||
        data.actor?.role === "admin" ||
        data.actor?.id === r.dispatcher ||
        (data.actor?.stationId === r.stationId &&
          data.actor?.stationManager === 1));
    for (const control of details.elements) control.disabled = !canEdit;
    details.elements.lat.disabled = !canEdit || !!r.stationId;
    details.elements.lng.disabled = !canEdit || !!r.stationId;
    $("locate").disabled = !canEdit || geoPending || !!r.stationId;
    const signature = JSON.stringify(data.messages);
    if (signature !== lastMessages) {
      const box = $("messages"),
        bottom = box.scrollHeight - box.scrollTop - box.clientHeight < 100;
      box.replaceChildren(
        ...data.messages.map((m) => {
          const n = el(
            "div",
            null,
            "chat-bubble " +
              (m.sender === "system"
                ? "system"
                : m.sender === (staff ? "staff" : "guest")
                  ? "mine"
                  : ""),
          );
          n.append(el("strong", m.author), el("p", m.body));
          if (m.mime) {
            const asset = el(m.mime.startsWith("image/") ? "img" : "audio");
            asset.src = prefix + "/media/" + m.id;
            if (asset.tagName === "IMG") {
              asset.alt = "Ảnh sự cố được chia sẻ";
              asset.loading = "lazy";
            } else {
              asset.controls = true;
              asset.preload = "none";
            }
            n.append(asset);
          }
          n.append(el("small", date(m.createdAt)));
          return n;
        }),
      );
      if (!data.messages.length)
        box.append(
          el(
            "p",
            "Bạn có thể gửi lời nhắn, ảnh hoặc ghi âm ngay. Nhân viên sẽ phản hồi khi tiếp nhận.",
            "muted",
          ),
        );
      if (bottom || !lastMessages) box.scrollTop = box.scrollHeight;
      lastMessages = signature;
    }
    const canChat =
      !terminal(r.state) &&
      (!staff ||
        data.actor?.role === "admin" ||
        [r.dispatcher, r.technician].includes(data.actor?.id) ||
        (data.actor?.stationId === r.stationId &&
          data.actor?.stationManager === 1));
    $("chat-text").disabled = !canChat;
    $("send-message").disabled = !canChat;
    $("record-audio").disabled = !canChat;
    $("attachment").disabled = !canChat;
    $("proposal-card").hidden = !r.plan;
    if (r.plan) {
      const c = $("proposal-content");
      c.replaceChildren(
        el("h3", r.technicianName || "Phương án trước đó"),
        el("p", r.plan),
        el("div", money(r.price), "proposal-price"),
        el("p", "Dự kiến đến sau " + r.eta + " phút kể từ khi xuất phát."),
        el("p", r.priceNote, "muted"),
      );
      if (
        [
          "waiting",
          "connected",
          "station_pending",
          "station_ready",
          "cancelled",
        ].includes(r.state)
      )
        c.append(el("p", "Phương án này không còn chờ xác nhận.", "muted"));
      if (r.technicianPhone && /^\+?\d{9,15}$/.test(r.technicianPhone)) {
        const a = el("a", "Gọi nhân viên", "btn rescue-call");
        a.href = "tel:" + r.technicianPhone;
        c.append(a);
      }
      const a = $("proposal-actions");
      a.replaceChildren();
      if (!staff && r.state === "proposed") {
        actionButton(a, "Đồng ý phương án", "accept", r.version);
        actionButton(a, "Cần trao đổi lại", "revise");
      }
    }
    $("cancel-actions").replaceChildren();
    if (
      [
        "waiting",
        "connected",
        "station_pending",
        "station_ready",
        "proposed",
        "accepted",
      ].includes(r.state) &&
      (!staff ||
        data.actor?.role === "admin" ||
        data.actor?.id === r.dispatcher)
    )
      actionButton($("cancel-actions"), "Hủy yêu cầu", "cancel");
    if (staff) {
      const a = $("staff-actions");
      a.replaceChildren();
      if (r.state === "waiting" && !data.actor?.stationId)
        actionButton(a, "Tiếp nhận & trao đổi", "claim");
      const owner =
        data.actor?.role === "admin" || data.actor?.id === r.dispatcher;
      const stationManager =
        data.actor?.role === "admin" ||
        (data.actor?.stationId === r.stationId &&
          data.actor?.stationManager === 1);
      const canDispatch =
        ["waiting", "connected", "station_pending", "station_ready"].includes(r.state) &&
        (owner || !r.dispatcher) &&
        (!data.actor?.stationId || data.actor?.role === "admin");
      $("dispatch-form").hidden = !canDispatch;
      if (canDispatch) {
        const select = $("dispatch-station"),
          previous = select.value;
        const candidates = window.RescueStations.eligible(stations)
          .map((s) => ({
            ...s,
            distanceKm: window.RescueStations.valid(r.lat, r.lng)
              ? window.RescueStations.distance(r.lat, r.lng, s.lat, s.lng)
              : null,
          }))
          .sort(
            (a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity),
          );
        select.replaceChildren(el("option", "Chọn trạm — cần vị trí khách"));
        select.options[0].value = "";
        for (const c of candidates) {
          const o = el(
            "option",
            c.name +
              (c.distanceKm !== null
                ? " · " + c.distanceKm.toFixed(2) + " km"
                : ""),
          );
          o.value = c.id;
          select.append(o);
        }
        select.value = candidates.some((c) => String(c.id) === previous)
          ? previous
          : data.nearestStation?.id || "";
      }
      $("station-decline-form").hidden = !(
        ["station_pending","station_ready"].includes(r.state) && stationManager
      );

      const canPropose =
        r.routingMode === "station"
          ? ["station_pending","station_ready"].includes(r.state) && stationManager
          : r.state === "connected" && owner && !stations.length;
      $('proposal-form').hidden=!canPropose;
      if(!initialized){
        $('proposal-customer-vehicle').value=r.vehicle || '';
        $('proposal-customer-issue').value=r.issue || '';
        initialized=true;
      }
      if(canPropose && !$('proposal-customer-vehicle').value && r.vehicle) $('proposal-customer-vehicle').value=r.vehicle;
      if(canPropose && !$('proposal-customer-issue').value && r.issue) $('proposal-customer-issue').value=r.issue;
      $("rescue-vehicle-label").hidden = r.routingMode !== "station";
      $("rescue-vehicle-select").required = r.routingMode === "station";
      if (canPropose && r.routingMode === "station") {
        for (const [select, list, label] of [
          [$("technician-select"), data.resources, "Chọn nhân viên của trạm"],
          [$("rescue-vehicle-select"), data.vehicles, "Chọn xe của trạm"],
        ]) {
          const previous = select.value;
          select.replaceChildren(el("option", label));
          select.options[0].value = "";
          for (const item of list.filter(
            (x) => !x.busy && (x.available === undefined || x.available),
          )) {
            const o = el(
              "option",
              item.name +
                (item.plate ? " · " + item.plate : "") +
                (item.capability ? " · " + item.capability : ""),
            );
            o.value = item.id;
            select.append(o);
          }
          select.value = previous;
        }
      } else if (canPropose) teamOptions().catch(error);
      if (r.state === "proposed" && (owner || stationManager))
        actionButton(a, "Thu hồi để sửa phương án", "revise");
      const next = {
        accepted: ["Xác nhận xuất phát", "enroute"],
        enroute: ["Đã đến · bắt đầu hỗ trợ", "helping"],
        helping: ["Hoàn thành cứu hộ", "complete"],
      }[r.state];
      if (
        next &&
        (data.actor?.role === "admin" || data.actor?.id === r.technician)
      )
        actionButton(a, ...next);
    }
  }
  refresh();
})();
