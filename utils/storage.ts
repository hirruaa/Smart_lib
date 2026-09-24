import { SupabaseClient } from '@supabase/supabase-js'

export const EBOOKS_BUCKET = 'ebooks'
export const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB (Supabase Free tier file upload limit)

export function isStoragePath(urlOrPath: string | null | undefined): boolean {
  if (!urlOrPath) return false
  // Check if it's not a full http(s) URL or if it points to supabase storage
  return (
    !urlOrPath.startsWith('http://') &&
    !urlOrPath.startsWith('https://') &&
    !urlOrPath.startsWith('/')
  ) || urlOrPath.startsWith('ebooks/')
}

export function cleanStoragePath(path: string): string {
  return path.replace(/^ebooks\//, '')
}

/**
 * Uploads an e-book PDF file to the 'ebooks' Supabase Storage bucket.
 */
export async function uploadEbookFile(
  supabase: SupabaseClient,
  file: File,
  bookIdOrSlug?: string | number
): Promise<{ path: string; error?: string }> {
  if (file.type !== 'application/pdf') {
    return { path: '', error: 'Only PDF files are supported.' }
  }

  if (file.size > MAX_FILE_SIZE) {
    return {
      path: '',
      error: `File size exceeds the 50 MB limit (${(file.size / (1024 * 1024)).toFixed(1)} MB).`,
    }
  }

  // Generate clean filename
  const timestamp = Date.now()
  const sanitizedName = file.name
    .toLowerCase()
    .replace(/[^a-z0-9.]/g, '_')
    .replace(/_{2,}/g, '_')
  const path = `${bookIdOrSlug ? `book_${bookIdOrSlug}_` : ''}${timestamp}_${sanitizedName}`

  const { error: uploadError } = await supabase.storage
    .from(EBOOKS_BUCKET)
    .upload(path, file, {
      cacheControl: '3600',
      upsert: true,
      contentType: 'application/pdf',
    })

  if (uploadError) {
    return { path: '', error: uploadError.message }
  }

  return { path }
}

/**
 * Resolves a readable URL for a PDF. If it's a storage path, creates a signed URL.
 * If it's an external URL (e.g. Google Drive, external link), returns it directly.
 */
export async function getReadableEbookUrl(
  supabase: SupabaseClient,
  pdfUrlOrPath: string,
  expiresInSeconds: number = 7200 // 2 hours
): Promise<{ url: string; error?: string }> {
  if (!pdfUrlOrPath) return { url: '', error: 'No PDF specified' }

  if (pdfUrlOrPath.startsWith('http://') || pdfUrlOrPath.startsWith('https://')) {
    return { url: pdfUrlOrPath }
  }

  const cleanPath = cleanStoragePath(pdfUrlOrPath)
  const { data, error } = await supabase.storage
    .from(EBOOKS_BUCKET)
    .createSignedUrl(cleanPath, expiresInSeconds)

  if (error || !data?.signedUrl) {
    return {
      url: '',
      error: error?.message || 'Failed to generate secure reading link.',
    }
  }

  return { url: data.signedUrl }
}
