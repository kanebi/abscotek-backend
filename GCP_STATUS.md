# GCP Storage - Current Status

## ✅ What's Working

1. **GCP Storage is configured and functional**
   - Bucket: `abscotek-web`
   - Project: `abscotek`
   - Service Account: `absco-web@abscotek.iam.gserviceaccount.com`
   - Files upload successfully to GCS

2. **Product Image Upload Flow**
   - Route: `POST /api/admin/products/:id/images`
   - Accepts multipart form data (up to 10 images)
   - Uses multer for file handling
   - Automatically uploads to GCS when `GCP_BUCKET` is set
   - Falls back to local storage if GCS fails

3. **Configuration**
   - Environment variable `GCP_BUCKET=abscotek-web` is set
   - Service account credentials are properly configured via `GCP_KEYFILE_JSON`
   - Storage module correctly detects GCP configuration

## ⚠️ What Needs Fixing

### Files are not publicly accessible (403 Forbidden)

**Problem:** Your bucket has "Uniform Bucket-Level Access" enabled, which is good for security, but the bucket is not configured to allow public read access.

**Solution:** Make the bucket publicly readable by running this command:

```bash
gcloud storage buckets add-iam-policy-binding gs://abscotek-web \
  --member=allUsers \
  --role=roles/storage.objectViewer
```

**Or via Google Cloud Console:**
1. Go to https://console.cloud.google.com/storage/browser
2. Click on bucket `abscotek-web`
3. Go to **Permissions** tab
4. Click **Grant Access**
5. Add principal: `allUsers`
6. Select role: **Storage Object Viewer**
7. Click **Save**

## How Product Image Upload Works

### Backend Flow

1. **Admin uploads images** via `POST /api/admin/products/:productId/images`
2. **Multer middleware** receives the files in memory (max 10 files, 10MB each)
3. **uploadImages controller** (`backend/src/controllers/productController.js`):
   - Receives file buffers from multer
   - Calls `saveImage()` from storage config
   - Generates unique filename with timestamp
   - Uploads to GCS (or local storage as fallback)
   - Returns public URL
   - Saves URLs to product's `images` array in MongoDB

### Storage Module (`backend/src/config/storage.js`)

```javascript
// Detects if GCP_BUCKET is set
const useGCP = !!process.env.GCP_BUCKET;

// If GCP is configured, uploads to GCS
if (useGCP && gcsBucket) {
  return await saveToGCS(filename, buffer, contentType);
}

// Otherwise uses local storage
return await saveToLocal(filename, buffer, baseUrl);
```

### Current Behavior

- ✅ Files upload to GCS successfully
- ✅ URLs are generated: `https://storage.googleapis.com/abscotek-web/[filename]`
- ❌ URLs return 403 Forbidden (bucket not public)
- ✅ Automatic fallback to local storage if GCS fails

## Testing

### Test GCP Upload
```bash
node backend/test-gcp-storage.js
```

**Expected Output:**
```
✅ GCP Storage initialized with bucket: abscotek-web
✅ Image uploaded successfully!
URL: https://storage.googleapis.com/abscotek-web/[timestamp]-[random].jpg
```

### Test Public Access (After making bucket public)
```bash
curl -I https://storage.googleapis.com/abscotek-web/[filename]
```

**Expected:** `HTTP/2 200` (currently returns `403 Forbidden`)

## Next Steps

1. **Make bucket public** using the command above
2. **Test upload** with `node backend/test-gcp-storage.js`
3. **Verify URL** is accessible in browser
4. **Test from admin panel** - upload product images
5. **Verify images** display correctly on product pages

## Alternative: Keep Bucket Private (Advanced)

If you prefer to keep the bucket private, you can use signed URLs instead. This requires modifying `saveToGCS()` to generate signed URLs:

```javascript
// Generate signed URL (expires in 10 years)
const [signedUrl] = await file.getSignedUrl({
  action: 'read',
  expires: Date.now() + 10 * 365 * 24 * 60 * 60 * 1000,
});
return signedUrl;
```

**Trade-offs:**
- ✅ More secure
- ❌ URLs are very long
- ❌ Need to regenerate when they expire
- ❌ More complex

For product images, **making the bucket public is the standard approach**.
