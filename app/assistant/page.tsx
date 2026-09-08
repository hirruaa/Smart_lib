import Link from 'next/link'
import BookAssistant from '@/components/BookAssistant'

export const dynamic = 'force-dynamic'

export default function AssistantPage() {
  return (
    <main className="surface-page min-h-screen px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-4xl">
        <Link href="/dashboard/student" className="text-sm font-semibold text-pine-600 dark:text-pine-200">Back to dashboard</Link>
        <div className="mt-6"><BookAssistant /></div>
      </div>
    </main>
  )
}