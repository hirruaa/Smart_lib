'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabase } from '@/utils/supabase/client'

type Transaction = { id: number; amount: number; transaction_type: string; description: string; created_at: string }
type Contribution = { id: number; title: string; status: string; points_awarded: number; created_at: string }
type Recognition = { id: number; category: string; points: number; reason: string; created_at: string }
type Grant = { id: number; book_id: number; access_type: string; points_paid: number; granted_at: string; expires_at: string | null; status: string; books?: { title: string }[] | null }
type Achievement = { id: string; name: string; description: string; awarded_at: string }

export default function PointsPage() {
  const router = useRouter()
  const [balance, setBalance] = useState(0)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [contributions, setContributions] = useState<Contribution[]>([])
  const [recognition, setRecognition] = useState<Recognition[]>([])
  const [grants, setGrants] = useState<Grant[]>([])
  const [achievements, setAchievements] = useState<Achievement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const supabase = getSupabase()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }

      const [profileResult, transactionResult, contributionResult, recognitionResult, grantResult, achievementResult] = await Promise.all([
        supabase.from('profiles').select('points_balance').eq('id', user.id).single(),
        supabase.from('point_transactions').select('id,amount,transaction_type,description,created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(100),
        supabase.from('book_contributions').select('id,title,status,points_awarded,created_at').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('recognition_awards').select('id,category,points,reason,created_at').eq('student_id', user.id).order('created_at', { ascending: false }),
        supabase.from('book_access_grants').select('id,book_id,access_type,points_paid,granted_at,expires_at,status,books(title)').eq('student_id', user.id).order('granted_at', { ascending: false }),
        supabase.from('user_achievements').select('awarded_at,achievements(name,description)').eq('user_id', user.id).order('awarded_at', { ascending: false }),
      ])
      const firstError = [profileResult, transactionResult, contributionResult, recognitionResult, grantResult, achievementResult].find((result) => result.error)?.error
      if (firstError) setError('Unable to load your points activity right now.')
      setBalance(profileResult.data?.points_balance ?? 0)
      setTransactions((transactionResult.data ?? []) as Transaction[])
      setContributions((contributionResult.data ?? []) as Contribution[])
      setRecognition((recognitionResult.data ?? []) as Recognition[])
      setGrants((grantResult.data ?? []) as Grant[])
      setAchievements(((achievementResult.data ?? []) as Array<{ awarded_at: string; achievements: { name: string; description: string }[] | null }>).map((item) => ({ id: item.awarded_at, awarded_at: item.awarded_at, name: item.achievements?.[0]?.name ?? 'Achievement', description: item.achievements?.[0]?.description ?? '' })) as Achievement[])
      setLoading(false)
    }
    void load()
  }, [router])

  const earned = useMemo(() => transactions.filter((item) => item.amount > 0).reduce((sum, item) => sum + item.amount, 0), [transactions])
  const spent = useMemo(() => Math.abs(transactions.filter((item) => item.amount < 0).reduce((sum, item) => sum + item.amount, 0)), [transactions])
  const approved = contributions.filter((item) => item.status === 'approved').length

  if (loading) return <main className="surface-page min-h-screen p-6"><div className="surface-card mx-auto max-w-5xl p-8 text-sm text-slate-500">Loading points wallet...</div></main>

  return (
    <main className="surface-page min-h-screen px-4 py-6 text-slate-900 dark:text-slate-100 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="surface-card flex flex-wrap items-center justify-between gap-4 p-6">
          <div><button type="button" onClick={() => router.push('/dashboard/student')} className="text-xs font-semibold text-pine-700 hover:underline dark:text-pine-200">← Student dashboard</button><p className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-pine-600 dark:text-pine-200">Points wallet</p><h1 className="mt-2 text-3xl font-semibold">Your academic contributions</h1><p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Track what you earned, spent, unlocked, and received through recognition.</p></div>
          <div className="rounded-2xl bg-forest-900 px-6 py-5 text-paper-100"><p className="text-xs uppercase tracking-wider text-paper-100/70">Available points</p><strong className="mt-2 block text-4xl">{balance}</strong></div>
        </header>
        {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div> : null}
        <section className="grid gap-4 sm:grid-cols-3"><div className="surface-card p-5"><p className="text-xs uppercase tracking-wider text-slate-500">Lifetime earned</p><strong className="mt-3 block text-2xl">{earned}</strong></div><div className="surface-card p-5"><p className="text-xs uppercase tracking-wider text-slate-500">Points spent</p><strong className="mt-3 block text-2xl">{spent}</strong></div><div className="surface-card p-5"><p className="text-xs uppercase tracking-wider text-slate-500">Approved contributions</p><strong className="mt-3 block text-2xl">{approved}</strong></div></section>
        <section className="grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
          <div className="surface-card p-6"><h2 className="text-xl font-semibold">Transaction history</h2><div className="mt-4 divide-y divide-paper-300 dark:divide-forest-700">{transactions.map((item) => <div key={item.id} className="flex items-start justify-between gap-4 py-4"><div><p className="font-medium">{item.description}</p><p className="mt-1 text-xs capitalize text-slate-500">{item.transaction_type.replaceAll('_', ' ')} · {new Date(item.created_at).toLocaleDateString()}</p></div><strong className={item.amount > 0 ? 'text-emerald-700' : 'text-rose-700'}>{item.amount > 0 ? '+' : ''}{item.amount}</strong></div>)}{transactions.length === 0 ? <p className="py-6 text-sm text-slate-500">No point transactions yet.</p> : null}</div></div>
          <div className="space-y-6"><div className="surface-card p-6"><h2 className="text-xl font-semibold">Recognition</h2><div className="mt-4 space-y-3">{recognition.map((item) => <article key={item.id} className="rounded-xl border border-paper-300 p-4 dark:border-forest-700"><div className="flex justify-between gap-3"><strong className="capitalize">{item.category.replaceAll('_', ' ')}</strong><strong className="text-emerald-700">+{item.points}</strong></div><p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{item.reason}</p></article>)}{recognition.length === 0 ? <p className="text-sm text-slate-500">No recognition awards yet.</p> : null}</div></div><div className="surface-card p-6"><h2 className="text-xl font-semibold">Achievements</h2><div className="mt-4 space-y-3">{achievements.map((item) => <article key={item.id} className="rounded-xl border border-paper-300 p-4 dark:border-forest-700"><strong>{item.name}</strong><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{item.description}</p></article>)}{achievements.length === 0 ? <p className="text-sm text-slate-500">Your verified achievements will appear here.</p> : null}</div></div>
          <div className="surface-card p-6"><h2 className="text-xl font-semibold">Unlocked materials</h2><div className="mt-4 space-y-3">{grants.slice(0, 6).map((grant) => <article key={grant.id} className="rounded-xl border border-paper-300 p-4 dark:border-forest-700"><div className="flex justify-between gap-3"><strong>{grant.books?.[0]?.title ?? `Book #${grant.book_id}`}</strong><span className="text-xs capitalize text-slate-500">{grant.status}</span></div><p className="mt-2 text-xs text-slate-500">{grant.points_paid ? `${grant.points_paid} points` : 'Free access'} · expires {grant.expires_at ? new Date(grant.expires_at).toLocaleString() : 'never'}</p><button type="button" onClick={() => router.push(`/reader/${grant.book_id}`)} className="mt-3 text-xs font-semibold text-pine-700 hover:underline dark:text-pine-200">Open reader</button></article>)}{grants.length === 0 ? <p className="text-sm text-slate-500">No unlocked materials yet.</p> : null}</div></div></div>
        </section>
        <section className="surface-card p-6"><h2 className="text-xl font-semibold">Contribution history</h2><div className="mt-4 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="border-b border-paper-300 text-xs uppercase tracking-wider text-slate-500 dark:border-forest-700"><tr><th className="px-3 py-3">Material</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Points</th><th className="px-3 py-3">Submitted</th></tr></thead><tbody className="divide-y divide-paper-300 dark:divide-forest-700">{contributions.map((item) => <tr key={item.id}><td className="px-3 py-3 font-medium">{item.title}</td><td className="px-3 py-3 capitalize">{item.status}</td><td className="px-3 py-3">{item.points_awarded}</td><td className="px-3 py-3 text-slate-500">{new Date(item.created_at).toLocaleDateString()}</td></tr>)}</tbody></table>{contributions.length === 0 ? <p className="py-6 text-sm text-slate-500">Submit a useful academic resource to start building your contribution history.</p> : null}</div></section>
      </div>
    </main>
  )
}
