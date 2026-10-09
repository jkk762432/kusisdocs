/**
 * PWA: 서비스 워커 등록(오프라인 실행) + [앱 설치] 버튼.
 * 새 버전은 온라인이면 다음에 열 때 자동으로 반영됩니다 (sw.js 참고).
 */
export function setupPwa() {
    const local = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || local)) {
        window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(err => console.warn('서비스 워커 등록 실패', err)));
    }
    const btn = document.getElementById('install-btn');
    if (!btn) return;
    let deferred = null;
    window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; btn.hidden = false; });
    window.addEventListener('appinstalled', () => { deferred = null; btn.hidden = true; });
    btn.addEventListener('click', async () => {
        if (!deferred) return;
        deferred.prompt();
        try { await deferred.userChoice; } catch (e) { /* 무시 */ }
        deferred = null; btn.hidden = true;
    });
}
