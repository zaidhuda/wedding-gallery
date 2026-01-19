import { env } from 'cloudflare:workers';

const ENVIRONMENT = env.ENVIRONMENT;
const PHOTO_BASE_URL = env.PHOTO_BASE_URL;

const TEXT_SYSTEM_PROMPT = `You moderate a Malay wedding LIVE digital guestbook. Decide if text is safe to display publicly.

Allow: praise, congratulations, playful slang, mild swearing used as intensifier, casual jokes, emojis.
Block: insults that attack dignity, humiliation, sexual content, hate/racism/religion slurs, threats, obscene gestures, animal insults.

Rules:
- SAFE if message is clearly positive/celebratory OR a compliment (including about a person).
  Examples SAFE: "Cantik gila Aina", "Handsome gila pengantin", "Sedap sial makanan", "Tahniah setan 🎉".
- UNSAFE if any of these:
  1) Negative appearance/body/face/skin/weight remarks (buruk, hodoh, gemuk, hitam, etc) about a person.
  2) Animal comparisons aimed at a person (babi/anjing, "macam babi", etc).
  3) Insults where the insult is the main point (no clear celebration).
  4) Sexual remarks or sexualised body comments (even as a joke).
  5) Hate/extremism (race/religion slurs).
  6) Deliberate humiliation/embarrassment likely to upset couple/families later.
- UNSURE if cannot confidently classify as safe or unsafe.

Output ONLY valid JSON with one of:
{"result":"safe","reason":"short"} OR {"result":"unsafe","reason":"short"} OR {"result":"unsure","reason":"short"}.
No extra keys. No prose.`;

const IMAGE_SYSTEM_PROMPT = `You are a moderator for a Malay Wedding LIVE Digital Guestbook.
Decide if this image is safe to display publicly.

CULTURAL CONTEXT (do NOT mark unsafe for these):
- Ceremonial Keris worn at the waist (traditional attire), not a threat.
- Inai/henna patterns on hands/fingers, not blood or injury.
- Normal wedding affection: salam/hand-kissing, light hugs, forehead kisses.
- Traditional formal attire: kebaya, baju melayu, songket, sheer headscarves.

SAFE examples:
- Group photos, selfies, food/buffet, pelamin, decorations, families, children.

UNSAFE if ANY apply:
- Nudity or visible genitalia.
- Sexual acts or sexualised posing/touching (even if clothed).
- Real violence, fights, blood/injuries/gore (excluding henna).
- Obscene gestures (middle finger).
- Hate symbols or extremist imagery.

UNSURE if cannot confidently classify as safe or unsafe.

Respond ONLY with valid JSON:
{"result":"safe","reason":"short"} OR {"result":"unsafe","reason":"short"} OR {"result":"unsure","reason":"short"}.
No other text.`;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const selfOrigin = url.origin;
    const origin = request.headers.get('Origin');
    const secFetchSite = request.headers.get('Sec-Fetch-Site');
    const isDevelopment = ENVIRONMENT === 'development';

    const normalizeOrigin = (value) => {
      if (!value) return null;
      try {
        return new URL(value).origin;
      } catch {
        return null;
      }
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
      'Access-Control-Allow-Credentials': path.startsWith('/admin')
        ? 'true'
        : 'true',
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
      return (
        request.headers.get('Cf-Access-Authenticated-User-Email') || 'unknown'
      );
    };

    const extractJsonObject = (text) => {
      if (!text) return null;
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start === -1 || end === -1 || end <= start) return null;
      const candidate = text.slice(start, end + 1);
      return candidate;
    };

    const parseSafeUnsafeFallback = (textRaw) => {
      const t = (textRaw || '').trim();
      if (!t) return null;

      // Take the first token only to avoid "not unsafe" traps
      const firstToken = t.split(/\s+/)[0].toUpperCase();
      if (firstToken === 'SAFE')
        return { result: 'safe', reason: 'ai_approved_fallback' };
      if (firstToken === 'UNSAFE')
        return { result: 'unsafe', reason: 'ai_flagged_fallback' };
      if (firstToken === 'UNSURE')
        return { result: 'unsure', reason: 'ai_unsure_fallback' };
      return null;
    };

    // Timeout wrapper for AI calls (10 seconds)
    const withTimeout = (promise, ms = 10000) => {
      return Promise.race([
        promise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('AI_TIMEOUT')), ms),
        ),
      ]);
    };

    const moderateTextWithAI = async (name, message, env) => {
      try {
        const hasUserText =
          (name && name.trim() && name !== 'Anonymous') ||
          (message && message.trim());
        if (!hasUserText) {
          return { status: 'safe', reason: 'no_text' };
        }

        if (!env.AI) {
          console.log('AI binding not available, requires manual review');
          return { status: 'unsure', reason: 'ai_unavailable' };
        }

        const safeName = (name || 'Anonymous').trim().slice(0, 50);
        const safeMsg = (message || '').trim().slice(0, 500);

        const textToAnalyze =
          `Guestbook entry:\n` +
          `- DisplayName (metadata, not an insult target): ${JSON.stringify(safeName)}\n` +
          `- Message: ${JSON.stringify(safeMsg)}`;

        const payload = {
          messages: [
            { role: 'system', content: TEXT_SYSTEM_PROMPT },
            { role: 'user', content: textToAnalyze },
          ],
          temperature: 0,
          top_p: 1,
          max_tokens: 40,
          stop: ['\n\n', '```'],
          response_format: {
            type: 'json_schema',
            json_schema: {
              type: 'object',
              properties: {
                result: { type: 'string', enum: ['safe', 'unsafe', 'unsure'] },
                reason: { type: 'string' },
              },
              required: ['result'],
              additionalProperties: false,
            },
          },
        };

        const response = await withTimeout(
          env.AI.run('@cf/meta/llama-3.2-3b-instruct', payload),
        );

        const aiText =
          (response &&
            (response.response || response.output_text || response.text)) ||
          '';
        console.log('AI text moderation raw:', aiText);

        const candidate = extractJsonObject(aiText);
        if (candidate) {
          try {
            const parsed = JSON.parse(candidate);
            if (parsed.result === 'safe' || parsed.safe === true) {
              return {
                status: 'safe',
                reason: parsed.reason || 'ai_approved',
                detail: aiText,
              };
            } else if (parsed.result === 'unsafe' || parsed.safe === false) {
              return {
                status: 'unsafe',
                reason: parsed.reason || 'ai_flagged',
                detail: aiText,
              };
            } else if (parsed.result === 'unsure') {
              return {
                status: 'unsure',
                reason: parsed.reason || 'ai_unsure',
                detail: aiText,
              };
            }
          } catch (e) {
            console.error('Failed to parse AI JSON:', e);
          }
        }

        const fallback = parseSafeUnsafeFallback(aiText);
        if (fallback) {
          return {
            status: fallback.result,
            reason: fallback.reason,
            detail: aiText,
          };
        }

        return { status: 'unsure', reason: 'needs_review', detail: aiText };
      } catch (error) {
        console.error('AI text moderation error:', error);
        return {
          status: 'unsure',
          reason: 'ai_error_review',
          detail: error?.message || String(error),
        };
      }
    };

    const moderateImageWithAI = async (imageBlob, env) => {
      try {
        if (!env.AI) {
          console.log('AI binding not available, requires manual review');
          return { status: 'unsure', reason: 'ai_unavailable' };
        }

        const buf = await imageBlob.arrayBuffer();
        const image = new Uint8Array(buf);

        const response = await withTimeout(
          env.AI.run('@cf/meta/llama-3.2-11b-vision-instruct', {
            image,
            prompt: IMAGE_SYSTEM_PROMPT,
            max_tokens: 60,
            temperature: 0,
            top_p: 1,
          }),
        );

        const raw =
          (response &&
            (response.response ||
              response.description ||
              response.output_text ||
              response.text)) ||
          '';
        console.log('AI image moderation raw:', raw);

        const jsonCandidate = extractJsonObject(raw);
        if (jsonCandidate) {
          try {
            const parsed = JSON.parse(jsonCandidate);
            if (parsed.result === 'safe' || parsed.safe === true) {
              return {
                status: 'safe',
                reason: parsed.reason || 'ai_approved',
                detail: raw,
              };
            } else if (parsed.result === 'unsafe' || parsed.safe === false) {
              return {
                status: 'unsafe',
                reason: parsed.reason || 'ai_flagged',
                detail: raw,
              };
            } else if (parsed.result === 'unsure') {
              return {
                status: 'unsure',
                reason: parsed.reason || 'ai_unsure',
                detail: raw,
              };
            }
          } catch (e) {
            console.error('Failed to parse AI JSON:', e);
          }
        }

        const fallback = parseSafeUnsafeFallback(raw);
        if (fallback) {
          return {
            status: fallback.result,
            reason: fallback.reason,
            detail: raw,
          };
        }

        return { status: 'unsure', reason: 'needs_review', detail: raw };
      } catch (error) {
        console.error('AI image moderation error:', error);
        return {
          status: 'unsure',
          reason: 'ai_error_review',
          detail: error?.message || String(error),
        };
      }
    };

    // Upload endpoint with AI moderation
    if (path === '/api/upload' && method === 'POST') {
      const formData = await request.formData();
      const uploadPassword = formData.get('pass');

      if (
        !uploadPassword ||
        uploadPassword.toLowerCase() !== GUEST_PASSWORD.toLowerCase()
      ) {
        console.error('Password validation failed:', {
          received: uploadPassword,
          expected: GUEST_PASSWORD,
          type: typeof uploadPassword,
        });
        return new Response(
          JSON.stringify({ error: 'Invalid or missing password' }),
          {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        );
      }

      try {
        const image = formData.get('image');
        const name = (formData.get('name') || '').trim() || 'Anonymous';
        const message = (formData.get('message') || '').trim();

        if (name.length > 50) {
          return new Response(
            JSON.stringify({ error: 'Name is too long (max 50 characters)' }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        }
        if (message.length > 500) {
          return new Response(
            JSON.stringify({
              error: 'Message is too long (max 500 characters)',
            }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        }
        const eventTag = formData.get('eventTag');

        if (!image || !eventTag) {
          return new Response(
            JSON.stringify({
              error: 'Missing required fields: image and eventTag',
            }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        }

        const validEventTags = ['Ijab & Qabul', 'Sanding', 'Tandang'];
        if (!validEventTags.includes(eventTag)) {
          return new Response(JSON.stringify({ error: 'Invalid eventTag' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const format = formData.get('format') || 'image/jpeg';
        const extension = format === 'image/webp' ? '.webp' : '.jpg';
        const filename = `${crypto.randomUUID()}${extension}`;
        const objectKey = `photos/${filename}`;

        // Clone the image blob for AI processing
        const imageArrayBuffer = await image.arrayBuffer();
        const imageBlob = new Blob([imageArrayBuffer], { type: format });

        // STEP 1: Moderate text first
        const textResult = await moderateTextWithAI(name, message, env);
        console.log('Text moderation:', JSON.stringify(textResult));

        // REJECT immediately if text is unsafe (400 Bad Request)
        if (textResult.status === 'unsafe') {
          return new Response(
            JSON.stringify({
              error:
                "Your message contains content that doesn't match the wedding vibe. Please try a different caption!",
              code: 'TEXT_MODERATION_FAILED',
            }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        }

        // STEP 2: Moderate image (only if text passed)
        const imageResult = await moderateImageWithAI(imageBlob, env);
        console.log('Image moderation:', JSON.stringify(imageResult));

        // REJECT immediately if image is unsafe (400 Bad Request)
        if (imageResult.status === 'unsafe') {
          return new Response(
            JSON.stringify({
              error:
                "Your photo contains content that can't be displayed. Please try a different photo!",
              code: 'IMAGE_MODERATION_FAILED',
            }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        }

        // Determine approval status:
        // - Both safe => auto-approve (isApproved = 1)
        // - Either unsure => needs review (isApproved = 0)
        const bothSafe =
          textResult.status === 'safe' && imageResult.status === 'safe';
        const isApproved = bothSafe ? 1 : 0;

        // Proceed with upload to R2
        await env.PHOTOS_BUCKET.put(objectKey, imageArrayBuffer, {
          httpMetadata: { contentType: format },
        });

        const imageUrl = `${PHOTO_BASE_URL}/${objectKey}`;
        const takenAt = formData.get('takenAt') || new Date().toISOString();
        const timestamp = new Date().toISOString();

        // Generate edit token for 1-hour edit window
        const editToken = crypto.randomUUID();

        // Save to D1 with moderation result and edit token
        await env.DB.prepare(
          'INSERT INTO photos (object_key, name, message, event_tag, timestamp, taken_at, is_approved, token) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        )
          .bind(
            objectKey,
            name,
            message,
            eventTag,
            timestamp,
            takenAt,
            isApproved,
            editToken,
          )
          .run();

        // Get the inserted photo ID by token
        const insertedPhoto = await env.DB.prepare(
          'SELECT id FROM photos WHERE token = ?',
        )
          .bind(editToken)
          .first();

        return new Response(
          JSON.stringify({
            success: true,
            url: imageUrl,
            id: insertedPhoto?.id,
            token: editToken,
            autoApproved: bothSafe,
            moderationReason: bothSafe
              ? 'auto_approved'
              : textResult.status === 'unsure'
                ? textResult.reason
                : imageResult.reason,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      } catch (error) {
        console.error('Upload error:', error);
        return new Response(JSON.stringify({ error: 'Upload failed' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Edit photo endpoint (name/message only, within 1 hour)
    if (path === '/api/edit' && method === 'POST') {
      try {
        const body = await request.json();
        const { id, token } = body;
        const name = (body.name || '').trim() || 'Anonymous';
        const message = (body.message || '').trim();

        if (!id || !token) {
          return new Response(
            JSON.stringify({
              error: 'Missing required fields: id, token',
            }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        }

        if (name.length > 50) {
          return new Response(
            JSON.stringify({ error: 'Name is too long (max 50 characters)' }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        }
        if (message.length > 500) {
          return new Response(
            JSON.stringify({
              error: 'Message is too long (max 500 characters)',
            }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        }

        // Verify token and check 1-hour limit
        const photoRow = await env.DB.prepare(
          'SELECT id, object_key, timestamp, token FROM photos WHERE id = ? AND token = ?',
        )
          .bind(id, token)
          .first();

        if (!photoRow) {
          return new Response(
            JSON.stringify({ error: 'Invalid token or photo not found' }),
            {
              status: 403,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        }

        // Map to camelCase for logic
        const photo = {
          id: photoRow.id,
          objectKey: photoRow.object_key,
          timestamp: photoRow.timestamp,
          token: photoRow.token,
        };

        // Check if within 1 hour (3600000 milliseconds)
        const uploadTime = new Date(photo.timestamp).getTime();
        const now = Date.now();
        const oneHourInMs = 60 * 60 * 1000;

        if (now - uploadTime > oneHourInMs) {
          return new Response(
            JSON.stringify({
              error:
                'Edit window expired. Photos can only be edited within 1 hour of upload.',
            }),
            {
              status: 403,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        }

        // Run AI text moderation on the new name/message
        // For edits: only allow if text is definitively safe
        // Reject if unsafe OR unsure (stricter than upload)
        const textModeration = await moderateTextWithAI(name, message, env);

        if (textModeration.status !== 'safe') {
          return new Response(
            JSON.stringify({
              error:
                "Your post couldn't be published. Please update your content and try again.",
              code: 'TEXT_MODERATION_FAILED',
            }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        }

        // Update name and message
        await env.DB.prepare(
          'UPDATE photos SET name = ?, message = ? WHERE id = ?',
        )
          .bind(name, message, id)
          .run();

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (error) {
        console.error('Edit error:', error);
        return new Response(JSON.stringify({ error: 'Edit failed' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
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
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        }

        // Verify token and check 1-hour limit
        const photoRow = await env.DB.prepare(
          'SELECT id, object_key, timestamp, token FROM photos WHERE id = ? AND token = ?',
        )
          .bind(id, token)
          .first();

        if (!photoRow) {
          return new Response(
            JSON.stringify({ error: 'Invalid token or photo not found' }),
            {
              status: 403,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        }

        // Map to camelCase
        const photo = {
          id: photoRow.id,
          objectKey: photoRow.object_key,
          timestamp: photoRow.timestamp,
          token: photoRow.token,
        };

        // Check if within 1 hour (3600000 milliseconds)
        const uploadTime = new Date(photo.timestamp).getTime();
        const now = Date.now();
        const oneHourInMs = 60 * 60 * 1000;

        if (now - uploadTime > oneHourInMs) {
          return new Response(
            JSON.stringify({
              error:
                'Delete window expired. Photos can only be deleted within 1 hour of upload.',
            }),
            {
              status: 403,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
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

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (error) {
        console.error('Delete error:', error);
        return new Response(JSON.stringify({ error: 'Delete failed' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Get photos endpoint with pagination (PUBLIC - only approved photos)
    if (path === '/api/photos' && method === 'GET') {
      try {
        const eventTag = url.searchParams.get('eventTag');
        const limit = parseInt(url.searchParams.get('limit')) || 12;
        const offset = parseInt(url.searchParams.get('offset')) || 0;
        const sinceId = parseInt(url.searchParams.get('since_id'));

        let query;
        let countQuery;
        let params;

        if (sinceId) {
          // Polling mode: fetch all new approved photos since given ID
          // We still respect eventTag if provided
          if (eventTag) {
            query =
              'SELECT * FROM photos WHERE is_approved = 1 AND event_tag = ? AND id > ? ORDER BY id DESC';
            params = [eventTag, sinceId];
          } else {
            query =
              'SELECT * FROM photos WHERE is_approved = 1 AND id > ? ORDER BY id DESC';
            params = [sinceId];
          }
          // No need for count/limit in polling usually, but D1 might limit result size.
          // We'll let it return all changes or maybe limit to 50 just in case.
          query += ' LIMIT 50';
        } else {
          // Standard pagination mode
          if (eventTag) {
            query =
              'SELECT * FROM photos WHERE is_approved = 1 AND event_tag = ? ORDER BY COALESCE(taken_at, timestamp) DESC LIMIT ? OFFSET ?';
            countQuery =
              'SELECT COUNT(*) as total FROM photos WHERE is_approved = 1 AND event_tag = ?';
            params = [eventTag, limit + 1, offset];
          } else {
            query =
              'SELECT * FROM photos WHERE is_approved = 1 ORDER BY COALESCE(taken_at, timestamp) DESC LIMIT ? OFFSET ?';
            countQuery =
              'SELECT COUNT(*) as total FROM photos WHERE is_approved = 1';
            params = [limit + 1, offset];
          }
        }

        const result = await env.DB.prepare(query)
          .bind(...params)
          .all();

        let countResult;
        if (!sinceId) {
          countResult = eventTag
            ? await env.DB.prepare(countQuery).bind(eventTag).first()
            : await env.DB.prepare(countQuery).first();
        }

        const photos = (result.results || []).map((p) => ({
          id: p.id,
          objectKey: p.object_key,
          name: p.name,
          message: p.message,
          eventTag: p.event_tag,
          timestamp: p.timestamp,
          takenAt: p.taken_at,
          isApproved: p.is_approved,
          token: p.token,
          url: `${PHOTO_BASE_URL}/${p.object_key}`,
        }));
        const hasMore = photos.length > limit;

        if (hasMore) photos.pop();

        return new Response(
          JSON.stringify({
            photos,
            hasMore,
            total: countResult?.total || 0,
            limit,
            offset,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      } catch (error) {
        console.error('Fetch photos error:', error);
        return new Response(
          JSON.stringify({ error: 'Failed to fetch photos' }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        );
      }
    }

    // Admin: Get pending photos
    if (path === '/admin/pending' && method === 'GET') {
      try {
        if (!isAccessAuthenticated(request)) {
          return new Response(
            JSON.stringify({
              error: 'Unauthorized - Cloudflare Access required',
            }),
            {
              status: 401,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        }

        const adminEmail = getAccessEmail(request);
        console.log(`Admin access by: ${adminEmail}`);

        const result = await env.DB.prepare(
          'SELECT * FROM photos WHERE is_approved = 0 ORDER BY timestamp DESC',
        ).all();

        const photos = (result.results || []).map((p) => ({
          id: p.id,
          objectKey: p.object_key,
          name: p.name,
          message: p.message,
          eventTag: p.event_tag,
          timestamp: p.timestamp,
          takenAt: p.taken_at,
          isApproved: p.is_approved,
          token: p.token,
          url: `${PHOTO_BASE_URL}/${p.object_key}`,
        }));

        return new Response(JSON.stringify({ photos, admin: adminEmail }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (error) {
        console.error('Fetch pending error:', error);
        return new Response(
          JSON.stringify({ error: 'Failed to fetch pending photos' }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        );
      }
    }

    // Admin: Approve or delete photo
    if (path === '/admin/action' && method === 'POST') {
      try {
        if (!isAccessAuthenticated(request)) {
          return new Response(
            JSON.stringify({
              error: 'Unauthorized - Cloudflare Access required',
            }),
            {
              status: 401,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        }

        const adminEmail = getAccessEmail(request);
        const body = await request.json();
        const { imageID, action, ids } = body;

        const targetIds = ids || (imageID ? [imageID] : []);
        if (targetIds.length === 0) {
          return new Response(
            JSON.stringify({ error: 'Missing imageID or ids' }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        }

        console.log(
          `Admin ${adminEmail}: ${action} on ${targetIds.length} photo(s)`,
        );

        if (action === 'approve') {
          const placeholders = targetIds.map(() => '?').join(',');
          await env.DB.prepare(
            `UPDATE photos SET is_approved = 1 WHERE id IN (${placeholders})`,
          )
            .bind(...targetIds)
            .run();

          return new Response(
            JSON.stringify({
              success: true,
              action: 'approved',
              count: targetIds.length,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          );
        } else if (action === 'delete') {
          const placeholders = targetIds.map(() => '?').join(',');
          const photosRes = await env.DB.prepare(
            `SELECT id, object_key FROM photos WHERE id IN (${placeholders})`,
          )
            .bind(...targetIds)
            .all();

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
            `DELETE FROM photos WHERE id IN (${placeholders})`,
          )
            .bind(...targetIds)
            .run();

          return new Response(
            JSON.stringify({
              success: true,
              action: 'deleted',
              count: targetIds.length,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          );
        } else {
          return new Response(
            JSON.stringify({
              error: 'Invalid action. Use "approve" or "delete"',
            }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        }
      } catch (error) {
        console.error('Admin action error:', error);
        return new Response(JSON.stringify({ error: 'Action failed' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Admin: Verify authentication (ping endpoint for frontend)
    if (path === '/admin/verify' && method === 'GET') {
      if (!isAccessAuthenticated(request)) {
        return new Response(JSON.stringify({ authenticated: false }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const adminEmail = getAccessEmail(request);
      console.log(`Admin verified: ${adminEmail}`);

      return new Response(
        JSON.stringify({ authenticated: true, email: adminEmail }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Admin: Unapprove a photo (set is_approved = 0)
    if (path === '/admin/unapprove' && method === 'POST') {
      try {
        if (!isAccessAuthenticated(request)) {
          return new Response(
            JSON.stringify({
              error: 'Unauthorized - Cloudflare Access required',
            }),
            {
              status: 401,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        }

        const adminEmail = getAccessEmail(request);
        const body = await request.json();
        const { id } = body;

        if (!id) {
          return new Response(JSON.stringify({ error: 'Missing photo id' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        console.log(`Admin ${adminEmail}: unapprove photo ${id}`);

        await env.DB.prepare('UPDATE photos SET is_approved = 0 WHERE id = ?')
          .bind(id)
          .run();

        return new Response(
          JSON.stringify({ success: true, action: 'unapproved', id }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      } catch (error) {
        console.error('Unapprove error:', error);
        return new Response(JSON.stringify({ error: 'Unapprove failed' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Serve images from R2
    if (isDevelopment && path.startsWith('/images/') && method === 'GET') {
      try {
        const objectKey = path.replace('/images/', '');
        const object = await env.PHOTOS_BUCKET.get(objectKey);

        if (!object) {
          return new Response('Not Found', {
            status: 404,
            headers: corsHeaders,
          });
        }

        const headers = new Headers(corsHeaders);
        object.writeHttpMetadata(headers);
        headers.set('etag', object.httpEtag);
        // Cache images for 1 year (immutable content with UUID filenames)
        headers.set('Cache-Control', 'public, max-age=31536000, immutable');

        return new Response(object.body, { headers });
      } catch (error) {
        console.error('Image serve error:', error);
        return new Response('Error serving image', {
          status: 500,
          headers: corsHeaders,
        });
      }
    }

    return new Response('Not Found', { status: 404, headers: corsHeaders });
  },
};
