// 오늘의 교양 기능 전부: 순수 로직 → localStorage/서버 → 화면 순서로 배치.
// (구 culture/core.js + store.js + ui.js)

// ==== 순수 로직: 날짜 기반 결정론적 선택 (같은 날짜는 항상 같은 결과) ====


function hashString(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return Math.abs(hash);
}

function indexFor(catalog, dateSeed, salt) {
  return hashString(dateSeed + salt) % catalog.length;
}

function dayBefore(dateSeed) {
  const d = new Date(dateSeed);
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// 카탈로그가 작아서 해시가 우연히 겹치면 며칠 간격으로 같은 문구가 반복될 수 있다.
// 어제 뽑힌 것과 같으면 다른 시드로 한 번 더 뽑아서 바로 다음날 반복되는 것만 피한다.
export function pickDaily(catalog, dateSeed) {
  if (!catalog || catalog.length === 0) return null;
  const index = indexFor(catalog, dateSeed, '');
  if (catalog.length === 1) return catalog[index];

  const prevIndex = indexFor(catalog, dayBefore(dateSeed), '');
  if (index === prevIndex) return catalog[indexFor(catalog, dateSeed, '#')];
  return catalog[index];
}

// ==== 저장/서버: 새로고침 문구 하루 유지 + 서버(Gemini) 교양 문구 생성 요청 ====


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

// ==== 화면: 교양 카드 ====

export function renderCultureCard(container, item, handlers = {}) {
  container.innerHTML = '';
  if (!item) return;

  const card = document.createElement('div');
  card.className = 'card culture-card';

  const text = document.createElement('p');
  text.className = 'culture-text';
  text.textContent = item.type === 'poem' ? `"${item.text}"` : item.title;
  card.appendChild(text);

  const source = document.createElement('p');
  source.className = 'culture-source';
  source.textContent = item.type === 'poem' ? `- ${item.author}` : `- ${item.composer}`;
  card.appendChild(source);

  if (handlers.onRefresh) {
    const refreshBtn = document.createElement('button');
    refreshBtn.className = 'culture-refresh';
    refreshBtn.setAttribute('aria-label', '다른 문구 보기');
    refreshBtn.textContent = '↻';
    refreshBtn.onclick = async () => {
      refreshBtn.disabled = true;
      refreshBtn.classList.add('spinning');
      await handlers.onRefresh();
      // onRefresh가 카드를 다시 그리므로 버튼 상태 복원은 필요 없다.
    };
    card.appendChild(refreshBtn);
  }

  container.appendChild(card);
}
