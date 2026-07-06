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

    const actions = document.createElement('div');
    actions.className = 'reminder-actions';

    const editBtn = document.createElement('button');
    editBtn.textContent = '수정';
    editBtn.onclick = () => handlers.onEdit(reminder);
    actions.appendChild(editBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '삭제';
    deleteBtn.onclick = () => handlers.onDelete(reminder.id);
    actions.appendChild(deleteBtn);

    body.appendChild(actions);
    card.appendChild(body);

    const toggle = document.createElement('button');
    toggle.className = 'toggle-switch' + (reminder.enabled ? ' on' : '');
    toggle.setAttribute('aria-label', '노티 on/off');
    toggle.onclick = () => handlers.onToggle(reminder.id);
    card.appendChild(toggle);

    container.appendChild(card);
  });
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

  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.className = 'primary';
  submitBtn.textContent = editingRule ? '수정 완료' : '노티 추가';
  form.appendChild(submitBtn);

  form.onsubmit = (e) => {
    e.preventDefault();
    const days = Array.from(daysBox.querySelectorAll('input:checked')).map((cb) => Number(cb.value));
    if (days.length === 0) {
      alert('요일을 하나 이상 선택해주세요.');
      return;
    }
    handlers.onSubmit({
      category: categorySelect.value,
      persona: personaSelect.value,
      title: titleInput.value,
      message: messageInput.value,
      schedule: { days, time: timeInput.value },
    });
  };

  container.appendChild(form);
}
