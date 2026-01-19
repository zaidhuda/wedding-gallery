import { env } from "cloudflare:workers";

const ENVIRONMENT = env.ENVIRONMENT
const PHOTO_BASE_URL = env.PHOTO_BASE_URL;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const selfOrigin = url.origin;
    const origin = request.headers.get('Origin');
    const secFetchSite = request.headers.get('Sec-Fetch-Site');
    const isDevelopment = ENVIRONMENT === "development"

    const normalizeOrigin = (value) => {
      if (!value) return null;
      try { return new URL(value).origin; } catch { return null; }
    };

    const requestOrigin = normalizeOrigin(origin);
    const isSameOriginByOrigin = requestOrigin && requestOrigin === selfOrigin;
    const isSameOriginByFetchMeta = secFetchSite === 'same-origin';

    if (!isSameOriginByOrigin && !isSameOriginByFetchMeta && !isDevelopment) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': 'null',
        },
      });
    }

    // ===== CORS HEADERS =====
    const corsHeaders = {
      'Access-Control-Allow-Origin': requestOrigin || selfOrigin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Credentials': path.startsWith('/admin') ? 'true' : 'true',
    };

    // Handle CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Single guest password for access control
    const GUEST_PASSWORD = 'ZM2026';

    // Helper: Check if request is authenticated via Cloudflare Access
    const isAccessAuthenticated = (request) => {
      if (isDevelopment) return true;
      const jwt = request.headers.get('Cf-Access-Jwt-Assertion');
      const email = request.headers.get('Cf-Access-Authenticated-User-Email');
      return !!(jwt && email);
    };

    const getAccessEmail = (request) => {
      if (isDevelopment) return 'dev@localhost';
      return request.headers.get('Cf-Access-Authenticated-User-Email') || 'unknown';
    };

    // ===== AI CONTENT MODERATION =====

    // AI Text moderation using Llama-3-8b-instruct (Malay Wedding Context)
    const moderateTextWithAI = async (name, message, env) => {
      try {
        // Skip if no meaningful user text to moderate
        // name might be 'Anonymous' (default) and message might be empty
        const hasUserText = (name && name !== 'Anonymous') || (message && message.trim());
        if (!hasUserText) {
          return { safe: true, reason: 'no_text' };
        }

        // Skip AI in local dev if AI binding not available
        if (!env.AI) {
          console.log('AI binding not available, skipping text moderation');
          return { safe: true, reason: 'ai_unavailable' };
        }

        const textToAnalyze = `Name: "${name || 'Anonymous'}"\nMessage: "${message || ''}"`;

        const response = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
          messages: [
            {
              role: 'system',
              content: `You are a culturally-aware moderator for a Malay Wedding.

CORE INSTRUCTION:
Your job is to distinguish between MALICE (hate/insults) and SLANG (celebration/banter).
You must use "fuzzy logic" to interpret intent. If the sentiment is positive, ALLOW IT, even if it uses harsh words.

1. PATTERN RECOGNITION (How to detect Slang):
- **The "Intensifier" Rule:** Malaysians often use "violent" or "rude" words to mean "Very".
- IF [Positive Adjective] + [Negative Word], THEN result is SAFE.
- Examples of this pattern: "Lawa nak mampus" (Pretty to death), "Sedap gila" (Crazy delicious), "Jahat gila kereta ni" (This car is wickedly good).
- Treat ANY word used in this grammatical structure as an intensifier, not an insult.

2. PATTERN RECOGNITION (Friendly Insults):
- **The "Best Friend" Rule:** Insults are often used as terms of endearment between close friends.
- Look for: [Congratulations/Well Wishes] + [Insult].
- Example: "Tahniah setan" (Congrats devil) or "Selamat pengantin baru, gemuk" (Happy wedding, fatty).
- IF the message contains well-wishes or congratulations, ignore the insult. It is SAFE.

3. HARD LIMITS (The only strict "NO"):
- Racism/Hate Speech: Slurs against race or religion are NEVER allowed.
- Sexual Harassment: Explicit sexual comments about the bride/groom.
- Malicious Intent: Insults *without* any well-wishes or humor (e.g., "Kau buruk" = UNSAFE).

Respond with ONLY valid JSON:
{"safe": true} or {"safe": false, "reason": "brief explanation"}`
            },
            {
              role: 'user',
              content: textToAnalyze
            }
          ],
          max_tokens: 100,
        });

        const aiResponse = response.response || '';
        console.log('AI text moderation response:', aiResponse);

        // Parse JSON response
        try {
          // Extract JSON from response (handle potential extra text)
          const jsonMatch = aiResponse.match(/\{[^}]+\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return {
              safe: parsed.safe === true,
              reason: parsed.reason || (parsed.safe ? 'ai_approved' : 'ai_flagged'),
              detail: aiResponse
            };
          }
        } catch (parseError) {
          console.error('Failed to parse AI response:', parseError);
        }

        // If we can't parse, check for keywords
        const lowerResponse = aiResponse.toLowerCase();
        if (lowerResponse.includes('"safe": true') || lowerResponse.includes('"safe":true')) {
          return { safe: true, reason: 'ai_approved', detail: aiResponse };
        }
        if (lowerResponse.includes('"safe": false') || lowerResponse.includes('"safe":false')) {
          return { safe: false, reason: 'ai_flagged', detail: aiResponse };
        }

        // Uncertain - allow but flag for review
        return { safe: true, reason: 'ai_uncertain', detail: aiResponse };

      } catch (error) {
        console.error('AI text moderation error:', error);
        // On AI error, allow but log (fail-open for text to avoid blocking legitimate messages)
        return { safe: true, reason: 'ai_error', detail: error.message };
      }
    };

    // AI Image moderation using Workers AI (Malay Wedding Context)
    const moderateImageWithAI = async (imageBlob, env) => {
      try {
        if (!env.AI) {
          console.log('AI binding not available, skipping image moderation');
          return { safe: true, reason: 'ai_unavailable', confidence: 0 };
        }

        const imageData = await imageBlob.arrayBuffer();
        const imageArray = [...new Uint8Array(imageData)];

        const response = await env.AI.run('@cf/llava-hf/llava-1.5-7b-hf', {
          image: imageArray,
          prompt: `You are a moderator for a Malay Wedding. Analyze this image for safety.

CRITICAL CULTURAL CONTEXT (Do NOT flag these as unsafe):
1. CEREMONIAL WEAPONS: The Groom often wears a "Keris" (dagger) tucked in his waist sash (Sampin). This is COSTUME/TRADITION, not a threat. MARK AS SAFE.
2. HENNA/INAI: Red/Orange intricate patterns on hands/fingers are "Inai" (Henna dye). This is NOT blood, gore, or disease. MARK AS SAFE.
3. INTIMACY: Forehead kisses, hand-kissing (salam), and hugging are expected wedding behaviors. MARK AS SAFE unless there is nudity.
4. ATTIRE: Fitted dresses (Kebaya) or sheer headscarves are traditional formal wear. MARK AS SAFE.

GENERIC SAFE ELEMENTS:
- Food/Feasts (Nasi Minyak, buffet settings).
- Crowds, family groups, children running.
- Wedding throne (Pelamin), flowers, gifts.

UNSAFE CONTENT (Reject ONLY if):
- Nudity or visible genitalia.
- Real violence (fighting, blood, guns - distinct from the ceremonial Keris).
- Middle finger gestures or explicit hate symbols.
- Gore (distinct from Henna).

Is this image SAFE for a public wedding gallery?
Answer strictly with: "SAFE" or "UNSAFE" followed by a very short reason.`,
          max_tokens: 60,
        });

        const aiResponse = (response.description || response.response || '').toLowerCase();
        console.log('AI image moderation response:', aiResponse);

        if (aiResponse.includes('unsafe')) {
          return { safe: false, reason: 'ai_flagged', detail: aiResponse, confidence: 0.9 };
        }
        if (aiResponse.includes('safe')) {
          return { safe: true, reason: 'ai_approved', detail: aiResponse, confidence: 0.9 };
        }

        // For Malay wedding context, be more permissive with uncertain responses
        // Most wedding photos are legitimate, so default to safe with lower confidence
        return { safe: true, reason: 'ai_uncertain', detail: aiResponse, confidence: 0.6 };

      } catch (error) {
        console.error('AI image moderation error:', error);
        return { safe: false, reason: 'ai_error', detail: error.message, confidence: 0 };
      }
    };

    // Combined content moderation - runs text and image checks in parallel
    const moderateContent = async (imageBlob, name, message, env) => {
      // Run both moderations in parallel for speed
      const [textResult, imageResult] = await Promise.all([
        moderateTextWithAI(name, message, env),
        moderateImageWithAI(imageBlob, env),
      ]);

      console.log('Text moderation:', JSON.stringify(textResult));
      console.log('Image moderation:', JSON.stringify(imageResult));

      return {
        textSafe: textResult.safe,
        textReason: textResult.reason,
        textDetail: textResult.detail,
        imageSafe: imageResult.safe,
        imageReason: imageResult.reason,
        imageDetail: imageResult.detail,
        imageConfidence: imageResult.confidence || 0,
        // Auto-approve only if BOTH text and image are safe with high confidence
        autoApproved: textResult.safe && imageResult.safe && (imageResult.confidence >= 0.8),
      };
    };

    // Upload endpoint with AI moderation
    if (path === '/api/upload' && method === 'POST') {
      const formData = await request.formData();
      const uploadPassword = formData.get('pass');

      if (!uploadPassword || uploadPassword.toLowerCase() !== GUEST_PASSWORD.toLowerCase()) {
        console.error('Password validation failed:', {
          received: uploadPassword,
          expected: GUEST_PASSWORD,
          type: typeof uploadPassword
        });
        return new Response(
          JSON.stringify({ error: 'Invalid or missing password' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      try {
        const image = formData.get('image');
        const name = (formData.get('name') || '').trim() || 'Anonymous';
        const message = (formData.get('message') || '').trim();

        if (name.length > 50) {
          return new Response(
            JSON.stringify({ error: 'Name is too long (max 50 characters)' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        if (message.length > 500) {
          return new Response(
            JSON.stringify({ error: 'Message is too long (max 500 characters)' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        const eventTag = formData.get('eventTag');

        if (!image || !eventTag) {
          return new Response(
            JSON.stringify({ error: 'Missing required fields: image and eventTag' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const validEventTags = ['Ijab & Qabul', 'Sanding', 'Tandang'];
        if (!validEventTags.includes(eventTag)) {
          return new Response(
            JSON.stringify({ error: 'Invalid eventTag' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const format = formData.get('format') || 'image/jpeg';
        const extension = format === 'image/webp' ? '.webp' : '.jpg';
        const filename = `${crypto.randomUUID()}${extension}`;
        const objectKey = `photos/${filename}`;

        // Clone the image blob for AI processing
        const imageArrayBuffer = await image.arrayBuffer();
        const imageBlob = new Blob([imageArrayBuffer], { type: format });

        // Run AI content moderation BEFORE uploading to R2
        // This way we can reject inappropriate text immediately without wasting storage
        const moderation = await moderateContent(imageBlob, name, message, env);

        console.log(`Upload moderation result: ${JSON.stringify(moderation)}`);

        // REJECT immediately if text is inappropriate (400 Bad Request)
        if (!moderation.textSafe) {
          return new Response(
            JSON.stringify({
              error: "Your message contains content that doesn't match the wedding vibe. Please try a different caption!",
              code: 'TEXT_MODERATION_FAILED',
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Text is safe, proceed with upload to R2
        await env.PHOTOS_BUCKET.put(objectKey, imageArrayBuffer, {
          httpMetadata: { contentType: format },
        });

        const imageUrl = `${PHOTO_BASE_URL}/${objectKey}`;
        const takenAt = formData.get('takenAt') || new Date().toISOString();
        const timestamp = new Date().toISOString();
        const isApproved = moderation.autoApproved ? 1 : 0;

        // Generate edit token for 1-hour edit window
        const editToken = crypto.randomUUID();

        // Save to D1 with moderation result and edit token
        await env.DB.prepare(
          'INSERT INTO photos (object_key, name, message, event_tag, timestamp, taken_at, is_approved, token) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        )
          .bind(objectKey, name, message, eventTag, timestamp, takenAt, isApproved, editToken)
          .run();

        // Get the inserted photo ID by token
        const insertedPhoto = await env.DB.prepare(
          'SELECT id FROM photos WHERE token = ?'
        )
          .bind(editToken)
          .first();

        return new Response(
          JSON.stringify({
            success: true,
            url: imageUrl,
            id: insertedPhoto?.id,
            token: editToken,
            autoApproved: moderation.autoApproved,
            moderationReason: moderation.autoApproved ? 'auto_approved' : moderation.imageReason,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

      } catch (error) {
        console.error('Upload error:', error);
        return new Response(
          JSON.stringify({ error: 'Upload failed' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Edit photo endpoint (name/message only, within 1 hour)
    if (path === '/api/edit' && method === 'POST') {
      try {
        const body = await request.json();
        const { id, token, name, message } = body;

        if (!id || !token || !name) {
          return new Response(
            JSON.stringify({ error: 'Missing required fields: id, token, name' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (name.length > 50) {
          return new Response(
            JSON.stringify({ error: 'Name is too long (max 50 characters)' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        if (message && message.length > 500) {
          return new Response(
            JSON.stringify({ error: 'Message is too long (max 500 characters)' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Verify token and check 1-hour limit
        const photoRow = await env.DB.prepare(
          'SELECT id, object_key, timestamp, token FROM photos WHERE id = ? AND token = ?'
        )
          .bind(id, token)
          .first();

        if (!photoRow) {
          return new Response(
            JSON.stringify({ error: 'Invalid token or photo not found' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Map to camelCase for logic
        const photo = {
          id: photoRow.id,
          objectKey: photoRow.object_key,
          timestamp: photoRow.timestamp,
          token: photoRow.token
        };

        // Check if within 1 hour (3600000 milliseconds)
        const uploadTime = new Date(photo.timestamp).getTime();
        const now = Date.now();
        const oneHourInMs = 60 * 60 * 1000;

        if (now - uploadTime > oneHourInMs) {
          return new Response(
            JSON.stringify({ error: 'Edit window expired. Photos can only be edited within 1 hour of upload.' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Update name and message
        await env.DB.prepare(
          'UPDATE photos SET name = ?, message = ? WHERE id = ?'
        )
          .bind(name.trim() || 'Anonymous', (message || '').trim(), id)
          .run();

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (error) {
        console.error('Edit error:', error);
        return new Response(
          JSON.stringify({ error: 'Edit failed' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Delete photo endpoint (within 1 hour, deletes DB row + R2 file)
    if (path === '/api/delete' && method === 'POST') {
      try {
        const body = await request.json();
        const { id, token } = body;

        if (!id || !token) {
          return new Response(
            JSON.stringify({ error: 'Missing required fields: id, token' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Verify token and check 1-hour limit
        const photoRow = await env.DB.prepare(
          'SELECT id, object_key, timestamp, token FROM photos WHERE id = ? AND token = ?'
        )
          .bind(id, token)
          .first();

        if (!photoRow) {
          return new Response(
            JSON.stringify({ error: 'Invalid token or photo not found' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Map to camelCase
        const photo = {
          id: photoRow.id,
          objectKey: photoRow.object_key,
          timestamp: photoRow.timestamp,
          token: photoRow.token
        };

        // Check if within 1 hour (3600000 milliseconds)
        const uploadTime = new Date(photo.timestamp).getTime();
        const now = Date.now();
        const oneHourInMs = 60 * 60 * 1000;

        if (now - uploadTime > oneHourInMs) {
          return new Response(
            JSON.stringify({ error: 'Delete window expired. Photos can only be deleted within 1 hour of upload.' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Delete from R2
        if (photo.objectKey) {
          try {
            await env.PHOTOS_BUCKET.delete(photo.objectKey);
          } catch (e) {
            console.error('R2 delete error:', e);
          }
        }

        // Delete from DB
        await env.DB.prepare('DELETE FROM photos WHERE id = ?').bind(id).run();

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (error) {
        console.error('Delete error:', error);
        return new Response(
          JSON.stringify({ error: 'Delete failed' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Get photos endpoint with pagination (PUBLIC - only approved photos)
    if (path === '/api/photos' && method === 'GET') {
      try {
        const eventTag = url.searchParams.get('eventTag');
        const limit = parseInt(url.searchParams.get('limit')) || 12;
        const offset = parseInt(url.searchParams.get('offset')) || 0;

        let query;
        let countQuery;
        let params;

        if (eventTag) {
          query = 'SELECT * FROM photos WHERE is_approved = 1 AND event_tag = ? ORDER BY COALESCE(taken_at, timestamp) DESC LIMIT ? OFFSET ?';
          countQuery = 'SELECT COUNT(*) as total FROM photos WHERE is_approved = 1 AND event_tag = ?';
          params = [eventTag, limit + 1, offset];
        } else {
          query = 'SELECT * FROM photos WHERE is_approved = 1 ORDER BY COALESCE(taken_at, timestamp) DESC LIMIT ? OFFSET ?';
          countQuery = 'SELECT COUNT(*) as total FROM photos WHERE is_approved = 1';
          params = [limit + 1, offset];
        }

        const result = await env.DB.prepare(query).bind(...params).all();
        const countResult = eventTag
          ? await env.DB.prepare(countQuery).bind(eventTag).first()
          : await env.DB.prepare(countQuery).first();

        const photos = (result.results || []).map(p => ({
          id: p.id,
          objectKey: p.object_key,
          name: p.name,
          message: p.message,
          eventTag: p.event_tag,
          timestamp: p.timestamp,
          takenAt: p.taken_at,
          isApproved: p.is_approved,
          token: p.token,
          url: `${PHOTO_BASE_URL}/${p.object_key}`
        }));
        const hasMore = photos.length > limit;

        if (hasMore) photos.pop();

        return new Response(
          JSON.stringify({ photos, hasMore, total: countResult?.total || 0, limit, offset }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (error) {
        console.error('Fetch photos error:', error);
        return new Response(
          JSON.stringify({ error: 'Failed to fetch photos' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Admin: Get pending photos
    if (path === '/admin/pending' && method === 'GET') {
      try {
        if (!isAccessAuthenticated(request)) {
          return new Response(
            JSON.stringify({ error: 'Unauthorized - Cloudflare Access required' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const adminEmail = getAccessEmail(request);
        console.log(`Admin access by: ${adminEmail}`);

        const result = await env.DB.prepare(
          'SELECT * FROM photos WHERE is_approved = 0 ORDER BY timestamp DESC'
        ).all();

        const photos = (result.results || []).map(p => ({
          id: p.id,
          objectKey: p.object_key,
          name: p.name,
          message: p.message,
          eventTag: p.event_tag,
          timestamp: p.timestamp,
          takenAt: p.taken_at,
          isApproved: p.is_approved,
          token: p.token,
          url: `${PHOTO_BASE_URL}/${p.object_key}`
        }));

        return new Response(
          JSON.stringify({ photos, admin: adminEmail }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (error) {
        console.error('Fetch pending error:', error);
        return new Response(
          JSON.stringify({ error: 'Failed to fetch pending photos' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Admin: Approve or delete photo
    if (path === '/admin/action' && method === 'POST') {
      try {
        if (!isAccessAuthenticated(request)) {
          return new Response(
            JSON.stringify({ error: 'Unauthorized - Cloudflare Access required' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const adminEmail = getAccessEmail(request);
        const body = await request.json();
        const { imageID, action, ids } = body;

        const targetIds = ids || (imageID ? [imageID] : []);
        if (targetIds.length === 0) {
          return new Response(
            JSON.stringify({ error: 'Missing imageID or ids' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log(`Admin ${adminEmail}: ${action} on ${targetIds.length} photo(s)`);

        if (action === 'approve') {
          const placeholders = targetIds.map(() => '?').join(',');
          await env.DB.prepare(
            `UPDATE photos SET is_approved = 1 WHERE id IN (${placeholders})`
          ).bind(...targetIds).run();

          return new Response(
            JSON.stringify({ success: true, action: 'approved', count: targetIds.length }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } else if (action === 'delete') {
          const placeholders = targetIds.map(() => '?').join(',');
          const photosRes = await env.DB.prepare(
            `SELECT id, object_key FROM photos WHERE id IN (${placeholders})`
          ).bind(...targetIds).all();

          for (const photo of photosRes.results || []) {
            if (photo.object_key) {
              try {
                await env.PHOTOS_BUCKET.delete(photo.object_key);
              } catch (e) {
                console.error('R2 delete error:', e);
              }
            }
          }

          await env.DB.prepare(
            `DELETE FROM photos WHERE id IN (${placeholders})`
          ).bind(...targetIds).run();

          return new Response(
            JSON.stringify({ success: true, action: 'deleted', count: targetIds.length }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } else {
          return new Response(
            JSON.stringify({ error: 'Invalid action. Use "approve" or "delete"' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } catch (error) {
        console.error('Admin action error:', error);
        return new Response(
          JSON.stringify({ error: 'Action failed' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Admin: Verify authentication (ping endpoint for frontend)
    if (path === '/admin/verify' && method === 'GET') {
      if (!isAccessAuthenticated(request)) {
        return new Response(
          JSON.stringify({ authenticated: false }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const adminEmail = getAccessEmail(request);
      console.log(`Admin verified: ${adminEmail}`);

      return new Response(
        JSON.stringify({ authenticated: true, email: adminEmail }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Admin: Unapprove a photo (set is_approved = 0)
    if (path === '/admin/unapprove' && method === 'POST') {
      try {
        if (!isAccessAuthenticated(request)) {
          return new Response(
            JSON.stringify({ error: 'Unauthorized - Cloudflare Access required' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const adminEmail = getAccessEmail(request);
        const body = await request.json();
        const { id } = body;

        if (!id) {
          return new Response(
            JSON.stringify({ error: 'Missing photo id' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log(`Admin ${adminEmail}: unapprove photo ${id}`);

        await env.DB.prepare(
          'UPDATE photos SET is_approved = 0 WHERE id = ?'
        ).bind(id).run();

        return new Response(
          JSON.stringify({ success: true, action: 'unapproved', id }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (error) {
        console.error('Unapprove error:', error);
        return new Response(
          JSON.stringify({ error: 'Unapprove failed' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Serve images from R2
    if (isDevelopment && path.startsWith('/images/') && method === 'GET') {
      try {
        const objectKey = path.replace('/images/', '');
        const object = await env.PHOTOS_BUCKET.get(objectKey);

        if (!object) {
          return new Response('Not Found', { status: 404, headers: corsHeaders });
        }

        const headers = new Headers(corsHeaders);
        object.writeHttpMetadata(headers);
        headers.set('etag', object.httpEtag);
        // Cache images for 1 year (immutable content with UUID filenames)
        headers.set('Cache-Control', 'public, max-age=31536000, immutable');

        return new Response(object.body, { headers });
      } catch (error) {
        console.error('Image serve error:', error);
        return new Response('Error serving image', { status: 500, headers: corsHeaders });
      }
    }

    return new Response('Not Found', { status: 404, headers: corsHeaders });
  },
};
