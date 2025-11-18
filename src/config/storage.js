const path = require('path');
const fs = require('fs');

// Local storage directory
const LOCAL_DIR = path.resolve(process.cwd(), 'uploads');

async function ensureLocalDir() {
  await fs.promises.mkdir(LOCAL_DIR, { recursive: true }).catch(() => {});
}

async function saveToLocal(filename, buffer, baseUrl) {
  await ensureLocalDir();
  const filePath = path.join(LOCAL_DIR, filename);
  await fs.promises.writeFile(filePath, buffer);
  // Return absolute URL when baseUrl provided, else relative path
  const relative = `/uploads/${filename}`;
  if (baseUrl) {
    const normalizedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    return `${normalizedBase}${relative}`;
  }
  return relative;
}

// GCP Storage - only initialize if GCP_BUCKET is provided
let gcs = null;
let gcsBucket = null;
const useGCP = !!process.env.GCP_BUCKET;

if (useGCP) {
  const { Storage } = require('@google-cloud/storage');
  const gcsOptions = {};
  
  if (process.env.GCP_PROJECT_ID) {
    gcsOptions.projectId = process.env.GCP_PROJECT_ID;
  }
  
  if (process.env.GCP_KEYFILE_JSON) {
    try {
      const creds = JSON.parse(process.env.GCP_KEYFILE_JSON);
      gcsOptions.credentials = creds;
    } catch (err) {
      console.error('Failed to parse GCP_KEYFILE_JSON:', err.message);
    }
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    // The client will pick credentials from this env var path
  }
  
  try {
    gcs = new Storage(gcsOptions);
    gcsBucket = gcs.bucket(process.env.GCP_BUCKET);
    console.log(`✅ GCP Storage initialized with bucket: ${process.env.GCP_BUCKET}`);
  } catch (err) {
    console.error('Failed to initialize GCP Storage:', err.message);
  }
} else {
  console.log('📁 Using local file storage (GCP_BUCKET not configured)');
}

async function saveToGCS(filename, buffer, contentType) {
  if (!gcsBucket) throw new Error('GCP bucket is not configured');
  const file = gcsBucket.file(filename);
  
  // Save file without trying to set ACLs (uniform bucket-level access)
  await file.save(buffer, { 
    contentType, 
    resumable: false, 
    validation: 'crc32c',
    metadata: {
      cacheControl: 'public, max-age=31536000',
    }
  });
  
  // With uniform bucket-level access, files are public if bucket is public
  // No need to call makePublic() - it will fail with uniform access enabled
  const publicUrl = `https://storage.googleapis.com/${gcsBucket.name}/${encodeURIComponent(filename)}`;
  return publicUrl;
}

function buildFileName(originalName) {
  const ext = path.extname(originalName || '').toLowerCase();
  const base = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  return `${base}${ext || ''}`;
}

async function saveImage(originalName, buffer, contentType, baseUrl) {
  const filename = buildFileName(originalName);
  
  // Use GCP if bucket is configured, otherwise use local storage
  if (useGCP && gcsBucket) {
    try {
      return await saveToGCS(filename, buffer, contentType || 'application/octet-stream');
    } catch (err) {
      console.error('Failed to save to GCP, falling back to local storage:', err.message);
      return await saveToLocal(filename, buffer, baseUrl);
    }
  }
  
  return await saveToLocal(filename, buffer, baseUrl);
}

module.exports = {
  saveImage,
  LOCAL_DIR,
  useGCP,
};

