import { env } from 'cloudflare:workers';
import { Buffer } from 'buffer';

const ENVIRONMENT = env.ENVIRONMENT;
const IS_DEVELOPMENT = ENVIRONMENT === 'development';
const PHOTO_BASE_URL = env.PHOTO_BASE_URL;
const GUEST_PASSWORD = env.GUEST_PASSWORD;
const MAX_PHOTO_SIZE = env.MAX_PHOTO_SIZE;
const TEXT_SYSTEM_PROMPT = env.TEXT_SYSTEM_PROMPT;
const IMAGE_SYSTEM_PROMPT = env.IMAGE_SYSTEM_PROMPT;

// ===== HELPERS =====

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

const jsonResponse = (data, status = 200, corsHeaders = {}) => {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
};

const errorResponse = (
  message,
  status = 400,
  corsHeaders = {},
  code = null,
) => {
  const body = { error: message };
  if (code) body.code = code;
  return jsonResponse(body, status, corsHeaders);
};

const validateUserInput = (name, message) => {
  if (name && name.length > 50) return 'Name is too long (max 50 characters)';
  if (message && message.length > 500)
    return 'Message is too long (max 500 characters)';
  return null;
};

const mapToPhotoObject = (p) => ({
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
});

const getEditWindowStatus = (timestamp) => {
  const uploadTime = new Date(timestamp).getTime();
  const now = Date.now();
  const oneHourInMs = 60 * 60 * 1000;
  return now - uploadTime <= oneHourInMs;
};

// ===== AI MODERATION =====

const extractJsonObject = (text) => {
  if (!text) return null;
  if (typeof text === 'object') return JSON.stringify(text);
  const raw = text.toString();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  const candidate = raw.slice(start, end + 1);
  return candidate;
};

const parseSafeUnsafeFallback = (textRaw) => {
  if (!textRaw) return null;
  const raw = textRaw.toString();
  const t = (raw || '').trim();
  if (!t) return null;

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
  let parsed = null;

  if (typeof aiRaw === 'object' && aiRaw !== null) {
    // Some Cloudflare AI models return the message object or just the response text
    const extracted =
      aiRaw.response || aiRaw.output_text || aiRaw.text || aiRaw;

    if (typeof extracted === 'string') {
      const candidate = extractJsonObject(extracted);
      if (candidate) {
        try {
          parsed = JSON.parse(candidate);
        } catch (e) {}
      }
    } else if (typeof extracted === 'object') {
      parsed = extracted;
    }
  } else {
    const raw = (aiRaw || '').toString();
    const candidate = extractJsonObject(raw);
    if (candidate) {
      try {
        parsed = JSON.parse(candidate);
      } catch (e) {
        console.error('Failed to parse AI JSON:', e);
      }
    }
  }

  if (parsed && typeof parsed === 'object') {
    if (parsed.result === 'safe' || parsed.safe === true) {
      return {
        status: 'safe',
        reason: parsed.reason || `${defaultReasonPrefix}_approved`,
      };
    } else if (parsed.result === 'unsafe' || parsed.safe === false) {
      return {
        status: 'unsafe',
        reason: parsed.reason || `${defaultReasonPrefix}_flagged`,
      };
    } else if (parsed.result === 'unsure') {
      return {
        status: 'unsure',
        reason: parsed.reason || `${defaultReasonPrefix}_unsure`,
      };
    }
  }

  const fallbackSource =
    typeof aiRaw === 'object' && aiRaw !== null
      ? aiRaw.response || aiRaw.output_text || aiRaw.text || ''
      : aiRaw || '';

  const fallback = parseSafeUnsafeFallback(fallbackSource);
  if (fallback) {
    return {
      status: fallback.result,
      reason: fallback.reason,
    };
  }

  return {
    status: 'unsure',
    reason: `${defaultReasonPrefix}_needs_review`,
  };
};

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
    };

    const response = await withTimeout(
      env.AI.run('@cf/meta/llama-3.2-3b-instruct', payload),
    );

    const aiText =
      (response &&
        (response.response || response.output_text || response.text)) ||
      '';
    console.log('AI text moderation raw:', aiText);

    return parseAIModerationResponse(aiText, 'ai_text');
  } catch (error) {
    console.error('AI text moderation error:', error);
    return {
      status: 'unsure',
      reason: 'ai_error_review',
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
    const b64 = Buffer.from(buf).toString('base64');
    const mime = imageBlob.type || 'image/jpeg';
    const dataUrl = `data:${mime};base64,${b64}`;

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
      (response &&
        (response.response || response.output_text || response.text)) ||
      response;
    console.log('AI image moderation raw:', aiRaw);

    return parseAIModerationResponse(aiRaw, 'ai_image');
  } catch (error) {
    console.error('AI image moderation error:', error);
    return {
      status: 'unsure',
      reason: 'ai_error_review',
    };
  }
};

const processBackgroundModeration = async (
  photoId,
  imageBlob,
  eventTag,
  env,
  urlOrigin,
) => {
  try {
    const imageResult = await moderateImageWithAI(imageBlob, env);
    if (imageResult.status === 'safe') {
      await env.DB.prepare('UPDATE photos SET is_approved = 1 WHERE id = ?')
        .bind(photoId)
        .run();
      await invalidateCache(urlOrigin, eventTag);
      console.log(`Photo ${photoId} auto-approved by AI.`);
    } else {
      console.log(
        `Photo ${photoId} moderation result: ${imageResult.status} (${imageResult.reason})`,
      );
    }
  } catch (error) {
    console.error(`Background moderation failed for photo ${photoId}:`, error);
  }
};

// ===== HANDLERS =====

const handleUpload = async (request, env, ctx, corsHeaders) => {
  const url = new URL(request.url);
  const formData = await request.formData();
  const uploadPassword = formData.get('pass');

  if (
    !uploadPassword ||
    uploadPassword.toLowerCase() !== GUEST_PASSWORD.toLowerCase()
  ) {
    return errorResponse('Invalid or missing password', 401, corsHeaders);
  }

  try {
    const image = formData.get('image');
    const name = (formData.get('name') || '').trim() || 'Anonymous';
    const message = (formData.get('message') || '').trim();
    const eventTag = formData.get('eventTag');
    const format = formData.get('format') || 'image/jpeg';
    const takenAtParam = formData.get('takenAt');

    const validationError = validateUserInput(name, message);
    if (validationError)
      return errorResponse(validationError, 400, corsHeaders);

    if (!image || !eventTag) {
      return errorResponse(
        'Missing required fields: image and eventTag',
        400,
        corsHeaders,
      );
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (
      !allowedTypes.includes(format) ||
      (image.type && !allowedTypes.includes(image.type))
    ) {
      return errorResponse(
        'Invalid file type. Only JPG, PNG, and WebP are allowed.',
        400,
        corsHeaders,
      );
    }

    if (image.size > MAX_PHOTO_SIZE * 1024 * 1024) {
      return errorResponse(
        `Photo is too large (max ${MAX_PHOTO_SIZE}MB).`,
        400,
        corsHeaders,
      );
    }

    const validEventTags = ['Ijab & Qabul', 'Sanding', 'Tandang'];
    if (!validEventTags.includes(eventTag)) {
      return errorResponse('Invalid eventTag', 400, corsHeaders);
    }

    const extension = format === 'image/webp' ? '.webp' : '.jpg';
    const objectKey = `photos/${crypto.randomUUID()}${extension}`;
    const imageArrayBuffer = await image.arrayBuffer();
    const imageBlob = new Blob([imageArrayBuffer], { type: format });

    const textResult = await moderateTextWithAI(name, message, env);
    if (textResult.status === 'unsafe') {
      return errorResponse(
        "Your message contains content that doesn't match the wedding vibe. Please try a different caption!",
        400,
        corsHeaders,
        'TEXT_MODERATION_FAILED',
      );
    }

    const isApproved = 0; // Always start as unapproved, moderate image in background
    const editToken = crypto.randomUUID();
    const timestamp = new Date().toISOString();
    const takenAt = takenAtParam || timestamp;

    await env.PHOTOS_BUCKET.put(objectKey, imageArrayBuffer, {
      httpMetadata: { contentType: format },
    });

    const dbResult = await env.DB.prepare(
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

    const photoId = dbResult.meta.last_row_id;

    // Background image moderation
    ctx.waitUntil(
      processBackgroundModeration(
        photoId,
        imageBlob,
        eventTag,
        env,
        url.origin,
      ),
    );

    const photoObject = {
      id: photoId,
      objectKey,
      name,
      message,
      eventTag,
      timestamp,
      takenAt,
      isApproved,
      token: editToken,
      url: `${PHOTO_BASE_URL}/${objectKey}`,
    };

    return jsonResponse({ photo: photoObject }, 200, corsHeaders);
  } catch (error) {
    console.error('Upload error:', error);
    return errorResponse('Upload failed', 500, corsHeaders);
  }
};

const handleEdit = async (request, env, corsHeaders) => {
  try {
    const body = await request.json();
    const { id, token } = body;
    const name = (body.name || '').trim() || 'Anonymous';
    const message = (body.message || '').trim();

    if (!id || !token)
      return errorResponse(
        'Missing required fields: id, token',
        400,
        corsHeaders,
      );

    const validationError = validateUserInput(name, message);
    if (validationError)
      return errorResponse(validationError, 400, corsHeaders);

    const photo = await env.DB.prepare(
      'SELECT id, timestamp FROM photos WHERE id = ? AND token = ?',
    )
      .bind(id, token)
      .first();

    if (!photo)
      return errorResponse(
        'Invalid token or photo not found',
        403,
        corsHeaders,
      );

    if (!getEditWindowStatus(photo.timestamp)) {
      return errorResponse(
        'Edit window expired. Photos can only be edited within 1 hour of upload.',
        403,
        corsHeaders,
      );
    }

    const textModeration = await moderateTextWithAI(name, message, env);
    if (textModeration.status !== 'safe') {
      return errorResponse(
        "Your post couldn't be published. Please update your content and try again.",
        400,
        corsHeaders,
        'TEXT_MODERATION_FAILED',
      );
    }

    await env.DB.prepare('UPDATE photos SET name = ?, message = ? WHERE id = ?')
      .bind(name, message, id)
      .run();

    return jsonResponse({ success: true }, 200, corsHeaders);
  } catch (error) {
    console.error('Edit error:', error);
    return errorResponse('Edit failed', 500, corsHeaders);
  }
};

const handleDelete = async (request, env, corsHeaders) => {
  try {
    const { id, token } = await request.json();
    if (!id || !token)
      return errorResponse(
        'Missing required fields: id, token',
        400,
        corsHeaders,
      );

    const photo = await env.DB.prepare(
      'SELECT id, object_key, timestamp FROM photos WHERE id = ? AND token = ?',
    )
      .bind(id, token)
      .first();

    if (!photo)
      return errorResponse(
        'Invalid token or photo not found',
        403,
        corsHeaders,
      );

    if (!getEditWindowStatus(photo.timestamp)) {
      return errorResponse(
        'Delete window expired. Photos can only be deleted within 1 hour of upload.',
        403,
        corsHeaders,
      );
    }

    if (photo.object_key) {
      try {
        await env.PHOTOS_BUCKET.delete(photo.object_key);
      } catch (e) {
        console.error('R2 delete error:', e);
      }
    }

    await env.DB.prepare('DELETE FROM photos WHERE id = ?').bind(id).run();
    return jsonResponse({ success: true }, 200, corsHeaders);
  } catch (error) {
    console.error('Delete error:', error);
    return errorResponse('Delete failed', 500, corsHeaders);
  }
};

const handleGetPhotos = async (url, env, corsHeaders) => {
  try {
    const eventTag = url.searchParams.get('eventTag');
    const limit = parseInt(url.searchParams.get('limit')) || 12;
    const offset = parseInt(url.searchParams.get('offset')) || 0;
    const sinceId = parseInt(url.searchParams.get('since_id'));
    const checkIds = url.searchParams.get('check_ids');

    let query, countQuery, params;
    let checkedPhotos = [];

    if (checkIds) {
      const ids = checkIds
        .split(',')
        .map((id) => parseInt(id))
        .filter((id) => !isNaN(id));
      if (ids.length > 0) {
        const placeholders = ids.map(() => '?').join(',');
        const checkQuery = `SELECT * FROM photos WHERE id IN (${placeholders})`;
        const checkResult = await env.DB.prepare(checkQuery)
          .bind(...ids)
          .all();
        checkedPhotos = (checkResult.results || []).map(mapToPhotoObject);
      }
    }

    if (sinceId) {
      query = eventTag
        ? 'SELECT * FROM photos WHERE is_approved = 1 AND event_tag = ? AND id > ? ORDER BY id DESC LIMIT 50'
        : 'SELECT * FROM photos WHERE is_approved = 1 AND id > ? ORDER BY id DESC LIMIT 50';
      params = eventTag ? [eventTag, sinceId] : [sinceId];
    } else {
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
    const photos = (result.results || []).map(mapToPhotoObject);

    const allPhotos = [...checkedPhotos];
    photos.forEach((p) => {
      if (!allPhotos.find((cp) => cp.id === p.id)) {
        allPhotos.push(p);
      }
    });

    const hasMore = photos.length > limit;
    if (hasMore) allPhotos.pop();

    let countResult = { total: 0 };
    if (!sinceId) {
      countResult = eventTag
        ? await env.DB.prepare(countQuery).bind(eventTag).first()
        : await env.DB.prepare(countQuery).first();
    }

    return jsonResponse(
      {
        photos: allPhotos,
        hasMore,
        total: countResult?.total || 0,
        limit,
        offset,
      },
      200,
      corsHeaders,
    );
  } catch (error) {
    console.error('Fetch photos error:', error);
    return errorResponse('Failed to fetch photos', 500, corsHeaders);
  }
};

const handleAdminPending = async (request, env, corsHeaders) => {
  try {
    if (!isAccessAuthenticated(request))
      return errorResponse('Unauthorized', 401, corsHeaders);
    const adminEmail = getAccessEmail(request);
    const result = await env.DB.prepare(
      'SELECT * FROM photos WHERE is_approved = 0 ORDER BY timestamp DESC',
    ).all();
    const photos = (result.results || []).map(mapToPhotoObject);
    return jsonResponse({ photos, admin: adminEmail }, 200, corsHeaders);
  } catch (error) {
    console.error('Fetch pending error:', error);
    return errorResponse('Failed to fetch pending photos', 500, corsHeaders);
  }
};

const handleAdminAction = async (request, env, corsHeaders) => {
  try {
    if (!isAccessAuthenticated(request))
      return errorResponse('Unauthorized', 401, corsHeaders);
    const adminEmail = getAccessEmail(request);
    const { imageID, action, ids } = await request.json();
    const targetIds = ids || (imageID ? [imageID] : []);

    if (targetIds.length === 0)
      return errorResponse('Missing imageID or ids', 400, corsHeaders);

    const placeholders = targetIds.map(() => '?').join(',');

    if (action === 'approve') {
      await env.DB.prepare(
        `UPDATE photos SET is_approved = 1 WHERE id IN (${placeholders})`,
      )
        .bind(...targetIds)
        .run();
      return jsonResponse(
        { action: 'approved', count: targetIds.length },
        200,
        corsHeaders,
      );
    } else if (action === 'delete') {
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
      return jsonResponse(
        { action: 'deleted', count: targetIds.length },
        200,
        corsHeaders,
      );
    }
    return errorResponse(
      'Invalid action. Use "approve" or "delete"',
      400,
      corsHeaders,
    );
  } catch (error) {
    console.error('Admin action error:', error);
    return errorResponse('Action failed', 500, corsHeaders);
  }
};

const handleAdminUnapprove = async (request, env, corsHeaders) => {
  try {
    if (!isAccessAuthenticated(request))
      return errorResponse('Unauthorized', 401, corsHeaders);
    const { id } = await request.json();
    if (!id) return errorResponse('Missing photo id', 400, corsHeaders);

    await env.DB.prepare('UPDATE photos SET is_approved = 0 WHERE id = ?')
      .bind(id)
      .run();
    return jsonResponse({ action: 'unapproved', id }, 200, corsHeaders);
  } catch (error) {
    console.error('Unapprove error:', error);
    return errorResponse('Unapprove failed', 500, corsHeaders);
  }
};

const handleAdminVerify = async (request, corsHeaders) => {
  if (!isAccessAuthenticated(request))
    return jsonResponse({ authenticated: false }, 401, corsHeaders);
  return jsonResponse(
    { authenticated: true, email: getAccessEmail(request) },
    200,
    corsHeaders,
  );
};

const handleServeImage = async (path, env, corsHeaders) => {
  try {
    const objectKey = path.replace('/images/', '');
    const object = await env.PHOTOS_BUCKET.get(objectKey);
    if (!object)
      return new Response('Not Found', { status: 404, headers: corsHeaders });

    const headers = new Headers(corsHeaders);
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
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

    const corsHeaders = {
      'Access-Control-Allow-Origin': requestOrigin || selfOrigin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Credentials': 'true',
    };

    if (method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Routing
    if (path === '/api/upload' && method === 'POST')
      return handleUpload(request, env, ctx, corsHeaders);
    if (path === '/api/edit' && method === 'POST')
      return handleEdit(request, env, corsHeaders);
    if (path === '/api/delete' && method === 'POST')
      return handleDelete(request, env, corsHeaders);
    if (path === '/api/photos' && method === 'GET')
      return handleGetPhotos(url, env, corsHeaders);

    // Admin routes
    if (path === '/admin/pending' && method === 'GET')
      return handleAdminPending(request, env, corsHeaders);
    if (path === '/admin/action' && method === 'POST')
      return handleAdminAction(request, env, corsHeaders);
    if (path === '/admin/verify' && method === 'GET')
      return handleAdminVerify(request, corsHeaders);
    if (path === '/admin/unapprove' && method === 'POST')
      return handleAdminUnapprove(request, env, corsHeaders);

    // Dev only: Serve images from R2
    if (IS_DEVELOPMENT && path.startsWith('/images/'))
      return handleServeImage(path, env, corsHeaders);

    return new Response('Not Found', { status: 404, headers: corsHeaders });
  },
};
