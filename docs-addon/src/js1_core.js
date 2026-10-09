'use strict';
/* ===== 공통 ===== */
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const COMMITTEE = 'kusis.midnight@gmail.com';
const FLOW = ['안건에 대한 제안 설명', '안건에 대한 질의 및 답변', '안건에 대한 찬반 토론', '안건에 대한 논의 종결', '안건에 대한 표결'];
const TYPES = ['보고안건', '토의안건', '심의안건'];
const DELIB = '심의안건';
const VOTE_OPTS = ['찬성', '반대', '기권', '의결권없음'];
const VOTE_SHORT = { 찬성: '찬성', 반대: '반대', 기권: '기권', 의결권없음: '무' };
const DEFAULT_MEMBERS = ['학부 학생회장', '학부 부학생회장', 'A반 학생회장', 'B반 학생회장', 'C반 학생회장', 'D반 학생회장'];
const DEFAULT_CHAIR = '학부 학생회장';
const FLOOR_STALE = 25000;
const hhmm = () => new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
const koDate = () => { const d = new Date(); return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`; };

/** Apps Script 서버 함수 호출 (Promise) */
const gs = (fn, ...args) => new Promise((ok, no) => {
    try { google.script.run.withSuccessHandler(ok).withFailureHandler(e => no(new Error((e && e.message) || String(e)))) [fn](...args); }
    catch (e) { no(e); }
});

let toastT = null;
function toast(msg) { const el = $('toast'); el.textContent = msg; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, 3600); }
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

/* ----- 설정 (문서에 저장) ----- */
let C = { email: '', members: DEFAULT_MEMBERS.slice(), siteUrl: '', recorder: '', place: '', name: '' };
const saveCfg = debounce(() => { gs('saveConfig', JSON.stringify(C)).catch(() => {}); }, 600);

/* ----- 회의 진행 상태 (문서에 저장 → 사이드바를 닫았다 열어도 이어짐) ----- */
const blankState = () => ({ phase: 'setup', name: '', place: '', chair: '', members: [], present: [], recess: false, openedAt: '', agendas: [], cur: { key: null, step: 0, current: '' }, feed: [], seq: 0, applied: [] });
let S = blankState();
const saveStateSoon = debounce(() => {
    const keep = Object.assign({}, S, { feed: S.feed.slice(-60), applied: S.applied.slice(-120) });
    gs('saveState', JSON.stringify(keep)).catch(() => {});
}, 900);

/* ----- 문서 쓰기 대기열: 한 번에 하나씩, 위치별로 모아서 순서대로 ----- */
const wq = [];            // { key, items } 또는 { call:[함수, 인자…], after }
let wBusy = false, wFail = 0;
function queueCall(call, after) { wq.push({ call, after }); renderPend(); pump(); }
function queueWrite(key, items) {
    if (!items || !items.length) return;
    const last = wq[wq.length - 1];
    if (last && last.key === key && !last.call) last.items.push(...items); else wq.push({ key, items: items.slice() });
    renderPend();
    pump();
}
async function pump() {
    if (wBusy) return;
    wBusy = true;
    try {
        while (wq.length) {
            const job = wq[0];
            try {
                if (job.call) { const r = await gs(...job.call); wq.shift(); wFail = 0; if (job.after) job.after(r); }
                else { const r = await gs('write', job.key, job.items); if (r && r.warn) toast(r.warn); wq.shift(); wFail = 0; }
            } catch (e) {
                wFail++;
                renderPend(e);
                await sleep(Math.min(8000, 1500 * wFail));
            }
            renderPend();
        }
    } finally { wBusy = false; renderPend(); }
}
function renderPend(err) {
    const n = wq.reduce((a, j) => a + (j.items ? j.items.length : 1), 0);
    $('pend').innerHTML = n ? (err ? `<span class="warn">⚠ 문서에 쓰지 못해 다시 시도 중 (${n}줄 대기) — ${esc(err.message)}</span>` : `문서에 쓰는 중… ${n}줄`) : '';
}
