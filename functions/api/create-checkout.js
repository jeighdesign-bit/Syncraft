// Cloudflare Pages Function: functions/api/create-checkout.js
// Generates a secure PayMongo checkout session and returns the checkout URL.

export async function onRequest(context) {
  const { request, env } = context;

  // CORS Headers
  const corsHeaders = {
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS,PATCH,DELETE,POST,PUT',
    'Access-Control-Allow-Headers': 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
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
    const { userId, price, tokens } = await request.json();

    if (!userId || !price || !tokens) {
      return new Response(JSON.stringify({ error: 'Missing required parameters: userId, price, and tokens' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const secretKey = env.PAYMONGO_SECRET_KEY;
    if (!secretKey) {
      console.error('PAYMONGO_SECRET_KEY is not defined in environment variables.');
      return new Response(JSON.stringify({ error: 'Server configuration error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const origin = request.headers.get('referer') || request.headers.get('origin') || 'http://localhost:5173';

    // Base64 encode the PayMongo secret key for basic authorization using standard btoa
    const authHeader = 'Basic ' + btoa(secretKey + ':');

    const response = await fetch('https://api.paymongo.com/v2/checkout_sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': authHeader
      },
      body: JSON.stringify({
        data: {
          attributes: {
            line_items: [
              {
                amount: Math.round(Number(price) * 100), // convert to centavos
                currency: 'PHP',
                name: 'Syncraft Tokens & Upgrade',
                description: `${tokens} vector generation tokens / mo`,
                quantity: 1
              }
            ],
            payment_method_types: ['card', 'gcash', 'maya', 'qrph'],
            success_url: `${origin.split('?')[0]}?tab=subscription&payment=success`,
            cancel_url: `${origin.split('?')[0]}?tab=subscription&payment=cancel`,
            metadata: {
              userId: String(userId),
              tokens: String(tokens),
              price: String(price)
            }
          }
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('PayMongo API Error:', data);
      return new Response(JSON.stringify({
        error: data.errors?.[0]?.detail || 'Failed to create checkout session'
      }), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const checkoutUrl = data.data?.attributes?.checkout_url;
    if (!checkoutUrl) {
      return new Response(JSON.stringify({ error: 'No checkout URL returned from PayMongo' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ checkoutUrl }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Checkout error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
