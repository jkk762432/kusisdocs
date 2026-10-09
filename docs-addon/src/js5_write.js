/* ===== 안건지 쓰기 도우미 + 회칙 ===== */
const RUL = window.RULES || { outline: [], articles: [] };
const artKey = a => `${a.add ? 'b' : ''}${a.no}-${a.sub || 0}`;
const artName = a => `${a.add ? '부칙 ' : ''}제${a.no}조${a.sub ? '의' + a.sub : ''}`;
const byKey = new Map(RUL.articles.map(a => [artKey(a), a]));
function parseRefs(t) {
    const out = [], re = /(부칙\s*)?제?\s*(\d+)\s*조(?:\s*의\s*(\d+))?/g; let m;
    while ((m = re.exec(t))) out.push(`${m[1] ? 'b' : ''}${m[2]}-${m[3] || 0}`);
    if (!out.length && /^[\d\s,]+$/.test(t.trim())) (t.match(/\d+/g) || []).forEach(n => out.push(`${n}-0`));
    return [...new Set(out)];
}
function searchRules(q, ch) {
    q = (q || '').trim();
    const refs = q ? parseRefs(q) : [];
    if (refs.length) return { arts: refs.map(k => byKey.get(k)).filter(Boolean), byNo: true };
    if (q) return { arts: RUL.articles.filter(a => (!ch || a.ch === ch) && (a.title.includes(q) || a.lines.some(l => l.includes(q)))), byNo: false };
    return { arts: ch ? RUL.articles.filter(a => a.ch === ch) : [], byNo: false };
}
const hl = (s, q) => q ? esc(s).split(esc(q)).join(`<mark>${esc(q)}</mark>`) : esc(s);
const ruleBlocks = a => { const head = `${artName(a)}【${a.title}】`; return [{ t: 'rule', x: head, bold: head.length }].concat(a.lines.map(l => ({ t: 'rule', x: l }))); };
async function insertDoc(blocks, okMsg) {
    try { const r = await gs('insertBlocks', blocks); MK = r.markers; syncAgendas(); renderAll(); toast(okMsg || (r.where === 'cursor' ? '커서 위치에 넣었습니다.' : '문서 끝에 넣었습니다 (커서가 없었습니다).')); }
    catch (e) { toast('문서에 넣지 못했습니다 — ' + e.message); }
}

/* --- 회칙 탭 --- */
const openArt = new Set();
function artHTML(a, q, force, mode) {
    const k = artKey(a), o = force || openArt.has(k);
    return `<div class="art" data-k="${k}"><div class="h"><button class="tt" data-act="art" data-a="${k}"><b>${artName(a)}</b>【${hl(a.title, q)}】</button>${mode === 'pick' ? `<button class="btn s" data-act="pickRef" data-a="${k}">+</button>` : `<button class="btn s" data-act="insRule" data-a="${k}">넣기</button>`}</div>${o ? `<div class="b"><div class="muted">${esc([a.ch, a.sec].filter(Boolean).join(' · '))}</div>${a.lines.map(l => `<p>${hl(l, q)}</p>`).join('')}</div>` : ''}</div>`;
}
function renderRules() {
    const sel = $('q-ch');
    if (!sel.options.length) sel.innerHTML = '<option value="">전체 장</option>' + RUL.outline.map(c => `<option>${esc(c.name)}</option>`).join('');
    const q = $('q-rule').value.trim(), ch = sel.value, { arts, byNo } = searchRules(q, ch);
    $('q-sub').textContent = byNo ? (arts.length ? `조항 번호로 찾은 결과 ${arts.length}개` : '해당 번호의 조항이 없습니다.') : q ? `"${q}"이(가) 들어간 조항 ${arts.length}개` : ch ? `${ch} — ${arts.length}개 조항` : '조항 번호나 낱말을 입력하거나 장을 고르세요.';
    $('q-list').innerHTML = arts.slice(0, 40).map(a => artHTML(a, byNo ? '' : q, byNo || arts.length <= 2)).join('') || '<div class="muted">결과 없음</div>';
    $('q-list').style.display = arts.length ? '' : 'none';
}
$('q-rule').addEventListener('input', debounce(renderRules, 150));
$('q-ch').addEventListener('change', renderRules);

/* --- 안건지 탭 --- */
let AGREFS = [];
function renderWrite() {
    setHTML($('w-meet'), `<label class="l">회의 이름</label><input type="text" id="a-name" value="${esc(C.name || '')}" placeholder="제3차 학부운영위원회">
        <label class="l">일시</label><input type="text" id="a-when" placeholder="2026년 10월 12일(월) 19:00">
        <label class="l">장소</label><input type="text" id="a-place" value="${esc(C.place || '')}">
        <label class="l">소집자</label><input type="text" id="a-by" placeholder="학부 학생회장">
        <div class="row" style="flex-wrap:wrap;margin-top:6px"><button class="btn p grow" data-act="insMeet">개요 넣기</button><button class="btn grow" data-act="insNotice">소집 공고문</button></div>
        <div class="muted">커서가 있는 곳에 들어갑니다. 공고문에는 문서에 만든 안건이 목록으로 들어갑니다.</div>`);
    setHTML($('w-ag'), `<label class="l">유형</label><select id="g-type">${TYPES.map(t => `<option${t === DELIB ? ' selected' : ''}>${t}</option>`).join('')}</select>
        <label class="l">안건 이름</label><input type="text" id="g-title" placeholder="예) 2026학년도 예산안 심의">
        <label class="row" style="font-size:12px"><input type="checkbox" id="g-auto" checked> 끝에 ‘의 건’ 자동으로 붙이기</label>
        <label class="l">발의자</label><input type="text" id="g-by" list="g-dl" placeholder="(선택)"><datalist id="g-dl">${C.members.map(m => `<option value="${esc(m)}">`).join('')}</datalist>
        <label class="l">요지 · 설명</label><textarea id="g-desc" placeholder="(선택)"></textarea>
        <label class="l">관련 회칙 (번호나 낱말로 찾기)</label><input type="search" id="g-rq" placeholder="예) 86 또는 정족수"><div id="g-rres"></div><div class="refs" id="g-refs"></div>
        <label class="l">비고</label><input type="text" id="g-note" placeholder="(선택)">
        <button class="btn p block" style="margin-top:8px" data-act="insAg">문서에 안건 넣기 (속기 위치 포함)</button>`);
    renderRefs();
    setHTML($('w-bulk'), `<div class="muted">한 줄에 안건 하나. <code>제목</code> 또는 <code>유형|제목|발의자</code></div><label class="l">기본 유형</label><select id="b-type">${TYPES.map(t => `<option${t === DELIB ? ' selected' : ''}>${t}</option>`).join('')}</select><textarea id="b-text" style="min-height:90px" placeholder="학생회비 사용 계획 보고\n심의안건|예산안 심의|부학생회장"></textarea><button class="btn p block" data-act="insBulk">모두 문서에 넣기</button>`);
    renderMarks();
}
function renderRefs() {
    const el = $('g-refs'); if (!el) return;
    el.innerHTML = AGREFS.map(k => { const a = byKey.get(k); return a ? `<span>${artName(a)} <b data-act="unref" data-a="${k}" style="cursor:pointer">×</b></span>` : ''; }).join('');
}
function renderMarks() {
    setHTML($('w-mark'), `<div class="muted">문서에서 커서를 놓은 뒤 누르세요.</div>
        <div class="row" style="flex-wrap:wrap"><button class="btn grow" data-act="mkOpen">여기를 개의 위치로</button><button class="btn grow" data-act="mkClose">여기를 산회 위치로</button></div>
        <div class="row"><select id="k-type" style="width:90px">${TYPES.map(t => `<option>${t}</option>`).join('')}</select><input type="text" id="k-title" class="grow" placeholder="안건 이름"></div><button class="btn block" data-act="mkAg">여기를 안건 위치로</button>
        <div style="margin-top:8px">${MK.length ? MK.map(m => `<div class="ag"><div class="t">${m.kind === 'agenda' ? `<span class="tag">[${esc(m.type)}]</span> ${esc(m.title)}` : esc(m.label)}${m.extra ? ' <small>(추가)</small>' : ''}</div><button class="btn s" data-act="goto" data-a="${esc(m.key)}">이동</button><button class="btn s bad" data-act="rmMark" data-a="${esc(m.key)}">×</button></div>`).join('') : '<div class="muted">아직 속기 위치가 없습니다.</div>'}</div>`);
}
const newKey = () => 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const autoTitle = (t, on) => { t = t.trim(); return on && t && !/(의\s*건|건)$/.test(t) ? t + '의 건' : t; };
function agBlocks(type, title, by, desc, refs, note) {
    const rows = [];
    if (by) rows.push(['발의자', by]);
    if (desc) rows.push(['요지', desc]);
    if (refs.length) rows.push(['관련 회칙', refs.map(k => { const a = byKey.get(k); return a ? `${artName(a)}【${a.title}】` : ''; }).filter(Boolean).join('\n')]);
    if (note) rows.push(['비고', note]);
    const out = [{ t: 'h', x: `[${type}] ${title}` }];
    if (rows.length) out.push({ t: 'kv', rows });
    refs.forEach(k => { const a = byKey.get(k); if (a) out.push(...ruleBlocks(a)); });
    out.push({ t: 'marker', key: newKey(), kind: 'agenda', type, title, label: `${type} · ${title}` });
    return out;
}
Object.assign(ACT, {
    art: k => { if (openArt.has(k)) openArt.delete(k); else openArt.add(k); renderRules(); },
    insRule: k => { const a = byKey.get(k); if (a) insertDoc(ruleBlocks(a), `${artName(a)}를 문서에 넣었습니다.`); },
    pickRef: k => { if (!AGREFS.includes(k)) AGREFS.push(k); renderRefs(); },
    unref: k => { AGREFS = AGREFS.filter(x => x !== k); renderRefs(); },
    insMeet: () => {
        const name = $('a-name').value.trim() || '학부운영위원회 회의', rows = [['일시', $('a-when').value.trim()], ['장소', $('a-place').value.trim()], ['소집자', $('a-by').value.trim()]].filter(r => r[1]);
        C.name = name; if ($('a-place').value.trim()) C.place = $('a-place').value.trim(); saveCfg();
        const bl = [{ t: 'title', x: name }]; if (rows.length) bl.push({ t: 'kv', rows });
        if (!hasMark('open')) bl.push({ t: 'marker', key: 'open', kind: 'open', label: '개의·회의 기록' });
        insertDoc(bl, '회의 개요를 넣었습니다.');
    },
    insNotice: () => {
        const name = $('a-name').value.trim() || '학부운영위원회 회의', rows = [['일시', $('a-when').value.trim()], ['장소', $('a-place').value.trim()]].filter(r => r[1]);
        const ags = MK.filter(m => m.kind === 'agenda' && !m.extra);
        const bl = [{ t: 'title', x: `${name} 소집 공고` }, { t: 'p', x: `${name}를 아래와 같이 소집하오니 위원 여러분의 참석을 바랍니다.` }];
        if (rows.length) bl.push({ t: 'kv', rows });
        bl.push({ t: 'h', x: '안건' });
        if (ags.length) ags.forEach(m => bl.push({ t: 'li', x: `[${m.type}] ${m.title}` })); else bl.push({ t: 'note', x: '(안건을 먼저 문서에 넣으면 이곳에 목록으로 들어갑니다.)' });
        bl.push({ t: 'note', x: '※ 부득이하게 참석하기 어려운 경우 미리 알려 주시기 바랍니다.' });
        if ($('a-by').value.trim()) bl.push({ t: 'p', x: `${koDate()}\n${$('a-by').value.trim()}` });
        insertDoc(bl, '소집 공고문을 넣었습니다.');
    },
    insAg: () => {
        const title = autoTitle($('g-title').value, $('g-auto').checked); if (!title) { toast('안건 이름을 적어 주세요.'); return; }
        insertDoc(agBlocks($('g-type').value, title, $('g-by').value.trim(), $('g-desc').value.trim(), AGREFS.slice(), $('g-note').value.trim()), '안건과 속기 위치를 넣었습니다.');
        $('g-title').value = ''; $('g-desc').value = ''; $('g-note').value = ''; AGREFS = []; renderRefs();
    },
    insBulk: () => {
        const dt = $('b-type').value, bl = [];
        $('b-text').value.split('\n').map(l => l.trim()).filter(Boolean).forEach(l => {
            const p = l.split('|').map(x => x.trim()); let type = dt, title, by = '';
            if (p.length >= 2 && TYPES.includes(p[0])) { type = p[0]; title = p[1]; by = p[2] || ''; } else { title = p[0]; by = p[1] || ''; }
            bl.push(...agBlocks(type, autoTitle(title, true), by, '', [], ''));
        });
        if (!bl.length) { toast('안건을 한 줄에 하나씩 적어 주세요.'); return; }
        insertDoc(bl, '안건들을 넣었습니다.'); $('b-text').value = '';
    },
    mkOpen: () => markDoc({ key: 'open', kind: 'open', label: '개의·회의 기록' }),
    mkClose: () => markDoc({ key: 'close', kind: 'close', label: '산회 요약' }),
    mkAg: () => { const t = $('k-title').value.trim(); if (!t) { toast('안건 이름을 적어 주세요.'); return; } markDoc({ key: newKey(), kind: 'agenda', type: $('k-type').value, title: t, label: `${$('k-type').value} · ${t}` }).then(() => { $('k-title').value = ''; }); },
    rmMark: async k => { MK = await gs('removeMarker', k); syncAgendas(); renderAll(); renderMarks(); }
});
async function markDoc(info) {
    try { MK = await gs('markHere', info); syncAgendas(); renderMarks(); renderAll(); toast('속기 위치를 지정했습니다.'); }
    catch (e) { toast(e.message); }
}
document.addEventListener('input', debounce(e => {
    if (e.target.id !== 'g-rq') return;
    const { arts } = searchRules(e.target.value, '');
    $('g-rres').innerHTML = e.target.value.trim() ? arts.slice(0, 6).map(a => artHTML(a, '', false, 'pick')).join('') || '<div class="muted">결과 없음</div>' : '';
}, 150));
// 안건지 탭의 표식 목록은 표식이 바뀔 때마다 갱신
const _renderAll = renderAll;
renderAll = function () { _renderAll(); if (tab === 'write' && $('w-mark')) renderMarks(); };
