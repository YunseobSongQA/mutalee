# 무탈이

내가 정해둔, 나를 위한 잔소리 — 요일·시각 규칙에 맞춰 알림(웹푸시)을 보내주는 PWA입니다.
AI(Gemini)가 페르소나·말투에 맞는 문구를 만들어주고, "오늘의 교양" 한 줄도 챙겨줍니다.

- 배포 주소: https://mutalee.pages.dev
- 구성: Cloudflare Pages(정적 + Functions) + 별도 cron Worker + KV

## 파일 지도

클라이언트 파일은 전부 루트에 평탄하게 있고, 기능 코드는 기능당 1파일(`reminders.js`, `culture.js`, `notify.js`)입니다.
`index.html`은 `app.js` 하나만 부르고, `app.js`가 기능 모듈들을 `import` 합니다. 전부 실제로 쓰이는 파일입니다.

| 파일 | 하는 일 | export |
|---|---|---|
| `index.html` | 앱 뼈대. `app.js` 하나만 부른다 | — |
| `app.js` | 화면 연결만 담당하는 진입점. 상태를 들고 각 기능을 조립한다 | — |
| `style.css` | 색·간격 변수 + 동작에 필요한 최소 스타일 (장식은 제거된 상태) | — |
| `styles-backup.css` | 장식 제거 전 원본 스타일 백업. 어디서도 로드하지 않음 (나중에 꾸밀 때 참고) | — |
| `reminders.js` | 노티 기능 전부: 도래 계산·문구 템플릿(순수 로직) + localStorage/AI 요청 + 목록·폼·모달 화면 | `getTodaysReminders`, `loadRules`, `renderReminderList` 등 |
| `culture.js` | 오늘의 교양 전부: 날짜 기반 선택(순수 로직) + 하루 유지/AI 요청 + 카드 화면 | `pickDaily`, `generateCulture`, `renderCultureCard` 등 |
| `notify.js` | 알림 기능 전부: 권한·앱 내 스위치·포그라운드 알림·웹푸시 구독 + 상태 배너 화면 | `checkAndNotify`, `subscribe`, `renderNoticeBanner` 등 |
| `sw.js` | 서비스워커: 오프라인 캐시(네트워크 우선) + 백그라운드 푸시 표시 | — |
| `manifest.json` | PWA 설치 정보 (홈 화면 추가용 이름·아이콘) | — |
| `icons/icon.svg` | 무탈이 마스코트 아이콘 | — |
| `data/*.json` | 카테고리·페르소나·말투 목록·교양 카탈로그·기본 규칙·VAPID 공개키 (클라이언트가 fetch) | — |
| `functions/api/generate-message.js` | 서버: 메모+페르소나+톤 → Gemini 알림 문구 (키는 서버에만) | `onRequestPost` |
| `functions/api/generate-culture.js` | 서버: 메모들 참고 → Gemini 교양 문구 | `onRequestPost` |
| `functions/api/sync.js` | 서버: 구독+규칙+프로필을 KV에 저장 (deviceId 기준) | `onRequestPost` |
| `functions/api/unsubscribe.js` | 서버: 구독을 KV에서 삭제 | `onRequestPost` |
| `worker/cron.js` | 1분마다 KV의 구독을 훑어 도래한 노티를 웹푸시 발송. `reminders.js`의 순수 로직을 재사용 | — |
| `worker/wrangler.toml` | cron Worker 배포 설정 (Pages와 별도 배포라 따로 필요) | — |
| `wrangler.toml` | Pages 배포 설정 + KV 바인딩 | — |
| `package.json`, `package-lock.json` | cron Worker가 쓰는 web-push-neo 의존성 | — |
| `prompt.txt` | 작업 요청 메모 (git에는 안 올라감) | — |

## 배포

git push만으로는 배포되지 않습니다 (직접 업로드 방식).

```bash
# 프론트 + Functions (리포 루트에서)
npx wrangler pages deploy

# cron Worker 변경 시 (별도 배포)
cd worker && npx wrangler deploy
```

배포 후 `curl https://mutalee.pages.dev/sw.js | head -1`로 `CACHE_NAME` 버전이 올라갔는지 확인하세요.
파일을 새로 만들면 `sw.js`의 `ASSETS` 목록에 추가하고 `CACHE_NAME` 버전을 올려야 합니다.

## 시크릿

| 이름 | 어디에 | 용도 |
|---|---|---|
| `GEMINI_API_KEY` | Pages 프로젝트 환경 변수 | AI 문구 생성 |
| `VAPID_PRIVATE_KEY` | cron Worker 시크릿 | 웹푸시 서명 (공개키는 `data/push-config.json`) |
