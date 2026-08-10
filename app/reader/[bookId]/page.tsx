export const dynamic = 'force-dynamic'
import React from 'react'
import EReader from '@/components/EReader'
import { createClient } from '@/utils/supabase/server'

type Props = { params: { bookId: string } }

export default async function Page({ params }: Props) {
  const supabase = createClient()
  const { data } = await supabase.from('books').select('id,pdf_url,title').eq('id', Number(params.bookId)).maybeSingle()
  const book = (data as any) ?? null

  if (!book || !book.pdf_url) {
    return <div>No PDF available for this book.</div>
  }

  return (
    <div>
      <h1 style={{ marginBottom: 12 }}>{book.title}</h1>
      <EReader bookId={Number(params.bookId)} pdfUrl={book.pdf_url} />
    </div>
  )
}
