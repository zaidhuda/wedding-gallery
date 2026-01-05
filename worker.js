export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const origin = request.headers.get('Origin') || '*';

    // CORS headers - use specific origin for admin routes (required for credentials)
    const isAdminRoute = path.startsWith('/admin');
    const corsHeaders = {
      'Access-Control-Allow-Origin': isAdminRoute ? origin : '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      ...(isAdminRoute && { 'Access-Control-Allow-Credentials': 'true' }),
    };

    // Handle CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Single guest password for access control
    const GUEST_PASSWORD = 'ZM2026';

    // Helper: Check if running locally
    const isLocalDev = url.hostname === 'localhost' || url.hostname === '127.0.0.1';

    // Helper: Check if request is authenticated via Cloudflare Access
    const isAccessAuthenticated = (request) => {
      if (isLocalDev) return true;
      const jwt = request.headers.get('Cf-Access-Jwt-Assertion');
      const email = request.headers.get('Cf-Access-Authenticated-User-Email');
      return !!(jwt && email);
    };

    const getAccessEmail = (request) => {
      if (isLocalDev) return 'dev@localhost';
      return request.headers.get('Cf-Access-Authenticated-User-Email') || 'unknown';
    };

    // ===== AI CONTENT MODERATION =====

    // AI Text moderation using Llama-3-8b-instruct (Malay Wedding Context)
    const moderateTextWithAI = async (name, message, env) => {
      try {
        // Skip if no text to moderate
        if (!name && !message) {
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
              content: `You are a moderator for a Malay Wedding (Majlis Perkahwinan) photo gallery. You MUST understand both English AND Bahasa Melayu, including Manglish (Malaysian English) and common slang.

THIS IS A BILINGUAL ENVIRONMENT. Do NOT reject text just because it's in Malay or uses Malaysian slang.

ALWAYS ALLOW (these are celebratory/cultural terms):
- Malay celebrations: "Mantap", "Lawa", "Segak", "Cun", "Gempak", "Best", "Terbaik", "Steady", "Power"
- Islamic/Religious: "Alhamdulillah", "Barakallah", "MasyaAllah", "InsyaAllah", "Semoga berbahagia"
- Wedding terms: "Nasi Minyak", "Pelamin", "Bunga Pahar", "Sanding", "Bersanding", "Dulang", "Hantaran"
- Common wishes: "Selamat Pengantin Baru", "Semoga kekal", "Bahagia selalu", "Happy always"
- Friendly slang: "Boss", "Bro", "Sis", "Abang", "Kakak", "Weh", "Eh", "Lah", "Kan"
- Names: ALL names are allowed, including Malay names, nicknames, and terms of endearment

REJECT (inappropriate content):
- "Mencarut" (Malay vulgarities): "bodoh", "babi", "sial", "celaka", "puki", "lancau", etc.
- English profanity: explicit swear words, slurs
- "Perli" with malicious intent: sarcasm meant to hurt or mock the couple
- Hate speech, bullying, threats
- Sexual/explicit content
- Spam or promotional content

CONTEXT MATTERS:
- "Steady boss!" = SAFE (compliment)
- "Gila lawa!" = SAFE (means "crazy beautiful" - a compliment)
- "Bodoh" alone = UNSAFE (insult)
- Genuine well-wishes (Ucapan) in any language = SAFE

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
          prompt: `Analyze this image for a MALAY WEDDING (Majlis Perkahwinan) photo gallery.

EXPECTED SAFE ELEMENTS (do NOT flag these):
- Traditional attire: Baju Melayu, Sampin, Tanjak/Songkok, Baju Kurung, Kebaya, Tudung/Hijab
- Wedding ceremonies: Bersanding (sitting on throne/pelamin), Tepung Tawar (blessing ritual), Makan Beradab (feeding ceremony)
- Decorations: Pelamin (wedding throne), Bunga Pahar, Bunga Telur, colorful traditional decor
- Close-up of hands with Inai/Henna patterns = SAFE and expected
- Food: Nasi Minyak, traditional Malay dishes, wedding buffet
- Guests in formal/traditional wear, family gatherings, group photos
- Gold jewelry, flowers, gifts (hantaran/dulang)

PRIORITIZE INTENT: Wedding photos often have intimate moments (hand-holding, close-ups, embracing) - these are SAFE in wedding context.

UNSAFE content (reject these):
- Nudity or explicit sexual content
- Violence, weapons, gore
- Offensive gestures or hate symbols
- Clearly inappropriate content unrelated to weddings

Answer with SAFE or UNSAFE followed by a brief reason.`,
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

      if (uploadPassword !== GUEST_PASSWORD) {
        console.error('Password validation failed');
        return new Response(
          JSON.stringify({ error: 'Invalid or missing password' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      try {
        const image = formData.get('image');
        const name = formData.get('name') || 'Anonymous';
        const message = formData.get('message') || '';
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

        const imageUrl = `${url.origin}/images/${objectKey}`;
        const takenAt = formData.get('takenAt') || new Date().toISOString();
        const timestamp = new Date().toISOString();
        const isApproved = moderation.autoApproved ? 1 : 0;

        // Save to D1 with moderation result
        await env.DB.prepare(
          'INSERT INTO photos (url, name, message, eventTag, timestamp, taken_at, is_approved) VALUES (?, ?, ?, ?, ?, ?, ?)'
        )
          .bind(imageUrl, name, message, eventTag, timestamp, takenAt, isApproved)
          .run();

        return new Response(
          JSON.stringify({
            success: true,
            url: imageUrl,
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
          query = 'SELECT * FROM photos WHERE is_approved = 1 AND eventTag = ? ORDER BY COALESCE(taken_at, timestamp) DESC LIMIT ? OFFSET ?';
          countQuery = 'SELECT COUNT(*) as total FROM photos WHERE is_approved = 1 AND eventTag = ?';
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

        const photos = result.results || [];
        const hasMore = photos.length > limit;

        if (hasMore) photos.pop();

        const transformedPhotos = photos.map(photo => {
          if (photo.url && isLocalDev) {
            photo.url = photo.url.replace(
              'https://wedding-gallery.zaidhuda.workers.dev',
              url.origin
            );
          }
          return photo;
        });

        return new Response(
          JSON.stringify({ photos: transformedPhotos, hasMore, total: countResult?.total || 0, limit, offset }),
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

        const photos = result.results || [];
        const transformedPhotos = photos.map(photo => {
          if (photo.url && isLocalDev) {
            photo.url = photo.url.replace(
              'https://wedding-gallery.zaidhuda.workers.dev',
              url.origin
            );
          }
          return photo;
        });

        return new Response(
          JSON.stringify({ photos: transformedPhotos, admin: adminEmail }),
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
          const photos = await env.DB.prepare(
            `SELECT id, url FROM photos WHERE id IN (${placeholders})`
          ).bind(...targetIds).all();

          for (const photo of photos.results || []) {
            if (photo.url) {
              const urlObj = new URL(photo.url);
              const objectKey = urlObj.pathname.replace('/images/', '');
              try {
                await env.PHOTOS_BUCKET.delete(objectKey);
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

    // Serve images from R2
    if (path.startsWith('/images/') && method === 'GET') {
      try {
        const objectKey = path.replace('/images/', '');
        const object = await env.PHOTOS_BUCKET.get(objectKey);

        if (!object) {
          return new Response('Not Found', { status: 404, headers: corsHeaders });
        }

        const headers = new Headers(corsHeaders);
        object.writeHttpMetadata(headers);
        headers.set('etag', object.httpEtag);

        return new Response(object.body, { headers });
      } catch (error) {
        console.error('Image serve error:', error);
        return new Response('Error serving image', { status: 500, headers: corsHeaders });
      }
    }

    return new Response('Not Found', { status: 404, headers: corsHeaders });
  },
};
