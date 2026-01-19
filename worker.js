import { env } from 'cloudflare:workers';

const ENVIRONMENT = env.ENVIRONMENT;
const PHOTO_BASE_URL = env.PHOTO_BASE_URL;
const IS_DEVELOPMENT = ENVIRONMENT === 'development';
const GUEST_PASSWORD = 'ZM2026';
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const VALID_EVENT_TAGS = ['Ijab & Qabul', 'Sanding', 'Tandang'];
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
const ONE_HOUR_IN_MS = 60 * 60 * 1000;

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
{"result":"safe","reason":"[short_reason]"} OR {"result":"unsafe","reason":"[short_reason]"} OR {"result":"unsure","reason":"[short_reason]"}.
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
- JUNK CONTENT: The image is completely blank, solid color, pure noise, extremely blurry to the point of being unrecognizable, or clearly not a photo (e.g., just a single dot or meaningless scribble). If it's a photo but just bad quality, it's SAFE, but if it's "not a real image", it's UNSAFE.

UNSURE if cannot confidently classify as safe or unsafe.

Respond ONLY with valid JSON:
{"result":"safe","reason":"[short_reason]"} OR {"result":"unsafe","reason":"[short_reason]"} OR {"result":"unsure","reason":"[short_reason]"}.
No other text.`;

const normalizeOrigin = (value) => {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
};

const isAccessAuthenticated = (request) => {
  if (IS_DEVELOPMENT) return true;
  const jwt = request.headers.get('Cf-Access-Jwt-Assertion');
  const email = request.headers.get('Cf-Access-Authenticated-User-Email');
  return !!(jwt && email);
};

const getAccessEmail = (request) => {
  if (IS_DEVELOPMENT) return 'dev@localhost';
  return request.headers.get('Cf-Access-Authenticated-User-Email') || 'unknown';
};

const extractJsonObject = (text) => {
  if (!text) return null;
  if (typeof text === 'object') return JSON.stringify(text);
  const raw = text.toString();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  return raw.slice(start, end + 1);
};

const parseSafeUnsafeFallback = (textRaw) => {
  if (!textRaw) return null;
  const raw = textRaw.toString();
  const t = (raw || '').trim();
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

const parseAIModerationResponse = (aiRaw, defaultReasonPrefix) => {
  const aiText =
    typeof aiRaw === 'object'
      ? JSON.stringify(aiRaw)
      : (aiRaw || '').toString();

  // Preferred: JSON parsing
  const candidate = extractJsonObject(aiRaw);
  if (candidate) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed.result === 'safe' || parsed.safe === true) {
        return {
          status: 'safe',
          reason: parsed.reason || `${defaultReasonPrefix}_approved`,
          detail: aiText,
        };
      } else if (parsed.result === 'unsafe' || parsed.safe === false) {
        return {
          status: 'unsafe',
          reason: parsed.reason || `${defaultReasonPrefix}_flagged`,
          detail: aiText,
        };
      } else if (parsed.result === 'unsure') {
        return {
          status: 'unsure',
          reason: parsed.reason || `${defaultReasonPrefix}_unsure`,
          detail: aiText,
        };
      }
    } catch (e) {
      console.error('Failed to parse AI JSON:', e);
    }
  }

  // Fallback: SAFE/UNSAFE/UNSURE first token
  const fallback = parseSafeUnsafeFallback(aiText);
  if (fallback) {
    return {
      status: fallback.result,
      reason: fallback.reason,
      detail: aiText,
    };
  }

  // Default: Unclear output => unsure
  return {
    status: 'unsure',
    reason: `${defaultReasonPrefix}_needs_review`,
    detail: aiText,
  };
};

// Timeout wrapper for AI calls (10 seconds)
const withTimeout = (promise, ms = 10000) =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('AI_TIMEOUT')), ms),
    ),
  ]);

const arrayBufferToBase64 = (buffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  // chunk to avoid call stack issues
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
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
    };

    const response = await withTimeout(
      env.AI.run('@cf/meta/llama-3.2-3b-instruct', payload),
    );

    const aiText =
      (response && (response.response || response.output_text || response.text)) ||
      '';
    console.log('AI text moderation raw:', aiText);

    return parseAIModerationResponse(aiText, 'ai_text');
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
    const b64 = arrayBufferToBase64(buf);
    const dataUrl = `data:${imageBlob.type || 'image/jpeg'};base64,${b64}`;

    const response = await withTimeout(
      env.AI.run('@cf/meta/llama-3.2-11b-vision-instruct', {
        messages: [
          { role: 'system', content: IMAGE_SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Classify this image for guestbook safety.',
              },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
        max_tokens: 60,
        temperature: 0,
        top_p: 1,
      }),
    );

    const aiRaw =
      (response && (response.response || response.output_text || response.text)) ||
      response;
    console.log('AI image moderation raw:', JSON.stringify(aiRaw));

    return parseAIModerationResponse(aiRaw, 'ai_image');
  } catch (error) {
    console.error('AI image moderation error:', error);
    return {
      status: 'unsure',
      reason: 'ai_error_review',
      detail: error?.message || String(error),
    };
  }
};

const handleUpload = async (request, env, corsHeaders) => {
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
    return new Response(JSON.stringify({ error: 'Invalid or missing password' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
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
    const format = formData.get('format') || 'image/jpeg';

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

    // VALIDATION: MIME type
    if (
      !ALLOWED_IMAGE_TYPES.includes(format) ||
      (image.type && !ALLOWED_IMAGE_TYPES.includes(image.type))
    ) {
      return new Response(
        JSON.stringify({
          error: 'Invalid file type. Only JPG, PNG, and WebP are allowed.',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    // VALIDATION: Payload size (10MB limit)
    if (image.size > MAX_IMAGE_SIZE_BYTES) {
      return new Response(
        JSON.stringify({ error: 'Photo is too large (max 10MB).' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    if (!VALID_EVENT_TAGS.includes(eventTag)) {
      return new Response(JSON.stringify({ error: 'Invalid eventTag' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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
};

const handleEdit = async (request, env, corsHeaders) => {
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
    if (now - uploadTime > ONE_HOUR_IN_MS) {
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
    await env.DB.prepare('UPDATE photos SET name = ?, message = ? WHERE id = ?')
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
};

const handleDelete = async (request, env, corsHeaders) => {
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
    if (now - uploadTime > ONE_HOUR_IN_MS) {
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
};

const handlePhotos = async (url, env, corsHeaders) => {
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
        countQuery = 'SELECT COUNT(*) as total FROM photos WHERE is_approved = 1';
        params = [limit + 1, offset];
      }
    }

    const result = await env.DB.prepare(query).bind(...params).all();

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
    return new Response(JSON.stringify({ error: 'Failed to fetch photos' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
};

const handleAdminPending = async (request, env, corsHeaders) => {
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
    return new Response(JSON.stringify({ error: 'Failed to fetch pending photos' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
};

const handleAdminAction = async (request, env, corsHeaders) => {
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
      return new Response(JSON.stringify({ error: 'Missing imageID or ids' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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
    }
    if (action === 'delete') {
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

      await env.DB.prepare(`DELETE FROM photos WHERE id IN (${placeholders})`)
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
    }

    return new Response(
      JSON.stringify({
        error: 'Invalid action. Use "approve" or "delete"',
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  } catch (error) {
    console.error('Admin action error:', error);
    return new Response(JSON.stringify({ error: 'Action failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
};

const handleAdminVerify = async (request, corsHeaders) => {
  if (!isAccessAuthenticated(request)) {
    return new Response(JSON.stringify({ authenticated: false }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const adminEmail = getAccessEmail(request);
  console.log(`Admin verified: ${adminEmail}`);

  return new Response(JSON.stringify({ authenticated: true, email: adminEmail }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
};

const handleAdminUnapprove = async (request, env, corsHeaders) => {
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

    return new Response(JSON.stringify({ success: true, action: 'unapproved', id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Unapprove error:', error);
    return new Response(JSON.stringify({ error: 'Unapprove failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
};

const handleDevImages = async (path, env, corsHeaders) => {
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
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const selfOrigin = url.origin;
    const origin = request.headers.get('Origin');
    const secFetchSite = request.headers.get('Sec-Fetch-Site');

    const requestOrigin = normalizeOrigin(origin);
    const isSameOriginByOrigin = requestOrigin && requestOrigin === selfOrigin;
    const isSameOriginByFetchMeta = secFetchSite === 'same-origin';

    if (!isSameOriginByOrigin && !isSameOriginByFetchMeta && !IS_DEVELOPMENT) {
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

    // Upload endpoint with AI moderation
    if (path === '/api/upload' && method === 'POST') {
      return handleUpload(request, env, corsHeaders);
    }

    // Edit photo endpoint (name/message only, within 1 hour)
    if (path === '/api/edit' && method === 'POST') {
      return handleEdit(request, env, corsHeaders);
    }

    // Delete photo endpoint (within 1 hour, deletes DB row + R2 file)
    if (path === '/api/delete' && method === 'POST') {
      return handleDelete(request, env, corsHeaders);
    }

    // Get photos endpoint with pagination (PUBLIC - only approved photos)
    if (path === '/api/photos' && method === 'GET') {
      return handlePhotos(url, env, corsHeaders);
    }

    // Admin: Get pending photos
    if (path === '/admin/pending' && method === 'GET') {
      return handleAdminPending(request, env, corsHeaders);
    }

    // Admin: Approve or delete photo
    if (path === '/admin/action' && method === 'POST') {
      return handleAdminAction(request, env, corsHeaders);
    }

    // Admin: Verify authentication (ping endpoint for frontend)
    if (path === '/admin/verify' && method === 'GET') {
      return handleAdminVerify(request, corsHeaders);
    }

    // Admin: Unapprove a photo (set is_approved = 0)
    if (path === '/admin/unapprove' && method === 'POST') {
      return handleAdminUnapprove(request, env, corsHeaders);
    }

    // Serve images from R2
    if (IS_DEVELOPMENT && path.startsWith('/images/') && method === 'GET') {
      return handleDevImages(path, env, corsHeaders);
    }

    return new Response('Not Found', { status: 404, headers: corsHeaders });
  },
};
