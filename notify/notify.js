import { getDueReminders, renderMessage } from '../reminders/core.js';
import { loadNotifiedToday, markNotified } from '../reminders/store.js';
import { getPermission } from './permission.js';

// 아직 알림을 안 보낸, 지금 막 도래한 노티에 대해서만 브라우저 알림을 쏜다.
// 앱이 포그라운드로 켜져 있을 때만 동작한다 (닫혀 있으면 이 함수 자체가 실행되지 않음).
export function checkAndNotify(rules, profile, personas, dateSeed) {
  if (getPermission() !== 'granted') return;

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
