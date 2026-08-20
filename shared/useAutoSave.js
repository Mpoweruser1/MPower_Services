// shared/useAutoSave.js — FINAL
// Auto-saves form data to localStorage so nothing is lost on
// power failure, accidental tab close, or page refresh.
// Also warns user if they try to navigate away with unsaved changes.

import { useState, useEffect, useCallback, useRef } from 'react';

export function useAutoSave(key, formData, {
  debounceMs   = 2000,   // save after 2 seconds of no changes
  maxAgeDays   = 1,      // discard drafts older than maxAgeDays
} = {}) {

  const [hasDraft, setHasDraft]     = useState(false);
  const [draftData, setDraftData]   = useState(null);
  const [lastSaved, setLastSaved]   = useState(null);
  const [isDirty, setIsDirty]       = useState(false);
  const timerRef  = useRef(null);
  const initialRef = useRef(null);

  // Check for existing draft on mount — DETECT only, never apply it.
  // Silently auto-filling the form the instant the page loads meant
  // whoever opened it next (a different person on a shared device, or
  // even the same person days later) had someone else's half-typed
  // data appear with no chance to say whether it was theirs. The
  // person must explicitly click "Restore" (via restoreDraft() below)
  // before any of this data ever reaches the form.
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
      setDraftData(parsed.data);
      setLastSaved(new Date(parsed.savedAt));
    } catch {
      // Corrupted draft — ignore
      localStorage.removeItem(`mpower_draft_${key}`);
    }
  }, [key]);

  // Save initial form state to detect changes. initialRef starting at
  // null (not just "unset on mount") lets resetBaseline() below force
  // a resync: the next time this effect's dependency changes, it
  // re-captures whatever formData is current as the new baseline.
  useEffect(() => {
    if (initialRef.current === null) {
      initialRef.current = JSON.stringify(formData);
    }
  }, [formData]);

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
    setDraftData(null);
    setIsDirty(false);
    initialRef.current = JSON.stringify(formData);
  }, [key, formData]);

  // Dismiss draft without restoring
  const dismissDraft = useCallback(() => {
    localStorage.removeItem(`mpower_draft_${key}`);
    setHasDraft(false);
    setDraftData(null);
  }, [key]);

  // Explicit, on-demand restore — only ever called from the person
  // clicking "Restore draft" themselves. Returns the draft data for the
  // caller to apply (e.g. setForm(restoreDraft())), and hides the
  // banner immediately since it's now been acted on.
  const restoreDraft = useCallback(() => {
    setHasDraft(false);
    return draftData;
  }, [draftData]);

  // For callers that reset form state externally (e.g. "Admit another"
  // after a successful submit) without going through clearDraft(). Only
  // resyncs the dirty-tracking baseline — leaves any saved draft alone,
  // unlike clearDraft() which wipes both. Without this, isDirty stays
  // pinned to a comparison against the PREVIOUS entry's data, so the
  // browser's unsaved-changes warning fires on a genuinely blank form.
  const resetBaseline = useCallback(() => {
    initialRef.current = null;
    setIsDirty(false);
  }, []);

  return { hasDraft, draftData, lastSaved, isDirty, clearDraft, dismissDraft, restoreDraft, resetBaseline };
}