require('dotenv').config({ path: __dirname + '/.env' });
const { saveImage, useGCP } = require('./src/config/storage');

console.log('=== GCP Storage Test ===');
console.log('GCP_BUCKET:', process.env.GCP_BUCKET);
console.log('useGCP:', useGCP);
console.log('GCP_KEYFILE_JSON exists:', !!process.env.GCP_KEYFILE_JSON);

if (process.env.GCP_KEYFILE_JSON) {
  try {
    const creds = JSON.parse(process.env.GCP_KEYFILE_JSON);
    console.log('GCP Project ID:', creds.project_id);
    console.log('GCP Client Email:', creds.client_email);
  } catch (err) {
    console.error('Failed to parse GCP_KEYFILE_JSON:', err.message);
  }
}

// Test image upload
async function testUpload() {
  try {
    console.log('\n=== Testing Image Upload ===');
    const testBuffer = Buffer.from('test image data');
    const url = await saveImage('test-image.jpg', testBuffer, 'image/jpeg');
    console.log('✅ Image uploaded successfully!');
    console.log('URL:', url);
  } catch (err) {
    console.error('❌ Image upload failed:', err.message);
    console.error('Stack:', err.stack);
  }
}

testUpload();
