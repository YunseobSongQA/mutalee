// localStorage 읽기/쓰기 + 서버(Gemini) 교양 문구 생성 요청. 로직(core.js)과 섞지 않는다.

const OVERRIDE_KEY = 'mutalee.culture-override';

// 새로고침으로 받은 문구는 그날 하루 유지한다 (앱을 다시 열어도 일일 추천으로 되돌아가지 않게).
export function loadCultureOverride(dateSeed) {
  try {
    const raw = localStorage.getItem(OVERRIDE_KEY);
    const data = raw ? JSON.parse(raw) : null;
    return data && data.date === dateSeed ? data.item : null;
  } catch (e) {
    return null;
  }
}

export function saveCultureOverride(dateSeed, item) {
  localStorage.setItem(OVERRIDE_KEY, JSON.stringify({ date: dateSeed, item }));
}

// 서버(Gemini)에 교양 문구 생성 요청. 실패하면 조용히 null (호출부가 카탈로그로 대체).
export async function generateCulture({ notes, name, tone, previousText }) {
  try {
    const res = await fetch('/api/generate-culture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes, name, tone, previousText }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.text) {
      return { type: 'poem', text: data.text, author: data.author || '무탈이' };
    }
  } catch (e) {
    // 실패는 조용히 무시
  }
  return null;
}
