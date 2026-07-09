// Pages Function: 클라이언트가 끈 구독을 KV에서 지운다.

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

async function removeFromSubIndex(env, keyName) {
  const index = await readSubIndex(env);
  if (!index.includes(keyName)) return;
  await env.MUTALEE_KV.put(INDEX_KEY, JSON.stringify(index.filter((k) => k !== keyName)));
}

export async function onRequestPost({ request, env }) {
  let payload;
  try {
    payload = await request.json();
  } catch (e) {
    return new Response('Invalid JSON', { status: 400 });
  }

  const { deviceId } = payload;
  if (!deviceId) {
    return new Response('Missing deviceId', { status: 400 });
  }

  const key = `sub:${deviceId}`;
  await env.MUTALEE_KV.delete(key);
  await removeFromSubIndex(env, key);

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
