# GCP Storage Setup Guide

## Current Status
✅ GCP Storage is configured and uploading files successfully
⚠️ Files are not publicly accessible (403 Forbidden)

## Issue
Your bucket `abscotek-web` has **Uniform Bucket-Level Access** enabled, which is the recommended security model. However, the bucket is not configured to allow public read access.

## Solution Options

### Option 1: Make Bucket Publicly Readable (Recommended for Product Images)

Run this command using `gcloud` CLI or Google Cloud Console:

```bash
# Using gcloud CLI
gcloud storage buckets add-iam-policy-binding gs://abscotek-web \
  --member=allUsers \
  --role=roles/storage.objectViewer
```

**Or via Google Cloud Console:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/storage/browser)
2. Click on your bucket `abscotek-web`
3. Go to the **Permissions** tab
4. Click **Grant Access**
5. Add principal: `allUsers`
6. Select role: **Storage Object Viewer**
7. Click **Save**

### Option 2: Use Signed URLs (More Secure, But Complex)

If you don't want to make the bucket public, you can generate signed URLs for each file. This requires code changes:

```javascript
async function saveToGCS(filename, buffer, contentType) {
  if (!gcsBucket) throw new Error('GCP bucket is not configured');
  const file = gcsBucket.file(filename);
  
  await file.save(buffer, { 
    contentType, 
    resumable: false, 
    validation: 'crc32c',
  });
  
  // Generate a signed URL that expires in 10 years
  const [signedUrl