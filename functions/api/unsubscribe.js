// Pages Function: 클라이언트가 끈 (또는 교체되어 죽은) 구독을 KV에서 지운다.

import { hashEndpoint } from './sync.js';

export async function onRequestPost({ request, env }) {
  let payload;
  try {
    payload = await request.json();
  } catch (e) {
    return new Response('Invalid JSON', { status: 400 });
  }

  const { endpoint } = payload;
  if (!endpoint) {
    return new Response('Missing endpoint', { status: 400 });
  }

  const key = `sub:${await hashEndpoint(endpoint)}`;
  await env.MUTALEE_KV.delete(key);

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
