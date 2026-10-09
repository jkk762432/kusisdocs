# 학부운영위원회 속기 (구글 독스 기반)

구글 독스 문서 한 개가 회의록입니다. 독스 사이드바에서 회의를 진행하면 위원들이 자기 기기로 발언하고, 그 말이 안건별 위치에 `이름: 발언` 으로 쓰입니다.

```
gakbu-docs/
  site/            위원·참관인이 여는 웹사이트 (GitHub → Cloudflare Pages)
  docs-addon/      독스에 붙이는 부가기능 (Code.gs, Sidebar.html, appsscript.json)
  firebase-rules.json   Realtime Database 규칙
```

## 처음부터 설치 (순서대로, 한 번만)

### 1) Firebase 프로젝트
1. https://console.firebase.google.com → 프로젝트 추가
2. **Authentication → 시작하기 → 이메일/비밀번호 사용 설정**, 사용자 추가: 위원회 계정(예: `kusis.midnight@gmail.com`) + 비밀번호
3. **Realtime Database → 데이터베이스 만들기** (위치 asia-southeast1, 잠금 모드) → **규칙** 탭에 `firebase-rules.json` 의 내용을 붙여 넣고 **게시**
4. 프로젝트 설정 → 내 앱 → 웹 앱(</>) 추가 → 나오는 `firebaseConfig` 값을 `site/src/shared/firebase-config.js` 에 붙여 넣기
5. (위원회 계정 이메일을 바꿨다면) `site/src/shared/fb.js` 의 `COMMITTEE_EMAIL` 과 `firebase-rules.json` 안의 이메일도 같은 값으로

### 2) 웹사이트 올리기
1. 이 폴더를 GitHub 저장소에 올리기
2. Cloudflare → Workers & Pages → Pages → Git 연결 → Framework **None**, Build command 비움, Output directory **`site`**
3. 배포되면 나오는 주소(예: `https://○○.pages.dev`)가 **위원 접속 주소**

### 3) 독스 부가기능
`docs-addon/설치.md` 를 따라 하세요 (Code.gs · appsscript.json · Sidebar.html 붙여 넣기, 약 5분).
설정 탭에서 위원 접속 주소·위원 명단·위원별 비밀번호를 정하면 끝입니다.

## 회의 하는 법
`docs-addon/설치.md` 의 3~4번 (안건지 쓰기 → 회의실 열기 → 의장 지정 → 개의 → 상정·표결 → 산회).

## 고치는 법
- 회칙 내용: `site/src/shared/rules.js` 수정 → `node docs-addon/build.js` → `Sidebar.html` 을 Apps Script 에 다시 붙여 넣기
- 사이드바 화면·절차: `docs-addon/src/*.js` 수정 → 위와 동일
- 사이트 파일을 바꿨다면 `site/sw.js` 의 `VERSION` 을 올려 주세요.
