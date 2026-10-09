/* ===== 설정 탭 · 시작 ===== */
let PINS = null, pinErr = '';
function renderSet() {
    setHTML($('s-acct'), `<b>계정</b><div class="muted">${U ? esc(U.email) + ' 로그인됨' : '로그인 안 됨 (진행 탭에서 로그인)'}</div>${U ? '<button class="btn s" data-act="logout" style="margin-top:4px">로그아웃</button>' : ''}`);
    setHTML($('s-meet'), `<b>회의 기본값</b><label class="l">위원 접속 주소 (위원 휴대폰에서 열 사이트)</label><input type="text" id="c-site" value="${esc(C.siteUrl || '')}" placeholder="https://….pages.dev"><label class="l">속기자</label><input type="text" id="c-rec" value="${esc(C.recorder || '')}"><div class="row"><button class="btn p grow" data-act="saveMeet">저장</button></div>`);
    setHTML($('s-mem'), `<b>위원 명단 (재적)</b><div class="muted">한 줄에 한 명. 직책이 곧 로그인 이름입니다.</div><textarea id="c-mem" style="min-height:110px">${esc(C.members.join('\n'))}</textarea><div class="row"><button class="btn p grow" data-act="saveMem">저장</button><button class="btn" data-act="memDefault">기본값</button></div><div class="muted">진행 중인 회의에는 적용되지 않습니다.</div>`);
    if (!U) { setHTML($('s-pin'), `<b>위원 비밀번호</b><div class="muted">로그인하면 설정할 수 있습니다.</div>`); return; }
    if (PINS === null && !renderSet.loading) { renderSet.loading = true; loadFb().then(() => DB.ref('config/pins').once('value')).then(s => { PINS = s.val() || {}; pinErr = ''; }).catch(e => { PINS = {}; pinErr = fbErr(e); }).then(() => { renderSet.loading = false; renderSet(); }); }
    const p = PINS || {};
    setHTML($('s-pin'), `<b>위원 비밀번호</b><div class="muted">위원이 첫 화면에서 이름을 고른 뒤 입력하는 고유 번호입니다. 한 번 정하면 계속 쓰입니다.${PINS === null ? ' (불러오는 중…)' : ''}</div>${pinErr ? `<div class="warn">${esc(pinErr)}</div>` : ''}${C.members.map((n, i) => `<div class="row"><span class="grow" style="font-size:12px">${esc(n)}</span><input type="text" id="pin-${i}" value="${esc(p[n] || '')}" style="width:90px" inputmode="numeric" placeholder="미설정"></div>`).join('')}<button class="btn p block" data-act="savePins">저장${R.on ? ' (회의실에 바로 반영)' : ''}</button>`);
}
Object.assign(ACT, {
    logout: () => doLogout(),
    saveMeet: () => { C.siteUrl = $('c-site').value.trim(); C.recorder = $('c-rec').value.trim(); saveCfg(); toast('저장했습니다.'); },
    saveMem: () => { const l = [...new Set($('c-mem').value.split('\n').map(x => x.trim()).filter(Boolean))]; if (!l.length) { toast('위원을 한 명 이상 적어 주세요.'); return; } C.members = l; saveCfg(); PINS = PINS; toast(`위원 ${l.length}명으로 저장했습니다.`); renderSet(); },
    memDefault: () => { $('c-mem').value = DEFAULT_MEMBERS.join('\n'); },
    savePins: async () => {
        const out = {}; C.members.forEach((n, i) => { const v = ($('pin-' + i).value || '').trim(); if (v) out[n] = v; });
        try { await loadFb(); await withTimeout(DB.ref('config/pins').set(Object.keys(out).length ? out : null), 15000); PINS = out; if (R.on) await publishPinProofs(); toast('비밀번호를 저장했습니다.'); }
        catch (e) { toast('저장하지 못했습니다 — ' + fbErr(e)); }
    }
});

/* ----- 시작 ----- */
(async function init() {
    renderAll();
    try { const c = JSON.parse(await gs('getConfig') || '{}'); C = Object.assign(C, c); if (!Array.isArray(C.members) || !C.members.length) C.members = DEFAULT_MEMBERS.slice(); } catch (e) { /* 새 문서 */ }
    try { const st = await gs('loadState'); if (st) { S = Object.assign(blankState(), JSON.parse(st)); (S.applied || []).forEach(id => applied.add(id)); } } catch (e) { /* 새 문서 */ }
    try { const d = await gs('docInfo'); if (d && d.url && C.docUrl !== d.url) { C.docUrl = d.url; saveCfg(); } } catch (e) { /* 무시 */ }
    stateLoaded = true;
    renderAll();
    refreshMarkers();
    maybeRejoin();
    loadFb().then(() => renderAll()).catch(e => { R.err = '서버 연결 도구를 불러오지 못했습니다 — 인터넷 연결을 확인해 주세요.'; renderAll(); });
    setInterval(() => { if (document.hidden || wq.length) return; refreshMarkers(); }, 10000);
    window.addEventListener('beforeunload', () => { if (S.phase !== 'setup') gs('saveState', JSON.stringify(Object.assign({}, S, { feed: S.feed.slice(-60) }))).catch(() => {}); });
})();
