# 무탈이

내가 정해둔, 나를 위한 잔소리 — 요일·시각 규칙에 맞춰 알림(웹푸시)을 보내주는 PWA입니다.
AI(Gemini)가 페르소나·말투에 맞는 문구를 만들어주고, "오늘의 교양" 한 줄도 챙겨줍니다.

- 배포 주소: https://mutalee.pages.dev
- 구성: Cloudflare Pages(정적 + Functions) + 별도 cron Worker + KV

## 폴더 지도

| 폴더 | 하는 일 |
|---|---|
| `public/` | 브라우저에 배포되는 클라이언트 전체. `index.html`은 `app.js` 하나만 부르고, `app.js`가 나머지를 `import` 한다 |
| `functions/api/` | Pages Functions 서버 코드. Gemini 키·KV는 서버에만 둔다 |
| `worker/` | 별도 배포되는 cron Worker (1분마다 웹푸시 발송) |
| `_notes/` | 작업 요청 프롬프트 기록 (배포 안 됨) |

## 파일 지도

기능(노티/교양/알림)마다 `core`(순수 로직) · `store`(저장/서버 요청) · `ui`(화면) 로 나눕니다.

| 파일 | 하는 일 | export |
|---|---|---|
| `public/app.js` | 화면 연결만 담당하는 진입점. 상태를 들고 각 기능을 조립한다 | — |
| `public/reminders/core.js` | 순수 함수: 오늘/지금 도래한 노티 계산, 문구 템플릿 | `getTodaysReminders`, `getDueReminders`, `renderMessage` |
| `public/reminders/store.js` | 규칙·프로필 localStorage + AI 문구 생성 요청 | `loadRules`, `addRule`, `generateMessage` 등 |
| `public/reminders/ui.js` | 노티 목록·추가/수정 폼·전체 문구 모달 | `renderReminderList`, `renderRuleForm`, `openMessageModal` |
| `public/culture/core.js` | 순수 함수: 날짜 기반 결정론적 "오늘의 교양" 선택 | `pickDaily` |
| `public/culture/store.js` | 새로고침 문구 하루 유지 + AI 교양 문구 생성 요청 | `loadCultureOverride`, `saveCultureOverride`, `generateCulture` |
| `public/culture/ui.js` | 교양 카드 화면 | `renderCultureCard` |
| `public/notify/notify.js` | 알림 권한·앱 내 스위치·포그라운드 알림·웹푸시 구독 | `checkAndNotify`, `subscribe`, `syncToServer` 등 |
| `public/notify/ui.js` | 알림 상태 배너 (켜기/끄기 버튼) | `renderNoticeBanner` |
| `public/sw.js` | 서비스워커: 오프라인 캐시(네트워크 우선) + 백그라운드 푸시 표시 | — |
| `public/data/*.json` | 카테고리·페르소나·교양 카탈로그·기본 규칙·VAPID 공개키 | — |
| `functions/api/generate-message.js` | 메모+페르소나+톤 → Gemini 알림 문구 | `onRequestPost` |
| `functions/api/generate-culture.js` | 메모들 참고 → Gemini 교양 문구 | `onRequestPost` |
| `functions/api/sync.js` | 구독+규칙+프로필을 KV에 저장 (deviceId 기준) | `onRequestPost` |
| `functions/api/unsubscribe.js` | 구독을 KV에서 삭제 | `onRequestPost` |
| `worker/cron.js` | 1분마다 KV의 구독을 훑어 도래한 노티를 웹푸시 발송. `public/reminders/core.js`를 그대로 재사용 | — |

## 배포

git push만으로는 배포되지 않습니다 (직접 업로드 방식).

```bash
# 프론트 + Functions (리포 루트에서)
npx wrangler pages deploy

# cron Worker 변경 시 (별도 배포)
cd worker && npx wrangler deploy
```

배포 후 `curl https://mutalee.pages.dev/sw.js | head -1`로 `CACHE_NAME` 버전이 올라갔는지 확인하세요.
`public/`에 파일을 새로 만들면 `public/sw.js`의 `ASSETS` 목록에 추가하고 `CACHE_NAME` 버전을 올려야 합니다.

## 시크릿

| 이름 | 어디에 | 용도 |
|---|---|---|
| `GEMINI_API_KEY` | Pages 프로젝트 환경 변수 | AI 문구 생성 |
| `VAPID_PRIVATE_KEY` | cron Worker 시크릿 | 웹푸시 서명 (공개키는 `public/data/push-config.json`) |
