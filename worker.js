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
    const validPasswords = ['L2026', 'T2026'];

    // Upload endpoint
    if (path === '/api/upload' && method === 'POST') {
      // Validate password for uploads
      const formData = await request.formData();
      const uploadPassword = formData.get('pass');

      if (!uploadPassword || !validPasswords.includes(uploadPassword)) {
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

        // Generate unique filename
        const filename = `${crypto.randomUUID()}.jpg`;
        const objectKey = `photos/${filename}`;

        // Upload to R2
        await env.PHOTOS_BUCKET.put(objectKey, image, {
          httpMetadata: {
            contentType: 'image/jpeg',
          },
        });

        // Get public URL for the image
        // Option 1: Serve through Worker (current - works with Pages Functions)
        const imageUrl = `${url.origin}/images/${objectKey}`;

        // Option 2: If using R2.dev public URL, uncomment and replace <account-id>:
        // const imageUrl = `https://pub-<account-id>.r2.dev/${objectKey}`;

        // Option 3: If using custom domain for R2, uncomment and update:
        // const imageUrl = `https://your-cdn-domain.com/${objectKey}`;

        // Option 4: If using R2 public bucket with custom domain via Worker route:
        // const imageUrl = `https://your-worker-domain.com/images/${objectKey}`;

        // Save metadata to D1
        const timestamp = new Date().toISOString();
        await env.DB.prepare(
          'INSERT INTO photos (url, name, message, eventTag, timestamp) VALUES (?, ?, ?, ?, ?)'
        )
          .bind(imageUrl, name, message, eventTag, timestamp)
          .run();

        return new Response(
          JSON.stringify({ success: true, url: imageUrl }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (error) {
        console.error('Upload error:', error);
        return new Response(
          JSON.stringify({ error: 'Upload failed', details: error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Get photos endpoint
    if (path === '/api/photos' && method === 'GET') {
      try {
        const eventTag = url.searchParams.get('eventTag');

        let query;
        let params;

        if (eventTag) {
          query = 'SELECT * FROM photos WHERE eventTag = ? ORDER BY timestamp DESC';
          params = [eventTag];
        } else {
          query = 'SELECT * FROM photos ORDER BY timestamp DESC';
          params = [];
        }

        const result = await env.DB.prepare(query).bind(...params).all();

        return new Response(
          JSON.stringify(result.results || []),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (error) {
        console.error('Fetch photos error:', error);
        return new Response(
          JSON.stringify({ error: 'Failed to fetch photos', details: error.message }),
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
