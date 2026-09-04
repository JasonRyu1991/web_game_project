//채널 파드 서버. 접속자 상태를 메모리에 들고 있어서 이 파드는 무상태가 아니다.
//그래서 함부로 죽이면 안 되고, 죽일 땐 접속자를 다른 채널로 넘겨야 한다. 그게 이 파일의 알맹이다.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { createClient } = require('redis');
const { Pool } = require('pg');
const C = require('./core.js');

const PORT = Number(process.env.PORT) || 8080;
const CHANNEL_ID = process.env.CHANNEL_ID || 'channel-0';
const REDIS_URL = process.env.REDIS_URL || '';
const DATABASE_URL = process.env.DATABASE_URL || ''; //Cloud SQL. 없으면 세이브 저장이 꺼진다(로컬 테스트용)
const DRAIN_TIMEOUT_SEC = Number(process.env.DRAIN_TIMEOUT_SEC) || 600;

const HEARTBEAT_SEC = 5;      //명부에 "나 살아있다" 도장 찍는 주기
const CHANNEL_TTL_SEC = 15;   //도장이 이만큼 안 찍히면 명부에서 저절로 사라진다. 파드가 죽으면 이게 청소부다
const TRANSFER_TTL_SEC = 30;  //사물함에 맡긴 짐을 아무도 안 찾아가면 버리는 시간

//파드 이름 끝의 숫자가 곧 채널 번호다. channel-0 이면 0.
const INDEX = Number((CHANNEL_ID.match(/(\d+)$/) || [, 0])[1]);

//밖에서 이 채널이 어떤 주소로 보이는지. 파드는 자기 외부 주소를 모르니 환경변수로 받는다.
//쉼표로 나눠서 채널 번호로 골라 쓴다. 예: "/ch0,/ch1" 또는 "http://localhost:8080,http://localhost:8081"
const MY_BASE = (process.env.CHANNEL_BASES || '').split(',')[INDEX] || '';

/* ---------- 접속자 ---------- */
const players = new Map(); //ws -> { id, name, level, snapshot }

//채널 포화·KEDA 스케일을 브라우저 탭 여러 개 안 열고 테스트하려고 두는 가짜 접속자.
//관리자 메뉴 버튼으로 늘리고 줄인다. 메모리에만 있고 이관 대상이 아니다(드레인되면 그냥 사라짐).
const bots = new Map(); //botId -> { id, name, level }

let draining = false;

//실접속자 + 봇. 정원·명부·지표는 전부 이걸 기준으로 센다.
const everyone = () => [...players.values(), ...bots.values()];

const roster = () =>
  everyone().map(p => ({ id: p.id, name: p.name, level: p.level }));

function send(ws, msg) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(msg, except) {
  for (const ws of players.keys()) if (ws !== except) send(ws, msg);
}

/* ---------- redis ---------- */
//redis 가 없어도 서버는 뜬다. 혼자 도는 로컬 테스트용 — 대신 채널 명부와 이관은 꺼진다.
let redis = null;

async function initRedis() {
  if (!REDIS_URL) {
    console.log('[redis] REDIS_URL 없음. 채널 명부와 이관 없이 단독으로 돈다.');
    return;
  }
  const c = createClient({ url: REDIS_URL });
  c.on('error', e => console.error('[redis]', e.message)); //핸들러가 없으면 연결 끊길 때 프로세스가 통째로 죽는다
  await c.connect();
  redis = c;
  console.log(`[redis] ${REDIS_URL} 연결`);
}

//"나 살아있고 몇 명 있다" 를 명부에 적는다. TTL 이 있어서 갱신을 멈추면 알아서 지워진다.
async function heartbeat() {
  if (!redis) return;
  const m = C.channelMetrics(everyone());
  const row = { index: INDEX, base: MY_BASE, players: m.active_players, full: m.full, draining };
  try {
    await redis.set(`channel:${INDEX}`, JSON.stringify(row), { EX: CHANNEL_TTL_SEC });
  } catch (e) {
    console.error('[heartbeat]', e.message);
  }
}

async function listChannels() {
  if (!redis) return [];
  try {
    const keys = await redis.keys('channel:*'); //채널이 수십 개 수준이라 KEYS 로 충분하다. 수천 개가 되면 SCAN 으로 바꿔야 한다
    if (!keys.length) return [];
    const vals = await redis.mGet(keys);
    return vals.filter(Boolean).map(v => JSON.parse(v)).sort((a, b) => a.index - b.index);
  } catch (e) {
    console.error('[channels]', e.message);
    return [];
  }
}

//드레인할 때 접속자를 어디로 보낼지 고른다. 살아있고, 나 아니고, 닫히는 중 아니고, 안 찬 채널 중 제일 한가한 곳.
async function pickTarget() {
  const list = await listChannels();
  const ok = list.filter(c => c.index !== INDEX && !c.draining && !c.full);
  if (!ok.length) return null;
  return ok.sort((a, b) => a.players - b.players)[0];
}

//플레이어 상태를 사물함에 맡긴다. 받는 채널이 이걸 꺼내서 이어붙인다.
async function park(p) {
  if (!redis || !p.snapshot) return false;
  try {
    await redis.set(`transfer:${p.id}`, JSON.stringify(p.snapshot), { EX: TRANSFER_TTL_SEC });
    return true;
  } catch (e) {
    console.error('[park]', e.message);
    return false;
  }
}

//사물함에서 짐을 꺼내고 바로 비운다. 한 번 쓰면 없어져야 같은 짐을 두 번 못 쓴다.
async function claim(id) {
  if (!redis) return null;
  try {
    const raw = await redis.get(`transfer:${id}`);
    if (!raw) return null;
    await redis.del(`transfer:${id}`);
    return JSON.parse(raw);
  } catch (e) {
    console.error('[claim]', e.message);
    return null;
  }
}

/* ---------- 세이브 DB (Cloud SQL) ---------- */
//세이브는 채널마다 다르지 않고 계정에 딸린 값이라, 어느 채널 파드가 받아도 같은 DB 한 곳에 쓴다.
//드레인 중 넘기는 이관 페이로드(redis)와는 별개다 — 저건 "지금 화면", 이건 "다음 접속".
let db = null;

async function initDb() {
  if (!DATABASE_URL) {
    console.log('[db] DATABASE_URL 없음. 세이브 저장 없이 돈다.');
    return;
  }
  const pool = new Pool({ connectionString: DATABASE_URL, max: 4 });
  pool.on('error', e => console.error('[db]', e.message)); //유휴 커넥션 에러로 프로세스가 죽지 않게
  //user_id 를 PK 로 쓴다(계정 아이디 = 유일 + 안 바뀜 + 참조하는 테이블 없음 → 자동순차 id 불필요).
  //name·level 은 세이브를 안 열고도 목록·랭킹에서 쓰려고 컬럼으로도 뺐다. data 에도 그대로 들어있다.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS saves (
      user_id    text        PRIMARY KEY,
      name       text        NOT NULL,
      level      int         NOT NULL DEFAULT 1,
      data       jsonb       NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);
  await pool.query('CREATE INDEX IF NOT EXISTS saves_level_idx ON saves (level DESC)');
  //유저가 친 채팅만 남기는 로그. 시스템 메시지(입장/드레인 안내)는 안 들어온다.
  //한 유저가 채팅 여러 개 = 1:N 이라 자동증가 id 가 PK, user_id 는 saves 를 참조하는 FK.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chats (
      id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      user_id    text        NOT NULL REFERENCES saves(user_id) ON DELETE CASCADE,
      text       text        NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
  await pool.query('CREATE INDEX IF NOT EXISTS chats_user_time_idx ON chats (user_id, created_at DESC)');
  db = pool;
  console.log('[db] Cloud SQL 연결, saves·chats 테이블 준비');
}

//채팅 1줄을 남긴다. 세이브 행이 아직 없으면(FK 위반) 조용히 버린다 — 접속 직후 몇 초의 채팅은 안 남을 수 있다.
async function logChat(userId, text) {
  if (!db) return;
  try {
    await db.query('INSERT INTO chats (user_id, text) VALUES ($1, $2)', [userId, text]);
  } catch (e) {
    if (e.code !== '23503') console.error('[chat log]', e.message); //23503 = FK 위반(세이브 아직 없음). 그건 무시
  }
}

async function loadSave(id) {
  if (!db) return null;
  try {
    const r = await db.query('SELECT data FROM saves WHERE user_id = $1', [id]);
    return r.rows[0]?.data ?? null;
  } catch (e) {
    console.error('[db load]', e.message);
    return null;
  }
}

async function putSave(id, data) {
  if (!db) return false;
  try {
    //name·level 은 data 에서 꺼내 컬럼에도 같이 쓴다. 게임 코드는 여전히 data 통째로만 읽는다.
    const name = String(data.name || '모험가').slice(0, 20);
    const level = Number(data.level) || 1;
    await db.query(
      `INSERT INTO saves (user_id, name, level, data) VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id) DO UPDATE
         SET name = $2, level = $3, data = $4, updated_at = now()`,
      [id, name, level, data]
    );
    return true;
  } catch (e) {
    console.error('[db save]', e.message);
    return false;
  }
}

//요청 본문을 JSON 으로 읽는다. 16KB 넘으면 자른다(세이브가 그것보다 클 일이 없다).
function readJson(req) {
  return new Promise(resolve => {
    let buf = '';
    req.on('data', c => {
      buf += c;
      if (buf.length > 16384) { buf = ''; req.destroy(); resolve(null); }
    });
    req.on('end', () => { try { resolve(JSON.parse(buf)); } catch { resolve(null); } });
    req.on('error', () => resolve(null));
  });
}

/* ---------- 정적 파일 ---------- */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};

//Ingress 가 /ch0/core.js 를 경로 그대로 넘겨준다(GKE 는 경로 재작성이 없다). 그래서 앞의 /ch0 을 내가 떼야 한다.
function stripBase(urlPath) {
  if (MY_BASE.startsWith('/') && urlPath.startsWith(MY_BASE)) {
    return urlPath.slice(MY_BASE.length) || '/';
  }
  return urlPath;
}

function serveStatic(urlPath, res) {
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const file = path.resolve(__dirname, rel);
  if (!file.startsWith(__dirname)) { //../ 로 파드 안 아무 파일이나 읽어가는 걸 막는다
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
const server = http.createServer(async (req, res) => {
  const urlPath = stripBase(req.url.split('?')[0]);

  if (urlPath === '/healthz') {
    res.writeHead(draining ? 503 : 200, { 'content-type': 'text/plain' }); //드레인 중엔 503 을 줘야 LB 가 신규 트래픽을 끊는다
    res.end(draining ? 'draining' : 'ok');
    return;
  }

  //클라이언트가 "채널 몇 개 있고 어디로 가면 되냐" 를 물어보는 곳.
  //목록이 redis 명부에서 나오기 때문에 KEDA 가 파드를 늘리면 여기도 자동으로 늘어난다.
  if (urlPath === '/channels') {
    const list = await listChannels();
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ me: INDEX, cap: C.CHANNEL_CAP, channels: list }));
    return;
  }

  //KEDA metrics-api 스케일러가 읽어갈 전체 집계. 채널 하나가 아니라 명부 전체의 인원 합이다.
  //KEDA 는 total_players 를 targetValue(3)로 나눠서 파드 수를 정한다. 예: 7명 → ceil(7/3)=3채널.
  //어느 파드가 응답해도 같은 값이 나온다(전부 같은 redis 명부를 본다).
  if (urlPath === '/scale') {
    const list = await listChannels();
    //KEDA 는 sub 채널(1~4)만 스케일한다. 홈 채널(0번)은 main_channel.yaml 이 항상 띄우므로
    //인원 합에서 뺀다. 안 빼면 0번에 사람이 몰릴 때 빈 sub 채널이 과다하게 뜬다.
    const total = list.filter(c => c.index !== 0).reduce((s, c) => s + (c.players || 0), 0);
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ total_players: total, channels: list.length }));
    return;
  }

  //세이브 load/save. 경로의 id 는 계정 id. DB 한 곳을 보므로 어느 채널로 와도 된다.
  //ponytail: 인증 없음 — id 만 알면 남의 세이브도 덮어쓴다. 관리계정 평문 비번과 같은 수준의 임시 상태.
  const saveMatch = urlPath.match(/^\/save\/([^/]+)$/);
  if (saveMatch) {
    const id = decodeURIComponent(saveMatch[1]);
    if (req.method === 'GET') {
      const data = await loadSave(id);
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ data }));
      return;
    }
    if (req.method === 'POST') {
      const body = await readJson(req);
      if (!body || typeof body !== 'object') { res.writeHead(400).end('bad json'); return; }
      const ok = await putSave(id, body);
      res.writeHead(ok ? 204 : 503).end();
      return;
    }
    res.writeHead(405).end();
    return;
  }

  serveStatic(urlPath, res);
});

/* ---------- WebSocket ---------- */
const wss = new WebSocketServer({ server });

wss.on('connection', ws => {
  if (draining) {
    send(ws, { type: 'closed', reason: '폐쇄 중인 채널이다' });
    ws.close();
    return;
  }
  if (everyone().length >= C.CHANNEL_CAP) {
    send(ws, { type: 'full', cap: C.CHANNEL_CAP });
    ws.close();
    return;
  }

  const me = { id: C.newId('u'), name: '접속중', level: 1, snapshot: null };
  players.set(ws, me);

  ws.on('message', async raw => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (msg.type === 'join') {
      if (msg.id) me.id = String(msg.id).slice(0, 64); //계정 id 를 그대로 쓴다. 이게 사물함 열쇠라 채널이 바뀌어도 같아야 한다
      me.name = String(msg.name || '모험가').slice(0, 10);
      me.level = Number(msg.level) || 1;

      const parked = msg.resume ? await claim(me.id) : null; //다른 채널에서 넘어온 거면 맡긴 짐이 있다
      if (parked) send(ws, { type: 'resume', state: parked });

      send(ws, {
        type: 'welcome',
        id: me.id,
        channel: CHANNEL_ID,
        index: INDEX,
        cap: C.CHANNEL_CAP,
        roster: roster(),
        resumed: !!parked,
      });
      broadcast({ type: 'system', text: `${me.name} 님이 입장했다.` }, ws);
      broadcast({ type: 'roster', roster: roster() });
      return;
    }

    if (msg.type === 'chat') {
      const text = String(msg.text || '').slice(0, 120).trim();
      if (!text) return;
      broadcast({ type: 'chat', who: me.name, text }); //보낸 사람한테도 돌려준다. 클라가 자기 말을 따로 안 그려도 되게
      logChat(me.id, text); //유저 채팅만 DB 에 남긴다(봇은 WS 가 없어서 여기 못 온다)
      return;
    }

    //클라가 1초마다 자기 상태를 통째로 보낸다. 서버는 들고만 있다가 이관할 때 사물함에 넣는다.
    if (msg.type === 'state') {
      me.level = Number(msg.level) || me.level;
      if (msg.snapshot) me.snapshot = msg.snapshot;
      broadcast({ type: 'roster', roster: roster() }, ws);
      return;
    }

    //관리자 메뉴의 "동료 추가/내보내기". 가짜 접속자를 늘리고 줄인다. 채널 포화·KEDA 테스트용.
    if (msg.type === 'bot') {
      const delta = Number(msg.delta) || 0;
      if (delta > 0 && everyone().length < C.CHANNEL_CAP) {
        const id = C.newId('bot');
        bots.set(id, { id, name: `봇${bots.size + 1}`, level: Number(msg.level) || 1 });
      } else if (delta < 0) {
        const k = [...bots.keys()].pop();
        if (k) bots.delete(k);
      }
      broadcast({ type: 'roster', roster: roster() });
      heartbeat(); //명부 인원수도 바로 갱신해야 KEDA 가 빨리 반응한다
      return;
    }

    //게임 안에서 "채널 이동" 을 눌렀을 때. 드레인이랑 똑같은 짓을 한 명한테만 한다.
    if (msg.type === 'switch') {
      const list = await listChannels();
      const target = list.find(c => c.index === Number(msg.to));
      if (!target || target.index === INDEX) {
        send(ws, { type: 'system', text: '그런 채널이 없다.' });
        return;
      }
      if (target.full)     { send(ws, { type: 'system', text: `${target.index}번 채널이 꽉 찼다.` }); return; }
      if (target.draining) { send(ws, { type: 'system', text: `${target.index}번 채널은 닫히는 중이다.` }); return; }
      if (!(await park(me))) {
        send(ws, { type: 'system', text: '상태 저장에 실패해서 이동을 취소했다.' }); //짐을 못 맡겼는데 보내면 상태가 날아간다
        return;
      }
      send(ws, { type: 'transfer', to: target.index, base: target.base, reason: 'switch' });
      ws.close();
      return;
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
let closing = false;

function shutdown(reason) {
  if (closing) return;
  closing = true;
  console.log(`[shutdown] ${reason}`);
  if (redis) redis.del(`channel:${INDEX}`).catch(() => {}); //명부에서 나를 지운다. 안 지워도 TTL 로 사라지지만 그만큼 빈 채널이 보인다
  wss.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}

//SIGTERM 을 받아도 바로 안 죽는다. 신규 입장만 막고, 접속자를 다른 채널로 하나씩 넘긴다.
process.on('SIGTERM', async () => {
  draining = true;
  console.log(`[drain] SIGTERM 수신. 접속자 ${players.size}명.`);
  await heartbeat(); //명부에 draining 을 먼저 알려야 다른 채널이 여기로 사람을 안 보낸다

  if (players.size === 0) {
    shutdown('접속자 없음');
    return;
  }

  const target = await pickTarget();
  if (!target) {
    //갈 데가 없으면 넘길 수가 없다. 알려만 주고 스스로 나가길 기다린다.
    console.log('[drain] 보낼 채널이 없다. 접속자가 빠지길 기다린다.');
    broadcast({ type: 'drain', text: '이 채널이 곧 닫힌다. 갈 수 있는 다른 채널이 없다.' });
  } else {
    console.log(`[drain] ${players.size}명을 ${target.index}번 채널로 넘긴다.`);
    for (const [ws, p] of players) {
      if (await park(p)) {
        send(ws, { type: 'transfer', to: target.index, base: target.base, reason: 'drain' });
      } else {
        send(ws, { type: 'drain', text: '이 채널이 곧 닫힌다.' });
      }
    }
  }

  setTimeout(() => shutdown('드레인 시간 초과'), DRAIN_TIMEOUT_SEC * 1000);
});

/* ---------- 기동 ---------- */
//redis·db 어느 쪽이 없어도 서버는 뜬다. 각자 없으면 해당 기능만 꺼진다.
Promise.allSettled([
  initRedis().catch(e => console.error('[redis] 연결 실패, 명부/이관 끔:', e.message)),
  initDb().catch(e => console.error('[db] 연결 실패, 세이브 저장 끔:', e.message)),
]).then(() => {
  heartbeat();
  setInterval(heartbeat, HEARTBEAT_SEC * 1000).unref();
  server.listen(PORT, () => {
    console.log(`[${CHANNEL_ID}] :${PORT} 대기 중 (정원 ${C.CHANNEL_CAP}명, base="${MY_BASE}")`);
  });
});
