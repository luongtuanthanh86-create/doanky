"use strict";
(() => {
  const app = document.querySelector('[data-view="room"]');
  if (!app) return;
  const $ = (id) => document.getElementById(id);
  const prefix =
    "/support/api/" +
    (app.dataset.staff === "true" ? "staff" : "guest") +
    "/" +
    app.dataset.id +
    "/call";
  const client = Array.from(crypto.getRandomValues(new Uint8Array(16)), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
  let pc,
    stream,
    localId,
    snapshot,
    pending = false,
    polling = false,
    generation = 0,
    timer,
    disconnectTimer;
  let context, bell, lastRing, connectionDeadline;
  const status = (message) => {
    $("voice-status").textContent = message;
  };
  async function api(body, keepalive = false) {
    const response = await fetch(prefix + (body ? "" : "?client=" + client), {
      method: body ? "POST" : "GET",
      cache: "no-store",
      keepalive,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body
        ? JSON.stringify({ ...body, client, _csrf: app.dataset.csrf })
        : undefined,
      signal: keepalive ? undefined : AbortSignal.timeout(12000),
    });
    const data = await response.json();
    if (!response.ok)
      throw Object.assign(new Error(data.error || "Không thể kết nối cuộc gọi."), { status: response.status });
    return data;
  }
  function sound() {
    try {
      context ||= new AudioContext();
      context.resume().catch(() => {});
      const o = context.createOscillator(),
        gain = context.createGain();
      gain.gain.value = 0.06;
      o.frequency.value = 660;
      o.connect(gain).connect(context.destination);
      o.start();
      o.stop(context.currentTime + 0.3);
    } catch {}
  }
  $("voice-sound").onclick = () => {
    sound();
    $("voice-sound").textContent = "Đã bật chuông";
  };
  function stopBell() {
    clearInterval(bell);
    bell = null;
    lastRing = null;
  }
  function cleanup(message) {
    generation++;
    clearTimeout(connectionDeadline);
    clearTimeout(disconnectTimer);
    stopBell();
    if (pc) {
      pc.onconnectionstatechange = null;
      pc.close();
      pc = null;
    }
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    $("voice-remote").srcObject = null;
    $("voice-remote").hidden = true;
    localId = null;
    $("voice-mute").textContent = "Tắt mic";
    if (message) status(message);
  }
  function controls() {
    const c = snapshot?.call;
    $("voice-start").hidden = !!c || !!pc;
    $("voice-start").disabled = pending || !snapshot?.canCall;
    $("voice-accept").hidden = !c?.incoming || !!pc;
    $("voice-accept").disabled = pending;
    $("voice-end").hidden = !(localId || c?.incoming || pc);
    $("voice-end").disabled = pending;
    $("voice-end").textContent = c?.incoming && !pc ? "Từ chối" : "Kết thúc";
    $("voice-mute").hidden = !stream;
  }
  async function end(message = "Cuộc gọi đã kết thúc.", ownedOnly = false) {
    const id = localId || (!ownedOnly && snapshot?.call?.id);
    cleanup(message);
    if (id) await api({ action: "end", callId: id }).catch(() => {});
    snapshot = null;
    controls();
  }
  async function peer(iceServers, epoch) {
    if (
      !window.isSecureContext ||
      !navigator.mediaDevices?.getUserMedia ||
      !window.RTCPeerConnection
    )
      throw new Error(
        "Gọi thoại cần Chrome/Edge hỗ trợ microphone và địa chỉ HTTPS (hoặc localhost).",
      );
    status("Đang xin quyền microphone… Hãy chọn Cho phép trên trình duyệt.");
    let expired = false,
      permissionTimer;
    const request = navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
      video: false,
    });
    request.then(
      (media) => {
        if (expired) media.getTracks().forEach((t) => t.stop());
      },
      () => {},
    );
    let media;
    try {
      media = await Promise.race([
        request,
        new Promise((_, reject) => {
          permissionTimer = setTimeout(() => {
            expired = true;
            reject(
              new Error(
                "Trình duyệt chưa cấp microphone. Nếu không thấy hộp Cho phép, hãy mở website bằng Chrome/Edge, cho phép microphone rồi gọi lại.",
              ),
            );
          }, 20000);
        }),
      ]);
    } finally {
      clearTimeout(permissionTimer);
    }
    if (epoch !== generation) {
      media.getTracks().forEach((t) => t.stop());
      throw new Error("Đã hủy cuộc gọi.");
    }
    stream = media;
    pc = new RTCPeerConnection({ iceServers });
    const connection = pc;
    media.getTracks().forEach((t) => connection.addTrack(t, media));
    connection.ontrack = (e) => {
      $("voice-remote").hidden = false;
      $("voice-remote").srcObject = e.streams[0] || new MediaStream([e.track]);
      $("voice-remote")
        .play()
        .catch(() => status("Đã kết nối. Nhấn phát ở thanh âm thanh để nghe."));
    };
    connection.onconnectionstatechange = () => {
      if (pc !== connection) return;
      if (connection.connectionState === "connected") {
        clearTimeout(connectionDeadline);
        clearTimeout(disconnectTimer);
        stopBell();
        status("● Đang nói chuyện · Âm thanh không được ghi lại");
      } else if (connection.connectionState === "failed")
        end(
          "Không kết nối được âm thanh. Kiểm tra mạng hoặc cấu hình TURN của website.",
        );
      else if (connection.connectionState === "disconnected") {
        status("Mất kết nối âm thanh · đang chờ khôi phục…");
        clearTimeout(disconnectTimer);
        disconnectTimer = setTimeout(
          () => end("Cuộc gọi ngắt do mất mạng."),
          12000,
        );
      }
    };
    controls();
    return connection;
  }
  async function gathered(connection, description) {
    await connection.setLocalDescription(description);
    await new Promise((resolve, reject) => {
      const done = () => {
        clearTimeout(timeout);
        connection.removeEventListener("icegatheringstatechange", check);
        resolve();
      };
      const check = () => {
        if (connection.iceGatheringState === "complete") done();
      };
      const timeout = setTimeout(done, 8000);
      connection.addEventListener("icegatheringstatechange", check);
      check();
    });
    if (connection.signalingState === "closed")
      throw new Error("Cuộc gọi đã đóng.");
    return {
      type: connection.localDescription.type,
      sdp: connection.localDescription.sdp,
    };
  }
  function connectingTimeout() {
    clearTimeout(connectionDeadline);
    if (pc?.connectionState === "connected") {
      status("● Đang nói chuyện · Âm thanh không được ghi lại");
      return;
    }
    connectionDeadline = setTimeout(
      () =>
        end("Không thiết lập được âm thanh. Hãy thử lại hoặc gửi tin nhắn."),
      35000,
    );
  }
  async function begin(accept) {
    if (pending) return;
    pending = true;
    controls();
    if (!accept && app.dataset.staff !== "true" && window.sendRescueLocationForCall)
      Promise.resolve().then(() => window.sendRescueLocationForCall()).catch(() => {
        $("call-location-status").textContent = "Chưa gửi được vị trí. Bạn vẫn có thể gọi và gửi vị trí trên bản đồ.";
      });
    const epoch = generation;
    try {
      snapshot = await api();
      if (!snapshot.canCall)
        throw new Error("Nhân viên cần tiếp nhận yêu cầu trước khi gọi.");
      const incoming = snapshot.call;
      if (accept && !incoming?.incoming)
        throw new Error("Cuộc gọi này không còn chờ nhận.");
      if (!accept && incoming)
        throw new Error(
          "Đã có cuộc gọi trong phòng. Hãy nghe hoặc chờ kết thúc.",
        );
      const connection = await peer(snapshot.iceServers, epoch);
      status("Đang thiết lập đường truyền âm thanh…");
      if (accept) {
        localId = incoming.id;
        await connection.setRemoteDescription(incoming.offer);
        const description = await gathered(
          connection,
          await connection.createAnswer(),
        );
        await api({ action: "accept", callId: localId, description });
        stopBell();
        status("Đang kết nối âm thanh…");
        connectingTimeout();
      } else {
        const description = await gathered(
          connection,
          await connection.createOffer(),
        );
        const result = await api({ action: "start", description });
        localId = result.id;
        status("Đang gọi… Chờ bên kia bấm nghe (tối đa 60 giây).");
      }
    } catch (e) {
      const messages = {
        NotAllowedError:
          "Bạn chưa cho phép microphone. Mở quyền microphone của trang rồi thử lại.",
        NotFoundError: "Không tìm thấy microphone trên thiết bị.",
        NotReadableError: "Microphone đang bận hoặc không sử dụng được.",
      };
      await end(messages[e.name] || e.message, true);
    } finally {
      pending = false;
      controls();
    }
  }
  $("voice-start").onclick = () => begin(false);
  $("voice-accept").onclick = () => begin(true);
  $("voice-end").onclick = () => end();
  $("voice-mute").onclick = () => {
    const track = stream?.getAudioTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      $("voice-mute").textContent = track.enabled ? "Tắt mic" : "Bật mic";
    }
  };
  async function poll() {
    if (polling) return;
    polling = true;
    try {
      const data = await api();
      const previous = snapshot?.call;
      const wasAllowed = snapshot?.canCall;
      snapshot = data;
      if (pending) return;
      const c = data.call;
      if (localId && (!c || c.id !== localId || !c.participant))
        cleanup("Cuộc gọi đã kết thúc, bị từ chối hoặc không có người nghe.");
      if (c?.incoming) {
        status("☎ Có cuộc gọi đến · Bấm Nghe để trò chuyện");
        if (lastRing !== c.id) {
          stopBell();
          lastRing = c.id;
          sound();
          bell = setInterval(sound, 2500);
        }
      } else {
        stopBell();
        if (previous?.incoming && !c) status("Cuộc gọi đến đã kết thúc.");
        if (c?.otherTab) status("Cuộc gọi đang mở ở một thẻ khác.");
        else if (!data.canCall)
          status(
            "Tiếp nhận yêu cầu để gọi thoại; phiên đã kết thúc sẽ không thể gọi.",
          );
        else if (wasAllowed === false && !c)
          status("Đã tiếp nhận. Bạn có thể gọi thoại cho khách.");
        else if (c && !c.participant && !pc)
          status("Một nhân viên khác đang trò chuyện với khách.");
      }
      if (pc && c?.answer && !pc.remoteDescription) {
        await pc.setRemoteDescription(c.answer);
        status("Đang kết nối âm thanh…");
        connectingTimeout();
      }
      controls();
    } catch (e) {
      if (!pending) {
        snapshot = null;
        const expired = [401, 403, 404].includes(e.status);
        cleanup(expired ? 'Phiên không còn hợp lệ. Dùng liên kết kết nối lại ở đầu trang.' : "Mất kết nối dịch vụ gọi. Hãy kiểm tra mạng rồi thử lại.");
        if (expired) clearInterval(timer);
        controls();
      }
    } finally {
      polling = false;
    }
  }
  timer = setInterval(poll, 2000);
  poll();
  window.addEventListener("pagehide", () => {
    const id = localId;
    cleanup();
    clearInterval(timer);
    context?.close();
    if (id) api({ action: "end", callId: id }, true).catch(() => {});
  });
})();
