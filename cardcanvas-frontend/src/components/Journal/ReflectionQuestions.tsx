'use client';

const QUESTIONS = [
  { id: 'kind', label: 'Talked kindly?', icon: '💬' },
  { id: 'humble', label: 'Stayed humble?', icon: '🙇' },
  { id: 'calm', label: 'Remained calm?', icon: '🧘' },
  { id: 'family', label: 'Loved my family?', icon: '❤️' },
  { id: 'healthy', label: 'Ate healthy?', icon: '🥗' },
  { id: 'exercise', label: 'Exercised today?', icon: '🏃' },
];

interface Props {
  answers: boolean[];
  onChange: (answers: boolean[]) => void;
}

export default function ReflectionQuestions({ answers, onChange }: Props) {
  // Ensure we always have 6 answers
  const safeAnswers = QUESTIONS.map((_, i) => answers[i] ?? false);

  const toggle = (index: number) => {
    const updated = [...safeAnswers];
    updated[index] = !updated[index];
    onChange(updated);
  };

  return (
    <div className="journal-reflection" id="journal-reflections">
      <div className="journal-reflection-grid">
        {QUESTIONS.map((q, i) => (
          <button
            key={q.id}
            type="button"
            id={`reflection-${q.id}`}
            className={`journal-reflection-item${safeAnswers[i] ? ' checked' : ''}`}
            onClick={() => toggle(i)}
          >
            <span className="journal-reflection-icon">{q.icon}</span>
            <span className="journal-reflection-label">{q.label}</span>
            <span className="journal-reflection-check">
              {safeAnswers[i] ? '✓' : ''}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
