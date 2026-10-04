const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const code = fs.readFileSync(
  require.resolve("../public/js/voice-call.js"),
  "utf8",
);
const flush = async () => {
  for (let i = 0; i < 8; i++) await new Promise(setImmediate);
};
function browser(mediaError, options = {}) {
  const nodes = new Map(),
    timers = new Map(),
    tracks = [
      {
        enabled: true,
        stopped: false,
        stop() {
          this.stopped = true;
        },
      },
    ];
  const media = { getTracks: () => tracks, getAudioTracks: () => tracks };
  const node = (id) => {
    if (!nodes.has(id))
      nodes.set(id, {
        textContent: "",
        hidden: false,
        disabled: false,
        play: async () => {},
      });
    return nodes.get(id);
  };
  let call = null,
    micRequests = 0,
    peer;
  class Peer {
    constructor() {
      peer = this;
      this.iceGatheringState = "complete";
      this.connectionState = "new";
    }
    addTrack() {}
    addEventListener() {}
    removeEventListener() {}
    async createOffer() {
      return { type: "offer", sdp: "v=0" };
    }
    async createAnswer() {
      return { type: "answer", sdp: "v=0" };
    }
    async setLocalDescription(d) {
      this.localDescription = d;
    }
    async setRemoteDescription(d) {
      this.remoteDescription = d;
      this.connectionState = "connected";
      this.onconnectionstatechange?.();
    }
    close() {
      this.signalingState = "closed";
    }
  }
  function schedule(fn, ms) {
    const key = {};
    timers.set(key, { fn, ms });
    return key;
  }
  const page = {
    isSecureContext: true,
    RTCPeerConnection: Peer,
    addEventListener() {},
    sendRescueLocationForCall: options.location,
  };
  const sandbox = {
    document: {
      querySelector: () => ({
        dataset: { id: "1", staff: options.staff ? "true" : "false", csrf: "test" },
      }),
      getElementById: node,
    },
    window: page,
    RTCPeerConnection: Peer,
    crypto: require("node:crypto"),
    AbortSignal,
    console,
    navigator: {
      mediaDevices: {
        getUserMedia: async () => {
          micRequests++;
          if (mediaError)
            throw Object.assign(new Error(), { name: mediaError });
          return media;
        },
      },
    },
    setTimeout: schedule,
    setInterval: schedule,
    clearTimeout: (key) => timers.delete(key),
    clearInterval: (key) => timers.delete(key),
    fetch: async (_, opts) => {
      if (opts.body) {
        const b = JSON.parse(opts.body);
        if (b.action === "start") call = { id: "test-call", participant: true };
        if (b.action === "accept") call = { id: b.callId, participant: true };
        if (b.action === "end") call = null;
        return { ok: true, json: async () => ({ id: "test-call" }) };
      }
      return {
        ok: true,
        json: async () => ({ canCall: true, iceServers: [], call }),
      };
    },
  };
  vm.runInNewContext(code, sandbox);
  return {
    node,
    tracks,
    timers,
    peer: () => peer,
    micRequests: () => micRequests,
    setCall: (c) => {
      call = c;
    },
    poll: async () => {
      await [...timers.values()].find((t) => t.ms === 2000).fn();
      await flush();
    },
  };
}
test("Từ chối microphone hiển thị lỗi và cho thử lại", async () => {
  const b = browser("NotAllowedError");
  await flush();
  await b.node("voice-start").onclick();
  assert.match(b.node("voice-status").textContent, /chưa cho phép microphone/);
  await b.poll();
  assert.equal(b.node("voice-start").disabled, false);
});
test("Gọi đi, nhận answer, tắt mic và kết thúc giải phóng microphone", async () => {
  const b = browser();
  await flush();
  await b.node("voice-start").onclick();
  b.setCall({
    id: "test-call",
    participant: true,
    answer: { type: "answer", sdp: "v=0" },
  });
  await b.poll();
  assert.match(b.node("voice-status").textContent, /Đang nói chuyện/);
  b.node("voice-mute").onclick();
  assert.equal(b.tracks[0].enabled, false);
  assert.equal(
    [...b.timers.values()].some((t) => t.ms === 35000),
    false,
  );
  await b.node("voice-end").onclick();
  assert.equal(b.tracks[0].stopped, true);
  assert.equal(b.peer().signalingState, "closed");
});
test("Nhận cuộc gọi cần thao tác Nghe, không tự bật mic; cuộc gọi mất dừng mic", async () => {
  const b = browser();
  await flush();
  b.setCall({
    id: "incoming",
    incoming: true,
    offer: { type: "offer", sdp: "v=0" },
  });
  await b.poll();
  assert.equal(b.micRequests(), 0);
  assert.equal(b.node("voice-accept").hidden, false);
  await b.node("voice-accept").onclick();
  assert.equal(b.micRequests(), 1);
  b.setCall(null);
  await b.poll();
  assert.equal(b.tracks[0].stopped, true);
});

test("GPS chậm không trì hoãn cuộc gọi; chỉ khách gọi đi gửi vị trí", async () => {
  let count = 0;
  const location = () => { count++; return new Promise(() => {}); };
  const customer = browser(null, {location});
  await flush(); await customer.node("voice-start").onclick();
  assert.equal(count, 1); assert.equal(customer.micRequests(), 1);
  assert.match(customer.node("voice-status").textContent, /Đang gọi/);
  const staff = browser(null, {staff:true, location});
  await flush(); await staff.node("voice-start").onclick();
  assert.equal(count, 1);
  const incoming = browser(null, {location}); await flush();
  incoming.setCall({id:"incoming", incoming:true, offer:{type:"offer",sdp:"v=0"}});
  await incoming.poll(); await incoming.node("voice-accept").onclick();
  assert.equal(count, 1);
});
test("Lỗi gửi GPS không ngăn cuộc gọi và hiển thị thông báo riêng", async () => {
  const b = browser(null, {location:async () => {throw new Error("GPS denied");}});
  await flush(); await b.node("voice-start").onclick(); await flush();
  assert.match(b.node("call-location-status").textContent, /Chưa gửi được vị trí/);
  assert.match(b.node("voice-status").textContent, /Đang gọi/);
});
