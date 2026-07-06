// Pages Function: 메모 + 페르소나 + 톤을 Gemini에 보내 완성된 알림 문구를 받는다.
// 실패하면 클라이언트가 템플릿 방식으로 조용히 대체한다.

const GEMINI_MODEL = 'gemini-2.5-flash-lite';

export async function onRequestPost({ request, env }) {
  let payload;
  try {
    payload = await request.json();
  } catch (e) {
    return new Response('Invalid JSON', { status: 400 });
  }

  const { note, personaLabel, name, tone } = payload;
  if (!note) {
    return new Response('Missing note', { status: 400 });
  }

  const toneLine = tone ? `전체적인 말투 컨셉: ${tone}.` : '';
  const prompt = `너는 알림 문구 작가야. 아래 메모를 "${personaLabel || '비서'}" 캐릭터의 말투로, 사용자 이름 "${name || '사용자'}"을 자연스럽게 넣어서 완성된 알림 문구로 바꿔줘. ${toneLine}
알림 배너는 표시 공간이 아주 좁으니 반드시 25자 이내, 짧은 한 문장으로만 써.
문구만 출력하고 설명이나 따옴표는 붙이지 마.

메모: ${note}`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 60 },
        }),
      }
    );
    if (!res.ok) {
      return new Response('Gemini error', { status: 502 });
    }
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) {
      return new Response('Empty result', { status: 502 });
    }
    return new Response(JSON.stringify({ message: text }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response('Gemini request failed', { status: 502 });
  }
}
