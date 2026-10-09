/* ===== 화면: 진행 탭 ===== */
function setHTML(el, html) {
    if (!el || el._h === html) return;
    const keep = {};
    el.querySelectorAll('input[id],textarea[id],select[id]').forEach(x => { keep[x.id] = x.type === 'checkbox' ? x.checked : x.value; });
    const af = document.activeElement && el.contains(document.activeElement) ? document.activeElement.id : '';
    el.innerHTML = html; el._h = html;
    Object.keys(keep).forEach(id => { const x = $(id); if (x && el.contains(x)) { if (x.type === 'checkbox') x.checked = keep[id]; else if (keep[id] !== '' || x.tagName !== 'SELECT') x.value = keep[id]; } });
    if (af && $(af)) { try { $(af).focus(); } catch (e) { /* 무시 */ } }
}
let tab = 'run';
const renderRunSoon = debounce(() => renderRun(), 120);
function renderAll() {
    const ok = R.on;
    $('dot').className = 'dot' + (ok ? ' on' : '');
    $('st').textContent = !U ? '로그인 필요' : ok ? `회의실 열림 · ${joinedMembers().length}명 접속` : '회의실 닫힘';
    if (tab === 'run') renderRun();
    else if (tab === 'set') renderSet();
}
const chipHtml = (n, cls, act) => `<span class="chip ${cls}" ${act ? `data-act="${act}" data-a="${esc(n)}"` : ''}>${esc(n)}</span>`;

function renderRun() {
    // 로그인
    setHTML($('r-login'), U ? '' : `<div class="card"><b>위원회 계정 로그인</b><label class="l">이메일</label><input type="email" id="lg-email" value="${esc(C.email || COMMITTEE)}"><label class="l">비밀번호</label><input type="password" id="lg-pw"><div class="row"><button class="btn p grow" data-act="login">로그인</button></div><div class="warn" id="lg-err"></div></div>`);
    renderLiveStrip();
    // 회의실
    if (!U) { setHTML($('r-room'), ''); } else if (!R.on) {
        setHTML($('r-room'), `<div class="card"><div class="muted">회의실을 열면 위원이 휴대폰에서 이름·비밀번호로 입장합니다.${C.siteUrl ? '' : ' (설정 탭에서 위원 접속 주소를 적어 두면 여기에 보입니다)'}</div>${R.err ? `<div class="warn">⚠ ${esc(R.err)}</div>` : ''}<button class="btn p block" data-act="openRoom"${R.busy ? ' disabled' : ''}>${R.busy ? '여는 중…' : '회의실 열기'}</button></div>`);
    } else {
        const obs = observers();
        setHTML($('r-room'), `<div class="card"><div class="row"><span class="grow"><b>회의실 열림</b> <span class="muted">위원 ${joinedMembers().length} · 참관 ${obs.length}</span></span>${S.phase === 'meeting' ? '' : '<button class="btn s" data-act="closeRoom">닫기</button>'}</div>${C.siteUrl ? `<div class="muted" style="word-break:break-all">입장 주소: ${esc(C.siteUrl)}</div>` : ''}</div>`);
    }
    renderMembers(); renderBody(); renderVote(); renderManual();
}
function renderMembers() {
    const ph = S.phase, members = S.members.length ? S.members : C.members;
    if (!U || !R.on) { setHTML($('r-members'), ''); return; }
    if (ph === 'setup') {
        const joined = joinedMembers();
        setHTML($('r-members'), `<div class="card"><div class="muted" style="margin-bottom:4px">위원 입장 현황 — 입장한 위원을 눌러 <b>의장</b>으로 지정</div><div class="chips">${members.map(n => chipHtml(n, joined.includes(n) ? (S.chair === n ? 'chair' : 'joined') : 'off', joined.includes(n) ? 'chair' : '')).join('')}</div>
            <div class="muted" style="margin-top:6px">출석은 입장한 위원 기준으로 자동 처리됩니다.</div>
            <label class="l">회의 이름</label><input type="text" id="m-name" value="${esc(S.name || C.name || '')}" placeholder="예) 제3차 학부운영위원회">
            <label class="l">장소</label><input type="text" id="m-place" value="${esc(S.place || C.place || '')}" placeholder="(선택)"></div>`);
    } else {
        setHTML($('r-members'), `<div class="card"><div class="muted" style="margin-bottom:4px">출석 ${S.present.length}/${S.members.length}${ph === 'meeting' ? ' — 눌러서 의장(임시의장) 변경' : ''}</div><div class="chips">${S.members.map(n => chipHtml(n, S.chair === n ? 'chair' : S.present.includes(n) ? 'joined' : 'off', ph === 'meeting' && S.present.includes(n) ? 'chair' : '')).join('')}</div></div>`);
    }
}
function markStatus() {
    const has = k => hasMark(k);
    const ags = MK.filter(m => m.kind === 'agenda').length;
    return `<div class="muted">속기 위치: 개의 ${has('open') ? '<span class="ok">✓</span>' : '<span class="warn">✗</span>'} · 안건 ${ags}개 · 산회 ${has('close') ? '<span class="ok">✓</span>' : '<span class="warn">✗</span>'} <button class="btn s" data-act="refresh">새로고침</button></div>`;
}
function renderBody() {
    const el = $('r-body'), ph = S.phase;
    if (!U || (!R.on && ph !== 'ended')) { setHTML(el, S.phase === 'meeting' && U ? '<div class="card muted">회의실에 다시 연결하는 중입니다…</div>' : ''); return; }
    if (V) { setHTML(el, ''); return; }
    if (ph === 'setup') {
        const ags = S.agendas.filter(a => a.status !== 'rejected');
        setHTML(el, `<div class="card">${markStatus()}${ags.length ? `<div style="margin-top:4px">${ags.map(a => `<div class="ag"><div class="t"><span class="tag">[${esc(labelOf(a))}]</span> ${esc(a.title)}</div><button class="btn s" data-act="goto" data-a="${esc(a.key)}">이동</button></div>`).join('')}</div>` : '<div class="muted">문서에 안건 위치가 아직 없습니다. 안건지 탭에서 만들어 주세요.</div>'}
            <button class="btn p block" style="margin-top:8px" data-act="openMeeting"${S.chair ? '' : ' disabled'}>개의${S.chair ? ` (의장 ${esc(S.chair)})` : ' — 의장을 먼저 지정'}</button></div>`);
        return;
    }
    if (ph === 'ended') {
        setHTML(el, `<div class="card"><b>산회했습니다.</b><div class="muted">문서에 기록이 남았습니다.</div><div class="row" style="flex-wrap:wrap"><button class="btn s" data-act="cleanMarkers">속기 위치 표식 지우기</button><button class="btn s" data-act="closeRoom">회의실 닫기</button><button class="btn s" data-act="newMeeting">새 회의 준비</button></div></div>`);
        return;
    }
    const a = curAgenda(), nums = numbers();
    let h = '';
    if (S.recess) h += `<div class="card"><b>정회 중</b> <span class="muted">발언은 기록되지 않습니다.</span><button class="btn p block" style="margin-top:6px" data-act="recessOff">속회</button></div>`;
    if (a) {
        const delib = a.type === DELIB, idx = FLOW.indexOf(S.cur.current);
        h += `<div class="card"><div><span class="tag">[${esc(labelOf(a))}]</span> ${esc(a.title)}${a.extra ? ' <small class="muted">(추가)</small>' : ''}</div>`;
        if (delib) h += `<div class="step">${FLOW.map((_, i) => `<i class="${i < S.cur.step ? 'd' : ''}"></i>`).join('')}</div><div class="muted">현재 절차 (${S.cur.step}/${FLOW.length}): ${esc(S.cur.current || '-')}</div>`;
        h += '<div class="row" style="flex-wrap:wrap;margin-top:6px">';
        if (delib && idx >= 0 && idx < 2) h += `<button class="btn p grow" data-act="next">다음: ${esc(FLOW[S.cur.step])}</button>`;
        if (delib && idx === 2) h += `<button class="btn p grow" data-act="motion">토론종결동의</button>`;
        if (delib && idx === 4) h += `<button class="btn p grow" data-act="vote">${a.result ? '표결 다시 하기' : '표결 진행'}</button>`;
        h += `<button class="btn" data-act="endAg">안건 종료</button></div>`;
        if (MOT) {
            h += MOT.by ? `<div class="muted" style="margin-top:6px">[${esc(MOT.by)}] 토론종결동의 — 성립 여부</div><div class="row"><button class="btn p grow" data-act="motYes">성립</button><button class="btn grow" data-act="motNo">불성립</button><button class="btn" data-act="motBack">취소</button></div>`
                : `<div class="muted" style="margin-top:6px">제출한 위원을 선택하세요</div><div class="chips">${S.present.map(n => chipHtml(n, '', 'motBy')).join('')}</div><button class="btn s" style="margin-top:4px" data-act="motBack">취소</button>`;
        }
        h += '</div>';
    } else {
        h += `<div class="card"><div class="muted" style="margin-bottom:4px">안건 — 눌러서 상정${hasMark('open') ? '' : ' <span class="warn">(개의 위치 없음)</span>'}</div>`
            + (S.agendas.length ? S.agendas.map(x => {
                const st = x.status === 'rejected' ? '상정 부결' : x.result ? (x.result.passed ? '가결' : '부결') : x.status === 'done' ? '완료' : '';
                return `<div class="ag"><div class="t"><span class="tag">[${esc(x.status === 'rejected' ? x.type : x.type + ' ' + (nums[x.key] || ''))}]</span> ${esc(x.title)}${x.extra ? ' <small>(추가)</small>' : ''}</div>${x.status === 'pending' ? `<button class="btn s p" data-act="start" data-a="${esc(x.key)}">상정</button>` : `<small class="${x.result && !x.result.passed ? 'warn' : 'ok'}">${st}</small>`}</div>`;
            }).join('') : '<div class="muted">안건이 없습니다.</div>')
            + `</div>`;
    }
    h += `<div class="row"><button class="btn grow" data-act="extra">추가 안건</button>${S.recess ? '' : '<button class="btn grow" data-act="recessOn">정회</button>'}<button class="btn bad grow" data-act="adjourn">산회</button></div>`;
    if (EXTRA) h += `<div class="card"><label class="l">유형</label><select id="x-type">${TYPES.map(t => `<option>${t}</option>`).join('')}</select><label class="l">안건 이름</label><input type="text" id="x-title" placeholder="예) 예산 증액의 건"><div class="muted">상정하려면 출석 2/3 이상 찬성이 필요합니다.</div><div class="row"><button class="btn p grow" data-act="extraGo">상정 표결</button><button class="btn" data-act="extra">닫기</button></div></div>`;
    setHTML(el, h);
}
let EXTRA = false;

function renderVote() {
    const el = $('r-vote'); if (!V) { setHTML(el, ''); return; }
    const sel = V.sel, r = voteRule(), yes = S.present.filter(m => sel[m] === '찬성').length, unset = S.present.filter(m => !sel[m]).length;
    const a = curAgenda();
    const title = V.kind === 'motion' ? `추가 안건 상정 표결 — [${V.type}] ${V.title}` : `표결 — [${a ? labelOf(a) : ''}] ${a ? a.title : ''}`;
    const rows = S.present.map(m => `<div class="vrow${sel[m] ? '' : ' unset'}"><span class="n" title="${esc(m)}">${esc(m)}</span>${VOTE_OPTS.map(o => `<label><input type="radio" name="v-${esc(m)}" ${sel[m] === o ? 'checked' : ''} data-act="setVote" data-a="${esc(m)}" data-b="${o}">${VOTE_SHORT[o]}</label>`).join('')}</div>`).join('');
    const cnt = o => S.present.filter(m => sel[m] === o).length;
    setHTML(el, `<div class="card"><b>${esc(title)}</b>
        ${V.kind === 'agenda' ? `<div class="row"><label><input type="radio" name="vreq" data-act="req" data-a="majority" ${V.req === 'majority' ? 'checked' : ''}>과반</label><label><input type="radio" name="vreq" data-act="req" data-a="twothirds" ${V.req === 'twothirds' ? 'checked' : ''}>2/3 가중</label></div>` : ''}
        <div class="muted">${esc(r.label)}: ${esc(r.text)}</div>
        <div class="row" style="flex-wrap:wrap"><button class="btn s" data-act="quick" data-a="찬성">미선택 전원 찬성</button><button class="btn s" data-act="quick" data-a="">초기화</button></div>
        <div style="margin:4px 0">${rows}</div>
        <div class="tally ${yes >= r.need ? 'okk' : ''}">찬성 ${cnt('찬성')} · 반대 ${cnt('반대')} · 기권 ${cnt('기권')} · 의결권 없음 ${cnt('의결권없음')}${unset ? ` · 미선택 ${unset}` : ''}<br>${yes >= r.need ? `요건 충족 (${r.need}인)` : `${r.need - yes}인 더 필요 (기준 ${r.need}인)`}</div>
        <div class="row"><button class="btn p grow" data-act="submitVote">결과 등록</button></div>
        <div class="row"><button class="btn grow" data-act="consent">이의 없음 (가결)</button><button class="btn" data-act="cancelVote">취소</button></div></div>`);
}

function renderManual() {
    const el = $('r-manual');
    if (!U || !R.on || S.phase !== 'meeting' || S.recess) { setHTML(el, ''); return; }
    setHTML(el, `<details><summary>발언 직접 입력</summary><div class="card"><select id="mn-who">${S.present.map(n => `<option>${esc(n)}</option>`).join('')}</select><textarea id="mn-text" placeholder="발언 내용"></textarea><button class="btn block" data-act="manual">문서에 추가</button></div></details>`);
}

/* 클릭 처리 */
const ACT = {
    login: async () => {
        const em = $('lg-email').value.trim(), pw = $('lg-pw').value; if (!em || !pw) { $('lg-err').textContent = '이메일과 비밀번호를 입력해 주세요.'; return; }
        try { await doLogin(em, pw); } catch (e) { const x = $('lg-err'); if (x) x.textContent = fbErr(e); }
    },
    openRoom: () => openRoom(), closeRoom: async () => { if (S.phase === 'meeting' && !(await ask('회의 중입니다. 회의실을 닫을까요?'))) return; closeRoom(); },
    refresh: () => refreshMarkers(),
    chair: (n) => setChair(n),
    goto: k => gs('gotoMarker', k).catch(() => {}),
    openMeeting: () => openMeeting(),
    start: k => startAgenda(k), next: () => nextStep(), endAg: () => endAgenda(),
    motion: () => { MOT = { by: '' }; renderAll(); }, motBy: n => { MOT.by = n; renderAll(); }, motBack: () => { MOT = null; renderAll(); }, motYes: () => motionResult(true), motNo: () => motionResult(false),
    vote: () => startVote({ kind: 'agenda' }),
    setVote: (n, v) => setVote(n, v), req: v => { V.req = v; renderVote(); }, quick: v => quickVote(v), submitVote: () => submitVote(false), consent: () => submitVote(true), cancelVote: () => cancelVote(),
    extra: () => { EXTRA = !EXTRA; renderAll(); },
    extraGo: () => { const t = ($('x-title').value || '').trim(); if (!t) { toast('안건 이름을 적어 주세요.'); return; } const type = $('x-type').value; EXTRA = false; startVote({ kind: 'motion', type, title: t }); },
    recessOn: () => setRecess(true), recessOff: () => setRecess(false), adjourn: () => adjourn(),
    cleanMarkers: async () => { if (await ask('문서의 "▶ 속기 위치" 표시 줄을 모두 지울까요?')) { const n = await gs('cleanMarkers'); MK = []; syncAgendas(); toast(`${n}개 표시를 지웠습니다.`); renderAll(); } },
    newMeeting: () => newMeeting(),
    manual: () => { const who = $('mn-who').value, text = $('mn-text').value.replace(/\s+/g, ' ').trim(); if (!who || !text) return; addLine({ t: 'msg', s: speakerLabel(who), x: text }); $('mn-text').value = ''; }
};
document.addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b || b.tagName === 'INPUT') return;
    const f = ACT[b.dataset.act]; if (f) f(b.dataset.a, b.dataset.b);
});
document.addEventListener('change', e => {
    const b = e.target.closest('input[data-act]'); if (!b) return;
    const f = ACT[b.dataset.act]; if (f) f(b.dataset.a, b.dataset.b);
});
document.addEventListener('input', e => {
    if (e.target.id === 'm-name') { S.name = e.target.value; C.name = S.name; saveCfg(); saveStateSoon(); }
    else if (e.target.id === 'm-place') { S.place = e.target.value; C.place = S.place; saveCfg(); saveStateSoon(); }
});
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'lg-pw') { e.preventDefault(); ACT.login(); } });
$('nav').addEventListener('click', e => {
    const b = e.target.closest('button[data-tab]'); if (!b) return;
    tab = b.dataset.tab;
    document.querySelectorAll('#nav button').forEach(x => x.classList.toggle('on', x === b));
    ['run', 'write', 'rules', 'set'].forEach(t => { $('tab-' + t).hidden = t !== tab; });
    if (tab === 'run') renderRun(); else if (tab === 'write') renderWrite(); else if (tab === 'rules') renderRules(); else renderSet();
    refreshMarkers();
});
