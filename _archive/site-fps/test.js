const assert = require('assert');
const E = require('./engine.js');

// --- 맵 무결성 ---
assert.ok(E.MAP.every(r => r.length === E.MAP_W), '모든 행의 길이가 같아야 함');
assert.ok(E.MAP_W >= 24 && E.MAP_H >= 20, '맵이 충분히 넓어야 함');
assert.ok(E.MAP.every(r => /^[#=.]+$/.test(r)), '허용된 타일 문자만 사용');
assert.ok(E.MAP[0].split('').every(c => c === '#') , '위쪽 테두리는 벽');
assert.ok(E.MAP.every(r => r[0] === '#' && r[r.length-1] === '#'), '좌우 테두리는 벽');

// --- 타일 / 벽 ---
assert.ok(E.isWall(0, 0), '테두리는 벽');
assert.ok(!E.isWall(E.SPAWN.x, E.SPAWN.y), '스폰 지점은 빈 칸');
assert.ok(E.isWall(-1, 5) && E.isWall(9999, 5), '맵 밖은 벽 취급');
assert.strictEqual(E.tileAt(7.5, 10.5), '=', '금속벽 타일 인식');

// --- 도달 가능 영역 ---
const cells = E.reachableCells();
assert.ok(cells.length > 150, `걸어다닐 공간이 너무 좁음 (${cells.length})`);
assert.ok(cells.every(c => !E.isWall(c.x, c.y)), '도달 목록에 벽이 섞이면 안 됨');
assert.ok(cells.some(c => Math.hypot(c.x - E.SPAWN.x, c.y - E.SPAWN.y) > 15),
  '맵 반대편까지 이어져 있어야 함 (고립된 방 방지)');

// --- 레이캐스트 ---
const left = E.castRay(1.5, 1.5, Math.PI);
assert.ok(Math.abs(left.dist - 0.5) < 1e-6, '좌측 벽 거리');
assert.ok(Math.abs(E.castRay(1.5, 1.5, -Math.PI/2).dist - 0.5) < 1e-6, '상단 벽 거리');
for (let i = 0; i < 360; i++) {
  const r = E.castRay(1.5, 1.5, i * Math.PI / 180);
  assert.ok(r.dist > 0 && r.dist < 96, `각도 ${i}에서 벽을 못 찾음`);
  assert.ok(r.wallX >= 0 && r.wallX < 1, `텍스처 좌표 범위 이탈: ${r.wallX}`);
  assert.ok(r.tile === '#' || r.tile === '=', `타일 종류 이상: ${r.tile}`);
}

// --- 이동 충돌 ---
let p = E.tryMove(1.5, 1.5, -1, 0);
assert.strictEqual(p.x, 1.5, '벽을 통과하면 안 됨');
p = E.tryMove(1.5, 1.5, -1, 1);
assert.strictEqual(p.x, 1.5, '막힌 축은 정지');
assert.ok(p.y > 1.5, '뚫린 축은 계속 이동 (벽 긁기)');

// --- 시야 ---
assert.ok(E.hasLineOfSight(1.5, 1.5, 1.5, 3.5), '뻥 뚫린 복도는 보임');
assert.ok(!E.hasLineOfSight(1.5, 1.5, 22.5, 18.5), '맵 대각선 끝은 벽에 가려짐');

// --- 각도 정규화 ---
assert.ok(Math.abs(E.normAngle(0.1) - 0.1) < 1e-9);
assert.ok(Math.abs(E.normAngle(Math.PI * 2 + 0.3) - 0.3) < 1e-9, '한 바퀴 돌아도 같은 각');

// --- 무기 ---
const { ak, revolver } = E.WEAPONS;
assert.strictEqual(ak.mag, 30, 'AK는 30발');
assert.strictEqual(revolver.mag, 8, '리볼버는 8발');
assert.ok(ak.auto && !revolver.auto, 'AK만 연사');
assert.ok(revolver.dmg > ak.dmg, '리볼버가 한 발 위력이 높아야 함');
assert.ok(ak.cool < revolver.cool, 'AK가 더 빨리 나가야 함');

// --- 장전 (탄창 크기별) ---
assert.deepStrictEqual(E.reload(0, 120, 30), { mag: 30, reserve: 90 }, 'AK 가득 장전');
assert.deepStrictEqual(E.reload(0, 48, 8), { mag: 8, reserve: 40 }, '리볼버 가득 장전');
assert.deepStrictEqual(E.reload(5, 100, 30), { mag: 30, reserve: 75 }, '남은 탄은 유지');
assert.deepStrictEqual(E.reload(2, 3, 8), { mag: 5, reserve: 0 }, '예비탄 부족');
assert.deepStrictEqual(E.reload(8, 10, 8), { mag: 8, reserve: 10 }, '가득 찼으면 소모 없음');
assert.deepStrictEqual(E.reload(0, 0, 30), { mag: 0, reserve: 0 }, '예비탄 0');

// --- 몬스터 테이블 ---
const { grunt, brute, boss } = E.ENEMIES;
assert.deepStrictEqual([grunt.weight, brute.weight, boss.weight], [7, 2, 1],
  '스폰 비율은 7 : 2 : 1');
assert.strictEqual(E.ENEMY_WEIGHT, 10, '가중치 합');
assert.ok(grunt.hp < brute.hp && brute.hp < boss.hp, '뒤로 갈수록 단단해야 함');
assert.ok(grunt.speed > brute.speed && brute.speed > boss.speed, '덩치가 클수록 느려야 함');
assert.ok(grunt.dmg < brute.dmg && brute.dmg < boss.dmg, '덩치가 클수록 아파야 함');
assert.ok(grunt.score < brute.score && brute.score < boss.score, '보상도 커야 함');
assert.ok(grunt.radius < brute.radius && brute.radius < boss.radius, '피격 반경');
assert.ok(!grunt.bar && brute.bar && boss.bar, '체력바는 중간보스부터');

// --- 가중 추첨: 구간별 ---
// 0.9 / 0.97 딱 그 지점은 부동소수 오차로 어느 쪽이든 나올 수 있어 안쪽 값으로 본다.
assert.strictEqual(E.pickEnemyKind(() => 0), 'grunt');
assert.strictEqual(E.pickEnemyKind(() => 0.69), 'grunt', '0.7 앞은 잡몹');
assert.strictEqual(E.pickEnemyKind(() => 0.75), 'brute', '0.7~0.9 는 중간보스');
assert.strictEqual(E.pickEnemyKind(() => 0.89), 'brute');
assert.strictEqual(E.pickEnemyKind(() => 0.92), 'boss', '0.9 뒤는 보스');
assert.strictEqual(E.pickEnemyKind(() => 0.999999), 'boss');
assert.ok(E.ENEMY_KINDS.includes(E.pickEnemyKind(() => 1)), '경계를 넘겨도 종류가 나와야 함');

// --- 가중 추첨: 실제 분포 (결정적 시드) ---
let seed = 12345;
const rng = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const N = 200000, count = { grunt: 0, brute: 0, boss: 0 };
for (let i = 0; i < N; i++) count[E.pickEnemyKind(rng)]++;
for (const [k, w] of [['grunt', 7], ['brute', 2], ['boss', 1]]) {
  const got = count[k] / N * 10;
  assert.ok(Math.abs(got - w) < 0.1, `${k} 비율이 ${w} 에서 벗어남 (${got.toFixed(3)})`);
}

// --- 처치 보상 ---
assert.strictEqual(E.MAX_HP, 100, '최대 체력');
assert.ok(E.ITEMS.medkit.heal > 0, '구급상자는 회복량이 있어야 함');
assert.ok(E.ITEMS.ammo.ak > 0 && E.ITEMS.ammo.revolver > 0, '탄약상자는 두 무기 모두 채움');
assert.ok(E.PICKUP_RANGE > 0 && E.PICKUP_RANGE < 1, '줍는 거리는 한 칸 안');

// 보스는 확정 드롭, 잡몹은 확률
assert.deepStrictEqual(E.rollDrops('boss', () => 0).sort(), ['ammo', 'medkit'], '보스는 둘 다 확정');
assert.deepStrictEqual(E.rollDrops('boss', () => 0.999).sort(), ['ammo', 'medkit'],
  '보스는 어떤 난수에도 확정');
assert.deepStrictEqual(E.rollDrops('grunt', () => 0.99), [], '잡몹은 안 떨굴 수도 있음');
assert.deepStrictEqual(E.rollDrops('grunt', () => 0).sort(), ['ammo', 'medkit'],
  '난수가 0이면 전부 떨어짐');
assert.ok(brute.drop.medkit > grunt.drop.medkit, '큰 놈이 더 잘 떨궈야 함');
assert.ok(boss.drop.medkit >= brute.drop.medkit);

// 드롭 확률이 실제 비율과 맞는가
let ds = 999;
const drng = () => (ds = (ds * 1103515245 + 12345) % 2147483648) / 2147483648;
const M = 100000;
let med = 0, amm = 0;
for (let i = 0; i < M; i++) {
  const d = E.rollDrops('grunt', drng);
  if (d.includes('medkit')) med++;
  if (d.includes('ammo')) amm++;
}
assert.ok(Math.abs(med / M - grunt.drop.medkit) < 0.01, `구급상자 드롭률 (${(med/M).toFixed(3)})`);
assert.ok(Math.abs(amm / M - grunt.drop.ammo) < 0.01, `탄약 드롭률 (${(amm/M).toFixed(3)})`);

console.log('ok');
