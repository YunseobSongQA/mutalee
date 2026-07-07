// 알림 기능 전체: 브라우저 권한, 로컬 포그라운드 알림, 서버 웹푸시 구독.
// (예전엔 permission.js/push-client.js로 쪼개져 있었는데 전부 "알림"이라는 한 기능이라 여기로 합침)

import { getDueReminders, renderMessage } from '../reminders/core.js';
import { loadNotifiedToday, markNotified } from '../reminders/store.js';

const ENABLED_KEY = 'mutalee.notify-enabled';
const LAST_ENDPOINT_KEY = 'mutalee.push-endpoint';

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
// 푸시 구독이 되어 있으면 worker/cron.js가 앱이 열려 있어도 어차피 같은 노티를 쏜다.
// 그 상태에서 로컬로 또 쏘면 잠금화면에 같은 알림이 2번 뜬다.
// 그래서 "푸시가 이미 이 기기를 담당하고 있으면 로컬은 쏘지 않는다"로 채널을 하나만 남긴다.
export async function checkAndNotify(rules, profile, personas, dateSeed) {
  if (!isNotifyEnabled() || getPermission() !== 'granted') return;
  if (await getExistingSubscription()) return;

  const due = getDueReminders(rules, new Date());
  const notified = loadNotifiedToday(dateSeed);

  due.forEach((reminder) => {
    if (notified.ids.includes(reminder.id)) return;
    new Notification(reminder.title, {
      body: renderMessage(reminder, profile, personas),
    });
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

// iOS는 가끔 push 구독 endpoint가 바뀐다. 바뀐 걸 감지하면 서버에 남아있는
// 옛 endpoint 구독을 지워서, 한 기기 앞으로 중복 구독이 쌓이지 않게 한다.
async function cleanupStaleEndpoint(currentEndpoint) {
  const prev = localStorage.getItem(LAST_ENDPOINT_KEY);
  if (prev && prev !== currentEndpoint) {
    try {
      await fetch('/api/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: prev }),
      });
    } catch (e) {
      // 정리 실패해도 새 구독 동기화는 계속 진행
    }
  }
  localStorage.setItem(LAST_ENDPOINT_KEY, currentEndpoint);
}

// 앱 내 "알림 끄기": 구독을 취소하고 서버 쪽 기록도 지운다.
export async function unsubscribe() {
  const subscription = await getExistingSubscription();
  if (!subscription) return;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  localStorage.removeItem(LAST_ENDPOINT_KEY);
  try {
    await fetch('/api/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint }),
    });
  } catch (e) {
    // 서버 정리 실패해도 클라이언트 구독은 이미 취소됨
  }
}

export async function syncToServer(subscription, rules, profile) {
  if (!subscription) return;
  await cleanupStaleEndpoint(subscription.endpoint);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  try {
    await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: subscription.toJSON(), rules, profile, timezone }),
    });
  } catch (e) {
    // 서버 동기화 실패는 조용히 무시 (로컬 알림은 그대로 동작)
  }
}
