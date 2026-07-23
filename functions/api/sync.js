// Pages Function: 클라이언트가 보낸 구독+규칙+프로필을 발송 Worker(Durable Object)에 저장한다.
// 기기 식별은 deviceId로 한다 (push endpoint는 iOS에서 자주 바뀌어서 키로 쓰면
// 바뀔 때마다 새 구독이 쌓여 한 기기 앞으로 알림이 중복 발송된다).
//
// 예전엔 KV에 직접 썼지만, KV는 최종 일관성이라 방금 만든 알람이 크론 눈에 최대 60초
// 늦게 보였다. 지금은 Worker의 Durable Object에 저장하는 즉시 도래 시각으로 알람이 걸린다.
// SYNC_TOKEN은 Pages와 Worker 양쪽에 같은 값으로 넣어둔 시크릿 (외부인의 발송 API 호출 차단).

const WORKER_URL = 'https://mutalee-cron.eyelash96.workers.dev';

export async function onRequestPost({ request, env }) {
  let payload;
  try {
    payload = await request.json();
  } catch (e) {
    return new Response('Invalid JSON', { status: 400 });
  }

  const { deviceId, subscription, rules, profile, timezone } = payload;
  if (!deviceId) {
    return new Response('Missing deviceId', { status: 400 });
  }
  if (!subscription || !subscription.endpoint) {
    return new Response('Missing subscription', { status: 400 });
  }

  const record = {
    subscription,
    rules: rules || [],
    profile: profile || { name: '사용자' },
    timezone: timezone || 'Asia/Seoul',
    updatedAt: Date.now(),
  };

  const res = await fetch(`${WORKER_URL}/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-sync-token': env.SYNC_TOKEN },
    body: JSON.stringify({ deviceId, record }),
  });
  if (!res.ok) {
    return new Response('Scheduler error', { status: 502 });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
