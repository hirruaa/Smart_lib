import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/utils/supabase/server'
import { isStaffRole } from '@/utils/roles'
import { rateLimit, sameOrigin, tooManyRequests, originViolation } from '@/utils/requestSecurity'

export const runtime = 'nodejs'
export const maxDuration = 120

const PAGE_SIZE = 500
const TABLES = [
  'profiles', 'faculty_ranks', 'academic_courses', 'faculty_courses', 'academic_departments',
  'books', 'borrow_requests', 'point_transactions', 'book_contributions', 'study_notes',
  'highlights', 'study_drawings', 'fines', 'notifications', 'reading_progress',
  'assistant_sessions', 'assistant_messages', 'recognition_awards', 'book_access_grants',
  'rewards', 'achievements', 'user_achievements', 'audit_logs', 'physical_book_copies',
  'physical_loan_options', 'physical_book_requests', 'physical_book_waitlist',
  'physical_reminder_events', 'ebook_purchase_requests',
] as const

type Row = Record<string, unknown>

function escapeXml(value: unknown) {
  const serialized = typeof value === 'string' ? value : value == null ? '' : JSON.stringify(value)
  const text = typeof serialized === 'string' ? serialized : String(serialized ?? '')
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character] ?? '')
}

function worksheetName(value: string) {
  return value.replace(/[^A-Za-z0-9 _-]/g, '').slice(0, 31) || 'Data'
}

function makeWorksheet(name: string, rows: Row[]) {
  const keys = Array.from(new Set(rows.flatMap((row) => Object.keys(row))))
  const headers = keys.length ? keys : ['No records']
  const headerXml = `<Row>${headers.map((key) => `<Cell ss:StyleID="Header"><Data ss:Type="String">${escapeXml(key)}</Data></Cell>`).join('')}</Row>`
  const rowXml = rows.map((row) => `<Row>${headers.map((key) => {
    const value = row[key]
    const type = typeof value === 'number' && Number.isFinite(value) ? 'Number' : 'String'
    return `<Cell><Data ss:Type="${type}">${escapeXml(value)}</Data></Cell>`
  }).join('')}</Row>`).join('')
  return `<Worksheet ss:Name="${escapeXml(worksheetName(name))}"><Table>${headerXml}${rowXml}</Table></Worksheet>`
}

function isMissingTable(error: { code?: string; message?: string }) {
  return error.code === 'PGRST205' || error.code === '42P01' || /could not find the table|relation .* does not exist/i.test(error.message || '')
}

export async function GET(request: Request) {
  if (!sameOrigin(request)) return originViolation()
  const requestLimit = rateLimit(request, { name: 'admin-excel-export', limit: 3, windowMs: 60 * 60_000 })
  if (!requestLimit.allowed) return tooManyRequests(requestLimit.retryAfterSeconds)

  const sessionClient = await createClient()
  const { data: { user }, error: userError } = await sessionClient.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
  const { data: profile, error: profileError } = await sessionClient.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profileError) return NextResponse.json({ error: 'Unable to verify administrator access.' }, { status: 500 })
  if (!isStaffRole(profile?.role)) return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 })

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return NextResponse.json({ error: 'Supabase service configuration is missing.' }, { status: 503 })

  let exportStep = 'initializing export'
  try {
    const supabase = createSupabaseClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
    const sheets: Array<{ name: string; rows: Row[] }> = []
    const users: Row[] = []
    exportStep = 'exporting authentication users'
    for (let page = 1; ; page += 1) {
      const result = await supabase.auth.admin.listUsers({ page, perPage: PAGE_SIZE })
      if (result.error) throw new Error(`Unable to export users: ${result.error.message}`)
      users.push(...result.data.users.map((authUser) => ({
        id: authUser.id,
        email: authUser.email,
        phone: authUser.phone,
        created_at: authUser.created_at,
        updated_at: authUser.updated_at,
        email_confirmed_at: authUser.email_confirmed_at,
        last_sign_in_at: authUser.last_sign_in_at,
        user_metadata: authUser.user_metadata,
        app_metadata: authUser.app_metadata,
      })))
      if (result.data.users.length < PAGE_SIZE) break
    }
    sheets.push({ name: 'Users', rows: users })

    for (const table of TABLES) {
      exportStep = `exporting ${table}`
      const rows: Row[] = []
      for (let offset = 0; ; offset += PAGE_SIZE) {
        const result = await supabase.from(table).select('*').range(offset, offset + PAGE_SIZE - 1)
        if (result.error) {
          if (isMissingTable(result.error)) break
          throw new Error(`Unable to export ${table}: ${result.error.message}`)
        }
        rows.push(...((result.data ?? []) as Row[]))
        if ((result.data ?? []).length < PAGE_SIZE) break
      }
      sheets.push({ name: table, rows })
    }

    exportStep = 'building Excel workbook'
    const workbook = `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?><?xml-stylesheet type="text/xsl" href="excelss.xsl"?>
      <Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="Header"><Font ss:Bold="1"/><Interior ss:Color="#DDEDE8" ss:Pattern="Solid"/></Style></Styles>${sheets.map((sheet) => makeWorksheet(sheet.name, sheet.rows)).join('')}</Workbook>`
    const date = new Date().toISOString().slice(0, 10)
    return new NextResponse(workbook, {
      headers: {
        'Content-Type': 'application/vnd.ms-excel; charset=utf-8',
        'Content-Disposition': `attachment; filename="smart-lib-backup-${date}.xls"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Excel export failed.'
    console.error(`Administrator Excel export failed while ${exportStep}.`, error)
    return NextResponse.json({ error: `Excel export failed while ${exportStep}: ${detail}` }, { status: 500 })
  }
}
