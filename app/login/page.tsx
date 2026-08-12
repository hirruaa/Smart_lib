import AuthForm from '@/components/AuthForm'

export const metadata = {
  title: 'Login - Smart Lib',
  description: 'Sign in to Smart Lib',
}

export default function LoginPage() {
  return <AuthForm defaultMode="login" />
}

