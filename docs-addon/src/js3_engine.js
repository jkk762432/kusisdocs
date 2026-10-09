/* ===== 안건 진행 절차 (의장이 총괄 · 심의안건은 정해진 절차) ===== */
let MK = [];                    // 문서의 속기 위치 목록
let V = null;                   // 진행 중인 표결 { kind, type, title, req, sel }
let MOT = null;                 // 토론종결동의 { by }

/* 확인창 (사이드바에서는 confirm 이 막혀 있어 직접 만듦) */
function ask(msg, yes = '확인', no = '취소') {
    return new Promise(res => {
        const o = document.createElement('div');
        o.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:20;display:flex;align-items:center;justify-content:center;padding:14px';
        o.innerHTML = `<div class="card" style="max-width:260px;margin:0"><p style="margin:0 0 10px;white-space:pre-line">${esc(msg)}</p><div class="row"><button class="btn grow" data-r="0">${esc(no)}</button><button class="btn p grow" data-r="1">${esc(yes)}</button></div></div>`;
        o.addEventListener('click', e => { const b = e.target.closest('button[data-r]'); if (!b) return; o.remove(); res(b.dataset.r === '1'); });
        document.body.appendChild(o);
    });
}

/* ----- 문서에 쓰고 + 참관 화면에 싣기 ----- */
function feedHTML(it) {
    switch (it.t) {
        case 'msg': return `<div class="message"><span class="speaker-name">[${esc(it.s)}]</span> <span class="message-text">${esc(it.x)}</span></div>`;
        case 'note': return `<div class="log-note">[ ${esc(it.feed || it.x)} ]</div>`;
        case 'step': return `<div class="step-title">- ${esc(it.x)}</div>`;
        case 'head': return `<div class="agenda-title"><span class="tag">${esc(it.tag || '')}</span> ${esc(it.x)}</div>`;
        case 'kv': return `<div class="meeting-info">${it.title ? `<h2>${esc(it.title)}</h2>` : ''}<table>${it.rows.map(r => `<tr><th>${esc(r[0])}</th><td>${esc(r[1])}</td></tr>`).join('')}</table></div>`;
        case 'result': return `<div class="vote-result"><div class="summary">${esc(it.x)}</div></div>`;
        default: return '';
    }
}
/** it: 항목 또는 항목 배열. noDoc 은 참관 화면에만, feed/tag/title 은 참관 화면용 보조 값 */
function addLine(it, key) {
    const items = Array.isArray(it) ? it : [it];
    queueWrite(key || curKey(), items.filter(x => !x.noDoc).map(x => { const o = Object.assign({}, x); delete o.feed; delete o.tag; delete o.title; return o; }));
    items.forEach(x => { const h = feedHTML(x); if (h) S.feed.push(h); });
    if (S.feed.length > 400) S.feed = S.feed.slice(-300);
    commit(false);
}
function commit(render = true) { saveStateSoon(); schedulePublish(); if (render) renderAll(); else renderRunSoon(); }

/* ----- 속기 위치(표식) → 안건 목록 ----- */
function syncAgendas() {
    const marks = MK.filter(m => m.kind === 'agenda');
    const old = {}; S.agendas.forEach(a => { old[a.key] = a; });
    const list = marks.map(m => {
        const a = old[m.key] || { key: m.key, status: 'pending', result: null };
        a.type = m.type || a.type || '토의안건'; a.title = m.title || a.title || ''; a.extra = !!m.extra;
        return a;
    });
    S.agendas.forEach(a => { if (!list.includes(a) && (a.status === 'rejected' || a.status === 'active' || a.status === 'done')) list.push(a); });
    S.agendas = list;
}
async function refreshMarkers() {
    if (wq.length) return;
    try { MK = await gs('listMarkers'); syncAgendas(); renderAll(); } catch (e) { console.error(e); }
}
const hasMark = k => MK.some(m => m.key === k);

/* ----- 개의 ----- */
async function openMeeting() {
    if (!R.on) { toast('먼저 회의실을 열어 주세요.'); return; }
    await refreshMarkers();
    const members = S.members.length ? S.members : C.members.slice();
    const present = joinedMembers().filter(n => members.includes(n));
    if (!present.length) { toast('입장한 위원이 없습니다.'); return; }
    if (!S.chair || !present.includes(S.chair)) { toast('입장한 위원 중에서 의장을 지정해 주세요.'); return; }
    const quorumOk = present.length * 2 > members.length;
    if (!quorumOk && !(await ask(`출석 ${present.length}명은 재적 ${members.length}명의 과반에 미달합니다 (회칙 제86조).\n그래도 개의할까요?`, '개의'))) return;
    S.members = members; S.present = present.slice(); S.phase = 'meeting'; S.recess = false; S.openedAt = hhmm();
    S.name = S.name || C.name || '학부운영위원회';
    const absent = members.filter(m => !present.includes(m));
    const ags = S.agendas.filter(a => a.status !== 'rejected');
    const rows = [['일시', koDate()], S.place ? ['장소', S.place] : null, ['개의 시간', S.openedAt], ['의장', S.chair], ['속기자', C.recorder || '미지정'],
        ['참석 현황', `재적 ${members.length}명 / 출석 ${present.length}명 — ${quorumOk ? '개의요건 충족' : '개의요건 미충족(과반 미달)'}`], ['출석', present.join(', ')]];
    if (absent.length) rows.push(['불참', absent.join(', ')]);
    if (ags.length) rows.push(['안건', ags.map(a => `[${labelOf(a)}] ${a.title}`).join('\n')]);
    S.cur = { key: null, step: 0, current: '' }; S.lastKey = 'open';
    addLine([{ t: 'kv', rows: rows.filter(Boolean), title: S.name }, { t: 'note', x: `개의 (${S.openedAt})` }], 'open');
    commit();
}

/* ----- 안건 상정 ----- */
function startAgenda(key, opts = {}) {
    const a = S.agendas.find(x => x.key === key); if (!a || S.cur.key) return;
    a.status = 'active'; S.cur = { key, step: 0, current: '' }; S.lastKey = key;
    const delib = a.type === DELIB;
    const lines = [{ t: 'head', x: a.title, tag: `[${labelOf(a)}]`, noDoc: true }, { t: 'note', x: `${opts.extra ? '추가 안건 · ' : ''}안건 상정 (${hhmm()})` }];
    if (delib) { S.cur.step = 1; S.cur.current = FLOW[0]; lines.push({ t: 'step', x: FLOW[0] }); }
    addLine(lines, key);
    commit();
}
function nextStep() {
    const a = curAgenda(); if (!a || a.type !== DELIB) return;
    const idx = FLOW.indexOf(S.cur.current); if (idx < 0 || idx >= 2) return;
    const t = FLOW[S.cur.step]; S.cur.step++; S.cur.current = t;
    addLine({ t: 'step', x: t }); commit();
}
function motionResult(ok) {
    const by = MOT.by; MOT = null;
    if (!ok) { addLine([{ t: 'msg', s: speakerLabel(by), x: '토론종결동의 제출' }, { t: 'note', x: '토론종결동의 불성립 — 찬반 토론 계속' }]); commit(); return; }
    const rest = FLOW.slice(S.cur.step);
    addLine([{ t: 'msg', s: speakerLabel(by), x: '토론종결동의 제출' }, { t: 'note', x: '토론종결동의 성립' }].concat(rest.map(x => ({ t: 'step', x }))));
    S.cur.step = FLOW.length; S.cur.current = FLOW[FLOW.length - 1];
    commit();
    startVote({ kind: 'agenda' });
}

/* ----- 표결 ----- */
const motionNeed = n => Math.ceil(n * 2 / 3);
function voteRule() {
    const n = S.present.length, novote = S.present.filter(m => V.sel[m] === '의결권없음').length;
    if (V.kind === 'motion' || V.req === 'twothirds') return { need: motionNeed(n), base: n, label: V.kind === 'motion' ? '상정 요건' : '의결 요건', text: `출석 ${n}인의 2/3 이상, 즉 ${motionNeed(n)}인 이상 찬성` };
    const valid = n - novote;
    return { need: Math.floor(valid / 2) + 1, base: valid, label: '의결 요건', text: `유효 투표 ${valid}인(의결권 없음 제외)의 과반, 즉 ${Math.floor(valid / 2) + 1}인 이상 찬성` };
}
async function startVote(mode) {
    if (!S.present.length) { toast('출석 중인 위원이 없습니다.'); return; }
    if (S.present.length * 2 <= S.members.length && !(await ask(`지금 출석은 ${S.present.length}명으로 재적 ${S.members.length}명의 과반에 미달합니다 (회칙 제86조).\n그래도 표결을 진행할까요?`, '진행'))) return;
    V = Object.assign({ req: 'majority', sel: {} }, mode);
    renderAll();
}
function setVote(name, v) { if (V) { V.sel[name] = v; renderVote(); } }
function quickVote(v) { if (!V) return; S.present.forEach(m => { if (!v) delete V.sel[m]; else if (!V.sel[m]) V.sel[m] = v; }); renderVote(); }
function cancelVote() { V = null; renderAll(); }

async function submitVote(consent) {
    if (!V) return;
    const n = S.present.length, total = S.members.length;
    const list = arr => arr.join(', ') || '없음';
    const consentLine = `출석 ${n}인 / 의장이 이의 유무를 물은바 이의가 없으므로`;
    let g = null;
    if (!consent) {
        const unset = S.present.filter(m => !V.sel[m]);
        if (unset.length && !(await ask(`의사를 선택하지 않은 위원이 ${unset.length}명 있습니다.\n(${unset.join(', ')})\n\n기권으로 처리하고 등록할까요?`, '등록'))) return;
        g = { 찬성: [], 반대: [], 기권: [], 의결권없음: [] };
        S.present.forEach(m => g[V.sel[m] || '기권'].push(m));
    }
    const v = V; V = null;
    if (v.kind === 'motion') {
        const need = motionNeed(n), yes = consent ? n : g.찬성.length, ok = consent || yes >= need;
        const rows = consent ? [['결과', `${consentLine} 상정 가결 (이의 없음)`]] : [['찬성', list(g.찬성)], ['반대', list(g.반대)], ['기권', list(g.기권)]].concat(g.의결권없음.length ? [['의결권 없음', list(g.의결권없음)]] : []);
        addLine([{ t: 'step', x: `추가 안건 상정 표결 — ${v.type} 「${v.title}」` }, { t: 'kv', rows },
            { t: 'result', x: consent ? '=> 상정 가결 (이의 없음)' : `출석 ${n}인 / 찬성 ${g.찬성.length}인 / 반대 ${g.반대.length}인 / 기권 ${g.기권.length}인 / 의결권 없음 ${g.의결권없음.length}인 (상정 요건: 출석 2/3 이상 찬성, ${need}인 이상) => 상정 ${ok ? '가결' : '부결'}`, verdict: true, pass: ok }]);
        const key = 'x' + Date.now().toString(36);
        if (ok) {
            S.agendas.push({ key, type: v.type, title: v.title, status: 'pending', extra: true, result: null });
            const no = numbers()[key] || '';
            queueCall(['addExtraMarker', { key, kind: 'agenda', type: v.type, title: v.title, extra: true, label: `${v.type} ${no}`.trim(), head: `[${v.type} ${no}] ${v.title}` }], r => { MK = r; syncAgendas(); renderAll(); });
            toast(`상정 가결 — "${v.title}"`);
            const cur = S.cur.key;
            if (cur) { const a = curAgenda(); finishAgenda(a, null, true); }     // 진행 중이던 안건은 마친 것으로 보고 새 안건 상정
            startAgenda(key, { extra: true });
        } else {
            S.agendas.push({ key, type: v.type, title: v.title, status: 'rejected', extra: true, result: null });
            toast(`상정 부결 — 찬성 ${yes}인 (요건 ${need}인)`);
        }
        commit();
        return;
    }
    const item = curAgenda(); if (!item) return;
    let result, items;
    if (consent) {
        result = { present: n, approve: [], reject: [], abstain: [], novote: [], passed: true, consent: true, time: hhmm() };
        items = [{ t: 'kv', rows: [['결과', `${consentLine} 안건 가결 (이의 없음)`]] }, { t: 'result', x: `=> ${labelOf(item)} 가결 (이의 없음)`, verdict: true, pass: true }];
    } else {
        const rn = voteRule2(v, g), passed = rn.valid > 0 && g.찬성.length >= rn.need;
        result = { present: n, approve: g.찬성, reject: g.반대, abstain: g.기권, novote: g.의결권없음, passed, req: v.req, need: rn.need, time: hhmm() };
        const warn = n * 2 > total ? '' : ` ※ 표결 시점 출석 ${n}인으로 재적(${total}인) 과반에 미달`;
        items = [{ t: 'kv', rows: [['찬성', list(g.찬성)], ['반대', list(g.반대)], ['기권', list(g.기권)]].concat(g.의결권없음.length ? [['의결권 없음', list(g.의결권없음)]] : []).concat([['의결 요건', v.req === 'twothirds' ? `출석 2/3 이상 찬성 (${rn.need}인 이상)` : `유효 투표 과반 찬성 (${rn.need}인 이상)`]]) },
            { t: 'result', x: `출석 ${n}인 / 찬성 ${g.찬성.length}인 / 반대 ${g.반대.length}인 / 기권 ${g.기권.length}인 / 의결권 없음 ${g.의결권없음.length}인 => 안건 ${passed ? '가결' : '부결'}${warn}`, verdict: true, pass: passed }];
    }
    items.unshift({ t: 'step', x: `표결 결과 — ${labelOf(item)}` });
    addLine(items);
    finishAgenda(item, result);
    toast(`표결 결과(${result.passed ? '가결' : '부결'})를 등록하고 안건을 종료했습니다.`);
}
function voteRule2(v, g) {
    const n = S.present.length;
    if (v.req === 'twothirds') return { need: motionNeed(n), valid: n };
    const valid = n - g.의결권없음.length; return { need: Math.floor(valid / 2) + 1, valid };
}
function finishAgenda(item, result, quiet) {
    if (result) item.result = result;
    item.status = 'done';
    addLine({ t: 'note', x: `안건 논의 종료 (${hhmm()})`, feed: `${labelOf(item)} 논의 종료` }, item.key);
    S.lastKey = item.key; S.cur = { key: null, step: 0, current: '' };
    if (!quiet) commit();
}

/* ----- 안건 종료 · 정회 · 의장 · 산회 ----- */
async function endAgenda() {
    const a = curAgenda(); if (!a) return;
    if (a.type === DELIB && !a.result && !(await ask('표결 없이 이 안건을 종료할까요?', '종료'))) return;
    finishAgenda(a, null);
}
function setRecess(on) {
    if (S.phase !== 'meeting' || S.recess === on) return;
    if (on) { addLine({ t: 'note', x: `정회 (${hhmm()})` }); S.recess = true; }
    else { S.recess = false; addLine({ t: 'note', x: `속회 (${hhmm()})` }); }
    commit();
}
function setChair(name) {
    if (!name || name === S.chair) return;
    const was = S.phase === 'meeting';
    S.chair = name;
    if (was) addLine({ t: 'note', x: `의장 변경 — ${name}(임시의장) (${hhmm()})` });
    commit();
}
async function adjourn() {
    if (S.phase !== 'meeting') return;
    const open = S.agendas.filter(a => a.status === 'active').length;
    if (!(await ask(open ? '진행 중인 안건이 있습니다. 그래도 산회할까요?' : '산회할까요?', '산회'))) return;
    const delib = S.agendas.filter(a => a.type === DELIB && a.status !== 'rejected');
    const rows = delib.map(a => {
        const r = a.result;
        const res = !r ? (a.status === 'pending' ? '미상정' : '표결 없음') : r.consent ? '가결 (이의 없음)' : `${r.passed ? '가결' : '부결'} (찬성 ${r.approve.length} · 반대 ${r.reject.length} · 기권 ${r.abstain.length} · 의결권 없음 ${r.novote.length})`;
        return [`[${labelOf(a)}] ${a.title}`, res];
    });
    const items = [{ t: 'note', x: `산회 (${hhmm()})` }];
    if (rows.length) { const p = delib.filter(a => a.result && a.result.passed).length, f = delib.filter(a => a.result && !a.result.passed).length; items.push({ t: 'kv', rows }, { t: 'result', x: `심의안건 ${delib.length}건 — 가결 ${p}건 · 부결 ${f}건${delib.length - p - f ? ` · 미의결 ${delib.length - p - f}건` : ''}` }); }
    else items.push({ t: 'result', x: '이번 회의에 심의안건은 없었습니다.' });
    addLine(items, 'close');
    S.phase = 'ended'; S.recess = false; S.cur = { key: null, step: 0, current: '' };
    commit(); publishNow();
}
async function newMeeting() {
    if (!(await ask('회의 기록 상태를 비우고 새 회의를 준비할까요?\n(문서에 쓴 내용은 그대로 남습니다)', '새 회의'))) return;
    const keepName = S.name, keepPlace = S.place;
    S = blankState(); S.name = keepName; S.place = keepPlace;
    applied.clear(); gs('clearState').catch(() => {});
    if (R.on) await closeRoom();
    commit(); refreshMarkers();
}
