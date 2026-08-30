import { NextResponse } from 'next/server'
// The client you created from the Server-Side Auth instructions
import { createClient } from '@/utils/supabase/server'

function classifyExchangeError(error) {
  const message = String(error?.message || '').toLowerCase()
  if (message.includes('code verifier') || message.includes('pkce')) return 'pkce-verifier-missing'
  if (message.includes('expired') || message.includes('invalid grant')) return 'code-expired'
  if (message.includes('fetch') || message.includes('network')) return 'auth-network-error'
  return error?.code || 'exchange-failed'
}

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const providerError = searchParams.get('error')
  const providerErrorDescription = searchParams.get('error_description')
  // if "next" is in param, use it as the redirect URL
  let next = searchParams.get('next') ?? '/'

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const createdAt = Date.parse(data?.user?.created_at || '')
      const lastSignInAt = Date.parse(data?.user?.last_sign_in_at || '')
      const isNewUser = Number.isFinite(createdAt)
        && Number.isFinite(lastSignInAt)
        && Math.abs(lastSignInAt - createdAt) <= 10_000
      const authEvent = isNewUser ? 'sign_up' : 'login'

      // Securely construct redirect URL to prevent Open Redirects
      try {
        const redirectUrl = new URL(next, origin)
        if (redirectUrl.origin !== origin) {
          throw new Error('Invalid redirect')
        }
        redirectUrl.searchParams.set('auth_event', authEvent)
        return NextResponse.redirect(redirectUrl.href)
      } catch (err) {
        return NextResponse.redirect(`${origin}/?auth_event=${authEvent}`)
      }
    }

    // Never include the OAuth code in logs. The error code/message is safe and
    // essential for distinguishing a missing PKCE verifier from provider or
    // redirect configuration failures during local development.
    console.error('[Auth Callback] Session exchange failed:', {
      code: error?.code || 'exchange_failed',
      message: error?.message || 'Unknown exchange error',
      origin,
    })
    const reason = classifyExchangeError(error)
    return NextResponse.redirect(`${origin}/?error=auth-failed&reason=${encodeURIComponent(reason)}`)
  }

  if (providerError || providerErrorDescription) {
    console.error('[Auth Callback] OAuth provider returned an error:', {
      error: providerError || 'provider_error',
      description: providerErrorDescription || 'No description',
      origin,
    })
    const reason = providerError || 'provider-error'
    return NextResponse.redirect(`${origin}/?error=auth-failed&reason=${encodeURIComponent(reason)}`)
  }

  console.error('[Auth Callback] Missing authorization code:', { origin })
  return NextResponse.redirect(`${origin}/?error=auth-failed&reason=missing-code`)
}
