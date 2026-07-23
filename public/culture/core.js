// 순수 함수: 날짜 기반 결정론적 선택 (같은 날짜는 항상 같은 결과)

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
