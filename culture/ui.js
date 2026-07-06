export function renderCultureCard(container, item) {
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

  container.appendChild(card);
}
