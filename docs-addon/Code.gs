/**
 * 학부운영위원회 속기 — 구글 독스 부가 기능 (문서에 연결된 Apps Script)
 *
 * 독스 문서 안의 '속기 위치'(표식)에 위원들의 발언·진행 기록을 써 넣습니다.
 * 화면(사이드바)은 Sidebar.html, 위원 휴대폰 화면·실시간 연결은 Firebase 가 맡습니다.
 * 설치: docs-addon/설치.md
 */

var FONT = 'Noto Sans KR';
var COL = { primary: '#8B0029', soft: '#F8EEF1', ink: '#1C1917', mute: '#78716C', line: '#E7E5E4', mark: '#A8A29E' };
var MARK_PREFIX = 'sg|';

/* ---------- 메뉴 · 사이드바 ---------- */

function onOpen() {
  DocumentApp.getUi().createMenu('속기').addItem('사이드바 열기', 'showSidebar').addToUi();
}
function onInstall() { onOpen(); }

function showSidebar() {
  var out = HtmlService.createHtmlOutputFromFile('Sidebar').setTitle('속기');
  DocumentApp.getUi().showSidebar(out);
}

/* ---------- 설정 · 상태 (문서 속성에 저장) ---------- */

function props_() { return PropertiesService.getDocumentProperties(); }

function docInfo() {
  var d = DocumentApp.getActiveDocument();
  return { id: d.getId(), name: d.getName(), url: d.getUrl() };
}
function getConfig() { return props_().getProperty('cfg') || '{}'; }
function saveConfig(json) { props_().setProperty('cfg', String(json).slice(0, 8000)); return true; }

/** 회의 진행 상태: 한 값이 9KB 를 넘을 수 없어 나눠 저장 */
function loadState() {
  var p = props_(), n = Number(p.getProperty('st_n')) || 0, s = '';
  for (var i = 0; i < n; i++) s += p.getProperty('st_' + i) || '';
  return s;
}
function saveState(json) {
  var p = props_(), s = String(json || ''), size = 8000, n = Math.ceil(s.length / size), old = Number(p.getProperty('st_n')) || 0, i;
  for (i = 0; i < n; i++) p.setProperty('st_' + i, s.slice(i * size, (i + 1) * size));
  for (i = n; i < old; i++) p.deleteProperty('st_' + i);
  p.setProperty('st_n', String(n));
  return true;
}
function clearState() { saveState(''); return true; }

/* ---------- 속기 위치(표식) ---------- */

function meta_() { try { return JSON.parse(props_().getProperty('mk') || '{}'); } catch (e) { return {}; } }
function saveMeta_(m) { props_().setProperty('mk', JSON.stringify(m)); }

function markerParagraph_(doc, key) {
  var rs = doc.getNamedRanges(MARK_PREFIX + key);
  for (var i = 0; i < rs.length; i++) {
    var els = rs[i].getRange().getRangeElements();
    if (els.length) {
      var el = els[0].getElement();
      if (el.getType() === DocumentApp.ElementType.PARAGRAPH) return el.asParagraph();
    }
  }
  return null;
}
function topChild_(el) {
  while (el && el.getParent() && el.getParent().getType() !== DocumentApp.ElementType.BODY_SECTION) el = el.getParent();
  return el;
}
function markerIndex_(body, p) { return body.getChildIndex(topChild_(p)); }

/** 지금 커서(또는 선택) 바로 다음 위치. 커서가 없으면 null */
function cursorIndex_(doc, body) {
  var el = null, c = doc.getCursor();
  if (c) el = c.getElement();
  else {
    var sel = doc.getSelection();
    if (sel) { var els = sel.getRangeElements(); if (els.length) el = els[els.length - 1].getElement(); }
  }
  if (!el) return null;
  el = topChild_(el);
  try { return body.getChildIndex(el) + 1; } catch (e) { return null; }
}

function labelOfKey_(key, m) {
  if (key === 'open') return '개의·회의 기록';
  if (key === 'close') return '산회 요약';
  return (m && m.label) || key;
}

function stylePlain_(p, size) {
  p.setHeading(DocumentApp.ParagraphHeading.NORMAL);
  p.setAlignment(DocumentApp.HorizontalAlignment.LEFT);
  p.setLineSpacing(1.5); p.setSpacingBefore(0); p.setSpacingAfter(6); p.setIndentStart(0); p.setIndentFirstLine(0);
  var t = p.editAsText();
  t.setFontFamily(FONT); t.setFontSize(size || 10.5); t.setBold(false); t.setItalic(false); t.setForegroundColor(COL.ink);
  return t;
}

function placeMarker_(doc, body, idx, key, info) {
  var old = markerParagraph_(doc, key);
  if (old) {                                  // 같은 표식은 옮겨 새로 만듦
    var oi = markerIndex_(body, old);
    doc.getNamedRanges(MARK_PREFIX + key).forEach(function (r) { r.remove(); });
    body.removeChild(body.getChild(oi));
    if (oi < idx) idx--;
  }
  var text = '▶ 속기 위치 · ' + labelOfKey_(key, info);
  var p = body.insertParagraph(idx, text);
  var t = stylePlain_(p, 8);
  p.setSpacingAfter(2);
  t.setForegroundColor(COL.mark); t.setItalic(true);
  doc.addNamedRange(MARK_PREFIX + key, doc.newRange().addElement(p).build());
  var m = meta_();
  m[key] = { kind: info.kind || 'agenda', type: info.type || '', title: info.title || '', no: info.no || 0, extra: !!info.extra, label: info.label || labelOfKey_(key, info) };
  saveMeta_(m);
  return idx;
}

/** 회의 중 추가로 상정된 안건의 속기 위치: '산회' 위치 바로 위(없으면 문서 맨 끝)에 만듦 */
function addExtraMarker(info) {
  var doc = DocumentApp.getActiveDocument(), body = doc.getBody(), close = markerParagraph_(doc, 'close');
  var idx = close ? markerIndex_(body, close) : body.getNumChildren();
  if (!info || !info.key) throw new Error('위치 이름이 없습니다.');
  var h = body.insertParagraph(idx, String(info.head || info.label || ''));
  var t = stylePlain_(h, 13); h.setHeading(DocumentApp.ParagraphHeading.HEADING2);
  h.setSpacingBefore(18); h.setSpacingAfter(8); t.setBold(true); t.setForegroundColor(COL.primary);
  placeMarker_(doc, body, idx + 1, info.key, info);
  return listMarkers();
}

/** 지금 커서 위치에 속기 위치를 지정 */
function markHere(info) {
  var doc = DocumentApp.getActiveDocument(), body = doc.getBody();
  var idx = cursorIndex_(doc, body);
  if (idx === null) throw new Error('문서에서 속기를 쓸 위치를 먼저 클릭해 주세요.');
  if (!info || !info.key) throw new Error('위치 이름이 없습니다.');
  placeMarker_(doc, body, idx, info.key, info);
  return listMarkers();
}

function listMarkers() {
  var doc = DocumentApp.getActiveDocument(), body = doc.getBody(), m = meta_(), out = [], dirty = false;
  Object.keys(m).forEach(function (key) {
    var p = markerParagraph_(doc, key);
    if (!p) { delete m[key]; dirty = true; return; }   // 문서에서 지워진 표식
    out.push({ key: key, kind: m[key].kind, type: m[key].type, title: m[key].title, no: m[key].no, extra: !!m[key].extra, label: m[key].label, index: markerIndex_(body, p) });
  });
  if (dirty) saveMeta_(m);
  out.sort(function (a, b) { return a.index - b.index; });
  return out;
}

function gotoMarker(key) {
  var doc = DocumentApp.getActiveDocument(), p = markerParagraph_(doc, key);
  if (!p) return false;
  doc.setCursor(doc.newPosition(p, 0));
  return true;
}

function removeMarker(key) {
  var doc = DocumentApp.getActiveDocument(), body = doc.getBody(), p = markerParagraph_(doc, key);
  if (p) {
    var i = markerIndex_(body, p);
    doc.getNamedRanges(MARK_PREFIX + key).forEach(function (r) { r.remove(); });
    body.removeChild(body.getChild(i));
  }
  var m = meta_(); delete m[key]; saveMeta_(m);
  return listMarkers();
}

/** 모든 표식 줄을 문서에서 지움 (회의가 끝난 뒤 깔끔하게) */
function cleanMarkers() {
  var doc = DocumentApp.getActiveDocument(), body = doc.getBody(), keys = Object.keys(meta_()), n = 0;
  keys.forEach(function (key) {
    var p = markerParagraph_(doc, key);
    if (p) { doc.getNamedRanges(MARK_PREFIX + key).forEach(function (r) { r.remove(); }); try { body.removeChild(body.getChild(markerIndex_(body, p))); n++; } catch (e) { /* 이미 지워짐 */ } }
  });
  saveMeta_({});
  return n;
}

/* ---------- 위치에 기록 쓰기 ---------- */

/**
 * key 표식 '바로 위'에 항목을 차례로 씀. items: { t: 'msg'|'note'|'step'|'head'|'kv'|'result', ... }
 * 표식이 없으면 문서 맨 끝에 쓰고 warn 을 돌려줌
 */
function write(key, items) {
  var doc = DocumentApp.getActiveDocument(), body = doc.getBody(), p = markerParagraph_(doc, key), warn = '';
  var idx = p ? markerIndex_(body, p) : body.getNumChildren();
  if (!p) warn = '속기 위치 "' + key + '"를 찾지 못해 문서 맨 끝에 썼습니다.';
  (items || []).forEach(function (it) { idx = writeItem_(body, idx, it); });
  return { ok: true, warn: warn, n: (items || []).length };
}

function writeItem_(body, idx, b) {
  var x = String(b.x == null ? '' : b.x), p, t;
  switch (b.t) {
    case 'msg':
      p = body.insertParagraph(idx, (b.s ? b.s + ': ' : '') + x); t = stylePlain_(p, 10.5); p.setSpacingAfter(8);
      if (b.s) { var n = String(b.s).length + 1; t.setBold(0, n - 1, true); t.setForegroundColor(0, n - 1, COL.primary); }
      return idx + 1;
    case 'note':
      p = body.insertParagraph(idx, '[ ' + x + ' ]'); t = stylePlain_(p, 9.5);
      p.setAlignment(DocumentApp.HorizontalAlignment.CENTER); p.setSpacingBefore(6); p.setSpacingAfter(10); t.setForegroundColor(COL.mute);
      return idx + 1;
    case 'step':
      p = body.insertParagraph(idx, x); t = stylePlain_(p, 10.5); p.setSpacingBefore(12); p.setSpacingAfter(6); t.setBold(true);
      return idx + 1;
    case 'head':
      p = body.insertParagraph(idx, x); t = stylePlain_(p, 13); p.setHeading(DocumentApp.ParagraphHeading.HEADING2);
      p.setSpacingBefore(18); p.setSpacingAfter(8); t.setBold(true); t.setForegroundColor(COL.primary);
      return idx + 1;
    case 'kv':
      return insertKv_(body, idx, b.rows || []);
    case 'result':
      p = body.insertParagraph(idx, x); t = stylePlain_(p, 10.5); p.setSpacingAfter(4); t.setBold(true);
      if (b.verdict) { var s = x.indexOf('=>'); if (s >= 0) t.setForegroundColor(s, x.length - 1, b.pass ? '#2F6F4F' : '#B42318'); }
      return idx + 1;
    default:
      p = body.insertParagraph(idx, x); stylePlain_(p, 10.5);
      return idx + 1;
  }
}

function insertKv_(body, idx, rows) {
  if (!rows.length) return idx;
  var data = rows.map(function (r) { return [String(r[0] == null ? '' : r[0]), String(r[1] == null ? '' : r[1])]; });
  var tb = body.insertTable(idx, data);
  tb.setBorderWidth(0.5); tb.setBorderColor(COL.line); tb.setColumnWidth(0, 78);
  for (var i = 0; i < data.length; i++) {
    for (var j = 0; j < 2; j++) {
      var c = tb.getRow(i).getCell(j);
      c.setPaddingTop(5).setPaddingBottom(5).setPaddingLeft(8).setPaddingRight(8);
      var t = c.editAsText(); t.setFontFamily(FONT); t.setFontSize(10);
      if (j === 0) { c.setBackgroundColor(COL.soft); t.setBold(true); t.setForegroundColor(COL.primary); } else { t.setBold(false); t.setForegroundColor(COL.ink); }
    }
  }
  var gap = body.insertParagraph(idx + 1, ''); gap.setSpacingAfter(2); gap.editAsText().setFontSize(4);
  return idx + 2;
}

/* ---------- 안건지 쓰기 도우미 (커서 위치에 양식 삽입) ---------- */

/**
 * blocks: { t: 'title'|'h'|'p'|'note'|'li'|'kv'|'marker', ... } 를 커서 다음 위치에 차례로 삽입
 * 'marker' 는 { key, kind, type, title, no, extra, label } — 삽입 위치에 속기 위치를 만듦
 */
function insertBlocks(blocks) {
  var doc = DocumentApp.getActiveDocument(), body = doc.getBody();
  var idx = cursorIndex_(doc, body), where = 'cursor';
  if (idx === null) { idx = body.getNumChildren(); where = 'end'; }
  (blocks || []).forEach(function (b) {
    var p, t;
    switch (b.t) {
      case 'title':
        p = body.insertParagraph(idx, String(b.x)); t = stylePlain_(p, 20); p.setHeading(DocumentApp.ParagraphHeading.HEADING1);
        p.setAlignment(DocumentApp.HorizontalAlignment.CENTER); p.setSpacingBefore(6); p.setSpacingAfter(14); t.setBold(true); t.setForegroundColor(COL.primary); idx++; break;
      case 'h':
        p = body.insertParagraph(idx, String(b.x)); t = stylePlain_(p, 13); p.setHeading(DocumentApp.ParagraphHeading.HEADING2);
        p.setSpacingBefore(20); p.setSpacingAfter(8); t.setBold(true); t.setForegroundColor(COL.primary); idx++; break;
      case 'note':
        p = body.insertParagraph(idx, String(b.x)); t = stylePlain_(p, 9.5); p.setSpacingAfter(8); t.setForegroundColor(COL.mute); idx++; break;
      case 'li':
        p = body.insertListItem(idx, String(b.x)); p.editAsText().setFontFamily(FONT); p.editAsText().setFontSize(10.5); idx++; break;
      case 'kv':
        idx = insertKv_(body, idx, b.rows || []); break;
      case 'rule':
        p = body.insertParagraph(idx, String(b.x)); t = stylePlain_(p, 10); p.setIndentStart(14); p.setSpacingAfter(3); t.setForegroundColor(COL.mute);
        if (b.bold) { t.setBold(0, Math.min(String(b.x).length, Number(b.bold)) - 1, true); t.setForegroundColor(0, Math.min(String(b.x).length, Number(b.bold)) - 1, COL.primary); }
        idx++; break;
      case 'marker':
        idx = placeMarker_(doc, body, idx, b.key, b) + 1; break;
      default:
        p = body.insertParagraph(idx, String(b.x == null ? '' : b.x)); stylePlain_(p, 10.5); idx++;
    }
  });
  return { where: where, markers: listMarkers() };
}

/** 현재 문서 안의 안건지 글을 읽어 서식에 맞게 고침 (모든 문단 글꼴 통일) */
function normalizeFont() {
  var body = DocumentApp.getActiveDocument().getBody();
  body.editAsText().setFontFamily(FONT);
  return true;
}
