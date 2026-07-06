// 순수 함수: DOM/저장소/네트워크를 건드리지 않는다.

function toHHMM(date) {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

// 오늘 요일에 해당하는 규칙 전체 (시각 상관없이), 시각순 정렬
export function getTodaysReminders(rules, now) {
  const day = now.getDay();
  return rules
    .filter((r) => r.enabled && r.schedule.days.includes(day))
    .slice()
    .sort((a, b) => a.schedule.time.localeCompare(b.schedule.time));
}

// 지금 시점(오늘, 이미 시각이 도래한 것)에 해당하는 노티만 골라냄
export function getDueReminders(rules, now) {
  const nowHHMM = toHHMM(now);
  return getTodaysReminders(rules, now).filter(
    (r) => r.schedule.time <= nowHHMM
  );
}

// reminder.message는 사용자가 대충 적은 메모다. generatedMessage(Gemini 생성 결과)가 있으면 그걸 쓰고,
// 없으면 페르소나 템플릿에 끼워서 완성된 문구로 만든다.
export function renderMessage(reminder, profile, personas) {
  if (reminder.generatedMessage) return reminder.generatedMessage;

  const persona = (personas || []).find((p) => p.id === reminder.persona);
  const template = persona && persona.template ? persona.template : '{note}';
  const tokens = { name: (profile && profile.name) || '사용자', note: reminder.message };
  return template.replace(/\{(\w+)\}/g, (match, key) => (tokens[key] != null ? tokens[key] : match));
}
