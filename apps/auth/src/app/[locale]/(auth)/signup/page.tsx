import { SignupForm } from "~/components/signup/signup-form"
import { AuthPageLayout } from "~/components/layout/auth-page-layout"
import type { Metadata } from "next"

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Sign up - Nodiox",
    description: "Create your Nodiox account."
  }
}

export default async function SignupPage() {
  return (
    <AuthPageLayout>
      <SignupForm />
    </AuthPageLayout>
  )
}
