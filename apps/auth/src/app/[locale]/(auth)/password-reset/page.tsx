import { PasswordResetForm } from "~/components/password-reset-form"
import { AuthPageLayout } from "~/components/layout/auth-page-layout"
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
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const cookieStore = await cookies()
  const resetCookieToken = cookieStore.get(RESET_COOKIE)?.value

  // Password resets are authorized exclusively by the short-lived, HTTP-only
  // reset cookie. URL codes and an existing sign-in session are not fallbacks.
  if (!resetCookieToken) {
    redirect({ href: "/forgot-password", locale })
  }

  return (
    <AuthPageLayout>
      <PasswordResetForm />
    </AuthPageLayout>
  )
}
