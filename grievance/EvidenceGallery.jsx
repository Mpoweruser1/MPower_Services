// grievance/EvidenceGallery.jsx
// Photo evidence upload and display for complaints.
//
// Uses the same functions as the "new complaint" form (uploadEvidence,
// fetchEvidence, getEvidenceUrl in grievanceApi.js), so a photo attached
// while filing and one added later land in the same place
// (complaint_attachments, private bucket, short-lived signed links) and
// both show here. Photos are shrunk before upload inside uploadEvidence.
import { useState, useEffect } from 'react';
import { uploadEvidence, fetchEvidence, getEvidenceUrl } from './grievanceApi';

// Guard against pathological files only; normal phone photos are shrunk
// to a few hundred KB by uploadEvidence before they leave the device.
const MAX_RAW_PHOTO_BYTES = 30 * 1024 * 1024;

export default function EvidenceGallery({ complaintId, uploaderCitizenId, uploaderUserId, canUpload = false }) {
  const [photos, setPhotos] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    if (complaintId) loadPhotos();
  }, [complaintId]);

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

  async function handleUpload(e) {
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

    setUploading(true);
    setError(null);

    try {
      await uploadEvidence({
        complaintId,
        file,
        uploadedByCitizenId: uploaderCitizenId || null,
        uploadedByUserId: uploaderUserId || null,
      });
      await loadPhotos();
    } catch (err) {
      console.error('Evidence upload failed:', err);
      setError(err.message || 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  }

  if (photos.length === 0 && !canUpload) return null;

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 10 }}>
        📷 Evidence Photos {photos.length > 0 && `(${photos.length})`}
      </div>

      {/* Photo grid */}
      {photos.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
          {photos.map(p => (
            <div
              key={p.id}
              onClick={() => { if (p.url && p.file_type !== 'video') setPreview(p.url); }}
              style={{ cursor: p.url && p.file_type !== 'video' ? 'pointer' : 'default', borderRadius: 8, overflow: 'hidden', aspectRatio: '1', background: '#f1f5f9' }}
            >
              {p.url && p.file_type === 'video' ? (
                <video
                  src={p.url}
                  controls
                  preload="metadata"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : p.url ? (
                <img
                  src={p.url}
                  alt="Evidence"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={e => { e.target.style.display = 'none'; }}
                />
              ) : null}
            </div>
          ))}
        </div>
      )}

      {/* Upload button */}
      {canUpload && (
        <div>
          <label style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 14px', borderRadius: 8,
            border: '2px dashed #e2e8f0', cursor: 'pointer',
            color: '#64748b', fontSize: 13,
            background: uploading ? '#f8fafc' : '#fff',
          }}>
            <span>{uploading ? '⏳ Uploading...' : '📎 Add photo evidence'}</span>
            <input id="evidence-file" name="evidence-file"
              type="file"
              accept="image/*"
              onChange={handleUpload}
              disabled={uploading}
              style={{ display: 'none' }}
            />
          </label>
          {error && (
            <div style={{ fontSize: 12, color: '#dc2626', marginTop: 6 }}>{error}</div>
          )}
        </div>
      )}

      {/* Full screen preview */}
      {preview && (
        <div
          onClick={() => setPreview(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: 20,
          }}
        >
          <img
            src={preview}
            alt="Evidence preview"
            style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 8, objectFit: 'contain' }}
          />
          <button
            onClick={() => setPreview(null)}
            style={{
              position: 'absolute', top: 20, right: 20,
              background: 'rgba(255,255,255,0.2)', border: 'none',
              color: '#fff', width: 36, height: 36, borderRadius: '50%',
              fontSize: 18, cursor: 'pointer',
            }}
          >✕</button>
        </div>
      )}
    </div>
  );
}