const path = require('path');
const fs = require('fs');

const isProduction = process.env.NODE_ENV === 'production';

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

// GCP Storage
let gcs = null;
let gcsBucket = null;
if (isProduction) {
  const { Storage } = require('@google-cloud/storage');
  const gcsOptions = {};
  if (process.env.GCP_PROJECT_ID) gcsOptions.projectId = process.env.GCP_PROJECT_ID;
  if (process.env.GCP_KEYFILE_JSON) {
    try {
      const creds = JSON.parse(process.env.GCP_KEYFILE_JSON);
      gcsOptions.credentials = creds;
    } catch (_) {}
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    // The client will pick credentials from this env var path
  }
  gcs = new Storage(gcsOptions);
  const bucketName = process.env.GCP_BUCKET;
  if (bucketName) {
    gcsBucket = gcs.bucket(bucketName);
  }
}

async function saveToGCS(filename, buffer, contentType) {
  if (!gcsBucket) throw new Error('GCP bucket is not configured');
  const file = gcsBucket.file(filename);
  await file.save(buffer, { contentType, resumable: false, public: true, validation: 'crc32c' });
  // Make file public (if not using uniform access)
  try { await file.makePublic(); } catch (_) {}
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
  if (isProduction) {
    return await saveToGCS(filename, buffer, contentType || 'application/octet-stream');
  }
  return await saveToLocal(filename, buffer, baseUrl);
}

module.exports = {
  saveImage,
  LOCAL_DIR,
  isProduction,
};

