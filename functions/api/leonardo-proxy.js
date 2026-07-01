// Cloudflare Pages Function: functions/api/leonardo-proxy.js
// Proxies Leonardo.ai REST API calls to bypass browser CORS restrictions.

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
