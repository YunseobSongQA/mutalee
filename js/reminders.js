// 노티(리마인더) 기능 전부: 순수 로직 → localStorage/서버 → 화면 순서로 배치.
// (구 reminders/core.js + store.js + ui.js)

// ==== 순수 로직: DOM/저장소/네트워크를 건드리지 않는다 (worker/cron.js도 이 부분을 재사용) ====


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

// ==== 저장/서버: localStorage 읽기·쓰기 + 서버(Gemini) 문구 생성 요청 ====


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

// ==== 화면: 노티 목록·추가/수정 폼·전체 문구 모달 ====

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

function labelOf(list, id) {
  const found = list.find((item) => item.id === id);
  return found ? found.label : id;
}

function daysToText(days) {
  return days
    .slice()
    .sort()
    .map((d) => DAY_LABELS[d])
    .join(', ');
}

export function renderReminderList(container, todaysReminders, categories, personas, now, handlers) {
  container.innerHTML = '';

  if (todaysReminders.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-note';
    empty.textContent = '오늘 예정된 노티가 없어요.';
    container.appendChild(empty);
    return;
  }

  const nowHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  todaysReminders.forEach((reminder) => {
    // 수정 중인 노티는 카드 대신 그 자리에 수정 폼을 그린다 (인라인 수정).
    if (handlers.editingId === reminder.id && handlers.renderEditor) {
      const slot = document.createElement('div');
      container.appendChild(slot);
      handlers.renderEditor(slot, reminder);
      return;
    }

    const isDue = reminder.schedule.time <= nowHHMM;

    const card = document.createElement('div');
    card.className = 'card reminder-card' + (isDue ? ' is-due' : '');

    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = reminder.schedule.time;
    card.appendChild(badge);

    const body = document.createElement('div');
    body.className = 'reminder-body';

    const title = document.createElement('h3');
    title.textContent = reminder.title;
    body.appendChild(title);

    const meta = document.createElement('div');
    meta.className = 'reminder-meta';
    meta.textContent = `${labelOf(categories, reminder.category)} · ${labelOf(personas, reminder.persona)} · ${daysToText(reminder.schedule.days)}`;
    body.appendChild(meta);

    card.appendChild(body);

    const toggle = document.createElement('button');
    toggle.className = 'toggle-switch' + (reminder.enabled ? ' on' : '');
    toggle.setAttribute('aria-label', '노티 on/off');
    toggle.onclick = () => handlers.onToggle(reminder.id);
    card.appendChild(toggle);

    // 수정/삭제는 카드 오른쪽 아래에 작은 알약 버튼으로 (본문 흐름과 분리).
    const actions = document.createElement('div');
    actions.className = 'reminder-actions';

    const editBtn = document.createElement('button');
    editBtn.textContent = '수정';
    editBtn.onclick = () => handlers.onEdit(reminder);
    actions.appendChild(editBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'danger';
    deleteBtn.textContent = '삭제';
    deleteBtn.onclick = () => handlers.onDelete(reminder.id);
    actions.appendChild(deleteBtn);

    card.appendChild(actions);

    container.appendChild(card);
  });
}

// 알림(로컬/푸시)을 눌렀을 때 잘리지 않은 전체 문구를 보여주는 모달.
export function openMessageModal(title, body) {
  const existing = document.querySelector('.modal-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.onclick = (e) => {
    if (e.target === overlay) overlay.remove();
  };

  const modal = document.createElement('div');
  modal.className = 'card message-modal';

  const heading = document.createElement('h3');
  heading.textContent = title;
  modal.appendChild(heading);

  const text = document.createElement('p');
  text.className = 'message-modal-body';
  text.textContent = body;
  modal.appendChild(text);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'primary';
  closeBtn.textContent = '닫기';
  closeBtn.onclick = () => overlay.remove();
  modal.appendChild(closeBtn);

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}

export function renderRuleForm(container, categories, personas, handlers, editingRule) {
  container.innerHTML = '';

  const form = document.createElement('form');
  form.className = 'rule-form card';

  const categoryField = document.createElement('div');
  categoryField.innerHTML = '<label>카테고리</label>';
  const categorySelect = document.createElement('select');
  categorySelect.name = 'category';
  categories.forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.label;
    categorySelect.appendChild(opt);
  });
  categoryField.appendChild(categorySelect);
  form.appendChild(categoryField);

  const personaField = document.createElement('div');
  personaField.innerHTML = '<label>톤(페르소나)</label>';
  const personaSelect = document.createElement('select');
  personaSelect.name = 'persona';
  personas.forEach((p) => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.label;
    personaSelect.appendChild(opt);
  });
  personaField.appendChild(personaSelect);
  form.appendChild(personaField);

  const titleField = document.createElement('div');
  titleField.innerHTML = '<label>제목</label>';
  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.name = 'title';
  titleInput.required = true;
  titleField.appendChild(titleInput);
  form.appendChild(titleField);

  const messageField = document.createElement('div');
  messageField.innerHTML = '<label>메모 (대충 적어도 돼요, 문구는 페르소나가 알아서 만들어요)</label>';
  const messageInput = document.createElement('textarea');
  messageInput.name = 'message';
  messageInput.rows = 2;
  messageInput.placeholder = '예: 초심 잃지 말기, 잘 삐지는 성향 이해하기';
  messageInput.required = true;
  messageField.appendChild(messageInput);
  form.appendChild(messageField);

  const timeField = document.createElement('div');
  timeField.innerHTML = '<label>시각</label>';
  const timeInput = document.createElement('input');
  timeInput.type = 'time';
  timeInput.name = 'time';
  timeInput.required = true;
  timeField.appendChild(timeInput);
  form.appendChild(timeField);

  const daysField = document.createElement('div');
  daysField.innerHTML = '<label>요일</label>';

  const presetBox = document.createElement('div');
  presetBox.className = 'day-presets';
  const presets = [
    { label: '매일', days: [0, 1, 2, 3, 4, 5, 6] },
    { label: '평일', days: [1, 2, 3, 4, 5] },
    { label: '주말', days: [0, 6] },
  ];

  const daysBox = document.createElement('div');
  daysBox.className = 'day-checkboxes';
  DAY_LABELS.forEach((label, idx) => {
    const dayLabel = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.name = 'days';
    cb.value = String(idx);
    const span = document.createElement('span');
    span.textContent = label;
    dayLabel.appendChild(cb);
    dayLabel.appendChild(span);
    daysBox.appendChild(dayLabel);
  });

  presets.forEach((preset) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'day-preset-btn';
    btn.textContent = preset.label;
    btn.onclick = () => {
      daysBox.querySelectorAll('input').forEach((cb) => {
        cb.checked = preset.days.includes(Number(cb.value));
      });
    };
    presetBox.appendChild(btn);
  });

  daysField.appendChild(presetBox);
  daysField.appendChild(daysBox);
  form.appendChild(daysField);

  if (editingRule) {
    categorySelect.value = editingRule.category;
    personaSelect.value = editingRule.persona;
    titleInput.value = editingRule.title;
    messageInput.value = editingRule.message;
    timeInput.value = editingRule.schedule.time;
    editingRule.schedule.days.forEach((d) => {
      const cb = daysBox.querySelector(`input[value="${d}"]`);
      if (cb) cb.checked = true;
    });
  }

  const actionsRow = document.createElement('div');
  actionsRow.className = 'form-actions';

  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.className = 'primary';
  submitBtn.textContent = editingRule ? '수정 완료' : '노티 추가';
  actionsRow.appendChild(submitBtn);

  if (handlers.onCancel) {
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'ghost';
    cancelBtn.textContent = '취소';
    cancelBtn.onclick = handlers.onCancel;
    actionsRow.appendChild(cancelBtn);
  }

  form.appendChild(actionsRow);

  form.onsubmit = (e) => {
    e.preventDefault();
    const days = Array.from(daysBox.querySelectorAll('input:checked')).map((cb) => Number(cb.value));
    if (days.length === 0) {
      alert('요일을 하나 이상 선택해주세요.');
      return;
    }
    handlers.onSubmit(
      {
        category: categorySelect.value,
        persona: personaSelect.value,
        title: titleInput.value,
        message: messageInput.value,
        schedule: { days, time: timeInput.value },
      },
      form
    );
  };

  container.appendChild(form);
}
