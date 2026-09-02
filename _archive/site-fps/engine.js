// 1bit.kr - 레이캐스팅 FPS 코어 로직 (브라우저 + node 공용, DOM 의존 없음)

// '#' 벽돌벽 / '=' 금속벽 / '.' 바닥
const MAP = `
########################
#....#........#........#
#....#..####..#..####..#
#.......#..#.....#..#..#
#....#..#..#..#..#..#..#
######..####..#..####..#
#..............#.......#
#..####..####..#..###..#
#..#........#..#....#..#
#..#..####..#..####.#..#
#.....#==#.....#.......#
####..#==#..#######..###
#........#..#.......#..#
#..####..#..#..###..#..#
#..#..#.....#..#.#..#..#
#..#..#######..#.#..#..#
#..#...........#.#.....#
#..#########..##.#####.#
#......................#
########################`.trim().split('\n');

const MAP_W = MAP[0].length, MAP_H = MAP.length;
const SPAWN = { x: 1.5, y: 1.5 };
const PLAYER_RADIUS = 0.25;

// 무기 정의. mag=탄창 용량, cool=발사 간격(초), auto=연사 여부, spread=탄퍼짐(라디안)
const WEAPONS = {
  ak: {
    key: 'ak', name: 'AK-47', mag: 30, reserve: 120,
    cool: 0.085, auto: true, dmg: 1, spread: 0.055, reloadSec: 1.8, recoil: 6,
  },
  revolver: {
    key: 'revolver', name: '리볼버', mag: 8, reserve: 48,
    cool: 0.42, auto: false, dmg: 3, spread: 0, reloadSec: 1.5, recoil: 14,
  },
};

const MAX_HP = 100;

// 몬스터 종류. weight 가 스폰 비율이다 (잡몹 7 : 중간보스 2 : 보스 1).
// drop 은 처치 시 아이템별 드롭 확률.
// hp/speed/dmg 는 순수 수치라 나중에 서버가 그대로 가져다 쓴다.
const ENEMIES = {
  grunt: {
    key: 'grunt', name: '임프', weight: 7,
    hp: 3, speed: 1.35, dmg: 8, cool: 1.0,
    radius: 0.40, scale: 0.75, score: 100, bar: false, tint: '#e2553f',
    drop: { medkit: 0.10, ammo: 0.22 },
  },
  brute: {
    key: 'brute', name: '파괴자', weight: 2,
    hp: 14, speed: 1.05, dmg: 17, cool: 1.3,
    radius: 0.55, scale: 1.05, score: 500, bar: true, tint: '#ff9c3a',
    drop: { medkit: 0.45, ammo: 0.65 },
  },
  boss: {
    key: 'boss', name: '군주', weight: 1,
    hp: 40, speed: 0.85, dmg: 28, cool: 1.6,
    radius: 0.75, scale: 1.45, score: 1500, bar: true, tint: '#c86bff',
    drop: { medkit: 1, ammo: 1 },        // 보스는 확정
  },
};

// 처치 보상. 바닥에 떨어지고 가까이 가면 줍는다.
const ITEMS = {
  medkit: { key: 'medkit', name: '구급상자', heal: 30, tint: '#ff5a5a' },
  ammo:   { key: 'ammo',   name: '탄약상자', ak: 45, revolver: 12, tint: '#ffc94d' },
};

const PICKUP_RANGE = 0.75;

// 어떤 아이템을 떨구는지. 확률이 독립이라 둘 다 나올 수도, 하나도 안 나올 수도 있다.
function rollDrops(kind, rng = Math.random) {
  const drop = ENEMIES[kind].drop || {};
  return Object.keys(drop).filter(k => rng() < drop[k]);
}

const ENEMY_KINDS = Object.keys(ENEMIES);
const ENEMY_WEIGHT = ENEMY_KINDS.reduce((s, k) => s + ENEMIES[k].weight, 0);

// 가중 추첨. rng 를 밖에서 넣을 수 있게 해 두면 테스트에서 결정적으로 굴릴 수 있다.
function pickEnemyKind(rng = Math.random) {
  let r = rng() * ENEMY_WEIGHT;
  for (const k of ENEMY_KINDS) if ((r -= ENEMIES[k].weight) < 0) return k;
  return ENEMY_KINDS[0];            // 부동소수 오차로 끝을 넘긴 경우
}

const tileAt = (x, y) =>
  (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) ? '#' : MAP[y | 0][x | 0];

const isWall = (x, y) => tileAt(x, y) !== '.';

// DDA 레이캐스트. 벽까지의 거리, 맞은 면(0=세로 1=가로),
// 벽면 위 가로 위치(0~1, 텍스처 좌표), 타일 종류를 반환한다.
function castRay(px, py, ang, maxSteps = 96) {
  const dx = Math.cos(ang), dy = Math.sin(ang);
  let mx = Math.floor(px), my = Math.floor(py);
  const ddx = dx === 0 ? Infinity : Math.abs(1 / dx);
  const ddy = dy === 0 ? Infinity : Math.abs(1 / dy);
  let sx, sy, sdx, sdy;
  if (dx < 0) { sx = -1; sdx = (px - mx) * ddx; } else { sx = 1; sdx = (mx + 1 - px) * ddx; }
  if (dy < 0) { sy = -1; sdy = (py - my) * ddy; } else { sy = 1; sdy = (my + 1 - py) * ddy; }

  for (let i = 0; i < maxSteps; i++) {
    let dist, side;
    if (sdx < sdy) { sdx += ddx; mx += sx; side = 0; dist = sdx - ddx; }
    else           { sdy += ddy; my += sy; side = 1; dist = sdy - ddy; }
    if (isWall(mx, my)) {
      // 맞은 지점의 벽면 좌표. 세로면이면 y가, 가로면이면 x가 벽을 따라 흐른다.
      let wallX = side === 0 ? py + dist * dy : px + dist * dx;
      wallX -= Math.floor(wallX);
      return { dist, side, wallX, tile: MAP[my][mx] };
    }
  }
  return { dist: maxSteps, side: 0, wallX: 0, tile: '#' };
}

// 축을 분리해서 밀어야 벽을 긁으며 미끄러진다. 한 번에 검사하면 모서리에서 걸림.
function tryMove(x, y, dx, dy) {
  const r = PLAYER_RADIUS;
  if (!isWall(x + dx + Math.sign(dx) * r, y)) x += dx;
  if (!isWall(x, y + dy + Math.sign(dy) * r)) y += dy;
  return { x, y };
}

// 두 점 사이에 벽이 없는가 (적의 시야 / 총알 관통 판정)
function hasLineOfSight(ax, ay, bx, by) {
  const d = Math.hypot(bx - ax, by - ay);
  return castRay(ax, ay, Math.atan2(by - ay, bx - ax)).dist >= d;
}

// 스폰 지점에서 실제로 걸어갈 수 있는 칸들. 벽으로 막힌 방에 적이 갇히는 걸 막는다.
function reachableCells() {
  const seen = new Set(), out = [];
  const stack = [[Math.floor(SPAWN.x), Math.floor(SPAWN.y)]];
  while (stack.length) {
    const [x, y] = stack.pop();
    const k = y * MAP_W + x;
    if (seen.has(k) || isWall(x + 0.5, y + 0.5)) continue;
    seen.add(k);
    out.push({ x: x + 0.5, y: y + 0.5 });
    stack.push([x+1, y], [x-1, y], [x, y+1], [x, y-1]);
  }
  return out;
}

// 각도 차를 -PI..PI 로 정규화. 0도 근처에서 부호가 튀는 걸 막는다.
const normAngle = a => Math.atan2(Math.sin(a), Math.cos(a));

// 장전: 예비탄에서 탄창을 채운다. 예비탄이 모자라면 남은 만큼만.
function reload(mag, reserve, size) {
  const need = Math.min(size - mag, reserve);
  return { mag: mag + need, reserve: reserve - need };
}

const ENGINE = {
  MAP, MAP_W, MAP_H, SPAWN, PLAYER_RADIUS, WEAPONS, MAX_HP,
  ENEMIES, ENEMY_KINDS, ENEMY_WEIGHT, pickEnemyKind,
  ITEMS, PICKUP_RANGE, rollDrops,
  tileAt, isWall, castRay, tryMove, hasLineOfSight, reachableCells, normAngle, reload,
};

if (typeof module !== 'undefined') module.exports = ENGINE;   // node (테스트)
if (typeof window !== 'undefined') window.ENGINE = ENGINE;    // 브라우저
