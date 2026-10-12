import 'server-only'
import { google } from 'googleapis'
import { Readable } from 'node:stream'

export function isGoogleDriveConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_REFRESH_TOKEN &&
    (process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || process.env.GOOGLE_DRIVE_SHARED_DRIVE_ID)
  )
}

export function isGoogleDriveBackupConfigured() {
  return isGoogleDriveConfigured() && Boolean(process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID)
}

function driveClient() {
  if (!isGoogleDriveConfigured()) throw new Error('Google Drive storage is not configured.')
  const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
  return google.drive({ version: 'v3', auth })
}

export async function uploadGoogleDriveBackup(input: { body: Readable; fileName: string }) {
  if (!isGoogleDriveBackupConfigured()) throw new Error('A dedicated Google Drive backup folder is not configured.')
  const drive = driveClient()
  const folder = await drive.files.get({
    fileId: process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID!,
    fields: 'id,mimeType,trashed',
    supportsAllDrives: true,
  })
  if (folder.data.trashed || folder.data.mimeType !== 'application/vnd.google-apps.folder') {
    throw new Error('The configured Google Drive backup destination is not an active folder.')
  }

  const result = await drive.files.create({
    requestBody: {
      name: input.fileName,
      parents: [folder.data.id!],
      appProperties: { smart_lib_type: 'backup', smart_lib_format: 'jsonl-gzip-v1' },
    },
    media: { mimeType: 'application/gzip', body: input.body },
    fields: 'id,name,size,mimeType',
    supportsAllDrives: true,
  })
  if (!result.data.id) throw new Error('Google Drive did not return a backup file ID.')
  return { fileId: result.data.id, fileName: result.data.name || input.fileName, fileSize: Number(result.data.size || 0) }
}

async function folderId(drive: ReturnType<typeof google.drive>, name: string) {
  const root = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || process.env.GOOGLE_DRIVE_SHARED_DRIVE_ID!
  const result = await drive.files.list({
    q: `'${root}' in parents and name = '${name.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id,name)',
    pageSize: 1,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    corpora: process.env.GOOGLE_DRIVE_SHARED_DRIVE_ID ? 'drive' : undefined,
    driveId: process.env.GOOGLE_DRIVE_SHARED_DRIVE_ID || undefined,
  })
  if (result.data.files?.[0]?.id) return result.data.files[0].id
  const created = await drive.files.create({
    requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [root] },
    fields: 'id',
    supportsAllDrives: true,
  })
  if (!created.data.id) throw new Error('Unable to create the Google Drive storage folder.')
  return created.data.id
}

export async function uploadGoogleDrivePdf(input: { buffer: Buffer; fileName: string; ownerId: string; category?: string }) {
  const drive = driveClient()
  const parent = await folderId(drive, input.category || 'Contributions')
  const result = await drive.files.create({
    requestBody: {
      name: input.fileName,
      parents: [parent],
      appProperties: { smart_lib_owner: input.ownerId, smart_lib_type: 'pdf' },
    },
    media: { mimeType: 'application/pdf', body: Readable.from(input.buffer) },
    fields: 'id,name,size,mimeType',
    supportsAllDrives: true,
  })
  if (!result.data.id) throw new Error('Google Drive did not return a file ID.')
  return { fileId: result.data.id, fileName: result.data.name || input.fileName, fileSize: Number(result.data.size || input.buffer.byteLength), mimeType: result.data.mimeType || 'application/pdf' }
}

export async function downloadGoogleDrivePdf(fileId: string, expectedOwnerId?: string) {
  const drive = driveClient()
  const metadata = await drive.files.get({
    fileId,
    fields: 'mimeType,trashed,appProperties',
    supportsAllDrives: true,
  })
  if (
    metadata.data.trashed ||
    metadata.data.mimeType !== 'application/pdf' ||
    (expectedOwnerId !== undefined &&
      metadata.data.appProperties?.smart_lib_owner !== undefined &&
      metadata.data.appProperties.smart_lib_owner !== expectedOwnerId) ||
    (metadata.data.appProperties?.smart_lib_type !== undefined &&
      metadata.data.appProperties.smart_lib_type !== 'pdf')
  ) {
    throw new Error('The Google Drive file is not an active PDF owned by this contribution.')
  }
  const result = await drive.files.get({ fileId, alt: 'media', supportsAllDrives: true }, { responseType: 'arraybuffer' })
  return Buffer.from(result.data as ArrayBuffer)
}

export async function downloadGoogleDriveBackupPdf(fileId: string) {
  const drive = driveClient()
  const metadata = await drive.files.get({
    fileId,
    fields: 'mimeType,trashed,appProperties',
    supportsAllDrives: true,
  })
  if (
    metadata.data.trashed ||
    metadata.data.mimeType !== 'application/pdf' ||
    (metadata.data.appProperties?.smart_lib_type !== undefined &&
      metadata.data.appProperties.smart_lib_type !== 'pdf')
  ) {
    throw new Error(`Google Drive file "${fileId}" is not an active Smart Lib PDF.`)
  }
  const result = await drive.files.get({ fileId, alt: 'media', supportsAllDrives: true }, { responseType: 'arraybuffer' })
  return Buffer.from(result.data as ArrayBuffer)
}

export async function deleteGoogleDriveFile(fileId: string) {
  await driveClient().files.delete({ fileId, supportsAllDrives: true })
}

export async function canDeleteGoogleDriveFile(fileId: string, ownerId: string, isAdmin: boolean) {
  if (isAdmin) return true
  const file = await driveClient().files.get({ fileId, fields: 'appProperties', supportsAllDrives: true })
  return file.data.appProperties?.smart_lib_owner === ownerId
}
