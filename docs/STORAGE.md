# File Storage Configuration

## Overview

The application supports two file storage options:
1. **Local Storage** - Files stored in the `uploads/` directory (default)
2. **Google Cloud Storage (GCS)** - Files stored in a GCP bucket (optional)

## Configuration

### Local Storage (Default)

By default, files are stored locally in the `uploads/` directory. No additional configuration is required.

### Google Cloud Storage

To use GCS, set the `GCP_BUCKET` environment variable:

```env
GCP_BUCKET=your-bucket-name
```

#### Authentication Options

**Option 1: Service Account Key File (Recommended for Production)**
```env
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json
```

**Option 2: Service Account Key JSON String**
```env
GCP_KEYFILE_JSON={"type":"service_account","project_id":"...","private_key":"..."}
```

**Option 3: Default Application Credentials**
If running on GCP (Cloud Run, GKE, etc.), the application will automatically use the default service account.

#### Optional: Project ID
```env
GCP_PROJECT_ID=your-project-id
```

## Behavior

- If `GCP_BUCKET` is **not set**: Files are stored locally
- If `GCP_BUCKET` is **set**: Files are stored in GCS
- If GCS upload fails, the system automatically falls back to local storage

## Required Permissions

The GCS service account needs the following permissions:
- `storage.objects.create`
- `storage.objects.get`
- `storage.objects.setIamPolicy` (for making files public)

Or use the predefined role: `Storage Object Admin`

## Example Configuration

### Development (.env)
```env
# Use local storage
GCP_BUCKET=
```

### Production (.env)
```env
# Use GCS
GCP_BUCKET=absco-web
GOOGLE_APPLICATION_CREDENTIALS=/app/gcp-key.json
```

## Testing

To test GCS integration:

1. Create a GCS bucket
2. Create a service account with Storage Object Admin role
3. Download the service account key JSON
4. Set environment variables:
   ```bash
   export GCP_BUCKET=your-bucket-name
   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json
   ```
5. Restart the server
6. Upload a file through the API
7. Verify the file appears in your GCS bucket

## Troubleshooting

### Files not uploading to GCS
- Check that `GCP_BUCKET` is set correctly
- Verify service account credentials are valid
- Check service account has required permissions
- Review server logs for error messages

### Files uploading to local storage instead of GCS
- Ensure `GCP_BUCKET` environment variable is set
- Check for GCS initialization errors in server startup logs
- Verify GCS credentials are properly configured
