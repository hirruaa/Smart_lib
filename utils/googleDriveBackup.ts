import 'server-only'
import { createGzip } from 'node:zlib'
import { Readable } from 'node:stream'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { downloadGoogleDriveBackupPdf, isGoogleDriveBackupConfigured, uploadGoogleDriveBackup } from '@/utils/googleDrive'

const PAGE_SIZE = 500
const TABLES = [
  'profiles',
  'faculty_ranks',
  'academic_courses',
  'faculty_courses',
  'academic_departments',
  'books',
  'borrow_requests',
  'point_transactions',
  'book_contributions',
  'study_notes',
  'highlights',
  'study_drawings',
  'fines',
  'email_queue',
  'notifications',
  'reading_progress',
  'assistant_sessions',
  'assistant_messages',
  'recognition_awards',
  'book_access_grants',
  'rewards',
  'achievements',
  'user_achievements',
  'audit_logs',
  'physical_book_copies',
  'physical_loan_options',
  'physical_book_requests',
  'physical_book_waitlist',
  'physical_reminder_events',
  'ebook_purchase_requests',
] as const

const TABLE_ORDER: Record<(typeof TABLES)[number], string[]> = {
  profiles: ['id'],
  faculty_ranks: ['id'],
  academic_courses: ['id'],
  faculty_courses: ['faculty_id', 'course_id'],
  academic_departments: ['id'],
  books: ['id'],
  borrow_requests: ['id'],
  point_transactions: ['id'],
  book_contributions: ['id'],
  study_notes: ['id'],
  highlights: ['id'],
  study_drawings: ['id'],
  fines: ['id'],
  email_queue: ['id'],
  notifications: ['id'],
  reading_progress: ['id'],
  assistant_sessions: ['id'],
  assistant_messages: ['id'],
  recognition_awards: ['id'],
  book_access_grants: ['id'],
  rewards: ['id'],
  achievements: ['id'],
  user_achievements: ['user_id', 'achievement_id'],
  audit_logs: ['id'],
  physical_book_copies: ['id'],
  physical_loan_options: ['id'],
  physical_book_requests: ['id'],
  physical_book_waitlist: ['student_id', 'book_id'],
  physical_reminder_events: ['loan_id', 'reminder_type', 'reminder_date'],
  ebook_purchase_requests: ['id'],
}

type BackupStats = {
  tables: number
  rows: number
  authUsers: number
  storageObjects: number
  storageBytes: number
  drivePdfs: number
  skippedTables: string[]
}

function jsonLine(value: unknown) {
  return `${JSON.stringify(value)}\n`
}

function userSnapshot(user: User) {
  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    created_at: user.created_at,
    updated_at: user.updated_at,
    email_confirmed_at: user.email_confirmed_at,
    phone_confirmed_at: user.phone_confirmed_at,
    last_sign_in_at: user.last_sign_in_at,
    user_metadata: user.user_metadata,
    app_metadata: user.app_metadata,
  }
}

function isMissingTableError(error: { code?: string; message?: string }) {
  return error.code === 'PGRST205' || error.code === '42P01' || /could not find the table|relation .* does not exist/i.test(error.message || '')
}

async function* storageObjects(supabase: SupabaseClient) {
  const { data: buckets, error: bucketError } = await supabase.storage.listBuckets()
  if (bucketError) throw new Error(`Unable to list Supabase Storage buckets: ${bucketError.message}`)

  for (const bucket of buckets) {
    const pendingFolders = ['']
    while (pendingFolders.length) {
      const folder = pendingFolders.pop()!
      let offset = 0
      while (true) {
        const { data: entries, error } = await supabase.storage.from(bucket.name).list(folder, {
          limit: PAGE_SIZE,
          offset,
          sortBy: { column: 'name', order: 'asc' },
        })
        if (error) throw new Error(`Unable to list Storage bucket "${bucket.name}": ${error.message}`)
        if (!entries?.length) break

        for (const entry of entries) {
          const path = folder ? `${folder}/${entry.name}` : entry.name
          if (!entry.id || !entry.metadata) {
            pendingFolders.push(path)
            continue
          }

          const { data: file, error: downloadError } = await supabase.storage.from(bucket.name).download(path)
          if (downloadError) throw new Error(`Unable to download Storage object "${bucket.name}/${path}": ${downloadError.message}`)
          const bytes = Buffer.from(await file.arrayBuffer())
          yield {
            bucket: bucket.name,
            path,
            content_type: entry.metadata.mimetype || null,
            data_base64: bytes.toString('base64'),
            size_bytes: bytes.byteLength,
          }
        }

        if (entries.length < PAGE_SIZE) break
        offset += entries.length
      }
    }
  }
}

async function* backupLines(supabase: SupabaseClient, stats: BackupStats) {
  const drivePdfIds = new Set<string>()
  yield jsonLine({
    record_type: 'manifest',
    format: 'smart-lib-jsonl-gzip-v1',
    created_at: new Date().toISOString(),
    tables: TABLES,
    includes: ['public table rows', 'Supabase Auth user identity metadata', 'Supabase Storage object bytes', 'referenced Smart Lib Google Drive PDFs'],
    excludes: ['passwords and password hashes', 'active sessions and access tokens'],
  })

  for (const table of TABLES) {
    let offset = 0
    let tableFound = true
    while (true) {
      let query = supabase.from(table).select('*')
      for (const column of TABLE_ORDER[table]) query = query.order(column, { ascending: true })
      const { data, error } = await query.range(offset, offset + PAGE_SIZE - 1)
      if (error) {
        if (offset === 0 && isMissingTableError(error)) {
          stats.skippedTables.push(table)
          tableFound = false
          break
        }
        throw new Error(`Unable to back up table "${table}": ${error.message}`)
      }
      const rows = data ?? []
      for (const row of rows) {
        yield jsonLine({ record_type: 'table_row', table, row })
        stats.rows += 1
        if (
          (table === 'books' || table === 'book_contributions') &&
          row.storage_provider === 'google_drive' &&
          typeof row.storage_file_id === 'string'
        ) {
          drivePdfIds.add(row.storage_file_id)
        }
      }
      if (rows.length < PAGE_SIZE) break
      offset += rows.length
    }
    if (tableFound) stats.tables += 1
  }

  let page = 1
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: PAGE_SIZE })
    if (error) throw new Error(`Unable to back up Auth users: ${error.message}`)
    const users = data.users ?? []
    for (const user of users) {
      yield jsonLine({ record_type: 'auth_user', user: userSnapshot(user) })
      stats.authUsers += 1
    }
    if (users.length < PAGE_SIZE) break
    page += 1
  }

  for await (const object of storageObjects(supabase)) {
    yield jsonLine({ record_type: 'storage_object', ...object })
    stats.storageObjects += 1
    stats.storageBytes += object.size_bytes
  }

  for (const fileId of drivePdfIds) {
    const bytes = await downloadGoogleDriveBackupPdf(fileId)
    yield jsonLine({
      record_type: 'storage_object',
      provider: 'google_drive',
      path: fileId,
      content_type: 'application/pdf',
      data_base64: bytes.toString('base64'),
      size_bytes: bytes.byteLength,
    })
    stats.drivePdfs += 1
    stats.storageBytes += bytes.byteLength
  }

  yield jsonLine({ record_type: 'backup_summary', ...stats })
}

export async function createGoogleDriveBackup(supabase: SupabaseClient) {
  if (!isGoogleDriveBackupConfigured()) {
    throw new Error('Backup service is not configured.')
  }

  const stats: BackupStats = {
    tables: 0,
    rows: 0,
    authUsers: 0,
    storageObjects: 0,
    storageBytes: 0,
    drivePdfs: 0,
    skippedTables: [],
  }
  const stream = Readable.from(backupLines(supabase, stats)).pipe(createGzip())
  const date = new Date().toISOString().replace(/[:.]/g, '-')
  const file = await uploadGoogleDriveBackup({ body: stream, fileName: `smart-lib-backup-${date}.jsonl.gz` })
  return { ...file, ...stats }
}
