// Pages Function: 클라이언트가 끈 구독을 발송 Worker(Durable Object)에서 지운다.

const WORKER_URL = 'https://mutalee-cron.eyelash96.workers.dev';

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

  const res = await fetch(`${WORKER_URL}/unsubscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-sync-token': env.SYNC_TOKEN },
    body: JSON.stringify({ deviceId }),
  });
  if (!res.ok) {
    return new Response('Scheduler error', { status: 502 });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
