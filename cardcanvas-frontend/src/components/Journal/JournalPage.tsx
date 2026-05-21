'use client';
import { useCallback, useRef, useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Camera, X } from 'lucide-react';
import { api } from '@/lib/api';
import MoodSelector from './MoodSelector';
import ReflectionQuestions from './ReflectionQuestions';
import JournalTodoList, { type TodoItem } from './JournalTodoList';
import type { JournalEntry, Mood } from '@/types';

// Curated list of famous motivational quotes
const MOTIVATIONAL_QUOTES = [
  { text: "Believe you can and you're halfway there.", author: "Theodore Roosevelt" },
  { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
  { text: "Act as if what you do makes a difference. It does.", author: "William James" },
  { text: "Success is not final, failure is not fatal: it is the courage to continue that counts.", author: "Winston Churchill" },
  { text: "In the middle of every difficulty lies opportunity.", author: "Albert Einstein" },
  { text: "The best way to predict the future is to create it.", author: "Abraham Lincoln" },
  { text: "You must be the change you wish to see in the world.", author: "Mahatma Gandhi" },
  { text: "Do what you can, with what you have, where you are.", author: "Theodore Roosevelt" },
  { text: "Keep your face always toward the sunshine—and shadows will fall behind you.", author: "Walt Whitman" },
  { text: "Happiness depends upon ourselves.", author: "Aristotle" },
  { text: "Your time is limited, so don't waste it living someone else's life.", author: "Steve Jobs" },
  { text: "The only limit to our realization of tomorrow will be our doubts of today.", author: "Franklin D. Roosevelt" },
  { text: "Nothing is impossible, the word itself says 'I'm possible'!", author: "Audrey Hepburn" },
  { text: "It is during our darkest moments that we must focus to see the light.", author: "Aristotle" },
  { text: "Change your thoughts and you change your world.", author: "Norman Vincent Peale" },
  { text: "Be present in all things and thankful for all things.", author: "Maya Angelou" },
  { text: "Let the beauty of what you love be what you do.", author: "Rumi" },
  { text: "Yesterday is history, tomorrow is a mystery, today is a gift of God, which is why we call it the present.", author: "Bil Keane" },
  { text: "The only true wisdom is in knowing you know nothing.", author: "Socrates" },
  { text: "The power of imagination makes us infinite.", author: "John Muir" },
  { text: "The journey of a thousand miles begins with one step.", author: "Lao Tzu" },
  { text: "To love and be loved is to feel the sun from both sides.", author: "David Viscott" },
  { text: "Don't count the days, make the days count.", author: "Muhammad Ali" },
  { text: "You miss 100% of the shots you don't take.", author: "Wayne Gretzky" },
  { text: "Strive not to be a success, but rather to be of value.", author: "Albert Einstein" },
  { text: "I attribute my success to this: I never gave or took any excuse.", author: "Florence Nightingale" },
  { text: "Every strike brings me closer to the next home run.", author: "Babe Ruth" },
  { text: "Life is what happens to you while you're busy making other plans.", author: "John Lennon" },
  { text: "We become what we think about.", author: "Earl Nightingale" },
  { text: "An unexamined life is not worth living.", author: "Socrates" }
];

const getQuoteForDate = (d: Date) => {
  // Compute day of year to deterministically select a quote
  const start = new Date(d.getFullYear(), 0, 1);
  const diff = d.getTime() - start.getTime() + (start.getTimezoneOffset() - d.getTimezoneOffset()) * 60000;
  const oneDay = 1000 * 60 * 60 * 24;
  const dayOfYear = Math.floor(diff / oneDay);
  const index = Math.abs(dayOfYear) % MOTIVATIONAL_QUOTES.length;
  return MOTIVATIONAL_QUOTES[index];
};

interface Props {
  date: Date;
  entry: JournalEntry | null;
  onSave: (data: Partial<JournalEntry>) => void;
}

export default function JournalPage({ date, entry, onSave }: Props) {
  const [mood, setMood] = useState<Mood | null>(entry?.mood ?? null);
  const [gratefulText, setGratefulText] = useState(entry?.grateful_text ?? '');
  const [longTermVision, setLongTermVision] = useState(entry?.long_term_vision ?? '');
  const [tinyWin, setTinyWin] = useState(entry?.tiny_win ?? '');
  const [reflections, setReflections] = useState<boolean[]>(entry?.reflection_answers ?? [false, false, false, false, false, false]);
  const [photos, setPhotos] = useState<string[]>(entry?.photo_urls ?? []);
  const [uploading, setUploading] = useState<number | null>(null);
  const [todos, setTodos] = useState<TodoItem[]>(() => {
    if (!entry?.content) return [];
    try {
      const parsed = JSON.parse(entry.content);
      if (Array.isArray(parsed)) return parsed;
    } catch (e) {
      // Fallback if legacy content is non-JSON
    }
    return [];
  });

  const fileInput0 = useRef<HTMLInputElement>(null);
  const fileInput1 = useRef<HTMLInputElement>(null);

  // Sync state if entry prop changes (e.g. user loaded a different day)
  useEffect(() => {
    setMood(entry?.mood ?? null);
    setGratefulText(entry?.grateful_text ?? '');
    setLongTermVision(entry?.long_term_vision ?? '');
    setTinyWin(entry?.tiny_win ?? '');
    setReflections(entry?.reflection_answers ?? [false, false, false, false, false, false]);
    setPhotos(entry?.photo_urls ?? []);

    let parsedTodos: TodoItem[] = [];
    if (entry?.content) {
      try {
        const parsed = JSON.parse(entry.content);
        if (Array.isArray(parsed)) {
          parsedTodos = parsed;
        }
      } catch (e) {
        // Fallback
      }
    }
    setTodos(parsedTodos);
  }, [entry]);

  // Keep latest state values in a ref to avoid stale closures in debounced save handler
  const stateRef = useRef({ mood, gratefulText, todos, longTermVision, tinyWin, reflections, photos });
  stateRef.current = { mood, gratefulText, todos, longTermVision, tinyWin, reflections, photos };

  // Debounced save
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const current = stateRef.current;
      onSave({
        mood: current.mood,
        grateful_text: current.gratefulText,
        content: JSON.stringify(current.todos),
        long_term_vision: current.longTermVision,
        tiny_win: current.tinyWin,
        reflection_answers: current.reflections,
        photo_urls: current.photos,
      });
    }, 1500);
  }, [onSave]);

  // Specific state update helpers
  const updateMood = (m: Mood) => {
    setMood(m);
    // Execute save quickly for immediate mood score calculation on backend
    setTimeout(() => triggerSave(), 50);
  };
  const updateGrateful = (v: string) => {
    setGratefulText(v);
    triggerSave();
  };
  const updateVision = (v: string) => {
    setLongTermVision(v);
    triggerSave();
  };
  const updateWin = (v: string) => {
    setTinyWin(v);
    triggerSave();
  };
  const updateReflections = (a: boolean[]) => {
    setReflections(a);
    setTimeout(() => triggerSave(), 50);
  };
  const updateTodos = (updated: TodoItem[]) => {
    setTodos(updated);
    triggerSave();
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>, slot: number) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setUploading(slot);
    try {
      const result = await api.media.upload(file);
      const updated = [...photos];
      updated[slot] = result.url;
      setPhotos(updated);
      setTimeout(() => {
        onSave({ photo_urls: updated });
      }, 100);
    } catch (err) {
      console.error('Photo upload failed:', err);
    } finally {
      setUploading(null);
    }
  };

  const removePhoto = (slot: number) => {
    const updated = [...photos];
    updated[slot] = '';
    const filtered = updated.filter(Boolean);
    setPhotos(filtered.length > 0 ? updated : []);
    setTimeout(() => {
      onSave({ photo_urls: filtered.length > 0 ? updated : [] });
    }, 100);
  };

  const dayName = format(date, 'EEEE');
  const dateDisplay = format(date, 'MMMM d, yyyy').replace(', ', ',');
  const quote = getQuoteForDate(date);

  return (
    <div className="journal-page" id="journal-page">
      <div className="journal-page-scroll">
        <div className="journal-page-inner">

          {/* Topmost header: Date & Quotes */}
          <div className="journal-header-quote">
            <div className="journal-page-date">
              <div className="journal-page-day">{dayName},</div>
              <div className="journal-page-datestr">{dateDisplay}</div>
            </div>
            <div className="journal-quote-center">
              <span className="journal-quote-text">&ldquo;{quote.text}&rdquo;</span>
              <span className="journal-quote-author"> &mdash; {quote.author}</span>
            </div>
          </div>

          {/* Top row: Grateful + Photos */}
          <div className="journal-top-row">
            {/* Grateful section (2/3 width) */}
            <div className="journal-card journal-card-green">
              <div className="journal-card-title">Im grateful for ... 🌸</div>
              <textarea
                className="journal-textarea"
                placeholder="What made you smile today…"
                value={gratefulText}
                onChange={e => updateGrateful(e.target.value)}
                rows={3}
                id="journal-grateful"
              />
            </div>

            {/* Photo uploads (1/3 width, horizontal flex) */}
            <div className="journal-photos" id="journal-photos">
              {[0, 1].map(slot => {
                const url = photos[slot];
                return (
                  <div key={slot} className="journal-photo-slot">
                    {url ? (
                      <div className="journal-photo-filled">
                        <img src={url} alt={`Photo ${slot + 1}`} className="journal-photo-img" />
                        <button
                          type="button"
                          className="journal-photo-remove"
                          onClick={() => removePhoto(slot)}
                          title="Remove photo"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="journal-photo-empty"
                        onClick={() => (slot === 0 ? fileInput0 : fileInput1).current?.click()}
                        disabled={uploading === slot}
                      >
                        {uploading === slot ? (
                          <span className="journal-photo-uploading">uploading…</span>
                        ) : (
                          <>
                            <Camera size={18} />
                            <span className="journal-photo-label-lowercase">photo</span>
                          </>
                        )}
                      </button>
                    )}
                    <input
                      ref={slot === 0 ? fileInput0 : fileInput1}
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={e => handlePhotoUpload(e, slot)}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Middle Layout: Todo checklist (left) + Column container (right) */}
          <div className="journal-middle-layout">
            
            {/* Left Column: To-Do Section (Blue Card) */}
            <div className="journal-card journal-card-blue journal-todo-card-wrap">
              <div className="journal-card-title">To-do 📝</div>
              <JournalTodoList todos={todos} onChange={updateTodos} />
            </div>

            {/* Right Column: Long-Term Vision + Daily Reflections + Mood Selector */}
            <div className="journal-right-column">
              
              {/* My Long-Term Vision (Pink Card) */}
              <div className="journal-card journal-card-pink journal-flex-card">
                <div className="journal-card-title">My Long-Term Vision 🌟</div>
                <textarea
                  className="journal-textarea journal-flex-textarea"
                  placeholder="Where do you see yourself…"
                  value={longTermVision}
                  onChange={e => updateVision(e.target.value)}
                  id="journal-vision"
                />
              </div>

              {/* Daily Reflection Section (Neutral Card) */}
              <div className="journal-card journal-card-neutral journal-flex-card">
                <div className="journal-card-title">Daily Reflection 🪞</div>
                <ReflectionQuestions answers={reflections} onChange={updateReflections} />
              </div>

              {/* Mood Selector (Yellow Card inside component) */}
              <MoodSelector selected={mood} onChange={updateMood} />

            </div>
          </div>

          {/* Bottom row: Tiny Win (Purple Card) */}
          <div className="journal-card journal-card-pinkbar">
            <input
              className="journal-tinywin-input"
              placeholder="my tiny win of the day section ✨ …"
              value={tinyWin}
              onChange={e => updateWin(e.target.value)}
              id="journal-tiny-win"
            />
          </div>

        </div>
      </div>
    </div>
  );
}
