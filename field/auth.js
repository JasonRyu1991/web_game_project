// 계정 — 서버(Cloud SQL)에 있다. 세이브(Store, game.js)와 같은 패턴이다:
// 서버가 진실이고, 이 브라우저의 SESSION 은 "지금 누가 로그인해 있나"만 기억하는 캐시다.
//
// ★ 이건 완전한 보안이 아니다. 로그인 뒤 요청에 세션 토큰이 안 붙는다 — id/pw 확인만 서버가
//   하고 끝이라, 그 뒤 /save 같은 API 는 여전히 무인증이다(server.js 에 ponytail 주석으로 남겨둠).
//   비밀번호는 서버에서 pbkdf2 로 해시하지 로그인 판별을 클라이언트가 하지 않는다.
//
// 서버가 없거나(file://, 아티팩트 미리보기) DB 가 안 붙었으면 signup/login 이 그냥 실패한다.
// 예전처럼 "이 브라우저에만 조용히 계정을 만드는" 동작은 없앴다 — 그게 "다른 기기에서
// 만든 계정이 안 보인다" 는 혼란의 원인이었다.

const Auth = {
  SESSION: 'field_session_v1',

  async _post(url, body) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      return res.ok ? data : { err: data.err || '서버 오류' };
    } catch {
      return { err: '서버에 연결할 수 없다' };
    }
  },

  async signup(name, id, pw, gender) {
    return this._post('/account/signup', { name, id, pw, gender });
  },

  async login(id, pw) {
    const r = await this._post('/account/login', { id, pw });
    if (r.ok) localStorage.setItem(this.SESSION, JSON.stringify(r.ok));
    return r;
  },

  // 캐시일 뿐이다 — 진짜 계정 존재 여부는 매 login 때 서버가 확인한다.
  current() {
    try { return JSON.parse(localStorage.getItem(this.SESSION)) || null; } catch { return null; }
  },
  logout() { localStorage.removeItem(this.SESSION); },

  async remove(id) {
    const r = await this._post('/account/remove', { id });
    if (!r.err && this.current()?.id === id) this.logout();
    return !r.err;
  },

  // 관리자 화면용 — 계정별 캐릭터 요약. 서버 조인 결과를 그대로 쓴다.
  async roster() {
    try {
      const res = await fetch('/account/roster');
      return res.ok ? await res.json() : [];
    } catch {
      return [];
    }
  },
};

if (typeof window !== 'undefined') window.Auth = Auth;
