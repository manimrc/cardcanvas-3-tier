/** Shared color palette for cards — used by CanvasCard quick-strip and RichTextEditor */
export const CARD_COLORS = [
  { name: 'Yellow', value: '#FFF9C4' },
  { name: 'Blue', value: '#BBDEFB' },
  { name: 'Green', value: '#C8E6C9' },
  { name: 'Pink', value: '#F8BBD0' },
  { name: 'Purple', value: '#E1BEE7' },
  { name: 'Orange', value: '#FFE0B2' },
  { name: 'Teal', value: '#B2DFDB' },
  { name: 'Indigo', value: '#C5CAE9' },
  { name: 'Coral', value: '#FFCCBC' },
  { name: 'Lime', value: '#DCEDC8' },
  { name: 'Lavender', value: '#D1C4E9' },
  { name: 'Peach', value: '#FFE0CC' },
  { name: 'Slate', value: '#CFD8DC' },
  { name: 'White', value: '#FFFFFF' },
] as const;

/** Max upload file size in bytes (10 MB) */
export const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;

/** Allowed MIME types for file uploads */
export const ALLOWED_UPLOAD_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/bmp',
  'application/pdf',
]);
