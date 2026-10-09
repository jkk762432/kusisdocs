/** 첫 화면: 위원 / 참관인 */
import { loadFirebase, timeout } from '../shared/fb.js';
import { setupPwa } from '../shared/pwa.js';
setupPwa();

const $ = id => document.getElementById(id);
const show = id => { ['s-role', 's-observer'].forEach(s => { $(s).hidden = s !== id; }); window.scrollTo(0, 0); };
document.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', () => show('s-role')));
document.querySelectorAll('[data-role]').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.role === 'member') location.href = '/view/?role=member'; else show('s-observer');
}));

// 진행 중인 회의 표시 (+ 회의록 문서 링크)
(async () => {
    try {
        const fb = await timeout(loadFirebase(), 20000);
        fb.database().ref('rooms/live').on('value', s => {
            const v = s.val(), chip = $('live-chip'), doc = $('c-doc');
            if (!v || !v.online) { chip.hidden = true; doc.hidden = true; return; }
            const name = v.view && v.view.meetingName;
            chip.textContent = `● 진행 중${name ? ' · ' + name : ''}`;
            chip.hidden = false;
            const url = v.view && v.view.docUrl;
            if (/^https:\/\/docs\.google\.com\//.test(url || '')) { doc.href = url; doc.target = '_blank'; doc.rel = 'noopener'; doc.hidden = false; } else doc.hidden = true;
        }, () => {});
    } catch (e) { /* 오프라인: 선택 화면은 그대로 사용 */ }
})();
