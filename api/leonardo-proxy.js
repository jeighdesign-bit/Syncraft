// Vercel Serverless Function: api/leonardo-proxy.js
// Proxies Leonardo.ai REST API calls to bypass browser CORS restrictions.

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
    let url = '';
    let method = 'POST';
    let body = null;

    if (action === 'init-image') {
      url = 'https://cloud.leonardo.ai/api/rest/v1/init-image';
      body = JSON.stringify(data || {});
    } else if (action === 'generations') {
      url = 'https://cloud.leonardo.ai/api/rest/v1/generations';
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
