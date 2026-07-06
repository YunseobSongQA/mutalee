// 순수 함수: 날짜 기반 결정론적 선택 (같은 날짜는 항상 같은 결과)

function hashString(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return Math.abs(hash);
}

export function pickDaily(catalog, dateSeed) {
  if (!catalog || catalog.length === 0) return null;
  const index = hashString(dateSeed) % catalog.length;
  return catalog[index];
}
