// src/grievance/VoiceInput.jsx   (NEW file -- add, don't replace; 14-10-2026)
//
// Voice input shared by the citizen complaint screens. Uses the browser's own speech
// recognition (Chrome / Edge, no outside service, nothing to pay for) -- the same
// mechanism the Subject and Description boxes already used.
//
//   <MicButton onClick={...} />
//   listenOnce({ language, onText, onUnsupported })   // language: 'Telugu' -> te-IN, else en-IN
//   appendText(previous, spoken)                      // adds spoken words after what is there

export function speechLang(language) {
  return language === 'Telugu' ? 'te-IN' : 'en-IN';
}

export function appendText(prev, spoken) {
  return prev ? `${prev} ${spoken}` : spoken;
}

export function listenOnce({ language, onText, onUnsupported, onError }) {
  const SpeechRecognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
  if (!SpeechRecognition) {
    if (onUnsupported) onUnsupported();
    return null;
  }
  const recognition = new SpeechRecognition();
  recognition.lang = speechLang(language);
  recognition.interimResults = false;
  recognition.onresult = (event) => {
    const spoken = event.results[0][0].transcript;
    if (spoken) onText(spoken);
  };
  recognition.onerror = (event) => { if (onError) onError(event); };
  recognition.start();
  return recognition;
}

export function MicButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Speak instead of typing"
      aria-label="Speak instead of typing"
      style={{
        flexShrink: 0, width: 42, border: '1px solid #e2e8f0', borderRadius: 6,
        background: '#f8fafc', fontSize: 18, cursor: 'pointer',
      }}
    >
      🎤
    </button>
  );
}
