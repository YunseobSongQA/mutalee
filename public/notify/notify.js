// 알림 기능 전체: 브라우저 권한, 로컬 포그라운드 알림, 서버 웹푸시 구독.
// (예전엔 permission.js/push-client.js로 쪼개져 있었는데 전부 "알림"이라는 한 기능이라 여기로 합침)

import { getDueReminders, renderMessage } from '../reminders/core.js';
import { loadNotifiedToday, markNotified } from '../reminders/store.js';

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

// ---- 브라우저 알림 권한 ----

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

// ---- 앱 안에서 켜고 끄는 전체 알림 스위치 ----
// (iOS 권한(Notification.permission)은 앱이 되돌릴 수 없어서, 그거랑 별개로
// "사용자가 앱에서 알림을 원하는가"를 따로 저장해서 실제 켜기/끄기가 되게 한다.)

export function isNotifyEnabled() {
  const raw = localStorage.getItem(ENABLED_KEY);
  return raw === null ? true : raw === 'true';
}

export function setNotifyEnabled(enabled) {
  localStorage.setItem(ENABLED_KEY, String(enabled));
}

// ---- 로컬 포그라운드 알림 ----
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

// ---- 서버 웹푸시 구독 ----

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
