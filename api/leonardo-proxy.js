// Vercel Serverless Function: api/leonardo-proxy.js
// Proxies Leonardo.ai REST API calls and uploads to bypass browser CORS restrictions.

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action, apiKey, data } = req.body;

  if (!action) {
    return res.status(400).json({ error: 'Missing parameter: action' });
  }

  // Fallback to default Leonardo key if not provided
  const activeKey = apiKey || process.env.DEFAULT_LEONARDO_API_KEY || '495c5c93-cf03-4f46-bfbf-c14c5de0cfda';

  try {
    if (action === 'upload') {
      const base64Image = data?.base64Image;
      const extension = data?.extension || 'png';

      if (!base64Image) {
        return res.status(400).json({ error: 'Missing base64Image for upload action' });
      }

      // 1. Get presigned upload URL from Leonardo
      const presignedRes = await fetch('https://cloud.leonardo.ai/api/rest/v1/init-image', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${activeKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ extension })
      });

      if (!presignedRes.ok) {
        const err = await presignedRes.json().catch(() => ({}));
        return res.status(presignedRes.status).json({
          error: "Leonardo init-image upload request failed: " + (err?.error || presignedRes.statusText)
        });
      }

      const presignedData = await presignedRes.json();
      const uploadUrlInfo = presignedData.uploadInitImage;
      if (!uploadUrlInfo) {
        return res.status(500).json({ error: 'Leonardo API did not return presigned URL fields.' });
      }

      const initImageId = uploadUrlInfo.id;
      const uploadUrl = uploadUrlInfo.url;
      const fields = JSON.parse(uploadUrlInfo.fields);

      // 2. Decode base64 image to binary buffer/blob natively (Node and Workers compatible)
      const base64Data = base64Image.split(',')[1] || base64Image;
      const binaryStr = atob(base64Data);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      const imageBlob = new Blob([bytes], { type: `image/${extension === 'jpg' ? 'jpeg' : extension}` });

      // Construct FormData using global FormData class
      const formData = new FormData();
      for (const [key, value] of Object.entries(fields)) {
        formData.append(key, value);
      }
      formData.append('file', imageBlob, `reference.${extension}`);

      // 3. Upload to S3
      const s3Res = await fetch(uploadUrl, {
        method: 'POST',
        body: formData
      });

      if (!s3Res.ok) {
        const s3ErrText = await s3Res.text().catch(() => '');
        console.error('S3 upload error text:', s3ErrText);
        return res.status(500).json({ error: 'Failed to upload image binary to Leonardo storage via proxy.' });
      }

      return res.status(200).json({ id: initImageId });
    }

    let url = '';
    let method = 'POST';
    let body = null;

    if (action === 'init-image') {
      url = 'https://cloud.leonardo.ai/api/rest/v1/init-image';
      body = JSON.stringify(data || {});
    } else if (action === 'generations') {
      url = 'https://cloud.leonardo.ai/api/rest/v1/generations';
      body = JSON.stringify(data || {});
    } else if (action === 'generations-v2') {
      url = 'https://cloud.leonardo.ai/api/rest/v2/generations';
      body = JSON.stringify(data || {});
    } else if (action === 'status') {
      const generationId = data?.generationId;
      if (!generationId) {
        return res.status(400).json({ error: 'Missing generationId for status action' });
      }
      url = `https://cloud.leonardo.ai/api/rest/v1/generations/${generationId}`;
      method = 'GET';
    } else {
      return res.status(400).json({ error: `Invalid action: ${action}` });
    }

    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${activeKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body
    });

    const resData = await response.json().catch(() => ({}));

    if (!response.ok) {
      return res.status(response.status).json({
        error: resData.error || resData.message || response.statusText
      });
    }

    return res.status(200).json(resData);
  } catch (error) {
    console.error('Leonardo proxy error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
