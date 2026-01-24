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
ele admin panad from thmage uplo iproduct
4. Test wser in a brobleaccessi is URLrify the  Vejs`
3.torage.est-gcp-sckend/tbagain: `node ript a the test sc Run 1 above
2.using Optionic publhe bucket 
1. Make t
eps# Next Sttion

# applica frontend ] Test fromdate)
- [ up policyucket IAM- needs br 3 errole (40accessibblicly  are pues] Fil- [ ly
ssfulcead sucloup[x] Files 
- sible accesand isket exists d
- [x] Bucurenfigtials coGCP creden- [x] ist

on Checklcatierifi

## V anyway.iblely accesso be public meant tmages are ih**. Productdard approacstanis the ket public ing the bucages, **mak product im withmerce siten e-comch
For aded Approaommenec

### Ry expirehen therate URLs wneNeed to rege❌ long
- re very 
- ❌ URLs amplementomplex to ire cey
- ❌ Mo account kg serviceginhan by ccessac revoke anxpire
- ✅ C - URLs e secureMore
- ✅ RLsd U Using Signe##
# analytics
ontrol orss c acceNo
- ⚠️ e URL know thheyfiles if tess can acc Anyone le
- ⚠️accessibblicly  be puat shouldct images thfor produ Works well - ✅e and fast

- ✅ Simplublicucket P Bing Mak###s

iderationCons# Security 

#]
```[filenamebscotek-web/pis.com/age.googlearattps://stocurl -I hurn 200)
 retld (shoucess ac publicTestge.js

# t-gcp-storand/tes
node backet upload
# Tes```bashith:

blic, test wet puing the buckter makg

AfTestin## )

led (enablevel accessucket-iform b* Unl:*cess Contro.com`
**Acountviceaccgsertek.iam.-web@abscosco* `abcount:*rvice Acek`
**Sescot** `abt ID:
**Projecb``abscotek-weame:** Bucket N
**figuration
ent ConCurr
## hing.
e and cacperformancter  bett forkeur bucnt of yoCDN in froloud tting up Csider se contion,oduc
For prd)
commenderoduction Reloud CDN (P Use COption 3:# }
```

##edUrl;
return sign
  
  
  });// 10 years1000, 0 * 60 *  * 6 24365 *() + 10 * ate.nowres: D,
    expiion: 'read'   actgnedUrl({
 t file.getSi] = awai