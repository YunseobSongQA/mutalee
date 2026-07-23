// 화면 연결만 담당하는 진입점. 기능별 코드는 루트의 기능이름.js 하나씩에 모여 있다.
import {
  getTodaysReminders,
  loadRules,
  addRule,
  updateRule,
  deleteRule,
  toggleRule,
  loadProfile,
  saveProfile,
  generateMessage,
  renderReminderList,
  renderRuleForm,
  openMessageModal,
} from './reminders.js';
import {
  pickDaily,
  loadCultureOverride,
  saveCultureOverride,
  generateCulture,
  renderCultureCard,
} from './culture.js';
import {
  checkAndNotify,
  getPermission,
  isNotifyEnabled,
  subscribe,
  syncToServer,
  getExistingSubscription,
  renderNoticeBanner,
} from './notify.js';

function dateSeedOf(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function generateId() {
  return `rule-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

const listEl = document.getElementById('reminder-list');
const cultureEl = document.getElementById('culture-card');
const noticeEl = document.getElementById('notice-banner');
const formContainer = document.getElementById('rule-form-container');
const addRuleBtn = document.getElementById('add-rule-btn');
const profileNameInput = document.getElementById('profile-name');
const profileToneInput = document.getElementById('profile-tone');

let rules = [];
let categories = [];
let personas = [];
let cultureCatalog = [];
let cultureItem = null;
let pushConfig = null;
let profile = loadProfile();
let formOpen = false;
let editingRuleId = null;

async function syncPushIfSubscribed() {
  const subscription = await getExistingSubscription();
  if (subscription) syncToServer(subscription, rules, profile);
}

function render() {
  const now = new Date();
  const todays = getTodaysReminders(rules, now);
  renderReminderList(listEl, todays, categories, personas, now, {
    onToggle: (id) => {
      rules = toggleRule(rules, id);
      render();
      syncPushIfSubscribed();
    },
    onDelete: (id) => {
      if (confirm('이 노티를 삭제할까요?')) {
        rules = deleteRule(rules, id);
        render();
        syncPushIfSubscribed();
      }
    },
    onEdit: (rule) => {
      editingRuleId = rule.id;
      closeForm();
      render();
    },
    // 복제: 같은 내용에 새 id로 하나 더 만든다. schedule은 얕은 복사로 원본과 얽히지 않게.
    onDuplicate: (rule) => {
      rules = addRule(rules, {
        ...rule,
        id: generateId(),
        title: `${rule.title} (복제)`,
        schedule: { ...rule.schedule, days: [...rule.schedule.days] },
      });
      render();
      syncPushIfSubscribed();
    },
    editingId: editingRuleId,
    renderEditor: (slot, rule) => {
      renderRuleForm(
        slot,
        categories,
        personas,
        {
          onSubmit: (data, form) => submitRule(data, rule, form),
          onCancel: () => {
            editingRuleId = null;
            render();
          },
        },
        rule
      );
    },
  });
}

// 추가/수정 공통 저장 경로: 문구 생성 → 규칙 반영 → 다시 그리기 → 서버 동기화.
async function submitRule(data, editingRule, form) {
  const submitBtn = form.querySelector('button[type=submit]');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = '문구 생성 중...';
  }

  const personaLabel = (personas.find((p) => p.id === data.persona) || {}).label;
  const generated = await generateMessage({
    note: data.message,
    personaLabel,
    name: profile.name,
    tone: profile.tone,
  });
  if (generated) data.generatedMessage = generated;

  if (editingRule) {
    rules = updateRule(rules, editingRule.id, data);
    editingRuleId = null;
  } else {
    rules = addRule(rules, { id: generateId(), enabled: true, ...data });
  }
  closeForm();
  render();
  syncPushIfSubscribed();
}

function openForm() {
  formOpen = true;
  renderRuleForm(
    formContainer,
    categories,
    personas,
    { onSubmit: (data, form) => submitRule(data, null, form) },
    null
  );
}

function closeForm() {
  formOpen = false;
  formContainer.innerHTML = '';
}

addRuleBtn.addEventListener('click', () => {
  if (formOpen) {
    closeForm();
  } else {
    openForm();
  }
});

// 배너 화면은 notify.js 담당. 여기선 "켜졌을 때 이어서 할 일"만 넘긴다.
function renderBanner() {
  renderNoticeBanner(noticeEl, {
    onEnabled: () => {
      runNotifyCheck();
      trySubscribe();
    },
  });
}

function runNotifyCheck() {
  const now = new Date();
  checkAndNotify(rules, profile, personas, dateSeedOf(now), openMessageModal);
}

// ---- 오늘의 교양 ----

function renderCulture() {
  renderCultureCard(cultureEl, cultureItem, { onRefresh: refreshCulture });
}

// 새로고침: 사용자의 알림 메모들을 참고해 AI가 마음에 도움이 되는 문구를 새로 만든다.
// AI가 실패하면 카탈로그에서 지금 것과 다른 문구를 뽑아서라도 반드시 바뀌게 한다.
async function refreshCulture() {
  const notes = rules.filter((r) => r.enabled).map((r) => `${r.title}: ${r.message}`);
  const generated = await generateCulture({
    notes,
    name: profile.name,
    tone: profile.tone,
    previousText: cultureItem ? cultureItem.text || cultureItem.title : '',
  });

  if (generated) {
    cultureItem = generated;
  } else {
    const others = cultureCatalog.filter((c) => c !== cultureItem);
    if (others.length > 0) cultureItem = others[Math.floor(Math.random() * others.length)];
  }
  saveCultureOverride(dateSeedOf(new Date()), cultureItem);
  renderCulture();
}

async function trySubscribe() {
  if (!pushConfig || !isNotifyEnabled() || getPermission() !== 'granted') return;
  const subscription = await subscribe(pushConfig.vapidPublicKey);
  if (subscription) await syncToServer(subscription, rules, profile);
}

profileNameInput.value = profile.name || '';
profileNameInput.addEventListener('change', () => {
  profile = { ...profile, name: profileNameInput.value || '사용자' };
  saveProfile(profile);
  render();
  syncPushIfSubscribed();
});

// 말투 드롭박스: 목록은 data/tones.json. 예전에 직접 입력해둔 말투는 선택지에 추가해 살린다.
function populateToneSelect(tones) {
  profileToneInput.innerHTML = '';
  const noneOpt = document.createElement('option');
  noneOpt.value = '';
  noneOpt.textContent = '기본';
  profileToneInput.appendChild(noneOpt);

  const list = tones.slice();
  if (profile.tone && !list.includes(profile.tone)) list.push(profile.tone);
  list.forEach((tone) => {
    const opt = document.createElement('option');
    opt.value = tone;
    opt.textContent = tone;
    profileToneInput.appendChild(opt);
  });
  profileToneInput.value = profile.tone || '';
}

profileToneInput.addEventListener('change', () => {
  profile = { ...profile, tone: profileToneInput.value };
  saveProfile(profile);
  syncPushIfSubscribed();
});

async function init() {
  const [categoriesRes, personasRes, cultureRes, pushConfigRes, tonesRes] = await Promise.all([
    fetch('data/categories.json'),
    fetch('data/personas.json'),
    fetch('data/culture-catalog.json'),
    fetch('data/push-config.json'),
    fetch('data/tones.json'),
  ]);
  categories = await categoriesRes.json();
  personas = await personasRes.json();
  cultureCatalog = await cultureRes.json();
  pushConfig = await pushConfigRes.json();
  populateToneSelect(await tonesRes.json());
  rules = await loadRules();

  renderBanner();

  const todaySeed = dateSeedOf(new Date());
  cultureItem = loadCultureOverride(todaySeed) || pickDaily(cultureCatalog, todaySeed);
  renderCulture();

  render();
  runNotifyCheck();

  // 잠금화면 알림(푸시)을 눌러 새로 열린 경우: sw.js가 URL에 실어준 전체 문구를 모달로 보여준다.
  const params = new URLSearchParams(location.search);
  if (params.has('noti')) {
    try {
      const payload = JSON.parse(params.get('noti'));
      if (payload && payload.body) openMessageModal(payload.title || '무탈이', payload.body);
    } catch (e) {
      // 깨진 파라미터는 무시
    }
    history.replaceState(null, '', location.pathname);
  }

  // 매분 정각에 맞춰 체크한다. 예전엔 고정 30초 간격이라 시각이 되고도 최대 30초 늦게 알림이 떴다.
  function minuteTick() {
    const now = new Date();
    const msToNextMinute = 60000 - (now.getSeconds() * 1000 + now.getMilliseconds());
    setTimeout(() => {
      // 인라인 수정 중에는 다시 그리면 입력 중인 내용이 날아가므로 건너뛴다.
      if (editingRuleId === null) render();
      runNotifyCheck();
      minuteTick();
    }, msToNextMinute + 50);
  }
  minuteTick();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
    // 앱이 이미 열려 있는 상태에서 푸시 알림을 누른 경우: sw.js가 보내는 전체 문구를 모달로.
    navigator.serviceWorker.addEventListener('message', (event) => {
      const data = event.data;
      if (data && data.type === 'notification-click' && data.body) {
        openMessageModal(data.title || '무탈이', data.body);
      }
    });
    trySubscribe();
  }
}

init();
