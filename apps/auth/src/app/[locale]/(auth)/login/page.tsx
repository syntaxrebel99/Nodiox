import { LoginForm } from "~/components/login/login-form"
import { AuthPageLayout } from "~/components/layout/auth-page-layout"
import type { Metadata } from "next"

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Login - Nodiox",
    description: "Securely log into your Nodiox account."
  }
}

export default async function LoginPage() {
  return (
    <AuthPageLayout>
      <LoginForm />
    </AuthPageLayout>
  )
}
