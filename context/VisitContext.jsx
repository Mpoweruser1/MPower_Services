// context/VisitContext.jsx — FINAL
// Tracks the active patient across hospital screens within one session
import React, { createContext, useContext, useState } from 'react';

const VisitContext = createContext(null);

export function VisitProvider({ children }) {
  const [activePatient, setActivePatient] = useState(null);
  // activePatient shape: { id, full_name, patient_uid, phone, abha_linked }

  function clearPatient() { setActivePatient(null); }

  return (
    <VisitContext.Provider value={{ activePatient, setActivePatient, clearPatient }}>
      {children}
    </VisitContext.Provider>
  );
}

export function useVisit() {
  const ctx = useContext(VisitContext);
  if (!ctx) throw new Error('useVisit must be used within VisitProvider');
  return ctx;
}