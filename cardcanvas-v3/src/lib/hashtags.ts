import type { Card } from '@/types';

/** Strip HTML to plain text for hashtag scanning */
export function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * All hashtag-like tokens from structured tags + title + body (HTML stripped).
 * Keys are lowercase for matching; use collectGlobalTagEntries for display labels.
 */
export function extractHashtagKeys(card: Card): Set<string> {
  const keys = new Set<string>();
  for (const t of card.tags || []) {
    const raw = String(t).replace(/^#/, '').trim();
    if (raw) keys.add(raw.toLowerCase());
  }
  const text = `${card.title || ''} ${stripHtml(card.content || '')}`;
  const re = /#([\w\u00C0-\u024F-]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[1]) keys.add(m[1].toLowerCase());
  }
  return keys;
}

export function collectGlobalTagEntries(cards: Card[]): { key: string; label: string }[] {
  const order: string[] = [];
  const keyToLabel = new Map<string, string>();

  for (const card of cards) {
    const text = `${card.title || ''} ${stripHtml(card.content || '')}`;
    const re = /#([\w\u00C0-\u024F-]+)/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const raw = m[1];
      const key = raw.toLowerCase();
      if (!keyToLabel.has(key)) {
        keyToLabel.set(key, raw);
        order.push(key);
      }
    }
    for (const t of card.tags || []) {
      const raw = String(t).replace(/^#/, '').trim();
      if (!raw) continue;
      const key = raw.toLowerCase();
      if (!keyToLabel.has(key)) {
        keyToLabel.set(key, raw);
        order.push(key);
      }
    }
  }
  return order.map(key => ({ key, label: keyToLabel.get(key)! }));
}

/** Card matches tag filter: no selection = all; with multiple tags, card must include every selected tag (AND). */
export function cardMatchesSelectedTags(card: Card, selectedKeys: string[]): boolean {
  if (selectedKeys.length === 0) return true;
  const keys = extractHashtagKeys(card);
  return selectedKeys.every(s => keys.has(s.toLowerCase()));
}
