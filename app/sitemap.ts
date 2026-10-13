import type { MetadataRoute } from 'next'

export const dynamic = 'force-dynamic'

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  if (!siteUrl) {
    throw new Error('NEXT_PUBLIC_SITE_URL must be set to the canonical HTTPS site origin to generate sitemap.xml.')
  }

  const baseUrl = new URL(siteUrl)
  if (baseUrl.protocol !== 'https:' && baseUrl.hostname !== 'localhost') {
    throw new Error('NEXT_PUBLIC_SITE_URL must use HTTPS outside local development.')
  }

  return ['/', '/privacy', '/terms', '/cookies'].map((path) => ({
    url: new URL(path, baseUrl).toString(),
  }))
}
