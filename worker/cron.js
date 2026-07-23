// 별도 배포되는 Worker: 1분마다 KV를 훑어 도래한 노티를 실제 웹푸시로 발송한다.
// Phase1의 순수 함수를 그대로 재사용한다 (경계를 지켜둔 덕분에 코드 변경 없이 재사용 가능).
//
// 처음엔 @pushforge/builder를 썼는데, 이 라이브러리는 구식 암호화 방식(aesgcm, 2016년 초안)만
// 지원해서 iOS Safari(aes128gcm, RFC 8188만 지원)에서 푸시가 조용히 안 뜨는 문제가 있었다.
// web-push-neo로 교체 — aes128gcm만 지원하고 Safari 16+ 포함 모든 최신 브라우저와 호환된다.
import { sendNotification } from 'web-push-neo';
import { getDueReminders, renderMessage } from '../reminders.js';
import personas from '../data/personas.json';
import pushConfig from '../data/push-config.json';

function zonedNow(timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const weekdayIdx = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(map.weekday);
  return {
    getDay: () => weekdayIdx,
    getHours: () => Number(map.hour),
    getMinutes: () => Number(map.minute),
  };
}

function dateSeedFor(timeZone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
}

async function sendPush(env, subscription, title, body) {
  const vapidKeys = JSON.parse(env.VAPID_PRIVATE_KEY); // 기존 JWK를 그대로 재사용 (d = raw 32바이트 개인키)
  return sendNotification(subscription, JSON.stringify({ title, body }), {
    vapidDetails: {
      subject: env.VAPID_SUBJECT || 'mailto:dwa3432@gmail.com',
      publicKey: pushConfig.vapidPublicKey,
      privateKey: vapidKeys.d,
    },
    urgency: 'high',
  });
}

// KV list()는 무료 한도가 하루 1,000회라 매분 크론(1,440회)이면 초과한다.
// 대신 살아있는 구독 키 이름 배열을 'sub-index' 키 하나에 저장해두고 get으로 읽는다.
// 동시 갱신은 last-write-wins지만 이 규모에선 충분하다.
const INDEX_KEY = 'sub-index';

async function readSubIndex(env) {
  try {
    const raw = await env.MUTALEE_KV.get(INDEX_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

async function removeFromSubIndex(env, keyName) {
  const index = await readSubIndex(env);
  if (!index.includes(keyName)) return;
  await env.MUTALEE_KV.put(INDEX_KEY, JSON.stringify(index.filter((k) => k !== keyName)));
}

async function processSubscriber(env, keyName) {
  const raw = await env.MUTALEE_KV.get(keyName);
  if (!raw) return;
  const record = JSON.parse(raw);
  const timezone = record.timezone || 'Asia/Seoul';
  const now = zonedNow(timezone);
  const dateSeed = dateSeedFor(timezone);
  const notified =
    record.notifiedToday && record.notifiedToday.date === dateSeed
      ? record.notifiedToday
      : { date: dateSeed, ids: [] };

  const due = getDueReminders(record.rules || [], now);
  let expired = false;
  let changed = false;

  for (const reminder of due) {
    if (notified.ids.includes(reminder.id)) continue;
    try {
      await sendPush(
        env,
        record.subscription,
        reminder.title,
        renderMessage(reminder, record.profile || { name: '사용자' }, personas)
      );
      notified.ids.push(reminder.id);
      changed = true;
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        expired = true;
        break;
      }
      // 그 외 실패는 이 노티만 건너뛰고 다음 분에 재시도 (notified에 안 넣었으니 due로 계속 잡힘)
      console.error(`푸시 발송 실패 (${keyName} / ${reminder.id}):`, err.message);
    }
  }

  if (expired) {
    await env.MUTALEE_KV.delete(keyName);
    await removeFromSubIndex(env, keyName);
  } else if (changed) {
    record.notifiedToday = notified;
    await env.MUTALEE_KV.put(keyName, JSON.stringify(record));
  }
}

export default {
  // 이 Worker는 크론 전용이라 원래 HTTP 처리가 없다. 주소로 직접 접속하면
  // (Error 1101이 나는 대신) 실제 앱으로 보내준다.
  async fetch() {
    return Response.redirect('https://mutalee.pages.dev', 302);
  },

  async scheduled(event, env, ctx) {
    const keyNames = await readSubIndex(env);

    for (const keyName of keyNames) {
      try {
        await processSubscriber(env, keyName);
      } catch (err) {
        // 구독 하나가 잘못돼도(깨진 키, 인코딩 오류 등) 나머지 구독자 처리는 계속되어야 한다.
        console.error(`구독 처리 실패 (${keyName}):`, err.message);
      }
    }
  },
};
