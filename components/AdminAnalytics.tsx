import React from 'react'

interface CategoryStat {
  category: string
  count: number
}

interface MonthlyStat {
  label: string
  requests: number
  approved: number
}

interface AdminAnalyticsProps {
  totalBooks: number
  totalStudents: number
  totalRequests: number
  totalLoansActive: number
  totalReturned: number
  categoryStats: CategoryStat[]
  monthlyStats: MonthlyStat[]
  storageCount: number
}

export default function AdminAnalytics({
  totalBooks,
  totalStudents,
  totalRequests,
  totalLoansActive,
  totalReturned,
  categoryStats,
  monthlyStats,
  storageCount,
}: AdminAnalyticsProps) {
  const fulfillmentRate = totalRequests > 0
    ? Math.round(((totalLoansActive + totalReturned) / totalRequests) * 100)
    : 100

  // Calculate highest request month for chart normalization
  const maxMonthValue = Math.max(1, ...monthlyStats.map((m) => Math.max(m.requests, m.approved)))

  // Max category count for bar normalization
  const maxCatCount = Math.max(1, ...categoryStats.map((c) => c.count))

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Fulfillment Rate
          </span>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-slate-900 dark:text-slate-100">
              {fulfillmentRate}%
            </span>
            <span className="text-xs text-emerald-600 dark:text-emerald-400">
              Approved or completed
            </span>
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${Math.min(100, fulfillmentRate)}%` }}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Active Digital Access
          </span>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-slate-900 dark:text-slate-100">
              {totalLoansActive}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Active loans today
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            {totalReturned} loans completed / returned
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            E-Books in Supabase
          </span>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-slate-900 dark:text-slate-100">
              {storageCount}
            </span>
            <span className="text-xs text-pine-600 dark:text-pine-300">
              Directly hosted
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            {totalBooks - storageCount} linked via external URLs
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Avg Loans / Student
          </span>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-slate-900 dark:text-slate-100">
              {totalStudents > 0 ? (totalRequests / totalStudents).toFixed(1) : '0'}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Across {totalStudents} students
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Lifetime requests logged: {totalRequests}
          </p>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Activity & Trends SVG Bar Chart */}
        <div className="rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Borrowing Velocity
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Loan requests and approved access comparison
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-sky-500" /> Requests
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Approved
              </span>
            </div>
          </div>

          <div className="mt-6 flex h-48 items-end gap-3 border-b border-slate-200 pb-2 dark:border-slate-800">
            {monthlyStats.length === 0 ? (
              <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">
                No borrowing activity recorded yet.
              </div>
            ) : (
              monthlyStats.map((item, idx) => {
                const reqHeight = Math.max(8, (item.requests / maxMonthValue) * 100)
                const appHeight = Math.max(6, (item.approved / maxMonthValue) * 100)

                return (
                  <div key={idx} className="flex flex-1 flex-col items-center gap-1">
                    <div className="flex h-36 w-full items-end justify-center gap-1">
                      <div
                        className="w-full max-w-[16px] rounded-t bg-sky-500/80 transition-all hover:bg-sky-500"
                        style={{ height: `${reqHeight}%` }}
                        title={`Requests: ${item.requests}`}
                      />
                      <div
                        className="w-full max-w-[16px] rounded-t bg-emerald-500/80 transition-all hover:bg-emerald-500"
                        style={{ height: `${appHeight}%` }}
                        title={`Approved: ${item.approved}`}
                      />
                    </div>
                    <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 truncate max-w-[48px]">
                      {item.label}
                    </span>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Category Breakdown Horizontal Bars */}
        <div className="rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Catalog Category Distribution
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Active inventory allocation by academic discipline
            </p>
          </div>

          <div className="mt-6 space-y-3.5">
            {categoryStats.length === 0 ? (
              <p className="text-xs text-slate-400">No categories found in catalog.</p>
            ) : (
              categoryStats.slice(0, 6).map((cat, idx) => {
                const percentage = Math.round((cat.count / Math.max(1, totalBooks)) * 100)
                const barWidth = Math.max(8, (cat.count / maxCatCount) * 100)

                return (
                  <div key={idx} className="space-y-1">
                    <div className="flex items-center justify-between text-xs font-medium">
                      <span className="text-slate-700 dark:text-slate-200">{cat.category}</span>
                      <span className="text-slate-500 dark:text-slate-400">
                        {cat.count} books ({percentage}%)
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className="h-full rounded-full bg-sky-600 dark:bg-sky-400 transition-all duration-500"
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
