'use client'

import { ReactNode, useEffect, useState } from 'react'

export default function ReaderSessionGuard({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    const update = () => setHidden(document.visibilityState !== 'visible' || !document.hasFocus())
    document.addEventListener('visibilitychange', update)
    window.addEventListener('blur', update)
    window.addEventListener('focus', update)
    update()
    return () => {
      document.removeEventListener('visibilitychange', update)
      window.removeEventListener('blur', update)
      window.removeEventListener('focus', update)
    }
  }, [])

  return <div className="reader-session-guard">
    <div className={hidden ? 'reader-session-content reader-session-content-hidden' : 'reader-session-content'}>
      {children}
    </div>
    {hidden ? <div className="reader-session-cover" role="status" aria-live="polite">Reading paused while this window is inactive</div> : null}
  </div>
}
