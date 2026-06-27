// Vercel Serverless Function: api/create-checkout.js
// Generates a secure PayMongo checkout session and returns the checkout URL.

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId, price, tokens } = req.body;

  if (!userId || !price || !tokens) {
    return res.status(400).json({ error: 'Missing required parameters: userId, price, and tokens' });
  }

  const secretKey = process.env.PAYMONGO_SECRET_KEY;
  if (!secretKey) {
    console.error('PAYMONGO_SECRET_KEY is not defined in environment variables.');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const origin = req.headers.referer || req.headers.origin || 'http://localhost:5173';

  // Base64 encode the PayMongo secret key for basic authorization
  const authHeader = 'Basic ' + Buffer.from(secretKey + ':').toString('base64');

  try {
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
      return res.status(response.status).json({
        error: data.errors?.[0]?.detail || 'Failed to create checkout session'
      });
    }

    const checkoutUrl = data.data?.attributes?.checkout_url;
    if (!checkoutUrl) {
      return res.status(500).json({ error: 'No checkout URL returned from PayMongo' });
    }

    return res.status(200).json({ checkoutUrl });
  } catch (error) {
    console.error('Checkout error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
