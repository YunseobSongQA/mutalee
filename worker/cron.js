// 별도 배포되는 Worker: Durable Object 알람으로 노티를 도래 시각 정각에 웹푸시 발송한다.
//
// 예전 구조(1분 크론 + KV 폴링)에는 지연 요인이 둘 있었다:
//   ① Cloudflare 크론은 정각이 아니라 워커별 오프셋(이 워커는 매분 31초경)에 깨어난다
//   ② KV는 최종 일관성이라 방금 저장한 알람이 다른 지역의 크론 눈에 최대 60초 늦게 보였다
// Durable Object는 강한 일관성 저장소 + 초 단위 정밀 알람(setAlarm)을 제공해서 둘 다 사라진다.
// 이제 /api/sync가 이 Worker를 거쳐 DO에 저장하는 즉시 다음 도래 시각으로 알람이 걸리고,
// 알람이 그 시각 정각에 깨어나 발송한다. 크론 트리거는 알람 유실 대비 안전망으로만 남긴다.
//
// 푸시 라이브러리는 web-push-neo — aes128gcm(RFC 8188)만 지원해 iOS Safari와 호환된다.
// (@pushforge/builder는 구식 aesgcm만 지원해 iOS에서 조용히 안 떴었음)
import { DurableObject } from 'cloudflare:workers';
import { sendNotification } from 'web-push-neo';
import { getDueReminders, renderMessage } from '../reminders.js';
import personas from '../data/personas.json';
import pushConfig from '../data/push-config.json';

const APP_URL = 'https://mutalee.pages.dev';
const RETRY_MS = 30 * 1000; // 일시 실패(네트워크 등) 시 재시도 간격

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

// timeZone의 로컬 시각과 UTC의 차이(ms). DST 없는 Asia/Seoul 기준으론 상수지만 일반형으로 계산.
function tzOffsetMs(timeZone, at) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const m = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const asUTC = Date.UTC(+m.year, +m.month - 1, +m.day, +m.hour, +m.minute, +m.second);
  return asUTC - at.getTime();
}

// 이 규칙이 다음에 도래하는 UTC 타임스탬프(ms). 앞으로 7일 안에 없으면 null.
function nextOccurrence(rule, timeZone, fromTs) {
  const [hh, mm] = rule.schedule.time.split(':').map(Number);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  const offset = tzOffsetMs(timeZone, new Date(fromTs));
  const local = new Date(fromTs + offset); // 로컬 시각을 UTC 필드로 갖는 Date
  for (let add = 0; add <= 7; add++) {
    const cand = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + add, hh, mm, 0));
    if (!rule.schedule.days.includes(cand.getUTCDay())) continue;
    const ts = cand.getTime() - offset;
    if (ts > fromTs) return ts;
  }
  return null;
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

export class MutaleeScheduler extends DurableObject {
  // /api/sync → 저장 즉시 다음 도래 시각으로 알람을 건다. notifiedToday는 기존 것을 보존.
  async syncRecord(deviceId, record) {
    const key = `rec:${deviceId}`;
    const existing = await this.ctx.storage.get(key);
    record.notifiedToday =
      (existing && existing.notifiedToday) || record.notifiedToday || { date: '', ids: [] };
    await this.ctx.storage.put(key, record);
    await this.ensureAlarm();
  }

  async removeRecord(deviceId) {
    await this.ctx.storage.delete(`rec:${deviceId}`);
    await this.ensureAlarm();
  }

  // 모든 기기·규칙을 통틀어 가장 이른 다음 도래 시각으로 알람을 설정한다.
  // needRetry: 일시 실패한 발송이 있어 잠시 후 다시 깨어나야 할 때 true.
  async ensureAlarm(needRetry = false) {
    const now = Date.now();
    let next = needRetry ? now + RETRY_MS : null;

    const records = await this.ctx.storage.list({ prefix: 'rec:' });
    for (const record of records.values()) {
      const timezone = record.timezone || 'Asia/Seoul';
      for (const rule of record.rules || []) {
        if (!rule.enabled) continue;
        const ts = nextOccurrence(rule, timezone, now);
        if (ts !== null && (next === null || ts < next)) next = ts;
      }
    }

    if (next !== null) {
      await this.ctx.storage.setAlarm(next);
    } else {
      await this.ctx.storage.deleteAlarm();
    }
  }

  // 도래 시각 정각에 깨어나 발송한다. 크론 안전망(tick)도 같은 경로를 탄다.
  async alarm() {
    console.log(`알람 깨어남: ${new Date().toISOString()}`);
    await this.tick();
  }

  async tick() {
    console.log(`틱 시작: ${new Date().toISOString()}`);
    const records = await this.ctx.storage.list({ prefix: 'rec:' });
    let needRetry = false;

    for (const [key, record] of records) {
      try {
        needRetry = (await this.processRecord(key, record)) || needRetry;
      } catch (err) {
        // 기기 하나가 잘못돼도(깨진 레코드 등) 나머지 처리는 계속되어야 한다.
        console.error(`기기 처리 실패 (${key}):`, err.message);
      }
    }

    await this.ensureAlarm(needRetry);
  }

  // 한 기기의 도래한 노티를 발송. 일시 실패가 남았으면 true(재시도 필요)를 돌려준다.
  async processRecord(key, record) {
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
    let needRetry = false;

    for (const reminder of due) {
      if (notified.ids.includes(reminder.id)) continue;
      try {
        await sendPush(
          this.env,
          record.subscription,
          reminder.title,
          renderMessage(reminder, record.profile || { name: '사용자' }, personas)
        );
        console.log(`발송 완료: ${key} / ${reminder.id} (${reminder.schedule.time}) at ${new Date().toISOString()}`);
        notified.ids.push(reminder.id);
        changed = true;
      } catch (err) {
        const status = err.statusCode || 0;
        // 4xx(429 제외)는 영구 실패다: 404/410은 구독 만료, 400/403은 깨진 구독·서명 불일치.
        // 남겨두면 30초마다 영원히 재시도하므로 레코드를 정리한다. 429/5xx/네트워크만 재시도.
        if (status >= 400 && status < 500 && status !== 429) {
          expired = true;
          console.error(`영구 실패(${status}) → 구독 정리 (${key} / ${reminder.id}):`, err.message);
          break;
        }
        needRetry = true;
        console.error(`푸시 발송 실패 (${key} / ${reminder.id}):`, err.message);
      }
    }

    if (expired) {
      await this.ctx.storage.delete(key);
      console.log(`만료 구독 삭제: ${key}`);
      return false;
    }
    if (changed) {
      record.notifiedToday = notified;
      await this.ctx.storage.put(key, record);
    }
    return needRetry;
  }
}

function schedulerStub(env) {
  return env.SCHEDULER.get(env.SCHEDULER.idFromName('main'));
}

export default {
  // /sync, /unsubscribe: Pages Function(functions/api/*)만 SYNC_TOKEN을 알고 호출한다.
  // 그 외 접속(사용자가 주소를 직접 열었을 때)은 앱으로 리다이렉트.
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'POST' && (url.pathname === '/sync' || url.pathname === '/unsubscribe')) {
      if (request.headers.get('x-sync-token') !== env.SYNC_TOKEN) {
        return new Response('unauthorized', { status: 401 });
      }
      let body;
      try {
        body = await request.json();
      } catch (e) {
        return new Response('Invalid JSON', { status: 400 });
      }
      if (!body.deviceId) return new Response('Missing deviceId', { status: 400 });

      const stub = schedulerStub(env);
      if (url.pathname === '/sync') {
        if (!body.record || !body.record.subscription) return new Response('Missing record', { status: 400 });
        await stub.syncRecord(body.deviceId, body.record);
      } else {
        await stub.removeRecord(body.deviceId);
      }
      return Response.json({ ok: true });
    }
    return Response.redirect(APP_URL, 302);
  },

  // 안전망: DO 알람이 어떤 이유로든 유실돼도 1분 안에 같은 처리 경로(tick)로 복구된다.
  // 발송 자체는 알람이 정각에 이미 했으므로 notifiedToday 덕에 중복은 없다.
  async scheduled(event, env, ctx) {
    await schedulerStub(env).tick();
  },
};
