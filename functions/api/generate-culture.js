// Pages Function: 사용자의 알림 메모들을 참고해 Gemini가 "오늘의 교양" 문구를 만든다.
// 실패하면 클라이언트가 카탈로그 방식으로 조용히 대체한다.

const GEMINI_MODEL = 'gemini-2.5-flash-lite';

export async function onRequestPost({ request, env }) {
  let payload;
  try {
    payload = await request.json();
  } catch (e) {
    return new Response('Invalid JSON', { status: 400 });
  }

  const { notes, name, tone, previousText } = payload;

  const notesLine =
    Array.isArray(notes) && notes.length > 0
      ? `이 사람이 스스로에게 보내려고 적어둔 알림 메모들 (마음 상태를 엿볼 수 있는 단서): ${notes.join(' / ')}`
      : '';
  const toneLine = tone ? `이 사람이 좋아하는 말투 분위기: ${tone}.` : '';
  const previousLine = previousText ? `직전에 보여준 문구 (겹치지 않게): ${previousText}` : '';

  const prompt = `너는 "오늘의 교양" 큐레이터야. "${name || '사용자'}"에게 마음에 도움이 되는 교양 문구 하나를 골라줘.
시 구절, 명언, 고전 속 한 문장, 짧은 사색거리 중 어울리는 것으로 — 위로, 다독임, 관계, 초심 같은 마음의 주제면 좋아.
${notesLine}
${toneLine}
${previousLine}
실존하는 작품/인물의 문구를 우선하되, 확실치 않으면 지어내지 말고 직접 쓴 문장으로 하고 출처를 "무탈이"로 해.
아래 JSON 형식으로만 출력하고 다른 설명은 붙이지 마:
{"text": "문구", "author": "출처(작가나 작품명)"}`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 300, responseMimeType: 'application/json' },
        }),
      }
    );
    if (!res.ok) {
      return new Response('Gemini error', { status: 502 });
    }
    const data = await res.json();
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!raw) {
      return new Response('Empty result', { status: 502 });
    }

    let parsed;
    try {
      // 혹시 코드펜스로 감싸서 주는 경우까지 방어
      parsed = JSON.parse(raw.replace(/^```(json)?|```$/g, '').trim());
    } catch (e) {
      return new Response('Malformed result', { status: 502 });
    }
    if (!parsed.text) {
      return new Response('Empty result', { status: 502 });
    }

    return new Response(JSON.stringify({ text: parsed.text, author: parsed.author || '무탈이' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response('Gemini request failed', { status: 502 });
  }
}
