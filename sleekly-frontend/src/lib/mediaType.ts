export type MediaKind = 'image' | 'pdf' | 'link';

export function inferMediaType(url: string, mimeHint?: string): MediaKind {
  if (mimeHint) {
    if (mimeHint.startsWith('image/')) return 'image';
    if (mimeHint === 'application/pdf') return 'pdf';
  }
  const path = url.split('?')[0].toLowerCase();
  if (/\.(jpe?g|gif|png|webp|svg|bmp|ico)$/.test(path)) return 'image';
  if (/\.pdf$/i.test(path)) return 'pdf';
  const t = url.trim();
  if (/^https?:\/\//i.test(t)) return 'link';
  if (t.startsWith('media://') || t.startsWith('asset://')) {
    if (mimeHint?.includes('pdf')) return 'pdf';
    if (mimeHint?.startsWith('image/')) return 'image';
    return 'image';
  }
  return 'link';
}
