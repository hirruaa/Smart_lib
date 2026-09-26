'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabase } from '@/utils/supabase/client'

type Reward = { id: number; name: string; description: string | null; points_cost: number; reward_type: string; stock: number | null }

export default function RewardsPage() {
  const router = useRouter()
  const [rewards, setRewards] = useState<Reward[]>([])
  const [balance, setBalance] = useState(0)
  const [message, setMessage] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const supabase = getSupabase()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      const [rewardResult, profileResult] = await Promise.all([
        supabase.from('rewards').select('id,name,description,points_cost,reward_type,stock').order('points_cost'),
        supabase.from('profiles').select('points_balance').eq('id', user.id).single(),
      ])
      setRewards((rewardResult.data ?? []) as Reward[])
      setBalance(profileResult.data?.points_balance ?? 0)
      setLoading(false)
    }
    void load()
  }, [router])

  async function redeem(reward: Reward) {
    if (reward.points_cost > balance) { setMessage(`You need ${reward.points_cost - balance} more points for this reward.`); return }
    if (!window.confirm(`Redeem ${reward.name} for ${reward.points_cost} points?`)) return
    setBusyId(reward.id)
    setMessage(null)
    const { error } = await getSupabase().rpc('redeem_reward', { target_reward_id: reward.id })
    if (error) setMessage(error.message)
    else { setBalance((value) => value - reward.points_cost); setMessage(`${reward.name} was redeemed successfully.`) }
    setBusyId(null)
  }

  return <main className="surface-page min-h-screen px-4 py-6 text-slate-900 dark:text-slate-100 sm:px-8"><div className="mx-auto max-w-5xl space-y-6"><header className="surface-card flex flex-wrap items-center justify-between gap-4 p-6"><div><button type="button" onClick={() => router.push('/dashboard/student')} className="text-xs font-semibold text-pine-700 hover:underline dark:text-pine-200">← Student dashboard</button><p className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-pine-600 dark:text-pine-200">Rewards</p><h1 className="mt-2 text-3xl font-semibold">Use points thoughtfully</h1><p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Redeem approved academic rewards without affecting your lifetime contributor progress.</p></div><div className="rounded-2xl bg-forest-900 px-6 py-5 text-paper-100"><p className="text-xs uppercase tracking-wider text-paper-100/70">Balance</p><strong className="mt-2 block text-4xl">{balance}</strong></div></header>{message ? <div className="rounded-2xl border border-pine-200 bg-pine-50 p-4 text-sm text-pine-900 dark:border-forest-700 dark:bg-forest-800/60 dark:text-paper-100">{message}</div> : null}{loading ? <div className="surface-card p-8 text-sm text-slate-500">Loading rewards...</div> : rewards.length === 0 ? <div className="surface-card p-10 text-center text-sm text-slate-500">No rewards are available yet. Keep contributing and check back later.</div> : <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{rewards.map((reward) => <article key={reward.id} className="surface-card flex flex-col p-6"><span className="text-xs font-semibold uppercase tracking-wider text-pine-600 dark:text-pine-200">{reward.reward_type.replaceAll('_', ' ')}</span><h2 className="mt-3 text-xl font-semibold">{reward.name}</h2><p className="mt-2 flex-1 text-sm text-slate-600 dark:text-slate-300">{reward.description || 'A library recognition reward.'}</p><div className="mt-5 flex items-center justify-between gap-3"><strong>{reward.points_cost} points</strong><span className="text-xs text-slate-500">{reward.stock === null ? 'Available' : `${reward.stock} left`}</span></div><button type="button" disabled={busyId !== null || reward.points_cost > balance || reward.stock === 0} onClick={() => void redeem(reward)} className="pine-action mt-4 rounded-xl px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50">{busyId === reward.id ? 'Redeeming...' : reward.points_cost > balance ? 'Not enough points' : 'Redeem reward'}</button></article>)}</section>}</div></main>
}
