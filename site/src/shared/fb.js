/** Firebase 불러오기 · 공용 도우미 (홈·참관 화면용). 속기 앱 본체는 자체 로더를 씀 */
import { firebaseConfig } from './firebase-config.js';

export const COMMITTEE_EMAIL = 'kusis.midnight@gmail.com';
const FB = 'https://www.gstatic.com/firebasejs/10.12.2/firebase-';
let p = null;
const loadScript = src => new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error('load failed')); document.head.appendChild(s); });
export function loadFirebase() {
    if (!p) p = (async () => {
        for (const n of ['app', 'auth', 'database']) await loadScript(`${FB}${n}-compat.js`);
        if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
        return firebase;
    })().catch(e => { p = null; throw e; });
    return p;
}
export const timeout = (pr, ms) => Promise.race([pr, new Promise((_, no) => setTimeout(() => no(new Error('timeout')), ms))]);
export const isCommittee = u => !!(u && !u.isAnonymous && u.email && u.email.toLowerCase() === COMMITTEE_EMAIL);
export const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
