// 계정은 서버(Cloud SQL)가 진실, SESSION 은 "누가 로그인했나"만 기억하는 캐시.
// ★ 로그인 뒤 요청엔 세션 토큰이 안 붙어 /save 등이 여전히 무인증(server.js ponytail 주석 참고).

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
