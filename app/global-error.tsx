'use client'

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#f5f1e8', color: '#242a28', fontFamily: 'sans-serif' }}>
        <main style={{ display: 'grid', minHeight: '100vh', placeItems: 'center', padding: '24px' }}>
          <section style={{ maxWidth: '560px', borderRadius: '20px', background: '#fcfbf7', padding: '40px', textAlign: 'center' }}>
            <h1>Smart Lib is temporarily unavailable.</h1>
            <p>Please try again. If the problem continues, contact your library administrator.</p>
            <button type="button" onClick={() => reset()} style={{ cursor: 'pointer', padding: '12px 20px' }}>
              Try again
            </button>
          </section>
        </main>
      </body>
    </html>
  )
}
