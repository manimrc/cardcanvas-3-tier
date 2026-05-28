'use client';
import { type Mood } from '@/types';

interface MoodOption {
  value: Mood;
  emoji: string;
  label: string;
}

const MOODS: MoodOption[] = [
  { value: 'joyful', emoji: '😊', label: 'Joyful' },
  { value: 'peaceful', emoji: '🧘', label: 'Peaceful' },
  { value: 'grateful', emoji: '🙏', label: 'Grateful' },
  { value: 'content', emoji: '😌', label: 'Content' },
  { value: 'neutral', emoji: '😐', label: 'Neutral' },
  { value: 'tired', emoji: '😴', label: 'Tired' },
  { value: 'anxious', emoji: '😰', label: 'Anxious' },
  { value: 'sad', emoji: '😢', label: 'Sad' },
  { value: 'frustrated', emoji: '😤', label: 'Frustrated' },
];

interface Props {
  selected: Mood | null;
  onChange: (mood: Mood) => void;
}

export default function MoodSelector({ selected, onChange }: Props) {
  const selectedLabel = MOODS.find(m => m.value === selected)?.label;

  return (
    <div className="journal-card journal-card-yellow journal-mood-card">
      <div className="journal-card-title">
        How are you feeling?{selectedLabel ? ` — ${selectedLabel}` : ''}
      </div>
      <div className="journal-mood-options-small">
        {MOODS.map(m => (
          <button
            key={m.value}
            type="button"
            id={`mood-${m.value}`}
            className={`journal-mood-pill-small${selected === m.value ? ' active' : ''}`}
            onClick={() => onChange(m.value)}
            title={m.label}
          >
            {m.emoji}
          </button>
        ))}
      </div>
      <p className="journal-ps-message">
        P.S. Tomorrow is another chance to be better, calmer, and happier.
      </p>
    </div>
  );
}
