import AuthForm from '@/components/AuthForm'

export const metadata = {
  title: 'Register - Smart Lib',
  description: 'Create a new Smart Lib account',
}

export default function RegisterPage() {
  return <AuthForm defaultMode="signup" />
}
