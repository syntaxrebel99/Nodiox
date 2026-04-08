import { PasswordResetForm } from "~/components/password-reset-form"
import { AuthPageLayout } from "~/components/layout/auth-page-layout"
import { createClient } from "~/lib/supabase/server"
import { redirect } from "@nodiox/i18n"
import type { Metadata } from "next"
import { cookies } from "next/headers"

const RESET_COOKIE = "nodiox_reset_token"

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Password Reset - Nodiox",
    description: "Create a new password for your Nodiox account."
  }
}

export default async function PasswordResetPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { locale } = await params
  const codeParam = (await searchParams).code
  const code = Array.isArray(codeParam) ? codeParam[0] : codeParam
  
  const cookieStore = await cookies()
  const resetCookieToken = cookieStore.get(RESET_COOKIE)?.value

  // PROTECTION:
  // 1. If a 'code' exists (legacy Supabase link or manual code), we allow.
  // 2. If a short-lived reset cookie exists (our new secure jump), we allow.
  // 3. Otherwise, check if an authenticated session exists (session bridge).
  if (!code && !resetCookieToken) {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) {
      redirect({ href: "/forgot-password", locale })
    }
  }

  return (
    <AuthPageLayout>
      <PasswordResetForm code={code} />
    </AuthPageLayout>
  )
}
