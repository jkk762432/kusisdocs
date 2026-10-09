/* ===== Firebase · 회의실 (위원 접속, 발언 수신, 화면 공유) ===== */
const FBV = 'https://www.gstatic.com/firebasejs/10.12.2/firebase-';
let fbP = null, DB = null, U = null;
const loadScript = src => new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error('서버 스크립트를 불러오지 못했습니다')); document.head.appendChild(s); });
function loadFb() {
    if (!fbP) fbP = (async () => {
        for (const n of ['app', 'auth', 'database']) await loadScript(`${FBV}${n}-compat.js`);
        if (!firebase.apps.length) firebase.initializeApp(window.FBCFG);
        DB = firebase.database();
        firebase.auth().onAuthStateChanged(u => { U = u && !u.isAnonymous && u.email && u.email.toLowerCase() === COMMITTEE ? u : null; renderAll(); maybeRejoin(); });
        return firebase;
    })().catch(e => { fbP = null; throw e; });
    return fbP;
}
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('시간 초과')), ms))]);
const sha256 = async str => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)))].map(b => b.toString(16).padStart(2, '0')).join('');
const fbErr = e => { const c = String((e && (e.code || e.message)) || ''); return /PERMISSION|permission/.test(c) ? '권한이 없습니다 (로그인 또는 규칙 확인)' : /invalid|wrong-password|user-not-found|credential/.test(c) ? '이메일 또는 비밀번호가 맞지 않습니다' : /network|timeout|시간/.test(c) ? '인터넷 연결을 확인해 주세요' : (e && e.message) || '알 수 없는 오류'; };

let R = { on: false, busy: false, err: '' };
let P = {}, SP = {}, FL = null, flSeen = 0, flSig = '';
let refs = {};
const applied = new Set();
const recentSig = {};
const spSeen = {};

const joinedMembers = () => [...new Set(Object.values(P).filter(x => x && x.role === 'member' && x.name).map(x => x.name))];
const observers = () => Object.values(P).filter(x => x && x.role === 'observer');

async function doLogin(email, pw) {
    await loadFb();
    await withTimeout(firebase.auth().signInWithEmailAndPassword(email, pw), 15000);
    C.email = email; saveCfg();
}
async function doLogout() { await loadFb(); await firebase.auth().signOut(); }

async function publishPinProofs() {
    const pins = (await withTimeout(DB.ref('config/pins').once('value'), 15000)).val() || {};
    const out = {};
    for (const [n, pin] of Object.entries(pins)) if (pin) out[n] = await sha256(`${n}|${pin}|gakbu-v1`);
    await withTimeout(DB.ref('liveAuth').set(Object.keys(out).length ? out : null), 15000);
    return Object.keys(out).length;
}

/** 사이드바를 닫았다 다시 열어도 회의 중이면 회의실에 자동으로 다시 연결 */
let stateLoaded = false;
function maybeRejoin() { if (stateLoaded && U && !R.on && !R.busy && S.phase === 'meeting') openRoom(); }
async function openRoom() {
    if (R.busy || R.on) return;
    R.busy = true; R.err = ''; renderAll();
    try {
        await loadFb();
        if (!U) throw new Error('먼저 위원회 계정으로 로그인해 주세요.');
        const ref = DB.ref('rooms/live');
        const cur = (await withTimeout(ref.once('value'), 15000)).val();
        if (cur && cur.online && cur.owner !== U.uid) throw new Error(`이미 진행 중인 회의가 있습니다${cur.view && cur.view.meetingName ? ` ("${cur.view.meetingName}")` : ''}. 그 회의가 끝난 뒤 다시 시도해 주세요.`);
        const keep = !!(cur && cur.owner === U.uid && cur.view && cur.view.phase === 'meeting' && S.phase === 'meeting');
        if (!keep) { await withTimeout(DB.ref('liveIn').remove(), 15000); applied.clear(); S.applied = []; }
        await withTimeout(ref.update({ owner: U.uid, online: true, createdAt: firebase.database.ServerValue.TIMESTAMP }), 15000);
        const np = await publishPinProofs();
        if (!np) toast('위원 비밀번호가 아직 없습니다 — 설정 탭에서 먼저 정해 주세요.');
        ref.child('online').onDisconnect().set(false);
        refs.room = ref;
        refs.presence = DB.ref('liveIn/presence'); refs.presence.on('value', s => { P = s.val() || {}; trackAttendance(); renderAll(); });
        refs.inbox = DB.ref('liveIn/inbox'); refs.inbox.on('child_added', handleInbox);
        refs.speaking = DB.ref('liveIn/speaking'); refs.speaking.on('value', s => { SP = s.val() || {}; renderLiveStrip(); publishLive(); });
        refs.floor = DB.ref('liveIn/floor'); refs.floor.on('value', s => { FL = s.val(); const sig = JSON.stringify(FL); if (sig !== flSig) { flSig = sig; flSeen = Date.now(); } renderLiveStrip(); });
        R.on = true;
        publishNow(); publishLive();
    } catch (e) { console.error(e); R.err = fbErr(e); }
    finally { R.busy = false; renderAll(); }
}

async function closeRoom() {
    if (!R.on) return;
    clearTimeout(pubT); clearTimeout(liveT);
    ['presence', 'inbox', 'speaking', 'floor'].forEach(k => { if (refs[k]) refs[k].off(); });
    const ref = refs.room; refs = {}; R.on = false; P = {}; SP = {}; FL = null;
    try { await ref.child('online').onDisconnect().cancel(); await ref.remove(); await DB.ref('liveIn').remove(); } catch (e) { console.error(e); }
    renderAll();
}

/* 다른 기기에서 말하는 중인 글자 (확정 전) — 사이드바 위에 보여 주고, 신호가 끊긴 것은 지움 */
function liveSpeakers() {
    const now = Date.now(), out = [];
    Object.keys(SP).forEach(k => {
        const x = SP[k]; if (!x || !x.name) return;
        const sig = JSON.stringify([x.text, x.hb]);
        if (!spSeen[k] || spSeen[k].sig !== sig) spSeen[k] = { sig, at: now };
        if (now - spSeen[k].at > 15000) { if (U) DB.ref(`liveIn/speaking/${k}`).remove().catch(() => {}); return; }
        out.push({ k, name: x.role === 'observer' ? `참관인 ${x.name}` : x.name, text: String(x.text || '') });
    });
    Object.keys(spSeen).forEach(k => { if (!SP[k]) delete spSeen[k]; });
    if (FL && refs.floor && now - flSeen > FLOOR_STALE + 3000) { const fr = refs.floor; FL = null; flSig = 'null'; fr.remove().catch(() => {}); }
    return out;
}
function renderLiveStrip() {
    const el = $('r-live'); if (!el) return;
    const on = R.on && S.phase === 'meeting' && !S.recess;
    const l = on ? liveSpeakers() : [];
    el.innerHTML = l.map(x => `<div class="live"><b>${esc(x.name)}</b> ${x.text ? esc(x.text.slice(-120)) : '듣는 중…'}</div>`).join('');
}
setInterval(renderLiveStrip, 2000);

/* 위원·참관인 발언 수신 → 문서 */
const speakerLabel = name => name === S.chair ? `${name}(의장)` : name;
function handleInbox(snap) {
    const id = snap.key, v = snap.val();
    const done = () => snap.ref.remove().catch(() => {});
    if (applied.has(id)) { done(); return; }
    if (!v || typeof v.text !== 'string' || typeof v.name !== 'string') { done(); return; }
    if (S.phase !== 'meeting' || S.recess) { done(); return; }
    const text = v.text.replace(/\s+/g, ' ').trim().slice(0, 2000);
    if (!text) { done(); return; }
    let who;
    if (v.role === 'member') { if (!S.members.includes(v.name)) { done(); return; } who = speakerLabel(v.name); }
    else who = `참관인 ${v.name.slice(0, 20)}`;
    const sig = (v.device || v.name) + '|' + text, now = Date.now();
    applied.add(id); S.applied.push(id);
    if (text.length >= 6 && recentSig[sig] && now - recentSig[sig] < 20000) { done(); return; }
    recentSig[sig] = now;
    addLine({ t: 'msg', s: who, x: text });
    done();
}

/* ----- 위원 입·퇴장 (개의 뒤): 접속 기준으로 출석을 따라감 ----- */
const leaveT = {};
function trackAttendance() {
    if (S.phase !== 'meeting') return;
    const joined = joinedMembers();
    joined.forEach(n => {
        if (leaveT[n]) { clearTimeout(leaveT[n]); delete leaveT[n]; }
        if (S.members.includes(n) && !S.present.includes(n)) {
            S.present.push(n); S.present.sort((a, b) => S.members.indexOf(a) - S.members.indexOf(b));
            addLine({ t: 'note', x: `${n} 입장 (${hhmm()})`, feed: `${n} 입장` });
        }
    });
    S.present.slice().forEach(n => {
        if (!joined.includes(n) && !leaveT[n]) leaveT[n] = setTimeout(() => {
            delete leaveT[n];
            if (joinedMembers().includes(n) || !S.present.includes(n) || !R.on) return;
            S.present = S.present.filter(x => x !== n);
            addLine({ t: 'note', x: `${n} 퇴장 (${hhmm()})`, feed: `${n} 퇴장` });
            renderAll();
        }, 20000);
    });
}

/* ----- 화면 공유 (rooms/live/view · live) ----- */
const curAgenda = () => S.agendas.find(a => a.key === S.cur.key) || null;
const curKey = () => S.cur.key || S.lastKey || "open";
function numbers() {
    const n = {}, cnt = {};
    S.agendas.forEach(a => { if (a.status === 'rejected') return; cnt[a.type] = (cnt[a.type] || 0) + 1; n[a.key] = cnt[a.type]; });
    return n;
}
const labelOf = a => `${a.type} ${numbers()[a.key] || ''}`.trim();
function statusText() {
    if (S.phase === 'ended') return '산회';
    if (S.phase === 'setup') return '회의 시작 전';
    if (S.recess) return '정회 중';
    const l = liveSpeakers();
    return l.length ? `${l[0].name} 발언 중` : '회의 중';
}
function viewSnapshot() {
    const item = curAgenda();
    return {
        meetingName: S.name || '', allowEdit: false, phase: S.phase, recess: !!S.recess, status: statusText(),
        present: S.present.length, total: S.members.length, members: (S.members.length ? S.members : C.members).slice(),
        chair: '', chairName: S.chair || '', docUrl: C.docUrl || '',
        cur: item ? { label: labelOf(item), type: item.type, title: item.title, step: S.cur.step, current: S.cur.current || '', steps: item.type === DELIB ? FLOW.length : 0 } : null,
        agendas: S.agendas.map(a => ({ label: a.status === 'rejected' ? a.type : labelOf(a), type: a.type, title: a.title, status: a.status, extra: !!a.extra, verdict: a.result ? (a.result.passed ? '가결' : '부결') : '' })),
        html: S.feed.join(''), t: firebase.database.ServerValue.TIMESTAMP
    };
}
let pubT = null, liveT = null, liveLast = 0;
function publishNow() { if (!R.on) return; clearTimeout(pubT); refs.room.child('view').set(viewSnapshot()).catch(e => console.error(e)); }
const schedulePublish = () => { if (!R.on) return; clearTimeout(pubT); pubT = setTimeout(publishNow, 500); };
function publishLive() {
    if (!R.on) return;
    const wait = 250 - (Date.now() - liveLast);
    clearTimeout(liveT);
    if (wait > 0) { liveT = setTimeout(publishLive, wait); return; }
    liveLast = Date.now();
    const l = liveSpeakers()[0];
    refs.room.child('live').set(l ? { speaker: l.name, text: l.text.slice(-400) } : null).catch(() => {});
}
