import { PasswordResetForm } from "~/components/password-reset-form"
import { AuthPageLayout } from "~/components/layout/auth-page-layout"
import { createClient } from "~/lib/supabase/server"
import { redirect } from "next/navigation"
import type { Metadata } from "next"

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Password Reset - Nodiox",
    description: "Create a new password for your Nodiox account."
  }
}

export default async function PasswordResetPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const codeParam = (await searchParams).code
  const code = Array.isArray(codeParam) ? codeParam[0] : codeParam
  
  const tokenParam = (await searchParams).token
  const token = Array.isArray(tokenParam) ? tokenParam[0] : tokenParam

  // PROTECTION:
  // 1. If a 'code' exists (link-based), we allow.
  // 2. If a 'token' exists (OTP-based secure jump), we allow.
  // 3. If no code/token, we check if an authenticated session exists (OTP-based session bridge).
  if (!code && !token) {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) {
      redirect("/forgot-password")
    }
  }

  return (
    <AuthPageLayout>
      <PasswordResetForm code={code} token={token} />
    </AuthPageLayout>
  )
}
