// grievance/EvidenceGallery.jsx
// Photo evidence upload and display for complaints
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function EvidenceGallery({ complaintId, uploaderCitizenId, uploaderUserId, canUpload = false }) {
  const [photos, setPhotos] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    if (complaintId) loadPhotos();
  }, [complaintId]);

  async function loadPhotos() {
    const { data } = await supabase
      .from('complaint_evidence')
      .select('id, file_url, uploaded_at, uploaded_by_citizen_id, uploaded_by_user_id')
      .eq('complaint_id', complaintId)
      .order('uploaded_at', { ascending: false });

    if (data) setPhotos(data);
  }

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type and size
    if (!file.type.startsWith('image/')) {
      setError('Only image files allowed.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be under 5MB.');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const ext = file.name.split('.').pop();
      const path = `evidence/${complaintId}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('complaint-evidence')
        .upload(path, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('complaint-evidence')
        .getPublicUrl(path);

      const { error: dbError } = await supabase
        .from('complaint_evidence')
        .insert({
          complaint_id: complaintId,
          file_url: urlData.publicUrl,
          file_path: path,
          uploaded_by_citizen_id: uploaderCitizenId || null,
          uploaded_by_user_id: uploaderUserId || null,
        });

      if (dbError) throw dbError;

      loadPhotos();
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
              onClick={() => setPreview(p.file_url)}
              style={{ cursor: 'pointer', borderRadius: 8, overflow: 'hidden', aspectRatio: '1', background: '#f1f5f9' }}
            >
              <img
                src={p.file_url}
                alt="Evidence"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={e => { e.target.style.display = 'none'; }}
              />
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
            <input
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