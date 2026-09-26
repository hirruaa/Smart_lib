'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabase } from '@/utils/supabase/client'

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
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

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
      setUserId(user.id)
      await load(user.id)
    }
    void start()
  }, [router])

  function chooseRevision(item: Contribution) {
    setEditingId(item.id)
    setForm({ title: item.title, author: item.author, description: item.description ?? '' })
    setFile(null)
    setMessage(null)
    setError(null)
  }

  async function uploadContribution(fileToUpload: File) {
    if (!userId) throw new Error('Authentication required')
    if (fileToUpload.type !== 'application/pdf') throw new Error('Only PDF files are supported.')
    if (fileToUpload.size > MAX_FILE_SIZE) throw new Error('PDF files must be 50 MB or smaller.')
    const formData = new FormData()
    formData.append('file', fileToUpload)
    formData.append('category', 'Contributions')
    formData.append('provider', 'google_drive')
    formData.append('allow_fallback', 'false')
    const response = await fetch('/api/storage/upload', { method: 'POST', body: formData })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Unable to upload PDF.')
    return result as { storage_provider: string; storage_file_id?: string; storage_path?: string; pdf_url?: string; file_name: string; file_size: number; mime_type: string }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setMessage(null)
    setError(null)
    let uploaded: { storage_provider: string; storage_file_id?: string; storage_path?: string; pdf_url?: string; file_name: string; file_size: number; mime_type: string } | null = null
    try {
      uploaded = file ? await uploadContribution(file) : null
      const supabase = getSupabase()
      if (editingId) {
        const previous = items.find((item) => item.id === editingId)
        const { error: submitError } = await supabase.rpc('student_resubmit_contribution_v2', {
          contribution_id: editingId,
          contribution_title: form.title,
          contribution_author: form.author,
          contribution_description: form.description || null,
          contribution_pdf_url: uploaded?.pdf_url || previous?.pdf_url || null,
          contribution_storage_provider: uploaded?.storage_provider || previous?.storage_provider || 'supabase',
          contribution_storage_file_id: uploaded?.storage_file_id || previous?.storage_file_id || null,
          contribution_storage_path: uploaded?.storage_path || previous?.storage_path || null,
          contribution_file_name: uploaded?.file_name || previous?.file_name || null,
          contribution_file_size: uploaded?.file_size || previous?.file_size || null,
          contribution_mime_type: uploaded?.mime_type || previous?.mime_type || 'application/pdf',
        })
        if (submitError) throw new Error(submitError.message)
        setMessage('Your revised contribution was resubmitted for review.')
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
          p_mime_type: uploaded?.mime_type || 'application/pdf',
        })
        if (submitError) throw new Error(submitError.message)
        setMessage('Your contribution was submitted for review.')
      }
      setForm({ title: '', author: '', description: '' })
      setFile(null)
      setEditingId(null)
      if (userId) await load(userId)
    } catch (submitError) {
      if (uploaded?.storage_provider === 'google_drive' && uploaded.storage_file_id) {
        await fetch(`/api/storage/upload?fileId=${encodeURIComponent(uploaded.storage_file_id)}`, { method: 'DELETE' }).catch(() => undefined)
      }
      setError(submitError instanceof Error ? submitError.message : 'Unable to submit contribution.')
    }
    setSaving(false)
  }

  return <main className="surface-page min-h-screen px-4 py-6 text-slate-900 dark:text-slate-100 sm:px-8"><div className="mx-auto max-w-5xl space-y-6"><header className="surface-card p-6"><button type="button" onClick={() => router.push('/dashboard/student')} className="text-xs font-semibold text-pine-700 hover:underline dark:text-pine-200">← Student dashboard</button><p className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-pine-600 dark:text-pine-200">Community library</p><h1 className="mt-2 text-3xl font-semibold">Contribute a learning material</h1><p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Upload useful academic resources. Points are awarded only after administrator approval.</p></header>{message ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{message}</div> : null}{error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div> : null}<section className="surface-card p-6"><h2 className="text-xl font-semibold">{editingId ? 'Revise contribution' : 'New contribution'}</h2><form onSubmit={submit} className="mt-5 grid gap-4 sm:grid-cols-2"><label><span className="text-sm font-medium">Title</span><input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="mt-2 w-full rounded-2xl border border-paper-300 bg-paper-50 px-3 py-3 text-sm dark:border-forest-700 dark:bg-forest-800" /></label><label><span className="text-sm font-medium">Author or creator</span><input required value={form.author} onChange={(event) => setForm({ ...form, author: event.target.value })} className="mt-2 w-full rounded-2xl border border-paper-300 bg-paper-50 px-3 py-3 text-sm dark:border-forest-700 dark:bg-forest-800" /></label><label className="sm:col-span-2"><span className="text-sm font-medium">Description</span><textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={4} className="mt-2 w-full rounded-2xl border border-paper-300 bg-paper-50 px-3 py-3 text-sm dark:border-forest-700 dark:bg-forest-800" /></label><label className="sm:col-span-2"><span className="text-sm font-medium">PDF file</span><input type="file" accept="application/pdf,.pdf" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="mt-2 block w-full rounded-2xl border border-dashed border-paper-300 bg-paper-50 px-3 py-4 text-sm dark:border-forest-700 dark:bg-forest-800" /><span className="mt-1 block text-xs text-slate-500">PDF only, maximum 50 MB.</span></label><div className="flex gap-3 sm:col-span-2"><button type="submit" disabled={saving} className="pine-action rounded-2xl px-5 py-3 text-sm font-semibold disabled:opacity-50">{saving ? 'Submitting...' : editingId ? 'Resubmit for review' : 'Submit for review'}</button>{editingId ? <button type="button" onClick={() => { setEditingId(null); setForm({ title: '', author: '', description: '' }); setFile(null) }} className="secondary-action rounded-2xl border px-5 py-3 text-sm font-semibold">Cancel revision</button> : null}</div></form></section><section className="surface-card p-6"><h2 className="text-xl font-semibold">Your contribution history</h2>{loading ? <p className="mt-4 text-sm text-slate-500">Loading history...</p> : <div className="mt-4 space-y-3">{items.map((item) => <article key={item.id} className="rounded-2xl border border-paper-300 p-4 dark:border-forest-700"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{item.title}</h3><p className="mt-1 text-xs text-slate-500">{item.author} · {new Date(item.created_at).toLocaleDateString()}</p></div><span className="rounded-full bg-paper-200 px-3 py-1 text-xs font-semibold capitalize dark:bg-forest-800">{item.status.replaceAll('_', ' ')}</span></div>{item.review_feedback ? <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Feedback: {item.review_feedback}</p> : null}{item.status === 'revision_requested' ? <button type="button" onClick={() => chooseRevision(item)} className="mt-3 rounded-xl border border-amber-300 px-3 py-2 text-xs font-semibold text-amber-800">Edit and resubmit</button> : null}</article>)}{items.length === 0 ? <p className="mt-4 text-sm text-slate-500">You have not submitted a contribution yet.</p> : null}</div>}</section></div></main>
}
