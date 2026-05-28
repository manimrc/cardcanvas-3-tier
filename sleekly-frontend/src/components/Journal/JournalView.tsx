'use client';
import { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { api } from '@/lib/api';
import { useAuth } from '@/components/AuthContext';
import JournalPage from './JournalPage';
import type { JournalEntry } from '@/types';

interface Props {
  /** Selected date from the calendar (managed by parent/sidebar) */
  selectedDate: Date;
  isLightMode?: boolean;
}

export default function JournalView({ selectedDate, isLightMode }: Props) {
  const { user } = useAuth();
  const [entry, setEntry] = useState<JournalEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const dateStr = format(selectedDate, 'yyyy-MM-dd');

  // Load entry for selected date
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoading(true);

    api.journal
      .getEntry(dateStr)
      .then(data => {
        if (!cancelled) setEntry(data);
      })
      .catch(err => {
        console.error('Failed to load journal entry:', err);
        if (!cancelled) setEntry(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user, dateStr]);

  // Save handler — upserts entry
  const handleSave = useCallback(
    async (data: Partial<JournalEntry>) => {
      if (!user) return;
      try {
        const saved = await api.journal.saveEntry(dateStr, data);
        if (saved.entry_date === dateStr) {
          setEntry(saved);
        }
      } catch (err) {
        console.error('Failed to save journal entry:', err);
      }
    },
    [user, dateStr],
  );

  if (loading) {
    return (
      <div className="journal-view journal-loading">
        <div className="journal-loading-inner">
          <div className="journal-loading-icon">📔</div>
          <div className="journal-loading-text">Opening your journal…</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`journal-view${isLightMode ? '' : ' journal-dark'}`}>
      <JournalPage
        key={dateStr}
        date={selectedDate}
        entry={entry}
        onSave={handleSave}
      />
    </div>
  );
}
