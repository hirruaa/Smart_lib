'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabase } from '@/utils/supabase/client'
import ActionModal from '@/components/ActionModal'

type Reward = { id: number; name: string; description: string | null; points_cost: number; reward_type: string; stock: number | null }

export default function RewardsCatalog() {
  const router = useRouter()
  const [rewards, setRewards] = useState<Reward[]>([])
  const [balance, setBalance] = useState(0)
  const [message, setMessage] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [pendingReward, setPendingReward] = useState<Reward | null>(null)

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
    setPendingReward(reward)
  }

  async function confirmRedeem() {
    if (!pendingReward) return
    const reward = pendingReward
    setBusyId(reward.id)
    setMessage(null)
    const { error } = await getSupabase().rpc('redeem_reward', { target_reward_id: reward.id })
    if (error) setMessage(error.message)
    else { setBalance((value) => value - reward.points_cost); setMessage(`${reward.name} was redeemed successfully.`) }
    setBusyId(null)
    setPendingReward(null)
  }

  return <section id="rewards" className="surface-card scroll-mt-6 p-6">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-pine-600 dark:text-pine-200">Recognition catalog</p><h2 className="mt-2 text-2xl font-semibold">Use your points</h2><p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Redeem approved academic rewards without losing your contribution history.</p></div><div className="rounded-2xl bg-forest-900 px-4 py-3 text-paper-100"><p className="text-[10px] uppercase tracking-wider text-paper-100/70">Available</p><strong className="mt-1 block text-2xl">{balance} pts</strong></div></div>
    {message ? <div className="mt-5 rounded-2xl border border-pine-200 bg-pine-50 p-4 text-sm text-pine-900 dark:border-forest-700 dark:bg-forest-800/60 dark:text-paper-100">{message}</div> : null}
    {loading ? <p className="mt-6 text-sm text-slate-500">Loading rewards...</p> : rewards.length === 0 ? <div className="mt-6 rounded-2xl border border-dashed border-paper-300 p-8 text-center text-sm text-slate-500 dark:border-forest-700">No rewards are available yet. Keep contributing and check back later.</div> : <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{rewards.map((reward) => <article key={reward.id} className="surface-card flex flex-col border-paper-300 p-5 shadow-none dark:border-forest-700"><span className="text-xs font-semibold uppercase tracking-wider text-pine-600 dark:text-pine-200">{reward.reward_type.replaceAll('_', ' ')}</span><h3 className="mt-3 text-lg font-semibold">{reward.name}</h3><p className="mt-2 flex-1 text-sm text-slate-600 dark:text-slate-300">{reward.description || 'A library recognition reward.'}</p><div className="mt-5 flex items-center justify-between gap-3"><strong>{reward.points_cost} points</strong><span className="text-xs text-slate-500">{reward.stock === null ? 'Available' : `${reward.stock} left`}</span></div><button type="button" disabled={busyId !== null || reward.points_cost > balance || reward.stock === 0} onClick={() => void redeem(reward)} className="pine-action mt-4 rounded-xl px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50">{busyId === reward.id ? 'Redeeming...' : reward.points_cost > balance ? 'Not enough points' : 'Redeem reward'}</button></article>)}</div>}
    <ActionModal
      open={pendingReward !== null}
      title="Redeem this reward?"
      description={pendingReward ? `${pendingReward.name} will use ${pendingReward.points_cost} points from your balance.` : undefined}
      confirmLabel="Redeem reward"
      busy={busyId !== null}
      onClose={() => setPendingReward(null)}
      onConfirm={() => void confirmRedeem()}
    />
  </section>
}
