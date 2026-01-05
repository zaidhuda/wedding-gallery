export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Validate password parameter
    const password = url.searchParams.get('pass');
    const validPasswords = ['N2026', 'S2026', 'T2026'];

    // Upload endpoint
    if (path === '/api/upload' && method === 'POST') {
      // Validate password for uploads
      const formData = await request.formData();
      const uploadPassword = formData.get('pass');

      if (!uploadPassword || !validPasswords.includes(uploadPassword)) {
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

        // Validate eventTag
        const validEventTags = ['Ijab & Qabul', 'Sanding', 'Tandang'];
        if (!validEventTags.includes(eventTag)) {
          return new Response(
            JSON.stringify({ error: 'Invalid eventTag' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get format from client (defaults to jpeg for backwards compatibility)
        const format = formData.get('format') || 'image/jpeg';
        const extension = format === 'image/webp' ? '.webp' : '.jpg';

        // Generate unique filename with correct extension
        const filename = `${crypto.randomUUID()}${extension}`;
        const objectKey = `photos/${filename}`;

        // Upload to R2 with correct content type
        await env.PHOTOS_BUCKET.put(objectKey, image, {
          httpMetadata: {
            contentType: format,
          },
        });

        // Get public URL for the image - serve through Worker
        // Use the request origin (works for both local dev and production)
        const imageUrl = `${url.origin}/images/${objectKey}`;

        // Get taken_at from client (EXIF DateTimeOriginal or fallback)
        const takenAt = formData.get('takenAt') || new Date().toISOString();

        // Save metadata to D1
        const timestamp = new Date().toISOString();
        await env.DB.prepare(
          'INSERT INTO photos (url, name, message, eventTag, timestamp, taken_at) VALUES (?, ?, ?, ?, ?, ?)'
        )
          .bind(imageUrl, name, message, eventTag, timestamp, takenAt)
          .run();

        return new Response(
          JSON.stringify({ success: true, url: imageUrl }),
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

    // Get photos endpoint with pagination
    if (path === '/api/photos' && method === 'GET') {
      try {
        const eventTag = url.searchParams.get('eventTag');
        const limit = parseInt(url.searchParams.get('limit')) || 12;
        const offset = parseInt(url.searchParams.get('offset')) || 0;

        let query;
        let countQuery;
        let params;

        if (eventTag) {
          // Fetch one extra to check if there are more
          // Order by taken_at (photo capture time) for authentic chronological display
          query = 'SELECT * FROM photos WHERE eventTag = ? ORDER BY COALESCE(taken_at, timestamp) DESC LIMIT ? OFFSET ?';
          countQuery = 'SELECT COUNT(*) as total FROM photos WHERE eventTag = ?';
          params = [eventTag, limit + 1, offset];
        } else {
          query = 'SELECT * FROM photos ORDER BY COALESCE(taken_at, timestamp) DESC LIMIT ? OFFSET ?';
          countQuery = 'SELECT COUNT(*) as total FROM photos';
          params = [limit + 1, offset];
        }

        const result = await env.DB.prepare(query).bind(...params).all();
        const countResult = eventTag
          ? await env.DB.prepare(countQuery).bind(eventTag).first()
          : await env.DB.prepare(countQuery).first();

        const photos = result.results || [];
        const hasMore = photos.length > limit;

        // Remove the extra item we fetched for checking
        if (hasMore) {
          photos.pop();
        }

        // Transform image URLs for localhost if running locally
        const transformedPhotos = photos.map(photo => {
          if (photo.url && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')) {
            // Replace production URL with localhost URL
            photo.url = photo.url.replace(
              'https://wedding-gallery.zaidhuda.workers.dev',
              url.origin
            );
          }
          return photo;
        });

        return new Response(
          JSON.stringify({
            photos: transformedPhotos,
            hasMore,
            total: countResult?.total || 0,
            limit,
            offset
          }),
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

    // Serve images from R2 (optional - if you want to serve images through the worker)
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

    // 404 for unknown routes
    return new Response('Not Found', { status: 404, headers: corsHeaders });
  },
};
