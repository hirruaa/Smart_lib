import AuthForm from '@/components/AuthForm'

import { createClient } from '@/utils/supabase/server'
import { dashboardPathForRole } from '@/utils/roles'
import { redirect } from 'next/navigation'

export const metadata = {
  title: 'Sign in',
  description: 'Sign in to the Mary the Queen College digital library.',
}

export default async function LoginPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    redirect(dashboardPathForRole(profile?.role))
  }

  return <AuthForm />
}

