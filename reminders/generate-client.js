// 서버(Gemini)에 문구 생성을 요청. 실패해도 조용히 null만 반환 (템플릿으로 대체됨).
export async function generateMessage({ note, personaLabel, name, tone }) {
  try {
    const res = await fetch('/api/generate-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note, personaLabel, name, tone }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.message || null;
  } catch (e) {
    return null;
  }
}
