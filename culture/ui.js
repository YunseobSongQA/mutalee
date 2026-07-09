export function renderCultureCard(container, item, handlers = {}) {
  container.innerHTML = '';
  if (!item) return;

  const card = document.createElement('div');
  card.className = 'card culture-card';

  const text = document.createElement('p');
  text.className = 'culture-text';
  text.textContent = item.type === 'poem' ? `"${item.text}"` : item.title;
  card.appendChild(text);

  const source = document.createElement('p');
  source.className = 'culture-source';
  source.textContent = item.type === 'poem' ? `- ${item.author}` : `- ${item.composer}`;
  card.appendChild(source);

  if (handlers.onRefresh) {
    const refreshBtn = document.createElement('button');
    refreshBtn.className = 'culture-refresh';
    refreshBtn.setAttribute('aria-label', '다른 문구 보기');
    refreshBtn.textContent = '↻';
    refreshBtn.onclick = async () => {
      refreshBtn.disabled = true;
      refreshBtn.classList.add('spinning');
      await handlers.onRefresh();
      // onRefresh가 카드를 다시 그리므로 버튼 상태 복원은 필요 없다.
    };
    card.appendChild(refreshBtn);
  }

  container.appendChild(card);
}
