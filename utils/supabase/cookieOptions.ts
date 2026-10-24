/**
 * Supabase SSR needs the browser client to read the session cookies so its
 * client-side database requests and token refreshes continue to work. Keep
 * these persistent, HTTPS-only in production, and scoped to the site.
 */
export const authCookieOptions = {
  path: '/',
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  maxAge: 400 * 24 * 60 * 60,
}
