// Pages Function: 클라이언트가 보낸 구독+규칙+프로필을 KV에 저장한다.
// 기기 식별은 deviceId로 한다 (push endpoint는 iOS에서 자주 바뀌어서 키로 쓰면
// 바뀔 때마다 새 구독이 쌓여 한 기기 앞으로 알림이 중복 발송된다).

// 크론이 KV list() 대신 읽는 구독 키 인덱스 ('sub-index' = 살아있는 sub 키 이름 배열).
// worker/cron.js와 같은 로직이지만 배포 경계가 달라 모듈을 공유할 수 없어 여기 둔다.
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

async function addToSubIndex(env, keyName) {
  const index = await readSubIndex(env);
  if (index.includes(keyName)) return;
  index.push(keyName);
  await env.MUTALEE_KV.put(INDEX_KEY, JSON.stringify(index));
}

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
  await addToSubIndex(env, key);

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
