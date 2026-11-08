export type ContributionFileFormat = 'pdf' | 'word' | 'powerpoint' | 'unknown'

const MIME_FORMATS: Record<string, ContributionFileFormat> = {
  'application/pdf': 'pdf',
  'application/msword': 'word',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'word',
  'application/vnd.ms-powerpoint': 'powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'powerpoint',
}

const EXTENSION_FORMATS: Record<string, ContributionFileFormat> = {
  pdf: 'pdf',
  doc: 'word',
  docx: 'word',
  ppt: 'powerpoint',
  pptx: 'powerpoint',
}

export function getContributionFileFormat(fileName?: string | null, mimeType?: string | null): ContributionFileFormat {
  const normalizedName = fileName?.trim().toLowerCase()
  if (normalizedName) {
    const extension = normalizedName.split('.').pop()
    return extension ? EXTENSION_FORMATS[extension] ?? 'unknown' : 'unknown'
  }
  if (mimeType) return MIME_FORMATS[mimeType.toLowerCase()] ?? 'unknown'
  return 'pdf'
}

export function getContributionFileTypeLabel(fileName?: string | null, mimeType?: string | null): string {
  switch (getContributionFileFormat(fileName, mimeType)) {
    case 'pdf': return 'PDF'
    case 'word': return 'Word document'
    case 'powerpoint': return 'PowerPoint presentation'
    default: return 'File type unknown'
  }
}
