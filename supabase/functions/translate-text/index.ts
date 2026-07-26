// supabase/functions/translate-text/index.ts
const GOOGLE_TRANSLATE_API_KEY = Deno.env.get('GOOGLE_TRANSLATE_API_KEY');

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

Deno.serve(async (req) => {
  try {
    const { text, targetLanguage = 'en', ticketId, messageId } = await req.json();
    if (!text || !text.trim()) return new Response(JSON.stringify({ error: 'text is required' }), { status: 400 });

    const res = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${GOOGLE_TRANSLATE_API_KEY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: text, target: targetLanguage, format: 'text' }),
    });

    if (!res.ok) {
      console.error('Google Translate failed:', await res.text());
      return new Response(JSON.stringify({ error: 'Translation failed' }), { status: 502 });
    }

    const data = await res.json();
    const translatedText = data.data?.translations?.[0]?.translatedText || '';
    const detectedSourceLanguage = data.data?.translations?.[0]?.detectedSourceLanguage || 'unknown';

    if (ticketId) {
      await supabase.from('ticket_translations').insert({
        ticket_id: ticketId, message_id: messageId || null, original_text: text,
        original_language: detectedSourceLanguage, translated_text: translatedText, translated_to: targetLanguage,
      });
    }

    return new Response(JSON.stringify({ translatedText, detectedSourceLanguage }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: 'Internal error translating text' }), { status: 500 });
  }
});