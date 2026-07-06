import { getTodaysReminders } from './reminders/core.js';
import {
  loadRules,
  saveRules,
  addRule,
  updateRule,
  deleteRule,
  toggleRule,
  loadProfile,
  saveProfile,
} from './reminders/store.js';
import { renderReminderList, renderRuleForm } from './reminders/ui.js';
import { pickDaily } from './culture/core.js';
import { renderCultureCard } from './culture/ui.js';
import { checkAndNotify } from './notify/notify.js';
import { isSupported, getPermission, requestPermission } from './notify/permission.js';
import { subscribe, syncToServer, getExistingSubscription } from './notify/push-client.js';
import { generateMessage } from './reminders/generate-client.js';

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
let pushConfig = null;
let profile = loadProfile();
let formOpen = false;

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
    onEdit: (rule) => openForm(rule),
  });
}

function openForm(editingRule) {
  formOpen = true;
  renderRuleForm(
    formContainer,
    categories,
    personas,
    {
      onSubmit: async (data) => {
        const submitBtn = formContainer.querySelector('button[type=submit]');
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
        } else {
          rules = addRule(rules, { id: generateId(), enabled: true, ...data });
        }
        closeForm();
        render();
        syncPushIfSubscribed();
      },
    },
    editingRule
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
    openForm(null);
  }
});

function renderNoticeBanner() {
  noticeEl.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'notice-banner';

  const statusLine = document.createElement('p');
  statusLine.className = 'notice-status';
  box.appendChild(statusLine);

  if (!isSupported()) {
    statusLine.textContent = '🔕 이 브라우저는 알림 기능을 지원하지 않아요.';
  } else {
    const status = getPermission();
    if (status === 'granted') {
      statusLine.textContent = '🔔 알림 켜짐 — 앱이 꺼져 있어도 알림이 옵니다.';
      const off = document.createElement('p');
      off.className = 'notice-sub';
      off.textContent = '끄려면 iOS 설정 > 알림 > 무탈이에서 꺼주세요.';
      box.appendChild(off);
    } else if (status === 'denied') {
      statusLine.textContent = '🔕 알림이 차단되어 있어요.';
      const off = document.createElement('p');
      off.className = 'notice-sub';
      off.textContent = '켜려면 iOS 설정 > 알림 > 무탈이에서 허용해주세요.';
      box.appendChild(off);
    } else {
      statusLine.textContent = '🔕 알림 꺼짐';
      const btn = document.createElement('button');
      btn.textContent = '알림 켜기';
      btn.onclick = async () => {
        await requestPermission();
        renderNoticeBanner();
        runNotifyCheck();
        trySubscribe();
      };
      box.appendChild(btn);
    }
  }

  noticeEl.appendChild(box);
}

function runNotifyCheck() {
  const now = new Date();
  checkAndNotify(rules, profile, personas, dateSeedOf(now));
}

async function trySubscribe() {
  if (!pushConfig || getPermission() !== 'granted') return;
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

profileToneInput.value = profile.tone || '';
profileToneInput.addEventListener('change', () => {
  profile = { ...profile, tone: profileToneInput.value };
  saveProfile(profile);
  syncPushIfSubscribed();
});

async function init() {
  const [categoriesRes, personasRes, cultureRes, pushConfigRes] = await Promise.all([
    fetch('data/categories.json'),
    fetch('data/personas.json'),
    fetch('data/culture-catalog.json'),
    fetch('data/push-config.json'),
  ]);
  categories = await categoriesRes.json();
  personas = await personasRes.json();
  cultureCatalog = await cultureRes.json();
  pushConfig = await pushConfigRes.json();
  rules = await loadRules();

  renderNoticeBanner();

  const today = new Date();
  const dailyItem = pickDaily(cultureCatalog, dateSeedOf(today));
  renderCultureCard(cultureEl, dailyItem);

  render();
  runNotifyCheck();

  setInterval(() => {
    render();
    runNotifyCheck();
  }, 30000);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
    trySubscribe();
  }
}

init();
