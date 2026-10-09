/** 참관 화면 (휴대폰) — /view/ */
import { firebaseConfig } from '../shared/firebase-config.js';
import rulesData from '../shared/rules.js';

(() => {
    'use strict';
    const $ = id => document.getElementById(id);
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const pad = n => String(n).padStart(2, '0');
    const store = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 무시 */ } } };

    /* ---------- 설정 · 회칙 (PC 화면과 같은 값) ---------- */
    const CFG_TEXT = JSON.stringify(firebaseConfig || {});
    const FIREBASE_CONFIG = (() => { const c = {}, re = /["']?\b(apiKey|authDomain|databaseURL|projectId|storageBucket|messagingSenderId|appId)\b["']?\s*:\s*["'`]([^"'`\s]+)["'`]/g; let m; while ((m = re.exec(CFG_TEXT))) c[m[1]] = m[2].trim(); return c; })();
    const RULES = (rulesData && Array.isArray(rulesData.outline)) ? rulesData : { outline: [], articles: [] };

    /* ---------- 안전한 HTML (보기 전용) ---------- */
    const SAFE = new Set(['SECTION', 'DIV', 'SPAN', 'P', 'B', 'STRONG', 'I', 'EM', 'SMALL', 'BR', 'H2', 'H3', 'H4', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'OL', 'UL', 'LI', 'MARK']);
    function clean(html) {
        const doc = new DOMParser().parseFromString(`<body>${html || ''}</body>`, 'text/html');
        const walk = el => [...el.children].forEach(c => {
            if (!SAFE.has(c.tagName)) { c.remove(); return; }
            [...c.attributes].forEach(a => { const n = a.name.toLowerCase(); if (!(n === 'class' || n === 'colspan' || n === 'rowspan' || (n === 'style' && /^\s*color:\s*#[0-9a-f]{3,8}\s*;?\s*$/i.test(a.value)))) c.removeAttribute(a.name); });
            walk(c);
        });
        walk(doc.body);
        return doc.body.innerHTML;
    }

    /* ---------- Firebase (보기 전용: 로그인 없음) ---------- */
    const FB = 'https://www.gstatic.com/firebasejs/10.12.2/firebase-';
    let fbP = null;
    const loadScript = src => new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error('load failed')); document.head.appendChild(s); });
    function fb() {
        if (!fbP) fbP = (async () => { await loadScript(FB + 'app-compat.js'); await loadScript(FB + 'auth-compat.js'); await loadScript(FB + 'database-compat.js'); if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG); return firebase.database(); })().catch(e => { fbP = null; throw e; });
        return fbP;
    }
    const timeout = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('timeout')), ms))]);

    /* ---------- 글자 크기 ---------- */
    let fs = store.get('gakbu-m-fs') || 17;
    const applyFs = () => document.documentElement.style.setProperty('--fs', fs + 'px');
    applyFs();
    $('fs-down').onclick = () => { fs = Math.max(13, fs - 1); applyFs(); store.set('gakbu-m-fs', fs); };
    $('fs-up').onclick = () => { fs = Math.min(26, fs + 1); applyFs(); store.set('gakbu-m-fs', fs); };

    /* ---------- 화면 꺼짐 방지 ---------- */
    let wake = null;
    async function keepAwake() { try { if ('wakeLock' in navigator && document.visibilityState === 'visible' && !wake) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); } } catch (e) { /* 지원 안 함 */ } }
    document.addEventListener('visibilitychange', keepAwake);

    /* ---------- 탭 ---------- */
    let tab = 'feed';
    $('tabs').addEventListener('click', e => {
        const b = e.target.closest('[data-tab]'); if (!b) return;
        tab = b.dataset.tab;
        document.querySelectorAll('#tabs button').forEach(x => x.classList.toggle('on', x === b));
        ['feed', 'agenda', 'rules'].forEach(t => { $('tab-' + t).hidden = t !== tab; });
        $('jump').hidden = true;
        if (tab === 'feed') { $('feed-dot').hidden = true; toBottom(); }
        if (tab === 'rules') renderRules();
        window.scrollTo(0, tab === 'feed' ? document.body.scrollHeight : 0);
    });
    const nearBottom = () => window.innerHeight + window.scrollY >= document.body.scrollHeight - 140;
    const toBottom = () => window.scrollTo({ top: document.body.scrollHeight });
    window.addEventListener('scroll', () => { if (tab === 'feed' && nearBottom()) $('jump').hidden = true; }, { passive: true });
    $('jump').onclick = () => { toBottom(); $('jump').hidden = true; };
    function stickNow() { $('now').style.top = $('hd').offsetHeight + 'px'; }
    window.addEventListener('resize', stickNow);

    /* ---------- 입장: 위원 / 참관인 (코드 없이 열려 있는 회의로 바로 연결) ---------- */
    const qs0 = new URLSearchParams(location.search);
    const ROLE = qs0.get('role') === 'member' ? 'member' : qs0.get('role') === 'observer' ? 'observer' : '';
    const OBS_MODE = qs0.get('mode') === 'onsite' ? 'onsite' : 'online';
    const LIVE = 'live';
    const DEVICE = (() => { try { let d = sessionStorage.getItem('gakbu-device'); if (!d) { d = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-3); sessionStorage.setItem('gakbu-device', d); } return d; } catch (e) { return Math.random().toString(36).slice(2, 12); } })();
    let code = LIVE, view = null, live = null, liveEl = null, ended = false, lastLen = 0, me = null, dbRef = null, room = null, joined = false;
    const canSpeak = () => !!me && (ROLE === 'member' || (ROLE === 'observer' && OBS_MODE === 'onsite'));

    async function startLobby() {
        const label = ROLE === 'member' ? '위원' : OBS_MODE === 'onsite' ? '현장 참관인' : '온라인 참관인';
        $('en-title').textContent = `${label} 입장`;
        $('en-sub').textContent = '열려 있는 회의를 찾는 중…';
        try {
            const db = await timeout(fb(), 20000);
            dbRef = db;
            db.ref(`rooms/${LIVE}`).on('value', s => { room = s.val(); if (!joined) renderLobby(); }, () => { $('err').textContent = '회의 정보를 읽지 못했습니다. 잠시 후 다시 시도해 주세요.'; });
        } catch (err) {
            console.error(err);
            $('en-sub').textContent = '서버에 연결하지 못했습니다.';
            $('err').textContent = '인터넷 연결을 확인한 뒤 다시 열어 주세요.';
        }
    }
    function renderLobby() {
        const v = room && room.view;
        const open = !!(room && room.online && v);
        if (!$('pin-form').hidden && pendingName) return;
        $('names').hidden = true; $('obs-form').hidden = true; $('err').textContent = '';
        if (!open) { $('en-sub').textContent = room && v && !room.online ? '의장 화면이 연결되어 있지 않습니다. 잠시 후 다시 확인합니다…' : '지금 열려 있는 회의가 없습니다. 회의가 열리면 이 화면에서 바로 입장할 수 있습니다.'; return; }
        if (v.phase === 'ended' && ROLE === 'member') { $('en-sub').textContent = `"${v.meetingName || '회의'}"는 종료되었습니다.`; return; }
        $('en-sub').textContent = v.meetingName || '학부운영위원회';
        if (ROLE === 'member') {
            const list = (v.members || []).filter(n => n !== v.chair);
            const last = store.get('gakbu-member-name');
            $('en-sub').innerHTML = `${esc(v.meetingName || '학부운영위원회')}<br>내 이름(직책)을 선택하세요`;
            $('names').innerHTML = list.map(n => `<button type="button" data-n="${esc(n)}"${n === last ? ' class="last"' : ''}>${esc(n)}${n === v.chairName ? ' <small>(의장)</small>' : ''}</button>`).join('') + (v.chair ? `<p style="grid-column:1/-1;font-size:.78em;opacity:.85;margin:6px 0 0;">${esc(v.chair)}은(는) 회의를 개최한 의장이라 목록에 없습니다.</p>` : '');
            $('names').hidden = false;
        } else {
            $('obs-form').hidden = false;
            const last = store.get('gakbu-obs-name');
            if (last && !$('obs-name').value) $('obs-name').value = last;
        }
    }
    let pendingName = '', PROOF = '';
    const sha256 = async str => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)))].map(b => b.toString(16).padStart(2, '0')).join('');
    $('names').addEventListener('click', e => { const b = e.target.closest('button[data-n]'); if (!b) return; pendingName = b.dataset.n; $('names').hidden = true; $('pin-form').hidden = false; $('en-sub').textContent = `${pendingName} — 비밀번호를 입력하세요`; $('err').textContent = ''; $('pin').value = ''; setTimeout(() => $('pin').focus(), 50); });
    $('pin-back').onclick = () => { $('pin-form').hidden = true; pendingName = ''; renderLobby(); };
    $('pin-go').onclick = async () => { const pin = $('pin').value.trim(); if (!pin) { $('err').textContent = '비밀번호를 입력해 주세요.'; return; } $('pin-go').disabled = true; try { PROOF = await sha256(`${pendingName}|${pin}|gakbu-v1`); await join(pendingName); } finally { $('pin-go').disabled = false; } };
    $('pin').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); $('pin-go').click(); } });
    $('obs-go').onclick = () => { const n = $('obs-name').value.replace(/\s+/g, ' ').trim(); if (!n) { $('err').textContent = '이름을 입력해 주세요.'; return; } join(n); };
    $('obs-name').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); $('obs-go').click(); } });

    function writePresence() {
        if (!dbRef || !me) return Promise.resolve();
        const r = dbRef.ref(`liveIn/presence/${DEVICE}`);
        r.onDisconnect().remove();
        const v = { name: me, role: ROLE, mode: ROLE === 'member' ? 'member' : OBS_MODE, ts: firebase.database.ServerValue.TIMESTAMP };
        if (ROLE === 'member') v.proof = PROOF;
        return r.set(v);
    }
    async function join(name) {
        if (joined) return;
        const v = room && room.view;
        if (!v) return;
        if (ROLE === 'member' && !(v.members || []).includes(name)) { $('err').textContent = '명단에 없는 이름입니다.'; return; }
        me = name;
        try { await timeout(writePresence(), 15000); }
        catch (err) { me = null; $('err').textContent = ROLE === 'member' ? '비밀번호가 맞지 않습니다.' : '입장하지 못했습니다. 잠시 후 다시 시도해 주세요.'; if (ROLE === 'member') { $('pin').value = ''; $('pin').focus(); } return; }
        joined = true;
        store.set(ROLE === 'member' ? 'gakbu-member-name' : 'gakbu-obs-name', name);
        try { history.replaceState(null, '', location.search); } catch (e) { /* file:// */ }
        $('enter').hidden = true; $('app').hidden = false; stickNow();
        const ref = dbRef.ref(`rooms/${LIVE}`);
        dbRef.ref('.info/connected').on('value', s => { if (s.val()) writePresence().catch(() => {}); });
        ref.child('view').on('value', s => renderView(s.val()));
        ref.child('live').on('value', s => renderLive(s.val()));
        ref.child('online').on('value', s => setConn(s.val()));
        ref.child('owner').on('value', s => { if (!s.exists()) endShare(); });
        firebase.auth().onAuthStateChanged(u => { member = u && !u.isAnonymous && u.email ? u : null; if (view && !editing()) renderView(view); else renderLogin(); });
        document.body.classList.toggle('has-dock', canSpeak());
        $('dock').hidden = !canSpeak();
        watchFloor();
        updateDock();
        flushOutbox();
        keepAwake();
    }

    function setConn(on) {
        if (ended) return;
        $('m-conn').textContent = on ? `● 실시간 연결됨 · ${me ? me + (ROLE === 'member' ? ' 위원' : ' (참관' + (OBS_MODE === 'onsite' ? '·현장' : '·온라인') + ')') : ''}` : '○ 의장 화면 연결 끊김 (재연결 대기)';
        $('m-status').classList.toggle('off', !on);
    }
    function endShare() {
        ended = true;
        canEdit = false; $('feed').querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable')); renderLogin();
        $('ended').hidden = false;
        $('m-conn').textContent = '공유가 종료되었습니다';
        $('m-status-t').textContent = '종료'; $('m-status').classList.remove('live');
        renderLive(null);
        updateDock();
    }
    const labelTag = a => esc(a.label || a.type);
    function renderView(v) {
        if (ended) return;
        view = v;
        if (!v) return;
        if (editing()) { pendingView = true; return; }      // 고치는 중이면 다 고친 뒤 새로 그림
        pendingView = false;
        $('m-name').textContent = v.meetingName || '학부운영위원회';
        $('m-sub').textContent = v.phase === 'setup' ? '회의 시작 전' : v.total ? `출석 ${v.present}/${v.total}명` : '참관 중';
        $('m-status-t').textContent = v.status || '';
        $('m-status').classList.toggle('live', /발언/.test(v.status || ''));
        // 현재 안건
        const cur = v.cur, now = $('now');
        now.classList.toggle('idle', !cur);
        if (cur) {
            const n = Math.min(10, Math.max(0, parseInt(cur.steps, 10) || 0)), st = Math.min(n, Math.max(0, parseInt(cur.step, 10) || 0));
            now.innerHTML = `<div class="lbl">현재 논의 중인 안건</div><div class="ttl"><span class="tag">[${labelTag(cur)}]</span>${esc(cur.title)}</div>`
                + (n ? `<div class="step"><span class="track">${Array.from({ length: n }, (_, i) => `<span class="${i < st ? 'done' : ''}"></span>`).join('')}</span><span>${esc(cur.current || '')}</span></div>` : '');
        } else now.innerHTML = `<div class="lbl">현재 안건</div><div class="ttl">${v.phase === 'ended' ? '회의가 종료되었습니다.' : '논의 중인 안건이 없습니다.'}</div>`;
        stickNow();
        updateDock();
        // 속기록
        const near = nearBottom();
        $('feed').innerHTML = clean(v.html);
        canEdit = !!(v.allowEdit && member && !ended);
        if (canEdit) $('feed').querySelectorAll(':scope > .message > .message-text').forEach(el => { el.contentEditable = 'true'; el.setAttribute('enterkeyhint', 'done'); });
        renderLogin();
        if (liveEl) $('feed').appendChild(liveEl);
        const len = $('feed').children.length;
        if (len !== lastLen) {
            if (tab === 'feed' && near) toBottom();
            else if (tab === 'feed' && lastLen) $('jump').hidden = false;
            else if (tab !== 'feed' && lastLen) $('feed-dot').hidden = false;
            lastLen = len;
        }
        // 안건 목록
        const list = Array.isArray(v.agendas) ? v.agendas : [];
        const docLink = /^https:\/\/docs\.google\.com\//.test(v.docUrl || '') ? `<p style="margin:0 0 10px"><a href="${esc(v.docUrl)}" target="_blank" rel="noopener">📄 회의록 문서 열기</a></p>` : '';
        $('ag-list').innerHTML = docLink + `<div class="sec-h">안건 ${list.filter(a => a.status !== 'rejected').length}건</div>` + (list.length ? list.map(a => {
            const isCur = cur && a.title === cur.title && a.status === 'active';
            const s = a.status === 'rejected' ? ['상정 부결', ''] : a.verdict ? [a.verdict, a.verdict === '가결' ? 'pass' : 'fail'] : a.status === 'done' ? ['완료', ''] : a.status === 'active' ? ['진행 중', 'on'] : ['대기', ''];
            return `<div class="ag-row${isCur ? ' cur' : ''}"><div class="t"><span class="tag">[${labelTag(a)}]</span> ${esc(a.title)}${a.extra ? ' <small style="color:var(--muted)">(추가)</small>' : ''}</div><div class="s ${s[1]}">${s[0]}</div></div>`;
        }).join('') : '<p class="loading">안건이 없습니다.</p>');
    }
    function renderLive(l) {
        live = l;
        if (liveEl) { liveEl.remove(); liveEl = null; }
        if (ended || !l || !l.speaker) return;
        const near = nearBottom();
        const el = document.createElement('div');
        el.className = 'message live';
        el.innerHTML = `<span class="speaker-name">[${esc(l.speaker)}]</span><span class="message-text${l.text ? '' : ' listening'}">${esc(l.text || '듣는 중…')}</span>`;
        $('feed').appendChild(el);
        liveEl = el;
        if (tab === 'feed' && near) toBottom();
    }

    /* ---------- 로그인한 참관인만 속기 고치기 ---------- */
    let member = null, canEdit = false, pendingView = false;
    const editing = () => document.activeElement && $('feed').contains(document.activeElement) && document.activeElement.isContentEditable;
    let toastT = null;
    function toast(t) { const el = $('toast'); el.textContent = t; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, 3200); }
    function renderLogin() {
        const b = $('m-login'), allow = !!(view && view.allowEdit) && !ended;
        b.hidden = !allow;
        b.classList.toggle('on', !!member);
        b.textContent = member ? '✎ 로그아웃' : '로그인';
        $('edit-hint').hidden = !(allow && member);
    }
    $('m-login').onclick = async () => {
        if (member) { if (confirm('로그아웃할까요? 로그아웃하면 속기를 고칠 수 없습니다.')) { await firebase.auth().signOut(); toast('로그아웃했습니다.'); } return; }
        $('l-err').textContent = ''; $('l-pw').value = ''; $('login-sheet').hidden = false; setTimeout(() => ($('l-email').value ? $('l-pw') : $('l-email')).focus(), 50);
    };
    $('l-cancel').onclick = () => { $('login-sheet').hidden = true; };
    $('login-sheet').addEventListener('click', e => { if (e.target.id === 'login-sheet') $('login-sheet').hidden = true; });
    async function doLogin() {
        const em = $('l-email').value.trim(), pw = $('l-pw').value;
        if (!em || !pw) { $('l-err').textContent = '이메일과 비밀번호를 입력해 주세요.'; return; }
        $('l-go').disabled = true;
        try {
            await timeout(firebase.auth().signInWithEmailAndPassword(em, pw), 15000);
            $('login-sheet').hidden = true;
            toast('로그인했습니다. 발언 글자를 눌러 고칠 수 있습니다.');
        } catch (err) {
            const c = String(err && (err.code || err.message) || '');
            $('l-err').textContent = /invalid|wrong-password|user-not-found/.test(c) ? '이메일 또는 비밀번호가 맞지 않습니다.' : /too-many/.test(c) ? '시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.' : '로그인하지 못했습니다. 인터넷 연결을 확인해 주세요.';
        } finally { $('l-go').disabled = false; }
    }
    $('l-go').onclick = doLogin;
    $('l-pw').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); doLogin(); } });
    $('feed').addEventListener('focusin', e => { if (e.target.classList && e.target.classList.contains('message-text') && e.target.isContentEditable) e.target.dataset.orig = e.target.textContent; });
    $('feed').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing && e.target.isContentEditable) { e.preventDefault(); e.target.blur(); } });
    $('feed').addEventListener('focusout', async e => {
        const t = e.target;
        if (!t.classList || !t.classList.contains('message-text') || t.dataset.orig === undefined) return;
        const old = t.dataset.orig; delete t.dataset.orig;
        const text = t.textContent.replace(/\s+/g, ' ').trim();
        const msgs = [...$('feed').querySelectorAll(':scope > .message:not(.live)')];
        const idx = msgs.indexOf(t.closest('.message'));
        setTimeout(() => { if (pendingView && !editing()) renderView(view); }, 60);
        if (!text) { t.textContent = old; return; }
        if (text === old.replace(/\s+/g, ' ').trim() || idx < 0) return;
        if (!canEdit || !member) { t.textContent = old; toast('위원회 계정으로 로그인해야 고칠 수 있습니다.'); return; }
        try {
            await timeout(firebase.database().ref(`edits/${code}`).push().set({ idx, old, text: text.slice(0, 2000), uid: member.uid, email: member.email, at: firebase.database.ServerValue.TIMESTAMP }), 15000);
            toast('고친 내용을 의장 화면에 보냈습니다.');
        } catch (err) {
            console.error(err); t.textContent = old;
            toast(/PERMISSION|permission/i.test(String(err && (err.code || err.message))) ? '고칠 권한이 없습니다. 위원회 계정으로 로그인했는지 확인해 주세요.' : '고친 내용을 보내지 못했습니다. 인터넷 연결을 확인해 주세요.');
        }
    });

    /* ---------- 회칙 ---------- */
    const artKey = a => `${a.add ? 'b' : ''}${a.no}-${a.sub || 0}`;
    const artName = a => `${a.add ? '부칙 ' : ''}제${a.no}조${a.sub ? '의' + a.sub : ''}`;
    const byKey = new Map(RULES.articles.map(a => [artKey(a), a]));
    $('r-ch').innerHTML = '<option value="">전체 장</option>' + RULES.outline.map(c => `<option>${esc(c.name)}</option>`).join('');
    const open = new Set();
    function parseRefs(t) {
        const out = [], re = /(부칙\s*)?제?\s*(\d+)\s*조(?:\s*의\s*(\d+))?/g; let m;
        while ((m = re.exec(t))) out.push(`${m[1] ? 'b' : ''}${m[2]}-${m[3] || 0}`);
        if (!out.length && /^[\d\s,]+$/.test(t.trim())) (t.match(/\d+/g) || []).forEach(n => out.push(`${n}-0`));
        return [...new Set(out)];
    }
    const hl = (s, q) => q ? esc(s).split(esc(q)).join(`<mark>${esc(q)}</mark>`) : esc(s);
    function artHTML(a, q, force) {
        const k = artKey(a), o = force || open.has(k);
        return `<div class="art" data-k="${k}"><button type="button"><span class="no">${artName(a)}</span>【${hl(a.title, q)}】</button>${o ? `<div class="body"><div class="where">${esc([a.ch, a.sec].filter(Boolean).join(' · '))}</div>${a.lines.map(l => `<p>${hl(l, q)}</p>`).join('')}</div>` : ''}</div>`;
    }
    function currentRules() {          // 가장 최근 상정 안건의 관련 회칙
        const briefs = [...$('feed').querySelectorAll('.agenda-brief')];
        const b = briefs.pop();
        return b ? [...b.querySelectorAll('.rule-quote b')].map(x => x.textContent.split('【')[0]).join(', ') : '';
    }
    let rulesPreset = false;
    function renderRules() {
        if (!rulesPreset && !$('r-q').value) { const p = currentRules(); if (p) $('r-q').value = p; rulesPreset = true; }
        const q = $('r-q').value.trim(), ch = $('r-ch').value;
        let arts, sub;
        const refs = q ? parseRefs(q) : [];
        if (refs.length) { arts = refs.map(k => byKey.get(k)).filter(Boolean); sub = arts.length ? `조항 번호로 찾은 결과 ${arts.length}개` : '해당 번호의 조항이 없습니다.'; }
        else if (q) { arts = RULES.articles.filter(a => (!ch || a.ch === ch) && (a.title.includes(q) || a.lines.some(l => l.includes(q)))); sub = `"${q}"이(가) 들어간 조항 ${arts.length}개`; }
        else { arts = ch ? RULES.articles.filter(a => a.ch === ch) : []; sub = ch ? `${ch} — ${arts.length}개 조항` : '조항 번호나 낱말을 입력하거나 장을 고르세요.'; }
        $('r-sub').textContent = sub;
        $('r-list').innerHTML = arts.slice(0, 60).map(a => artHTML(a, refs.length ? '' : q, refs.length > 0 || arts.length <= 2)).join('');
    }
    $('r-q').addEventListener('input', renderRules);
    $('r-ch').addEventListener('change', renderRules);
    $('r-list').addEventListener('click', e => {
        const b = e.target.closest('.art > button'); if (!b) return;
        const box = b.parentElement, k = box.dataset.k;
        if (open.has(k)) open.delete(k); else open.add(k);
        const q = $('r-q').value.trim();
        box.outerHTML = artHTML(byKey.get(k), parseRefs(q).length ? '' : q, open.has(k));
    });

    /* ---------- 안건지 링크 (?agenda=) ---------- */
    async function agendaView(raw) {
        const c = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        $('enter').hidden = true; $('agview').hidden = false;
        try {
            const db = await timeout(fb(), 20000);
            db.ref(`agendaShare/${c}`).on('value', s => {
                const v = s.val();
                if (!v) { $('av-doc').className = 'loading'; $('av-doc').textContent = '안건지를 찾을 수 없습니다. 링크가 꺼졌거나 주소가 잘못되었습니다.'; $('av-sub').textContent = ''; return; }
                $('av-doc').className = 'agdoc';
                $('av-doc').innerHTML = clean(v.html);
                $('av-name').textContent = v.title || '안건지';
                document.title = `${v.title || '안건지'} · 안건지`;
                const d = v.updatedAt ? new Date(v.updatedAt) : null;
                $('av-sub').textContent = d ? `안건지 · ${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())} 수정` : '안건지';
            });
        } catch (err) { console.error(err); $('av-doc').textContent = '서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.'; }
    }

    /* ---------- 발언 (위원 · 현장 참관인): 내 기기의 마이크로 받아쓰고, 끝날 때마다 속기록으로 전송 ---------- */
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    let flushTimer = null, flushedAny = false, rec = null, want = false, srOn = false, finalT = '', interimT = '', startedAt = 0, spkTimer = null, spkLast = 0, failStreak = 0, sessStart = 0, doneIdx = 0, lastChunk = '', cancelled = false;
    const OUTBOX = 'gakbu-outbox';
    const outbox = () => store.get(OUTBOX) || [];
    function floorOpen() { return !!(view && view.phase === 'meeting' && !view.recess && !ended); }
    function updateDock() {
        if (!canSpeak()) return;
        const open = floorOpen();
        const b = $('spk');
        const fb = floorBusy();
        b.disabled = (!open || !!fb) && !want;
        b.classList.toggle('rec', want);
        b.textContent = want ? '■ 발언 끝내기 (눌러서 전송)' : '🎤 발언하기';
        $('typ').disabled = !open || want || !!fb;
        const n = outbox().length;
        $('dock-note').textContent = fb && !want ? `${fb.name} 님이 발언 중입니다. 끝나면 발언할 수 있습니다.` : want ? '말씀하세요. 끝나면 버튼을 눌러 전송합니다.' : n ? `전송 대기 ${n}건 (인터넷이 연결되면 자동 전송)` : !view ? '' : view.phase === 'setup' ? '회의가 시작되면 발언할 수 있습니다.' : view.phase === 'ended' ? '회의가 종료되었습니다.' : view.recess ? '정회 중입니다.' : SR ? '' : '이 브라우저는 음성 인식을 지원하지 않습니다. [글로 입력]을 쓰거나 PC 크롬·안드로이드 크롬을 이용하세요.';
        $('dock-live').hidden = !want;
    }
    /* ----- 발언권: 한 번에 한 사람만 발언 (서버의 liveIn/floor 에서 먼저 잡은 사람이 가짐) ----- */
    const FLOOR_STALE = 25000;
    let floor = null, floorSeenAt = 0, floorSig = '', floorRef = null, haveFloor = false;
    const floorBusy = () => (floor && floor.device && floor.device !== DEVICE && Date.now() - floorSeenAt < FLOOR_STALE) ? floor : null;
    function watchFloor() {
        if (!dbRef || floorRef) return;
        floorRef = dbRef.ref('liveIn/floor');
        floorRef.on('value', s => { floor = s.val(); const sig = JSON.stringify(floor); if (sig !== floorSig) { floorSig = sig; floorSeenAt = Date.now(); } updateDock(); });
        setInterval(updateDock, 3000);
    }
    async function claimFloor() {
        if (!dbRef) return true;
        try {
            const r = await timeout(dbRef.ref('liveIn/floor').transaction(cur => {
                if (cur && cur.device && cur.device !== DEVICE && Date.now() - (cur.ts || 0) < FLOOR_STALE) return;      // 남이 발언 중 → 포기
                return { device: DEVICE, name: me, role: ROLE, proof: ROLE === 'member' ? PROOF : null, ts: firebase.database.ServerValue.TIMESTAMP };
            }, undefined, false), 8000);
            if (r && r.committed) { haveFloor = true; try { dbRef.ref('liveIn/floor').onDisconnect().remove(); } catch (e) { /* 무시 */ } return true; }
            return false;
        } catch (err) { console.error(err); return true; }      // 서버 규칙이 아직 없거나 연결이 불안정하면 막지 않음
    }
    function releaseFloor() {
        if (!dbRef || !haveFloor) return;
        haveFloor = false;
        const r = dbRef.ref('liveIn/floor');
        try { r.onDisconnect().cancel(); } catch (e) { /* 무시 */ }
        r.transaction(cur => (cur && cur.device === DEVICE) ? null : undefined, undefined, false).catch(() => {});
    }
    let spkHb = 0;
    function publishSpeaking(final) {
        clearTimeout(spkTimer);                       // 끝난 뒤에 예약된 전송이 다시 '발언 중'을 만들지 않도록
        if (!dbRef) return;
        const r = dbRef.ref(`liveIn/speaking/${DEVICE}`);
        if (final) { spkLast = 0; r.remove().catch(() => {}); return; }
        if (!want) return;                            // 발언 중이 아니면 올리지 않음
        const wait = 300 - (Date.now() - spkLast);
        if (wait > 0) { spkTimer = setTimeout(() => publishSpeaking(false), wait); return; }
        spkLast = Date.now();
        r.onDisconnect().remove();
        r.set({ name: me, role: ROLE, proof: ROLE === 'member' ? PROOF : null, text: (finalT + ' ' + interimT).replace(/\s+/g, ' ').trim().slice(-300), hb: ++spkHb }).catch(() => {});
    }
    /* 발언 중에는 4초마다 신호를 보냄 — 의장 화면은 신호가 끊긴 '발언 중'을 알아서 지움. 화면이 백그라운드로 가면 마이크가 꺼지므로 발언을 끝냄 */
    setInterval(() => { if (want) { spkLast = 0; publishSpeaking(false); if (haveFloor && dbRef) dbRef.ref('liveIn/floor/ts').set(firebase.database.ServerValue.TIMESTAMP).catch(() => {}); } }, 4000);
    document.addEventListener('visibilitychange', () => { if (document.hidden && want) stopSpeak(); });
    /* 말이 잠시(2.5초) 멈추면 지금까지의 문장을 바로 속기록으로 보냄 — [발언 끝내기]를 누르지 않아도 됨 (발언권은 계속 유지) */
    const FLUSH_MS = 2000;
    function scheduleFlush() { clearTimeout(flushTimer); flushTimer = setTimeout(autoFlush, FLUSH_MS); }
    function autoFlush() {
        if (!want || interimT.trim()) { if (want) scheduleFlush(); return; }
        const text = finalT.replace(/\s+/g, ' ').trim();
        if (!text) return;
        finalT = ''; flushedAny = true;
        sendUtterance(text);
        renderDockLive();
    }
    function renderDockLive() {
        const t = (finalT + ' ' + interimT).replace(/\s+/g, ' ').trim();
        $('dock-live').textContent = t || '듣는 중…';
        publishSpeaking(false);
    }
    function startRec() { try { doneIdx = 0; rec.start(); srOn = true; sessStart = Date.now(); return true; } catch (e) { console.error(e); return false; } }
    function startSpeak() {
        if (want || !canSpeak() || !floorOpen()) return;
        if (!SR) { toast('이 브라우저는 음성 인식을 지원하지 않습니다. [글로 입력]을 이용해 주세요.'); return; }
        if (!rec) {
            rec = new SR(); rec.lang = 'ko-KR'; rec.interimResults = true; rec.continuous = true;
            rec.addEventListener('result', e => {
                let it = '';
                for (let i = e.resultIndex; i < e.results.length; i++) {
                    if (e.results[i].isFinal) {
                        if (i < doneIdx) continue;                       // 같은 확정 결과를 다시 보내는 브라우저(안드로이드 등) 대비
                        doneIdx = i + 1;
                        const chunk = e.results[i][0].transcript, norm = chunk.replace(/\s+/g, ' ').trim();
                        if (norm.length >= 4 && norm === lastChunk) continue;   // 바로 앞 문장과 똑같은 결과는 한 번만
                        lastChunk = norm;
                        finalT += (finalT && !/\s$/.test(finalT) ? ' ' : '') + chunk;
                    } else it += e.results[i][0].transcript;
                }
                interimT = it; renderDockLive();
                scheduleFlush();
            });
            rec.addEventListener('end', () => {
                srOn = false;
                if (interimT) { if (!finalT.trim().endsWith(interimT.trim())) finalT += (finalT ? ' ' : '') + interimT; interimT = ''; }
                if (want) {
                    failStreak = (Date.now() - sessStart < 1500) ? failStreak + 1 : 0;
                    if (failStreak >= 5) { toast('음성 인식이 계속 끊깁니다. 마이크·인터넷 연결을 확인하거나 [글로 입력]을 이용해 주세요.'); finishSpeak(); return; }
                    setTimeout(() => { if (want && !srOn && !startRec()) finishSpeak(); }, 250);
                    return;
                }
                finishSpeak();
            });
            rec.addEventListener('error', e => {
                if (e.error === 'no-speech' || e.error === 'aborted') return;
                if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { toast('마이크 사용 권한이 필요합니다. 브라우저 설정에서 이 사이트의 마이크를 허용해 주세요.'); want = false; }
                else if (e.error === 'audio-capture') { toast('마이크를 찾을 수 없습니다.'); want = false; }
                else if (e.error === 'network') toast('음성 인식 서버에 연결할 수 없습니다. 인터넷 연결을 확인해 주세요.');
            });
        }
        finalT = ''; interimT = ''; lastChunk = ''; cancelled = false; flushedAny = false; failStreak = 0; want = true; startedAt = Date.now();
        if (!startRec()) { want = false; toast('음성 인식을 시작하지 못했습니다. 잠시 후 다시 눌러 주세요.'); publishSpeaking(true); updateDock(); return; }
        renderDockLive(); updateDock();
        claimFloor().then(ok => { if (!ok && want) { cancelSpeak(); const f = floorBusy() || floor; toast(`${f && f.name ? f.name + ' 님이' : '다른 분이'} 발언 중입니다. 끝난 뒤에 눌러 주세요.`); } });
    }
    /** 다른 사람이 먼저 발언권을 잡은 경우: 지금까지 받아쓴 것은 버리고 조용히 취소 */
    function cancelSpeak() {
        cancelled = true; want = false;
        try { rec.abort(); } catch (e) { /* 무시 */ }
        srOn = false; finalT = ''; interimT = '';
        publishSpeaking(true); updateDock();
    }
    function stopSpeak() {
        if (!want) return;
        want = false;
        if (srOn) { try { rec.stop(); } catch (e) { /* end 에서 마무리 */ } setTimeout(() => { if (srOn) { try { rec.abort(); } catch (e) { /* 무시 */ } srOn = false; finishSpeak(); } }, 4000); }
        else finishSpeak();
        updateDock();
    }
    let finishing = false;
    function finishSpeak() {
        if (cancelled) { cancelled = false; releaseFloor(); updateDock(); return; }
        if (finishing) return;
        finishing = true; want = false;
        const text = (finalT + ' ' + interimT).replace(/\s+/g, ' ').trim();
        clearTimeout(flushTimer);
        finalT = ''; interimT = '';
        publishSpeaking(true);
        releaseFloor();
        if (text) sendUtterance(text); else if (!flushedAny) toast('인식된 발언이 없어 보내지 않았습니다.');
        finishing = false;
        updateDock();
    }
    $('spk').onclick = () => { if (want) stopSpeak(); else startSpeak(); };
    $('typ').onclick = () => { $('type-text').value = ''; $('type-sheet').hidden = false; setTimeout(() => $('type-text').focus(), 50); };
    $('type-cancel').onclick = () => { $('type-sheet').hidden = true; };
    $('type-send').onclick = () => { const t = $('type-text').value.replace(/\s+/g, ' ').trim(); if (!t) return; $('type-sheet').hidden = true; sendUtterance(t); };

    /* ---------- 전송: 보내기 전에 이 기기에 보관해 두고, 서버에 올라가면 지움 (연결이 끊겨도 잃어버리지 않음) ---------- */
    function sendUtterance(text) {
        const item = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: me, role: ROLE, proof: ROLE === 'member' ? PROOF : null, text: text.slice(0, 2000) };
        store.set(OUTBOX, outbox().concat(item));
        updateDock();
        flushOutbox();
    }
    let flushing = false;
    async function flushOutbox() {
        if (flushing || !dbRef) return;
        flushing = true;
        try {
            for (const it of outbox()) {
                try {
                    // 같은 발언은 늘 같은 키로 보냄 → 응답이 늦어 다시 보내도 속기록에는 한 번만 들어감
                    try { await timeout(dbRef.ref(`liveIn/inbox/${DEVICE}_${it.id}`).set({ name: it.name, role: it.role, proof: it.proof || null, text: it.text, device: DEVICE, ts: firebase.database.ServerValue.TIMESTAMP }), 15000); }
                    catch (err) { if (!(it.tries > 0 && err && err.code === 'PERMISSION_DENIED')) { it.tries = (it.tries || 0) + 1; store.set(OUTBOX, outbox().map(x => x.id === it.id ? Object.assign({}, x, { tries: it.tries }) : x)); throw err; } }   // 다시 보낼 때 '이미 있음'으로 거절되면 이미 전달된 것
                    store.set(OUTBOX, outbox().filter(x => x.id !== it.id));
                    toast('발언을 속기록으로 보냈습니다.');
                } catch (err) { console.error(err); throw err; }
            }
        } catch (err) { setTimeout(flushOutbox, 6000); }
        finally { flushing = false; updateDock(); }
    }
    window.addEventListener('online', flushOutbox);

    const qs = new URLSearchParams(location.search);
    if (qs.get('agenda')) agendaView(qs.get('agenda'));
    else if (ROLE) startLobby();
    else location.replace('/');
})();
