import { z } from "zod"

export const createForgotPasswordSchema = () =>
  z
    .object({
      email: z.string().email("emailError"),
      password: z
        .string()
        .min(8, "passwordMinLength")
        .regex(/[a-z]/, "pwdReqLowercase")
        .regex(/[A-Z]/, "pwdReqUppercase")
        .regex(/[0-9]/, "pwdReqNumber")
        .regex(/[^A-Za-z0-9]/, "pwdReqSpecial"),
      confirmPassword: z.string().min(1, "passwordRequired"),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: "passwordsMustMatch",
      path: ["confirmPassword"],
    })

export type ForgotPasswordData = z.infer<ReturnType<typeof createForgotPasswordSchema>>
