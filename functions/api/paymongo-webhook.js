// Cloudflare Pages Function: functions/api/paymongo-webhook.js
// Receives paid notifications from PayMongo and updates Supabase database.

export async function onRequestPost(context) {
  const { request, env } = context;

  // 1. Read raw body (required for signature validation)
  const rawBody = await request.text();

  // 2. Verify PayMongo webhook signature if webhook secret is configured
  const webhookSecret = env.PAYMONGO_WEBHOOK_SIGNING_SECRET;
  const signatureHeader = request.headers.get('paymongo-signature');

  if (webhookSecret && signatureHeader) {
    try {
      // signatureHeader format: t=timestamp,li=signature
      const parts = signatureHeader.split(',');
      const tPart = parts.find(p => p.startsWith('t='));
      const liPart = parts.find(p => p.startsWith('li='));

      if (!tPart || !liPart) {
        throw new Error('Invalid signature header format');
      }

      const t = tPart.substring(2); // extract timestamp value
      const signature = liPart.substring(3); // extract signature value

      const dataToSign = `${t}.${rawBody}`;

      // Import signing secret as Web Crypto Key
      const encoder = new TextEncoder();
      const keyData = encoder.encode(webhookSecret);
      const messageData = encoder.encode(dataToSign);

      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify', 'sign']
      );

      // Convert hex signature to Uint8Array
      const signatureBytes = new Uint8Array(
        signature.match(/.{1,2}/g).map(byte => parseInt(byte, 16))
      );

      // Verify HMAC SHA-256 signature
      const isValid = await crypto.subtle.verify(
        'HMAC',
        cryptoKey,
        signatureBytes,
        messageData
      );

      if (!isValid) {
        return new Response(JSON.stringify({ error: 'Signature verification failed' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    } catch (err) {
      console.error('Signature verification error:', err);
      return new Response(JSON.stringify({ error: 'Signature verification failed' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  } else {
    console.warn('PAYMONGO_WEBHOOK_SIGNING_SECRET is not configured. Bypassing signature verification.');
  }

  // 3. Parse JSON body
  let event;
  try {
    event = JSON.parse(rawBody);
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Invalid JSON payload' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 4. Process the checkout session paid event
  const eventType = event.data?.attributes?.type;
  if (eventType === 'checkout_session.payment.paid') {
    const session = event.data?.attributes?.data;
    const metadata = session?.attributes?.metadata;

    const userId = metadata?.userId;
    const tokens = parseInt(metadata?.tokens || '0');
    const price = parseFloat(metadata?.price || '0');

    if (!userId || !tokens) {
      console.error('Invalid metadata in checkout session:', metadata);
      return new Response(JSON.stringify({ error: 'Invalid checkout session metadata' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const supabaseUrl = env.SUPABASE_URL;
    const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Supabase credentials are not defined in environment variables.');
      return new Response(JSON.stringify({ error: 'Server database configuration error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    try {
      // A. Fetch current user profile
      const getResponse = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${userId}&select=*`, {
        method: 'GET',
        headers: {
          'apikey': supabaseServiceKey,
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Accept': 'application/json'
        }
      });

      if (!getResponse.ok) {
        throw new Error(`Failed to fetch user profile: ${getResponse.statusText}`);
      }

      const profiles = await getResponse.json();
      if (!profiles || profiles.length === 0) {
        throw new Error(`User profile not found for ID: ${userId}`);
      }

      const profile = profiles[0];
      const history = profile.history || [];

      // B. Append billing log
      history.unshift({
        date: new Date().toISOString(),
        type: 'Billing',
        desc: `Upgraded subscription to Professional via PayMongo (₱${price}, limit: ${tokens} tokens)`
      });

      // C. Update profile plan and credits
      const patchResponse = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${userId}`, {
        method: 'PATCH',
        headers: {
          'apikey': supabaseServiceKey,
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({
          plan: 'Professional',
          credits_max: tokens,
          history: history
        })
      });

      if (!patchResponse.ok) {
        throw new Error(`Failed to update user profile: ${patchResponse.statusText}`);
      }

      console.log(`Successfully upgraded user ${userId} to Professional plan with ${tokens} credits.`);
    } catch (error) {
      console.error('Database update failed:', error);
      return new Response(JSON.stringify({ error: 'Failed to update user subscription in database' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  // Acknowledge receipt of the webhook to PayMongo
  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
