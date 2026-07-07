// Pages Function: 클라이언트가 보낸 구독+규칙+프로필을 KV에 저장한다.
// 기기 식별은 deviceId로 한다 (push endpoint는 iOS에서 자주 바뀌어서 키로 쓰면
// 바뀔 때마다 새 구독이 쌓여 한 기기 앞으로 알림이 중복 발송된다).

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

  const key = `sub:${deviceId}`;
  const existingRaw = await env.MUTALEE_KV.get(key);
  const existing = existingRaw ? JSON.parse(existingRaw) : {};

  const record = {
    subscription,
    rules: rules || [],
    profile: profile || { name: '사용자' },
    timezone: timezone || 'Asia/Seoul',
    notifiedToday: existing.notifiedToday || { date: '', ids: [] },
    updatedAt: Date.now(),
  };

  await env.MUTALEE_KV.put(key, JSON.stringify(record));

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
