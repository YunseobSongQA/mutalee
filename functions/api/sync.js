// Pages Function: 클라이언트가 보낸 구독+규칙+프로필을 KV에 저장한다.

async function hashEndpoint(endpoint) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function onRequestPost({ request, env }) {
  let payload;
  try {
    payload = await request.json();
  } catch (e) {
    return new Response('Invalid JSON', { status: 400 });
  }

  const { subscription, rules, profile, timezone } = payload;
  if (!subscription || !subscription.endpoint) {
    return new Response('Missing subscription', { status: 400 });
  }

  const key = `sub:${await hashEndpoint(subscription.endpoint)}`;
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
