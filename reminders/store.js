// localStorage 읽기/쓰기 담당. 로직(core.js)과 섞지 않는다.

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
