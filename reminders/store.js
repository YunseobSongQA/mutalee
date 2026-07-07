// localStorage 읽기/쓰기 + 서버(Gemini) 문구 생성 요청. 로직(core.js)과 섞지 않는다.

const RULES_KEY = 'mutalee.rules';
const PROFILE_KEY = 'mutalee.profile';
const NOTIFIED_KEY = 'mutalee.notified';

export async function loadRules() {
  const raw = localStorage.getItem(RULES_KEY);
  if (raw) return JSON.parse(raw);
  const res = await fetch('data/default-rules.json');
  const seed = await res.json();
  saveRules(seed);
  return seed;
}

export function saveRules(rules) {
  localStorage.setItem(RULES_KEY, JSON.stringify(rules));
}

export function addRule(rules, rule) {
  const next = rules.concat(rule);
  saveRules(next);
  return next;
}

export function updateRule(rules, id, patch) {
  const next = rules.map((r) => (r.id === id ? { ...r, ...patch } : r));
  saveRules(next);
  return next;
}

export function deleteRule(rules, id) {
  const next = rules.filter((r) => r.id !== id);
  saveRules(next);
  return next;
}

export function toggleRule(rules, id) {
  const next = rules.map((r) =>
    r.id === id ? { ...r, enabled: !r.enabled } : r
  );
  saveRules(next);
  return next;
}

export function loadProfile() {
  const raw = localStorage.getItem(PROFILE_KEY);
  return raw ? JSON.parse(raw) : { name: '사용자' };
}

export function saveProfile(profile) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

// 오늘 이미 알림을 쏜 규칙 id 목록 (날짜 바뀌면 자동 초기화)
export function loadNotifiedToday(dateSeed) {
  const raw = localStorage.getItem(NOTIFIED_KEY);
  const data = raw ? JSON.parse(raw) : { date: dateSeed, ids: [] };
  if (data.date !== dateSeed) return { date: dateSeed, ids: [] };
  return data;
}

export function markNotified(dateSeed, id) {
  const data = loadNotifiedToday(dateSeed);
  if (!data.ids.includes(id)) data.ids.push(id);
  localStorage.setItem(NOTIFIED_KEY, JSON.stringify(data));
  return data;
}

// 서버(Gemini)에 문구 생성 요청. 실패하면 조용히 null (호출부가 템플릿으로 대체).
// 한 번 실패하면 Gemini가 가끔 일시적으로 과부하 상태라 1번만 재시도한다.
export async function generateMessage({ note, personaLabel, name, tone }) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch('/api/generate-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note, personaLabel, name, tone }),
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (data.message) return data.message;
    } catch (e) {
      // 다음 시도로 넘어감
    }
  }
  return null;
}
