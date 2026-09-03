// 채널 파드(server.js)와 붙는 클라이언트 쪽 연결. game.js 가 이걸 통해 채팅을 주고받는다.
//
// 서버가 없어도 게임 자체는 그대로 돌아가야 한다 — 파일을 직접 열어서(file://) 테스트하거나
// 아티팩트로 볼 때가 그렇다. 그래서 연결 실패는 오류가 아니라 "혼자 모드"로 취급한다.

const Net = {
  ws: null,
  connected: false,
  me: null,        // 서버가 발급한 접속 id
  channel: null,
  roster: [],
  on: {},          // { chat, system, roster, drain, full } 핸들러를 game.js 가 채운다

  emit(type, payload) {
    const fn = this.on[type];
    if (fn) fn(payload);
  },

  connect(name, level) {
    // file:// 로 열었으면 붙을 서버 자체가 없다. 시도조차 안 하고 혼자 모드로 간다.
    if (location.protocol === 'file:') return;

    const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
    let ws;
    try {
      ws = new WebSocket(`${scheme}://${location.host}`);
    } catch {
      return; // 주소가 이상해도 게임은 계속 돌아가야 한다
    }
    this.ws = ws;

    ws.onopen = () => {
      this.connected = true;
      ws.send(JSON.stringify({ type: 'join', name, level }));
    };

    ws.onmessage = ev => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (msg.type === 'welcome') {
        this.me = msg.id;
        this.channel = msg.channel;
        this.roster = msg.roster || [];
        this.emit('system', { text: `채널 ${msg.channel} 접속 (정원 ${msg.cap}명)` });
        this.emit('roster', this.roster);
        return;
      }
      if (msg.type === 'roster') {
        this.roster = msg.roster || [];
        this.emit('roster', this.roster);
        return;
      }
      this.emit(msg.type, msg);
    };

    // 서버가 없거나 끊겨도 게임은 계속된다. 재접속은 아직 안 붙였다
    // (matchmaker 가 생기면 "다른 채널로 재배정"이 이 자리에 들어간다).
    ws.onclose = () => { this.connected = false; };
    ws.onerror = () => { this.connected = false; };
  },

  chat(text) {
    if (!this.connected) return false;
    this.ws.send(JSON.stringify({ type: 'chat', text }));
    return true;
  },

  syncLevel(level) {
    if (!this.connected) return;
    this.ws.send(JSON.stringify({ type: 'state', level }));
  },
};

if (typeof window !== 'undefined') window.Net = Net;
