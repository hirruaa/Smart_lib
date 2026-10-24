import type { MetadataRoute } from 'next'

export const dynamic = 'force-dynamic'

export default function robots(): MetadataRoute.Robots {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL

  if (!siteUrl) {
    console.error('NEXT_PUBLIC_SITE_URL is required to publish the Mary the Queen College sitemap URL in robots.txt.')
  }

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/dashboard/', '/profile', '/assistant', '/reader/'],
    },
    ...(siteUrl ? { sitemap: new URL('/sitemap.xml', siteUrl).toString() } : {}),
  }
}
