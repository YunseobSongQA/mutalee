// 알림 상태 배너: 지원 여부/권한/켜짐 상태에 따라 문구와 켜기·끄기 버튼을 그린다.
// (culture/ui.js, reminders/ui.js와 같은 역할 — 알림 기능의 화면 담당)

import {
  isSupported,
  getPermission,
  requestPermission,
  isNotifyEnabled,
  setNotifyEnabled,
  unsubscribe,
} from './notify.js';

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
