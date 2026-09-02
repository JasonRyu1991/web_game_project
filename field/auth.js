// 계정 — 서버가 붙기 전까지의 임시 껍데기.
//
// ★ 이건 보안이 아니다. localStorage 는 브라우저 콘솔에서 그대로 읽고 고칠 수 있다.
//   비밀번호를 평문으로 두지 않으려고 SHA-256 해시만 저장하지만, 그것도 클라이언트에서
//   계산하므로 인증 수단이 못 된다. 실제 인증은 채널 파드 앞단(티어1 web/was)이 맡고,
//   여기 있는 함수 본문만 fetch 로 바꾸면 되도록 인터페이스를 async 로 맞춰 뒀다.
//
// SSO(구글 로그인)도 같은 이유로 서버가 필요하다. 화면에 자리만 잡아 두었다.

const Auth = {
  KEY: 'field_accounts_v1',
  SESSION: 'field_session_v1',
  ADMIN: { id: 'admin', pw: 'test123!' },

  async hash(pw) {
    const buf = new TextEncoder().encode('field:' + pw);
    const d = await crypto.subtle.digest('SHA-256', buf);
    return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
  },

  all() {
    try { return JSON.parse(localStorage.getItem(this.KEY)) || {}; } catch { return {}; }
  },
  write(a) { localStorage.setItem(this.KEY, JSON.stringify(a)); },

  // 관리 계정은 없으면 만들고, 있으면 비밀번호를 현재 값으로 맞춘다.
  // 없을 때만 만들면 비밀번호를 바꿔도 옛 해시가 남아 있는 브라우저는 계속 옛 값으로 들어간다.
  async seed() {
    const a = this.all();
    const pw = await this.hash(this.ADMIN.pw);
    const cur = a[this.ADMIN.id];
    if (!cur) {
      a[this.ADMIN.id] = { id: this.ADMIN.id, pw, name: '관리자', role: 'admin', createdAt: Date.now() };
    } else if (cur.pw !== pw) {
      cur.pw = pw;
    } else return;
    this.write(a);
  },

  async signup(name, id, pw) {
    name = (name || '').trim();
    id = (id || '').trim();
    if (name.length < 1 || name.length > 10) return { err: '캐릭터 이름은 1~10자로 정한다' };
    if (id.length < 3) return { err: '아이디는 3자 이상이어야 한다' };
    if (!/^[a-zA-Z0-9_]+$/.test(id)) return { err: '아이디는 영문·숫자·밑줄만 쓸 수 있다' };
    if ((pw || '').length < 4) return { err: '비밀번호는 4자 이상이어야 한다' };
    const a = this.all();
    if (a[id]) return { err: '이미 있는 아이디다' };
    if (Object.values(a).some(x => x.name === name)) return { err: '이미 쓰는 캐릭터 이름이다' };
    a[id] = { id, name, pw: await this.hash(pw), role: 'user', createdAt: Date.now() };
    this.write(a);
    return { ok: a[id] };
  },

  async login(id, pw) {
    const acc = this.all()[(id || '').trim()];
    if (!acc) return { err: '없는 아이디다' };
    if (acc.pw !== await this.hash(pw)) return { err: '비밀번호가 다르다' };
    localStorage.setItem(this.SESSION, acc.id);
    return { ok: acc };
  },

  current() {
    const id = localStorage.getItem(this.SESSION);
    return id ? this.all()[id] || null : null;
  },
  logout() { localStorage.removeItem(this.SESSION); },

  // 계정 삭제 = 캐릭터 삭제. 관리 계정은 지우지 않는다.
  remove(id) {
    const a = this.all();
    if (!a[id] || a[id].role === 'admin') return false;
    delete a[id];
    this.write(a);
    localStorage.removeItem('field_save_v1:' + id);
    if (localStorage.getItem(this.SESSION) === id) localStorage.removeItem(this.SESSION);
    return true;
  },

  // 관리자 화면용 — 계정별 캐릭터 요약
  roster() {
    return Object.values(this.all()).map(acc => {
      let save = null;
      try { save = JSON.parse(localStorage.getItem('field_save_v1:' + acc.id)); } catch {}
      return {
        id: acc.id, name: acc.name || acc.id, role: acc.role,
        level: save ? save.level : 0,
        kills: save ? save.kills : 0,
        playSec: save ? Math.round(save.stats.playSec) : 0,
        savedAt: save ? save.savedAt : null,
      };
    }).sort((x, y) => y.level - x.level);
  },
};

if (typeof window !== 'undefined') window.Auth = Auth;
