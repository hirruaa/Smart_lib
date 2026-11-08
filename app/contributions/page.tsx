'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabase } from '@/utils/supabase/client'
import ActionModal from '@/components/ActionModal'
import ResultModal from '@/components/ResultModal'
import { getContributionFileFormat, getContributionFileTypeLabel } from '@/utils/contributionFiles'

type Contribution = { id: number; title: string; author: string; description: string | null; pdf_url: string | null; storage_provider: string; storage_file_id: string | null; storage_path: string | null; file_name: string | null; file_size: number | null; mime_type: string | null; status: string; points_awarded: number; review_feedback: string | null; created_at: string }

const MAX_FILE_SIZE = 50 * 1024 * 1024

export default function ContributionsPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [items, setItems] = useState<Contribution[]>([])
  const [form, setForm] = useState({ title: '', author: '', description: '' })
  const [file, setFile] = useState<File | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmSubmit, setConfirmSubmit] = useState(false)
  const [result, setResult] = useState<{ status: 'success' | 'error'; message: string; successTitle?: string } | null>(null)

  async function load(user: string) {
    const { data, error: loadError } = await getSupabase().from('book_contributions').select('id,title,author,description,pdf_url,storage_provider,storage_file_id,storage_path,file_name,file_size,mime_type,status,points_awarded,review_feedback,created_at').eq('user_id', user).order('created_at', { ascending: false })
    if (loadError) setError('Unable to load contribution history.')
    setItems((data ?? []) as Contribution[])
    setLoading(false)
  }

  useEffect(() => {
    async function start() {
      const { data: { user } } = await getSupabase().auth.getUser()
      if (!user) { router.replace('/login'); return }
      const { data: profile, error: profileError } = await getSupabase().from('profiles').select('role').eq('id', user.id).maybeSingle()
      if (profileError || profile?.role !== 'faculty') { router.replace('/unauthorized'); return }
      setUserId(user.id)
      await load(user.id)
    }
    void start()
  }, [router])

  function chooseRevision(item: Contribution) {
    setEditingId(item.id)
    setForm({ title: item.title, author: item.author, description: item.description ?? '' })
    setFile(null)
    setError(null)
  }

  async function uploadContribution(fileToUpload: File) {
    if (!userId) throw new Error('Authentication required')
    if (getContributionFileFormat(fileToUpload.name, fileToUpload.type) === 'unknown') throw new Error('Choose a PDF, Word, or PowerPoint file.')
    if (fileToUpload.size <= 0 || fileToUpload.size > MAX_FILE_SIZE) throw new Error('Files must be between 1 byte and 50 MB.')
    const formData = new FormData()
    formData.append('file', fileToUpload)
    formData.append('category', 'Contributions')
    formData.append('provider', 'supabase')
    formData.append('allow_fallback', 'false')
    const response = await fetch('/api/storage/upload', { method: 'POST', body: formData })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Unable to upload the contribution.')
    return result as { storage_provider: string; storage_file_id?: string; storage_path?: string; pdf_url?: string; file_name: string; file_size: number; mime_type: string }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setConfirmSubmit(true)
  }

  async function executeSubmit() {
    const wasRevision = editingId !== null
    setSaving(true)
    setError(null)
    let uploaded: { storage_provider: string; storage_file_id?: string; storage_path?: string; pdf_url?: string; file_name: string; file_size: number; mime_type: string } | null = null
    try {
      uploaded = file ? await uploadContribution(file) : null
      const supabase = getSupabase()
      if (editingId) {
        const { error: submitError } = await supabase.rpc('student_resubmit_contribution_v2', {
          contribution_id: editingId,
          contribution_title: form.title,
          contribution_author: form.author,
          contribution_description: form.description || null,
          contribution_pdf_url: uploaded?.pdf_url || null,
          contribution_storage_provider: uploaded?.storage_provider || null,
          contribution_storage_file_id: uploaded?.storage_file_id || null,
          contribution_storage_path: uploaded?.storage_path || null,
          contribution_file_name: uploaded?.file_name || null,
          contribution_file_size: uploaded?.file_size ?? null,
          contribution_mime_type: uploaded?.mime_type || null,
        })
        if (submitError) throw new Error(submitError.message)
      } else {
        const { error: submitError } = await supabase.rpc('submit_book_contribution_v2', {
          p_title: form.title,
          p_author: form.author,
          p_description: form.description || null,
          p_pdf_url: uploaded?.pdf_url || null,
          p_storage_provider: uploaded?.storage_provider || 'supabase',
          p_storage_file_id: uploaded?.storage_file_id || null,
          p_storage_path: uploaded?.storage_path || null,
          p_file_name: uploaded?.file_name || null,
          p_file_size: uploaded?.file_size || null,
          p_mime_type: uploaded?.mime_type || (file ? file.type : 'application/pdf'),
        })
        if (submitError) throw new Error(submitError.message)
      }
      setForm({ title: '', author: '', description: '' })
      setFile(null)
      setEditingId(null)
      setResult({
        status: 'success',
        successTitle: wasRevision ? 'Contribution resubmitted' : 'Contribution submitted',
        message: wasRevision
          ? 'Your revised contribution was resubmitted successfully and is awaiting review.'
          : 'Your contribution was submitted successfully and is awaiting review.',
      })
      if (userId) await load(userId)
    } catch (submitError) {
      if (uploaded?.storage_provider === 'google_drive' && uploaded.storage_file_id) {
        await fetch(`/api/storage/upload?fileId=${encodeURIComponent(uploaded.storage_file_id)}`, { method: 'DELETE' }).catch(() => undefined)
      }
      const failureMessage = submitError instanceof Error ? submitError.message : 'Unable to submit contribution.'
      setResult({ status: 'error', message: failureMessage })
    }
    setSaving(false)
  }

  return <main className="surface-page min-h-screen px-4 py-6 text-slate-900 dark:text-slate-100 sm:px-8"><div className="mx-auto max-w-5xl space-y-6"><header className="surface-card p-6"><button type="button" onClick={() => router.push('/dashboard')} className="text-xs font-semibold text-pine-700 hover:underline dark:text-pine-200">← Member dashboard</button>  <p className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-pine-600 dark:text-pine-200">Faculty resource shelf</p><h1 className="mt-2 text-3xl font-semibold">Submit a lesson</h1><p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Faculty may submit lessons only. Approved lessons are published separately from the book catalog; administrators set the point reward.</p></header>{error ? <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div> : null}<section className="surface-card p-6"><h2 className="text-xl font-semibold">{editingId ? 'Revise lesson' : 'New lesson'}</h2><form onSubmit={submit} className="mt-5 grid gap-4 sm:grid-cols-2"><label><span className="text-sm font-medium">Lesson title</span><input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="mt-2 w-full rounded-2xl border border-paper-300 bg-paper-50 px-3 py-3 text-sm dark:border-forest-700 dark:bg-forest-800" /></label><label><span className="text-sm font-medium">Author or creator</span><input required value={form.author} onChange={(event) => setForm({ ...form, author: event.target.value })} className="mt-2 w-full rounded-2xl border border-paper-300 bg-paper-50 px-3 py-3 text-sm dark:border-forest-700 dark:bg-forest-800" /></label><label className="sm:col-span-2"><span className="text-sm font-medium">Description</span><textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={4} className="mt-2 w-full rounded-2xl border border-paper-300 bg-paper-50 px-3 py-3 text-sm dark:border-forest-700 dark:bg-forest-800" /></label><label className="sm:col-span-2"><span className="text-sm font-medium">Teaching material file</span><input type="file" accept="application/pdf,.pdf,.doc,.docx,.ppt,.pptx" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="mt-2 block w-full rounded-2xl border border-dashed border-paper-300 bg-paper-50 px-3 py-4 text-sm dark:border-forest-700 dark:bg-forest-800" />{file ? <span className="mt-1 block text-xs font-medium text-pine-700 dark:text-pine-200">Selected: {getContributionFileTypeLabel(file.name, file.type)}</span> : null}<span className="mt-1 block text-xs text-slate-500">PDF, Word (.doc/.docx), or PowerPoint (.ppt/.pptx), maximum 50 MB.</span></label><div className="flex gap-3 sm:col-span-2"><button type="submit" disabled={saving} className="pine-action rounded-2xl px-5 py-3 text-sm font-semibold disabled:opacity-50">{saving ? 'Submitting...' : editingId ? 'Resubmit lesson' : 'Submit lesson'}</button>{editingId ? <button type="button" onClick={() => { setEditingId(null); setForm({ title: '', author: '', description: '' }); setFile(null) }} className="secondary-action rounded-2xl border px-5 py-3 text-sm font-semibold">Cancel revision</button> : null}</div></form></section><section className="surface-card p-6"><h2 className="text-xl font-semibold">Your lesson history</h2>{loading ? <p className="mt-4 text-sm text-slate-500">Loading history...</p> : <div className="mt-4 space-y-3">{items.map((item) => <article key={item.id} className="rounded-2xl border border-paper-300 p-4 dark:border-forest-700"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{item.title}</h3><p className="mt-1 text-xs text-slate-500">{item.author} · {new Date(item.created_at).toLocaleDateString()}</p><span className="mt-2 inline-flex rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-800 dark:bg-sky-950/60 dark:text-sky-200">{getContributionFileTypeLabel(item.file_name, item.mime_type)}</span></div><span className="rounded-full bg-paper-200 px-3 py-1 text-xs font-semibold capitalize dark:bg-forest-800">{item.status.replaceAll('_', ' ')}</span></div>{item.review_feedback ? <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Feedback: {item.review_feedback}</p> : null}{item.status === 'revision_requested' ? <button type="button" onClick={() => chooseRevision(item)} className="mt-3 rounded-xl border border-amber-300 px-3 py-2 text-xs font-semibold text-amber-800">Edit and resubmit</button> : null}</article>)}{items.length === 0 ? <p className="mt-4 text-sm text-slate-500">You have not submitted a lesson yet.</p> : null}</div>}</section><ActionModal open={confirmSubmit} title={editingId ? 'Resubmit lesson?' : 'Submit lesson?'} description="Your teaching material will be uploaded privately and sent for administrator review." confirmLabel={editingId ? 'Resubmit' : 'Submit lesson'} busy={saving} onClose={() => setConfirmSubmit(false)} onConfirm={() => { setConfirmSubmit(false); void executeSubmit() }} /><ResultModal open={result !== null} status={result?.status ?? 'success'} message={result?.message ?? ''} successTitle={result?.successTitle} onClose={() => setResult(null)} /></div></main>
}
