'use client'

import { useEffect, useMemo, useState } from 'react'

export type SearchableMember = { id: string; full_name?: string | null; email: string; role: string }

export default function SearchableMemberSelect({
  members,
  value,
  onChange,
  label = 'Member',
  placeholder = 'Search by name or email…',
}: {
  members: SearchableMember[]
  value: string
  onChange: (id: string) => void
  label?: string
  placeholder?: string
}) {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const selected = members.find((member) => member.id === value)

  useEffect(() => {
    if (!open) setSearch('')
  }, [open, value])

  const matches = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    if (query.length < 2) return []
    return members
      .filter((member) => !query || `${member.full_name ?? ''} ${member.email} ${member.role}`.toLocaleLowerCase().includes(query))
      .slice(0, 8)
  }, [members, search])

  return <div className="relative min-w-0">
    <span className="mb-1 block text-sm font-medium">{label}</span>
    {selected && !open ? <div className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950">
      <span className="min-w-0 truncate"><strong>{selected.full_name || selected.email}</strong><span className="ml-2 text-xs capitalize text-slate-500">{selected.role}</span></span>
      <button type="button" onClick={() => setOpen(true)} className="shrink-0 font-semibold text-pine-700 underline underline-offset-2 dark:text-pine-200">Change</button>
    </div> : <>
      <input type="search" role="combobox" aria-expanded={open} aria-controls="member-select-results" aria-autocomplete="list" autoFocus={open} value={search} onFocus={() => setOpen(true)} onChange={(event) => setSearch(event.target.value)} placeholder={placeholder} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-pine-600 focus:ring-2 focus:ring-pine-200 dark:border-slate-700 dark:bg-slate-950 dark:focus:ring-pine-900" />
      {open ? <div id="member-select-results" role={search.trim().length >= 2 ? 'listbox' : undefined} aria-label={`${label} search results`} className="absolute z-[70] mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 text-slate-900 shadow-xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
        {search.trim().length < 2 ? <p className="px-3 py-3 text-sm text-slate-500">Type at least 2 characters to search.</p> : null}
        {matches.map((member) => <button key={member.id} type="button" role="option" aria-selected={false} onClick={() => { onChange(member.id); setOpen(false) }} className="block w-full rounded-lg px-3 py-2 text-left text-slate-900 hover:bg-emerald-50 focus:bg-emerald-50 focus:outline-none dark:text-slate-100 dark:hover:bg-slate-800 dark:focus:bg-slate-800">
          <span className="block truncate text-sm font-medium">{member.full_name || member.email}</span><span className="block truncate text-xs text-slate-500">{member.email} · <span className="capitalize">{member.role}</span></span>
        </button>)}
        {search.trim().length >= 2 && matches.length === 0 ? <p className="px-3 py-3 text-sm text-slate-500">No matching members. Try a name or email.</p> : null}
        {search.trim().length >= 2 ? <button type="button" onClick={() => setOpen(false)} className="w-full border-t border-slate-100 px-3 py-2 text-left text-xs font-semibold text-slate-500 dark:border-slate-800">Close results</button> : null}
      </div> : null}
    </>}
  </div>
}
