'use client'

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Application root error:', error)
  }, [error])

  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#f3f6f8', color: '#102a4c', fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' }}>
        <main style={{ display: 'grid', minHeight: '100vh', placeItems: 'center', padding: '24px' }}>
          <section style={{ width: '100%', maxWidth: '560px', border: '1px solid #d7e1ec', borderRadius: '24px', background: '#ffffff', padding: 'clamp(24px, 6vw, 40px)', textAlign: 'center', boxShadow: '0 20px 50px rgba(15, 42, 76, .12)' }}>
            <span aria-hidden="true" style={{ display: 'grid', width: '52px', height: '52px', margin: '0 auto 18px', placeItems: 'center', borderRadius: '50%', background: '#fff1df', color: '#9a4b16', fontSize: '26px', fontWeight: 700 }}>!</span>
            <p style={{ margin: '0 0 8px', color: '#47705c', fontSize: '12px', fontWeight: 700, letterSpacing: '.18em', textTransform: 'uppercase' }}>Smart Lib</p>
            <h1 style={{ margin: 0, fontSize: 'clamp(22px, 5vw, 30px)', lineHeight: 1.2, letterSpacing: '-.03em' }}>The library is temporarily unavailable</h1>
            <p style={{ margin: '14px 0 24px', color: '#52657a', fontSize: '15px', lineHeight: 1.6 }}>Something went wrong while loading this page. Try again, or contact your library administrator if the problem continues.</p>
            {error.digest ? <p style={{ margin: '-10px 0 20px', color: '#718096', fontSize: '12px' }}>Reference: {error.digest}</p> : null}
            <button type="button" onClick={() => reset()} style={{ cursor: 'pointer', border: 0, borderRadius: '12px', background: '#102a4c', color: '#fff', padding: '12px 20px', fontSize: '14px', fontWeight: 700 }}>
              Try again
            </button>
          </section>
        </main>
      </body>
    </html>
  )
}
