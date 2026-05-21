import type { Card } from '@/types';

const GAP = 20;

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Check if two rectangles overlap (with gap) */
export function rectsOverlap(a: Rect, b: Rect, gap = GAP): boolean {
  return !(
    a.x + a.width + gap <= b.x ||
    b.x + b.width + gap <= a.x ||
    a.y + a.height + gap <= b.y ||
    b.y + b.height + gap <= a.y
  );
}

/** Check if a rect overlaps any card except excludeId */
export function hasOverlap(
  rect: Rect,
  cards: Card[],
  excludeId?: string,
  gap = GAP
): boolean {
  return cards.some(
    c => c.id !== excludeId && rectsOverlap(rect, c, gap)
  );
}

/** Find the nearest non-overlapping position for a card */
export function findNonOverlappingPosition(
  cardId: string,
  proposedX: number,
  proposedY: number,
  width: number,
  height: number,
  allCards: Card[],
  gap = GAP
): { x: number; y: number } {
  const rect: Rect = { x: proposedX, y: proposedY, width, height };

  if (!hasOverlap(rect, allCards, cardId, gap)) {
    return { x: proposedX, y: proposedY };
  }

  const STEP = 10;
  const MAX_TRIES = 60;

  // Try right
  for (let i = 1; i <= MAX_TRIES; i++) {
    const x = proposedX + i * STEP;
    if (!hasOverlap({ ...rect, x }, allCards, cardId, gap)) {
      return { x, y: proposedY };
    }
  }

  // Try down
  for (let i = 1; i <= MAX_TRIES; i++) {
    const y = proposedY + i * STEP;
    if (!hasOverlap({ ...rect, y }, allCards, cardId, gap)) {
      return { x: proposedX, y };
    }
  }

  // Try left
  for (let i = 1; i <= MAX_TRIES; i++) {
    const x = proposedX - i * STEP;
    if (x < 0) break;
    if (!hasOverlap({ ...rect, x }, allCards, cardId, gap)) {
      return { x, y: proposedY };
    }
  }

  // Try up
  for (let i = 1; i <= MAX_TRIES; i++) {
    const y = proposedY - i * STEP;
    if (y < 0) break;
    if (!hasOverlap({ ...rect, y }, allCards, cardId, gap)) {
      return { x: proposedX, y };
    }
  }

  // Spiral outward
  for (let radius = 1; radius <= MAX_TRIES; radius++) {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
        const x = proposedX + dx * STEP;
        const y = proposedY + dy * STEP;
        if (x < 0 || y < 0) continue;
        if (!hasOverlap({ x, y, width, height }, allCards, cardId, gap)) {
          return { x, y };
        }
      }
    }
  }

  return { x: proposedX, y: proposedY };
}
