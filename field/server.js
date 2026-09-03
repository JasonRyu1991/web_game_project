// 채널 파드 서버.
//
// 이 프로젝트의 명제("WebSocket 세션이 붙은 워크로드를 튕기지 않고 스케일 인")에서
// "세션이 붙은" 쪽을 담당하는 프로세스다. 접속자 상태를 메모리에 들고 있기 때문에
// 이 파드는 무상태가 아니고, 그래서 함부로 죽이면 안 되는 워크로드가 된다.
//
// 지금 범위: 정적 파일 서빙 + 채팅 릴레이 + 접속자 관리 + /metrics + preStop 드레인.
// 아직 없는 것: matchmaker(채널 배정), redis(이관 버퍼), Cloud SQL(영속 저장).

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const C = require('./core.js');

const PORT = Number(process.env.PORT) || 8080;
const CHANNEL_ID = process.env.CHANNEL_ID || '1';
// preStop 이 SIGTERM 을 보낸 뒤 남은 접속자를 기다려 주는 시간.
// 매니페스트의 terminationGracePeriodSeconds 보다 짧아야 강제 종료를 안 당한다.
const DRAIN_TIMEOUT_SEC = Number(process.env.DRAIN_TIMEOUT_SEC) || 600;

/* ---------- 접속자 ---------- */
// 채널 파드가 stateful 인 이유가 이 Map 하나다. 여기 든 내용이 곧 "잃으면 안 되는 상태"고,
// 채널을 닫을 때 다른 채널로 넘겨야 하는 대상이기도 하다(core.transferState).
const players = new Map(); // ws -> { id, name, level, joinedAt }

let draining = false; // preStop 이후: 신규 입장 차단, 기존 접속만 유지

const roster = () =>
  [...players.values()].map(p => ({ id: p.id, name: p.name, level: p.level }));

function send(ws, msg) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(msg, except) {
  for (const ws of players.keys()) if (ws !== except) send(ws, msg);
}

/* ---------- 정적 파일 ---------- */
// 브라우저가 index.html 과 클라이언트 스크립트를 받아 가는 통로.
// 별도 웹서버(nginx)를 두지 않는 이유는 파드를 하나로 유지하기 위해서다.
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

function serveStatic(urlPath, res) {
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  // 상위 경로 탈출(../)로 파드 안 아무 파일이나 읽어가는 것을 막는다.
  const file = path.resolve(__dirname, rel);
  if (!file.startsWith(__dirname)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
}

/* ---------- HTTP ---------- */
const server = http.createServer((req, res) => {
  const urlPath = req.url.split('?')[0];

  // LB 헬스체크. 드레인 중에는 실패를 돌려줘야 LB 가 새 트래픽을 그만 보낸다.
  if (urlPath === '/healthz') {
    res.writeHead(draining ? 503 : 200, { 'content-type': 'text/plain' });
    res.end(draining ? 'draining' : 'ok');
    return;
  }

  // KEDA ScaledObject 가 읽어갈 지표. pod-deletion-cost 와 같은 값을 봐야
  // "가장 한가한 채널"의 정의가 어긋나지 않는다(core.channelMetrics).
  if (urlPath === '/metrics') {
    const m = C.channelMetrics([...players.values()]);
    res.writeHead(200, { 'content-type': 'text/plain; version=0.0.4' });
    res.end(
      `# HELP active_players 이 채널에 접속한 인원\n` +
      `# TYPE active_players gauge\n` +
      `active_players{channel="${CHANNEL_ID}"} ${m.active_players}\n` +
      `# HELP channel_full 정원(${C.CHANNEL_CAP}) 도달 여부\n` +
      `# TYPE channel_full gauge\n` +
      `channel_full{channel="${CHANNEL_ID}"} ${m.full ? 1 : 0}\n` +
      `# HELP channel_draining preStop 으로 폐쇄 중인지\n` +
      `# TYPE channel_draining gauge\n` +
      `channel_draining{channel="${CHANNEL_ID}"} ${draining ? 1 : 0}\n`
    );
    return;
  }

  serveStatic(urlPath, res);
});

/* ---------- WebSocket ---------- */
const wss = new WebSocketServer({ server });

wss.on('connection', ws => {
  // 폐쇄 중인 채널은 신규 입장을 받지 않는다. 실제 배포에서는 matchmaker 가
  // 등록 해제된 채널로 아예 배정을 안 하지만, 직접 접속까지 막아 두 겹으로 잠근다.
  if (draining) {
    send(ws, { type: 'closed', reason: '폐쇄 중인 채널이다' });
    ws.close();
    return;
  }
  if (players.size >= C.CHANNEL_CAP) {
    send(ws, { type: 'full', cap: C.CHANNEL_CAP });
    ws.close();
    return;
  }

  const me = { id: C.newId('u'), name: '접속중', level: 1, joinedAt: Date.now() };
  players.set(ws, me);

  ws.on('message', raw => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return; // 형식이 깨진 메시지는 조용히 버린다
    }

    if (msg.type === 'join') {
      me.name = String(msg.name || '모험가').slice(0, 10);
      me.level = Number(msg.level) || 1;
      send(ws, {
        type: 'welcome',
        id: me.id,
        channel: CHANNEL_ID,
        cap: C.CHANNEL_CAP,
        roster: roster(),
      });
      broadcast({ type: 'system', text: `${me.name} 님이 입장했다.` }, ws);
      broadcast({ type: 'roster', roster: roster() });
      return;
    }

    if (msg.type === 'chat') {
      const text = String(msg.text || '').slice(0, 120).trim();
      if (!text) return;
      // 발신자에게도 되돌려 준다 — 클라이언트가 자기 말을 따로 그리지 않아도 되게.
      broadcast({ type: 'chat', who: me.name, text });
      return;
    }

    // 레벨 같은 가벼운 상태 동기화. 지금은 명단 갱신에만 쓴다.
    if (msg.type === 'state') {
      me.level = Number(msg.level) || me.level;
      broadcast({ type: 'roster', roster: roster() }, ws);
    }
  });

  ws.on('close', () => {
    players.delete(ws);
    broadcast({ type: 'system', text: `${me.name} 님이 나갔다.` });
    broadcast({ type: 'roster', roster: roster() });
    if (draining && players.size === 0) shutdown('드레인 완료');
  });
});

/* ---------- 종료 처리 ---------- */
// 이 프로젝트의 알맹이. SIGTERM 을 받자마자 죽지 않고, 신규 입장만 막은 채
// 남은 접속자가 빠질 때까지 기다린다. 실제 채널 폐쇄에서는 이 구간에서
// core.transferState 로 상태를 넘기게 되지만, 지금은 대기까지만 한다.
let closing = false;

function shutdown(reason) {
  if (closing) return;
  closing = true;
  console.log(`[shutdown] ${reason}`);
  wss.close();
  server.close(() => process.exit(0));
  // close 콜백이 안 오는 경우를 대비한 안전장치
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on('SIGTERM', () => {
  draining = true;
  console.log(`[drain] SIGTERM 수신. 접속자 ${players.size}명이 빠지길 기다린다.`);
  broadcast({ type: 'drain', text: '이 채널이 곧 닫힌다.' });

  if (players.size === 0) {
    shutdown('접속자 없음');
    return;
  }
  setTimeout(() => shutdown('드레인 시간 초과'), DRAIN_TIMEOUT_SEC * 1000);
});

server.listen(PORT, () => {
  console.log(`[channel ${CHANNEL_ID}] :${PORT} 대기 중 (정원 ${C.CHANNEL_CAP}명)`);
});
