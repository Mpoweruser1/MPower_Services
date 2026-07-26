// shared/UnsavedChangesGuard.jsx — FINAL
// Uses beforeunload event only — compatible with all React Router versions
import { useEffect } from 'react';

export default function UnsavedChangesGuard({ isDirty, message }) {
  useEffect(() => {
    if (!isDirty) return;

    function handleBeforeUnload(e) {
      e.preventDefault();
      e.returnValue = message || 'You have unsaved changes. Are you sure you want to leave?';
      return e.returnValue;
    }

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty, message]);

  return null;
}