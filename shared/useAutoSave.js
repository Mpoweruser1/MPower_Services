// shared/useAutoSave.js — FINAL
// Auto-saves form data to localStorage so nothing is lost on
// power failure, accidental tab close, or page refresh.
// Also warns user if they try to navigate away with unsaved changes.

import { useState, useEffect, useCallback, useRef } from 'react';

export function useAutoSave(key, formData, {
  debounceMs   = 2000,   // save after 2 seconds of no changes
  maxAgeDays   = 1,      // discard drafts older than 1 day
  onRestore    = null,   // callback when draft is restored
} = {}) {

  const [hasDraft, setHasDraft]     = useState(false);
  const [lastSaved, setLastSaved]   = useState(null);
  const [isDirty, setIsDirty]       = useState(false);
  const timerRef  = useRef(null);
  const initialRef = useRef(null);

  // Check for existing draft on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`mpower_draft_${key}`);
      if (!saved) return;

      const parsed = JSON.parse(saved);
      const age    = Date.now() - parsed.savedAt;

      // Discard if older than maxAgeDays
      if (age > maxAgeDays * 24 * 60 * 60 * 1000) {
        localStorage.removeItem(`mpower_draft_${key}`);
        return;
      }

      setHasDraft(true);
      setLastSaved(new Date(parsed.savedAt));

      if (onRestore) onRestore(parsed.data);
    } catch {
      // Corrupted draft — ignore
      localStorage.removeItem(`mpower_draft_${key}`);
    }
  }, [key]);

  // Save initial form state to detect changes
  useEffect(() => {
    if (initialRef.current === null) {
      initialRef.current = JSON.stringify(formData);
    }
  }, []);

  // Auto-save on form data change
  useEffect(() => {
    // Detect if form is dirty
    if (initialRef.current !== null) {
      const currentStr = JSON.stringify(formData);
      setIsDirty(currentStr !== initialRef.current);
    }

    // Debounce the save
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      try {
        // Don't save completely empty forms
        const hasData = Object.values(formData).some((v) =>
          v !== null && v !== undefined && v !== '' && v !== false
        );
        if (!hasData) return;

        localStorage.setItem(`mpower_draft_${key}`, JSON.stringify({
          data:    formData,
          savedAt: Date.now(),
        }));
        setLastSaved(new Date());
      } catch {
        // localStorage full or blocked — silent fail
      }
    }, debounceMs);

    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [formData, key, debounceMs]);

  // Warn on page unload if dirty
  useEffect(() => {
    function handleBeforeUnload(e) {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
      return e.returnValue;
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  // Clear draft after successful save
  const clearDraft = useCallback(() => {
    localStorage.removeItem(`mpower_draft_${key}`);
    setHasDraft(false);
    setIsDirty(false);
    initialRef.current = JSON.stringify(formData);
  }, [key, formData]);

  // Dismiss draft without restoring
  const dismissDraft = useCallback(() => {
    localStorage.removeItem(`mpower_draft_${key}`);
    setHasDraft(false);
  }, [key]);

  return { hasDraft, lastSaved, isDirty, clearDraft, dismissDraft };
}