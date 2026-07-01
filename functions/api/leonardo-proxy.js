// Cloudflare Pages Function: functions/api/leonardo-proxy.js
// Proxies Leonardo.ai REST API calls and uploads to bypass browser CORS restrictions.

export async function onRequest(context) {
  const { request, env } = context;

  // CORS Headers
  const corsHeaders = {
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS,PATCH,DELETE,POST,PUT',
    'Access-Control-Allow-Headers': 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  };

  // Handle preflight request
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders
    });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const { action, apiKey, data } = await request.json();

    if (!action) {
      return new Response(JSON.stringify({ error: 'Missing parameter: action' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Fallback to default Leonardo key from env or constant
    const activeKey = apiKey || env.DEFAULT_LEONARDO_API_KEY || '495c5c93-cf03-4f46-bfbf-c14c5de0cfda';

    if (action === 'upload') {
      const base64Image = data?.base64Image;
      const extension = data?.extension || 'png';

      if (!base64Image) {
        return new Response(JSON.stringify({ error: 'Missing base64Image for upload action' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
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
        return new Response(JSON.stringify({
          error: "Leonardo init-image upload request failed: " + (err?.error || presignedRes.statusText)
        }), {
          status: presignedRes.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const presignedData = await presignedRes.json();
      const uploadUrlInfo = presignedData.uploadInitImage;
      if (!uploadUrlInfo) {
        return new Response(JSON.stringify({ error: 'Leonardo API did not return presigned URL fields.' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
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
        return new Response(JSON.stringify({ error: 'Failed to upload image binary to Leonardo storage via proxy.' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ id: initImageId }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
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
        return new Response(JSON.stringify({ error: 'Missing generationId for status action' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      url = `https://cloud.leonardo.ai/api/rest/v1/generations/${generationId}`;
      method = 'GET';
    } else {
      return new Response(JSON.stringify({ error: `Invalid action: ${action}` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
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
      return new Response(JSON.stringify({
        error: resData.error || resData.message || response.statusText
      }), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify(resData), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Leonardo proxy error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
