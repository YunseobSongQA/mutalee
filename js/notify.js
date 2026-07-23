// 알림 기능 전부: 권한·앱 내 스위치·포그라운드 알림·웹푸시 구독 + 상태 배너 화면.
// (구 notify/notify.js + notify/ui.js)

import { getDueReminders, renderMessage, loadNotifiedToday, markNotified } from './reminders.js';

const ENABLED_KEY = 'mutalee.notify-enabled';
const DEVICE_ID_KEY = 'mutalee.device-id';

// 이 기기를 서버(KV)에서 식별하는 고유 id. push endpoint는 iOS에서 자주 바뀌는데,
// endpoint로 KV 키를 잡으면 바뀔 때마다 새 구독이 쌓여서 한 기기 앞으로 알림이 여러 번 온다.
// 그래서 endpoint 대신 이 변하지 않는 id로 서버 레코드를 하나만 유지한다.
function getDeviceId() {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

// ==== 브라우저 알림 권한 ====

export function isSupported() {
  return typeof Notification !== 'undefined';
}

export function getPermission() {
  if (!isSupported()) return 'unsupported';
  return Notification.permission;
}

export async function requestPermission() {
  if (!isSupported()) return 'unsupported';
  return Notification.requestPermission();
}

// ==== 앱 안에서 켜고 끄는 전체 알림 스위치 ====
// (iOS 권한(Notification.permission)은 앱이 되돌릴 수 없어서, 그거랑 별개로
// "사용자가 앱에서 알림을 원하는가"를 따로 저장해서 실제 켜기/끄기가 되게 한다.)

export function isNotifyEnabled() {
  const raw = localStorage.getItem(ENABLED_KEY);
  return raw === null ? true : raw === 'true';
}

export function setNotifyEnabled(enabled) {
  localStorage.setItem(ENABLED_KEY, String(enabled));
}

// ==== 로컬 포그라운드 알림 ====
// 앱이 열려 있는 동안은 여기서 즉시(30초 주기) 쏜다 — 정시성이 중요해서 서버 푸시(1분 주기 cron)를
// 기다리지 않는다. 앱이 열려 있을 때 서버 푸시가 중복으로 뜨는 건 sw.js의 push 핸들러가
// "지금 포커스된 창이 있으면" 억제해서 막는다 (그래서 여기선 구독 여부를 신경 안 써도 됨).
export async function checkAndNotify(rules, profile, personas, dateSeed, onOpen) {
  if (!isNotifyEnabled() || getPermission() !== 'granted') return;

  const due = getDueReminders(rules, new Date());
  const notified = loadNotifiedToday(dateSeed);

  due.forEach((reminder) => {
    if (notified.ids.includes(reminder.id)) return;
    const body = renderMessage(reminder, profile, personas);
    const notification = new Notification(reminder.title, { body });
    // OS가 문구를 잘라서 보여주므로, 누르면 앱에서 전체 문구를 볼 수 있게 한다.
    if (typeof onOpen === 'function') {
      notification.onclick = () => {
        window.focus();
        onOpen(reminder.title, body);
      };
    }
    markNotified(dateSeed, reminder.id);
  });
}

// ==== 서버 웹푸시 구독 ====

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export async function getExistingSubscription() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

export async function subscribe(vapidPublicKey) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  if (existing) return existing;
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
  });
}

// 앱 내 "알림 끄기": 구독을 취소하고 서버 쪽 기록도 지운다.
export async function unsubscribe() {
  const subscription = await getExistingSubscription();
  if (subscription) await subscription.unsubscribe();
  try {
    await fetch('/api/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: getDeviceId() }),
    });
  } catch (e) {
    // 서버 정리 실패해도 클라이언트 구독은 이미 취소됨
  }
}

export async function syncToServer(subscription, rules, profile) {
  if (!subscription) return;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  try {
    await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: getDeviceId(),
        subscription: subscription.toJSON(),
        rules,
        profile,
        timezone,
      }),
    });
  } catch (e) {
    // 서버 동기화 실패는 조용히 무시 (로컬 알림은 그대로 동작)
  }
}

// ==== 화면: 알림 상태 배너 ====
// 지원 여부/권한/켜짐 상태에 따라 문구와 켜기·끄기 버튼을 그린다.
// onEnabled: 알림을 막 켰을 때 앱이 이어서 할 일(즉시 체크 + 푸시 구독)을 받아온다.
export function renderNoticeBanner(container, { onEnabled } = {}) {
  container.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'notice-banner';

  const statusLine = document.createElement('p');
  statusLine.className = 'notice-status';
  box.appendChild(statusLine);

  if (!isSupported()) {
    statusLine.textContent = '🔕 이 브라우저는 알림 기능을 지원하지 않아요.';
  } else {
    const status = getPermission();
    if (status === 'denied') {
      statusLine.textContent = '🔕 알림이 차단되어 있어요.';
      const off = document.createElement('p');
      off.className = 'notice-sub';
      off.textContent = '켜려면 iOS 설정 > 알림 > 무탈이에서 허용해주세요.';
      box.appendChild(off);
    } else if (status === 'granted' && isNotifyEnabled()) {
      statusLine.textContent = '🔔 알림 켜짐 — 앱이 꺼져 있어도 알림이 옵니다.';
      const btn = document.createElement('button');
      btn.textContent = '알림 끄기';
      btn.onclick = async () => {
        setNotifyEnabled(false);
        await unsubscribe();
        renderNoticeBanner(container, { onEnabled });
      };
      box.appendChild(btn);
    } else {
      statusLine.textContent = '🔕 알림 꺼짐';
      const btn = document.createElement('button');
      btn.textContent = '알림 켜기';
      btn.onclick = async () => {
        setNotifyEnabled(true);
        if (getPermission() !== 'granted') await requestPermission();
        renderNoticeBanner(container, { onEnabled });
        if (typeof onEnabled === 'function') onEnabled();
      };
      box.appendChild(btn);
    }
  }

  container.appendChild(box);
}
