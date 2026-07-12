import { NextResponse } from 'next/server'
// The client you created from the Server-Side Auth instructions
import { createClient } from '@/utils/supabase/server'

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // if "next" is in param, use it as the redirect URL
  let next = searchParams.get('next') ?? '/'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // Securely construct redirect URL to prevent Open Redirects
      try {
        const redirectUrl = new URL(next, origin)
        if (redirectUrl.origin !== origin) {
          throw new Error('Invalid redirect')
        }
        return NextResponse.redirect(redirectUrl.href)
      } catch (err) {
        return NextResponse.redirect(`${origin}/`)
      }
    }
  }

  // return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/?error=auth-failed`)
}
