// src/components/grievance/EvidenceGallery.jsx
//
// Photo/video evidence for a complaint — thumbnails + upload. Used from
// both CitizenPortal (citizen adding evidence to their own complaint,
// any time during its lifecycle) and StaffDashboard (staff adding
// evidence gathered on a site visit). Which one is uploading is decided
// entirely by which prop is passed — uploaderCitizenId or uploaderUserId,
// never both.

import { useState, useEffect, useCallback } from 'react';
import { fetchEvidence, uploadEvidence, getEvidenceUrl } from './grievanceApi';

const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25MB — matches the backstop noted in the storage migration

export default function EvidenceGallery({ complaintId, uploaderCitizenId, uploaderUserId, canUpload = true }) {
  const [attachments, setAttachments] = useState([]);
  const [urls, setUrls] = useState({});
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    const items = await fetchEvidence(complaintId);
    setAttachments(items);
    const entries = await Promise.all(
      items.map(async (a) => [a.id, await getEvidenceUrl(a.storage_path)])
    );
    setUrls(Object.fromEntries(entries));
  }, [complaintId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_FILE_BYTES) {
      setError('File too large — 25MB maximum.');
      e.target.value = '';
      return;
    }
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      setError('Only photos and videos are allowed.');
      e.target.value = '';
      return;
    }

    setError(null);
    setUploading(true);
    try {
      await uploadEvidence({
        complaintId,
        file,
        uploadedByCitizenId: uploaderCitizenId || null,
        uploadedByUserId: uploaderUserId || null,
        caption: caption.trim() || null,
      });
      setCaption('');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  return (
    <div style={{ marginTop: 16 }}>
      <p style={{ fontSize: 12.5, fontWeight: 600, color: '#5B6473', marginBottom: 8 }}>
        Evidence ({attachments.length})
      </p>

      {attachments.length === 0 && !canUpload && (
        <p style={{ fontSize: 12, color: '#8B9099' }}>No evidence attached.</p>
      )}

      {attachments.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: 8, marginBottom: 12 }}>
          {attachments.map((a) => (
            <a
              key={a.id}
              href={urls[a.id]}
              target="_blank"
              rel="noreferrer"
              style={{ display: 'block', border: '1px solid #D9D5C8', borderRadius: 6, overflow: 'hidden', textDecoration: 'none' }}
            >
              {a.file_type === 'photo' ? (
                <img
                  src={urls[a.id]}
                  alt={a.caption || 'evidence'}
                  style={{ width: '100%', height: 70, objectFit: 'cover', display: 'block', background: '#EFEDE6' }}
                />
              ) : (
                <div style={{ width: '100%', height: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#15213A', color: '#fff', fontSize: 11, fontWeight: 600 }}>
                  ▶ Video
                </div>
              )}
              {a.caption && (
                <div style={{ fontSize: 10, color: '#5B6473', padding: '3px 5px', lineHeight: 1.3 }}>{a.caption}</div>
              )}
            </a>
          ))}
        </div>
      )}

      {canUpload && (
        <div style={{ display: 'grid', gap: 6 }}>
          <input
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Caption (optional)"
            style={{ fontSize: 12.5, padding: '7px 9px', border: '1px solid #D9D5C8', borderRadius: 6 }}
          />
          <label
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              fontSize: 12.5, fontWeight: 600, padding: '9px 12px', border: '1px dashed #B9B4A3',
              borderRadius: 6, cursor: uploading ? 'default' : 'pointer', color: '#15213A',
              opacity: uploading ? 0.6 : 1,
            }}
          >
            {uploading ? 'Uploading…' : '+ Add photo or video'}
            <input
              type="file"
              accept="image/*,video/*"
              onChange={handleFileChange}
              disabled={uploading}
              style={{ display: 'none' }}
            />
          </label>
          {error && <p style={{ fontSize: 11.5, color: '#9B3C2E' }}>{error}</p>}
        </div>
      )}
    </div>
  );
}
