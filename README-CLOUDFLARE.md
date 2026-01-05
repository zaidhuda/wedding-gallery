# Cloudflare Migration Setup Guide

This guide will help you migrate your wedding photo gallery from Firebase to Cloudflare (D1 + R2 + Pages).

## Prerequisites

1. Cloudflare account
2. Wrangler CLI installed: `npm install -g wrangler`
3. Login to Wrangler: `wrangler login`

## Setup Steps

### 1. Create D1 Database

```bash
# Create the database
wrangler d1 create wedding-gallery-db

# Copy the database_id from the output and paste it into wrangler.toml
```

Update `wrangler.toml` with the `database_id` you received.

### 2. Initialize Database Schema

```bash
# Run the schema to create tables
wrangler d1 execute wedding-gallery-db --file=./schema.sql
```

### 3. Create R2 Bucket

```bash
# Create the R2 bucket
wrangler r2 bucket create wedding-photos
```

### 4. Configure R2 Public Access (Optional)

If you want to serve images directly from R2:

**Option A: Use R2.dev subdomain**
- Go to Cloudflare Dashboard → R2 → wedding-photos → Settings
- Enable "Public Access"
- Note the public URL (e.g., `https://pub-xxxxx.r2.dev`)
- Update `worker.js` line with the R2 public URL

**Option B: Use Custom Domain**
- Set up a custom domain in R2 settings
- Update `worker.js` to use your custom domain

**Option C: Serve through Worker** (current implementation)
- Images are served via `/images/` route in the worker
- This is already configured in `worker.js`

### 5. Update Worker Image URL

In `worker.js`, update the `imageUrl` generation based on your R2 setup:

```javascript
// Option A: R2.dev public URL
const imageUrl = `https://pub-<your-account-id>.r2.dev/${objectKey}`;

// Option B: Custom domain
const imageUrl = `https://your-cdn-domain.com/${objectKey}`;

// Option C: Through Worker (current)
const imageUrl = `${url.origin}/images/${objectKey}`;
```

### 6. Deploy Worker

```bash
# Deploy the worker
wrangler deploy
```

### 7. Set up Cloudflare Pages

1. Go to Cloudflare Dashboard → Pages → Create a project
2. Connect your Git repository
3. Build settings:
   - Build command: (leave empty, static site)
   - Build output directory: `public`
4. Add environment variable:
   - `WORKER_URL`: Your worker URL (e.g., `https://wedding-gallery-api.your-subdomain.workers.dev`)

### 8. Update Frontend Worker URL

In `public/index.html`, update the `WORKER_URL` constant:

```javascript
// For Cloudflare Pages with Functions/Workers integration:
const WORKER_URL = '/api';

// OR if using separate worker domain:
const WORKER_URL = 'https://wedding-gallery-api.your-subdomain.workers.dev';
```

### 9. Configure Pages Functions (Alternative)

If you want to use Cloudflare Pages Functions instead of a separate Worker:

1. Create `functions/api/[[path]].js`:
```javascript
export { default } from '../../worker.js';
```

2. Update `wrangler.toml` to work with Pages, or use `functions/api/[[path]].js` directly

## Testing

1. Test upload with password: `https://your-site.com?pass=L2026`
2. Test viewing photos: Click on any folder card
3. Check browser console for any errors

## Migration Checklist

- [ ] D1 database created and schema applied
- [ ] R2 bucket created
- [ ] Worker deployed and tested
- [ ] Image URLs configured correctly
- [ ] Frontend updated with correct Worker URL
- [ ] Pages site deployed
- [ ] Password validation working
- [ ] Upload functionality working
- [ ] Gallery display working

## Troubleshooting

### Images not loading
- Check R2 bucket permissions
- Verify image URL format in worker.js
- Check CORS headers

### Upload fails
- Verify password parameter is being sent
- Check Worker logs: `wrangler tail`
- Verify D1 database connection

### Database errors
- Ensure schema is applied: `wrangler d1 execute wedding-gallery-db --file=./schema.sql`
- Check database_id in wrangler.toml matches your D1 database

## Cost Comparison

**Firebase:**
- Firestore: $0.06/GB egress
- Storage: $0.12/GB egress

**Cloudflare:**
- D1: Free tier includes 5M reads/day
- R2: $0.015/GB egress (87.5% cheaper!)
- Pages: Free tier includes 500 builds/month

## Support

For issues, check:
- Cloudflare Workers docs: https://developers.cloudflare.com/workers/
- D1 docs: https://developers.cloudflare.com/d1/
- R2 docs: https://developers.cloudflare.com/r2/
