// Pages Function: 클라이언트가 끈 구독을 KV에서 지운다.

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

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
