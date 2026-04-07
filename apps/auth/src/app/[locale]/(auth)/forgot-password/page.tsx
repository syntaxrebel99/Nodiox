import { ForgotPasswordWrapper } from "~/components/forgot-password/forgot-password-wrapper"
import { AuthPageLayout } from "~/components/layout/auth-page-layout"
import type { Metadata } from "next"

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Forgot Password - Nodiox",
    description: "Reset your Nodiox password."
  }
}

export default async function ForgotPasswordPage() {
  return (
    <AuthPageLayout>
      <ForgotPasswordWrapper />
    </AuthPageLayout>
  )
}
