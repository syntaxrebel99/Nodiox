import { z } from "zod"

/**
 * Shared password validation logic.
 * Ensures minimum 8 characters, at least one lowercase, one uppercase, one number, and one special character.
 */
export const passwordSchema = (t?: (key: string) => string) => 
  z.string()
    .min(8, t ? t("passwordMinLength") : "passwordMinLength")
    .regex(/[a-z]/, t ? t("pwdReqLowercase") : "pwdReqLowercase")
    .regex(/[A-Z]/, t ? t("pwdReqUppercase") : "pwdReqUppercase")
    .regex(/[0-9]/, t ? t("pwdReqNumber") : "pwdReqNumber")
    .regex(/[^A-Za-z0-9]/, t ? t("pwdReqSpecial") : "pwdReqSpecial")

/**
 * Creates a schema for forms that require password and confirmation.
 */
export const createPasswordAndConfirmSchema = (t?: (key: string) => string) =>
  z.object({
    password: passwordSchema(t),
    confirmPassword: z.string().min(1, t ? t("passwordRequired") : "passwordRequired"),
  }).refine((data) => data.password === data.confirmPassword, {
    message: t ? t("passwordsMustMatch") : "passwordsMustMatch",
    path: ["confirmPassword"],
  })

/**
 * Specifically for Forgot Password flow which includes email.
 */
export const createForgotPasswordSchema = (t?: (key: string) => string) =>
  z.object({
    email: z.string().email(t ? t("emailError") : "emailError"),
  }).merge(createPasswordAndConfirmSchema(t))

export type ForgotPasswordData = z.infer<ReturnType<typeof createForgotPasswordSchema>>
export type PasswordAndConfirmData = z.infer<ReturnType<typeof createPasswordAndConfirmSchema>>
