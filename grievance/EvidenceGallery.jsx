// grievance/EvidenceGallery.jsx
// Photo and video evidence for complaints -- upload and display.   (rebuilt 14-10-2026)
//
// One shared component: the citizen, the representative, the MLA and the office all see
// exactly this. Same functions as the "new complaint" form (uploadEvidence, fetchEvidence,
// getEvidenceUrl in grievanceApi.js), so a photo attached while filing and one added later
// land in the same place (complaint_attachments, private bucket, short-lived signed links).
//
// What it shows now, for every photo / video:
//   * the WHOLE picture in its tile (not cropped);
//   * what it is: the caption the citizen wrote ("What does this photo show?"), else the
//     file name, with the file name underneath when there is a caption;
//   * who added it (citizen / office staff) and when;
//   * a tap opens a large viewer: the whole picture fitted to the screen (or zoomed), the
//     caption, file name, who and when, previous / next arrows, "open original", and
//     videos play there with controls.
// Adding a photo later asks for an optional caption first (with the mic).
//
// Props are unchanged, plus an optional `language` ('Telugu' | 'English') for the mic.
import { useState, useEffect, useRef } from 'react';
import { uploadEvidence, fetchEvidence, getEvidenceUrl } from './grievanceApi';
import { MicButton, listenOnce, appendText } from './VoiceInput';

// Guard against pathological files only; normal phone photos are shrunk
// to a few hundred KB by uploadEvidence before they leave the device.
const MAX_RAW_PHOTO_BYTES = 30 * 1024 * 1024;
const CAPTION_MAX = 300;

const isVideo = (p) => p.file_type === 'video';
const titleOf = (p) => p.caption || p.file_name || (isVideo(p) ? 'Video' : 'Photo');
const whoOf = (p) => (p.uploaded_by_citizen_id ? 'Citizen' : 'Office staff');

function fmtDate(iso, withTime) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('en-IN', withTime
      ? { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }
      : { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return ''; }
}

function fmtSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function EvidenceGallery({ complaintId, uploaderCitizenId, uploaderUserId, canUpload = false, language }) {
  const [photos, setPhotos] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [viewIndex, setViewIndex] = useState(null);
  const [pending, setPending] = useState(null); // { file, previewUrl, caption } -- chosen, not yet uploaded
  const pendingRef = useRef(null);
  pendingRef.current = pending;

  useEffect(() => {
    if (complaintId) loadPhotos();
  }, [complaintId]);

  // Free the temporary preview if this is closed with a file still waiting.
  useEffect(() => () => {
    const p = pendingRef.current;
    if (p && p.previewUrl && typeof URL !== 'undefined' && URL.revokeObjectURL) URL.revokeObjectURL(p.previewUrl);
  }, []);

  async function loadPhotos() {
    try {
      const rows = await fetchEvidence(complaintId);
      // The bucket is private, so every file needs its own short-lived link.
      const withUrls = await Promise.all(
        rows.map(async (r) => {
          try {
            return { ...r, url: await getEvidenceUrl(r.storage_path) };
          } catch {
            return { ...r, url: null };
          }
        })
      );
      setPhotos(withUrls);
    } catch (err) {
      console.error('Loading evidence failed:', err);
    }
  }

  function clearPending() {
    setPending((p) => {
      if (p && p.previewUrl && typeof URL !== 'undefined' && URL.revokeObjectURL) URL.revokeObjectURL(p.previewUrl);
      return null;
    });
  }

  function handleChoose(e) {
    const file = e.target.files?.[0];
    // Lets the same file be picked again after an error.
    e.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Only image files allowed.');
      return;
    }
    if (file.size > MAX_RAW_PHOTO_BYTES) {
      setError('Image is too large. Please choose a smaller one.');
      return;
    }
    setError(null);
    clearPending();
    setPending({
      file,
      caption: '',
      previewUrl: typeof URL !== 'undefined' && URL.createObjectURL ? URL.createObjectURL(file) : null,
    });
  }

  async function handleUpload() {
    if (!pending) return;
    setUploading(true);
    setError(null);
    try {
      await uploadEvidence({
        complaintId,
        file: pending.file,
        caption: pending.caption.trim() || undefined,
        uploadedByCitizenId: uploaderCitizenId || null,
        uploadedByUserId: uploaderUserId || null,
      });
      clearPending();
      await loadPhotos();
    } catch (err) {
      console.error('Evidence upload failed:', err);
      setError(err.message || 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  }

  function speakCaption() {
    listenOnce({
      language,
      onText: (txt) => setPending((p) => (p ? { ...p, caption: appendText(p.caption, txt).slice(0, CAPTION_MAX) } : p)),
      onUnsupported: () => setError('Voice input needs Chrome or Edge — not supported in this browser.'),
    });
  }

  if (photos.length === 0 && !canUpload) return null;

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 10 }}>
        📷 Evidence {photos.length > 0 && `(${photos.length})`}
      </div>

      {/* Evidence tiles: the whole picture, what it is, who added it and when */}
      {photos.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, marginBottom: 12 }}>
          {photos.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setViewIndex(i)}
              aria-label={`Open ${titleOf(p)}`}
              style={{ display: 'block', width: '100%', padding: 0, textAlign: 'left', cursor: 'pointer', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', background: '#fff' }}
            >
              <div style={{ position: 'relative', aspectRatio: '4 / 3', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {p.url && isVideo(p) ? (
                  <>
                    <video src={p.url} preload="metadata" muted playsInline style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                    <span aria-hidden="true" style={{ position: 'absolute', fontSize: 28, color: '#fff', textShadow: '0 1px 6px rgba(0,0,0,0.6)' }}>▶</span>
                  </>
                ) : p.url ? (
                  <img
                    src={p.url}
                    alt={titleOf(p)}
                    style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                ) : (
                  <span style={{ fontSize: 12, color: '#64748b' }}>Not available</span>
                )}
              </div>
              <div style={{ padding: '6px 8px', display: 'grid', gap: 2 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: '#1a1a2e', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflowWrap: 'anywhere' }}>
                  {titleOf(p)}
                </div>
                {p.caption && p.file_name && (
                  <div style={{ fontSize: 11, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.file_name}</div>
                )}
                <div style={{ fontSize: 11, color: '#64748b' }}>{whoOf(p)} · {fmtDate(p.created_at, false)}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Add a photo: pick it, optionally say what it shows, then upload */}
      {canUpload && (
        <div style={{ display: 'grid', gap: 10 }}>
          {pending && (
            <div style={{ display: 'grid', gap: 8, border: '1px solid #e2e8f0', borderRadius: 8, padding: 10, background: '#f8fafc' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                {pending.previewUrl && <img src={pending.previewUrl} alt="" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />}
                <div style={{ minWidth: 0, fontSize: 12.5, color: '#1a1a2e', overflowWrap: 'anywhere' }}>
                  {pending.file.name}
                  <div style={{ fontSize: 11, color: '#64748b' }}>{fmtSize(pending.file.size)}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  id="evidence-caption" name="evidence-caption"
                  value={pending.caption}
                  onChange={(e) => setPending((p) => ({ ...p, caption: e.target.value.slice(0, CAPTION_MAX) }))}
                  maxLength={CAPTION_MAX}
                  aria-label="What does this photo show? (optional)"
                  placeholder="What does this photo show? (optional)"
                  disabled={uploading}
                  style={{ flex: 1, border: '1px solid #e2e8f0', borderRadius: 6, padding: '9px 11px', fontSize: 13.5, background: '#fff' }}
                />
                <MicButton onClick={speakCaption} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={handleUpload} disabled={uploading}
                  style={{ flex: 1, background: '#1a1a2e', color: '#e8a020', border: 'none', borderRadius: 7, padding: '10px 14px', fontSize: 13.5, fontWeight: 600, cursor: uploading ? 'default' : 'pointer' }}>
                  {uploading ? '⏳ Uploading...' : 'Upload photo'}
                </button>
                <button type="button" onClick={clearPending} disabled={uploading}
                  style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 7, padding: '10px 14px', fontSize: 13.5, fontWeight: 600, color: '#64748b', cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
            </div>
          )}
          <label style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 14px', borderRadius: 8,
            border: '2px dashed #e2e8f0', cursor: 'pointer',
            color: '#64748b', fontSize: 13,
            background: '#fff',
          }}>
            <span>📎 Add photo evidence</span>
            <input id="evidence-file" name="evidence-file"
              type="file"
              accept="image/*"
              onChange={handleChoose}
              disabled={uploading}
              style={{ display: 'none' }}
            />
          </label>
          {error && (
            <div style={{ fontSize: 12, color: '#dc2626' }}>{error}</div>
          )}
        </div>
      )}

      {viewIndex !== null && photos[viewIndex] && (
        <EvidenceViewer
          items={photos}
          index={viewIndex}
          onIndex={setViewIndex}
          onClose={() => setViewIndex(null)}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------
 * The large viewer
 * ------------------------------------------------------------------- */

function EvidenceViewer({ items, index, onIndex, onClose }) {
  const p = items[index];
  const [zoomed, setZoomed] = useState(false);
  const closeRef = useRef(null);
  const many = items.length > 1;

  useEffect(() => { setZoomed(false); }, [index]);

  useEffect(() => {
    if (closeRef.current) closeRef.current.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prevOverflow; };
  }, []);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
      else if (e.key === 'ArrowRight' && index < items.length - 1) onIndex(index + 1);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [index, items.length, onClose, onIndex]);

  const bar = { background: 'rgba(255,255,255,0.14)', border: 'none', color: '#fff', borderRadius: 8, padding: '8px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer', textDecoration: 'none' };
  const arrow = { position: 'absolute', top: '50%', transform: 'translateY(-50%)', width: 44, height: 56, background: 'rgba(0,0,0,0.45)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 26, cursor: 'pointer', zIndex: 2 };

  return (
    <div role="dialog" aria-modal="true" aria-label="Evidence viewer"
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: '#0f172a', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', color: '#e2e8f0', fontSize: 13 }}>
        <span style={{ flex: 1 }}>{index + 1} / {items.length}</span>
        {!isVideo(p) && p.url && (
          <button type="button" onClick={() => setZoomed((z) => !z)} style={bar} aria-pressed={zoomed}>
            {zoomed ? 'Fit to screen' : '🔍 Zoom'}
          </button>
        )}
        {p.url && <a href={p.url} target="_blank" rel="noopener noreferrer" style={bar}>Open original ↗</a>}
        <button type="button" ref={closeRef} onClick={onClose} aria-label="Close viewer" style={bar}>✕ Close</button>
      </div>

      <div
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', alignItems: zoomed ? 'flex-start' : 'center', justifyContent: zoomed ? 'flex-start' : 'center', padding: '0 12px' }}
      >
        {many && index > 0 && (
          <button type="button" aria-label="Previous" onClick={() => onIndex(index - 1)} style={{ ...arrow, left: 8 }}>‹</button>
        )}
        {many && index < items.length - 1 && (
          <button type="button" aria-label="Next" onClick={() => onIndex(index + 1)} style={{ ...arrow, right: 8 }}>›</button>
        )}
        {!p.url ? (
          <div style={{ color: '#cbd5e1', fontSize: 14 }}>This file is not available right now.</div>
        ) : isVideo(p) ? (
          <video key={p.id} src={p.url} controls playsInline style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 8 }} />
        ) : (
          <img
            key={p.id}
            src={p.url}
            alt={titleOf(p)}
            style={zoomed
              ? { maxWidth: 'none', width: '180%', borderRadius: 4 }
              : { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8 }}
          />
        )}
      </div>

      <div style={{ background: '#fff', padding: '12px 16px 16px', display: 'grid', gap: 3, maxHeight: '32vh', overflowY: 'auto' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#1a1a2e', overflowWrap: 'anywhere' }}>{titleOf(p)}</div>
        {p.caption && p.file_name && <div style={{ fontSize: 12.5, color: '#475569', overflowWrap: 'anywhere' }}>File: {p.file_name}</div>}
        <div style={{ fontSize: 12, color: '#64748b' }}>
          Added by {whoOf(p)} · {fmtDate(p.created_at, true)}{p.file_size_bytes ? ` · ${fmtSize(p.file_size_bytes)}` : ''}
        </div>
      </div>
    </div>
  );
}
