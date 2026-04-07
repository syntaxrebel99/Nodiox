import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "~/lib/supabase/server"
import { createAdminClient } from "~/lib/supabase/admin"
import { EmailService } from "~/lib/email-service"
import { z } from "zod"

const setPasswordSchema = z.object({
  password: z.string().min(8),
  fullName: z.string().min(2),
  phone: z.string().optional(),
})

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const result = setPasswordSchema.safeParse(body)
    
    if (!result.success) {
      return NextResponse.json(
        { error: "Invalid request format", details: result.error.issues },
        { status: 400 }
      )
    }

    const { password, fullName, phone } = result.data

    // 1. Check for the Secure Signup Verification Cookie
    const cookieStore = await cookies()
    const verifiedEmail = cookieStore.get("nodiox_signup_email")?.value

    if (!verifiedEmail) {
      return NextResponse.json(
        { error: "Email verification expired or not found. Please restart signup." },
        { status: 401 }
      )
    }

    const admin = createAdminClient()
    const supabase = await createClient()

    // 2. Create or Update the User Record via Admin API
    // This allows us to mark them as 'email_confirm: true' immediately
    const { data: userData, error: createError } = await admin.auth.admin.createUser({
      email: verifiedEmail,
      password: password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        phone: phone,
      }
    })

    if (createError) {
      // If user already exists, we might want to handle it differently, 
      // but for signup, we assume they should be new.
      console.error("Signup Create Error:", createError)
      return NextResponse.json(
        { error: createError.message },
        { status: 400 }
      )
    }

    // 3. Clear the signup verification cookie
    const response = NextResponse.json({ success: true, user: userData.user })
    response.cookies.delete("nodiox_signup_email")

    // 4. Send Welcome Email
    const locale = cookieStore.get("NEXT_LOCALE")?.value || "en"
    if (verifiedEmail) {
      await EmailService.sendWelcomeEmail(verifiedEmail, fullName, locale)
    }

    // 5. Log the user in automatically (Bridge to Session)
    const { data: { properties }, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: verifiedEmail,
    })

    if (!linkError && properties?.email_otp) {
      await supabase.auth.verifyOtp({
        email: verifiedEmail,
        token: properties.email_otp,
        type: "magiclink",
      })
    }

    return response
  } catch (error: any) {
    console.error("Set Password Error:", error)
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    )
  }
}
