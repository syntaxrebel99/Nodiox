import { z } from "zod"

export const createPasswordResetSchema = (t: (key: string) => string) =>
  z
    .object({
      password: z
        .string()
        .min(8, t("passwordMinLength"))
        .regex(/[a-z]/, t("pwdReqLowercase"))
        .regex(/[A-Z]/, t("pwdReqUppercase"))
        .regex(/[0-9]/, t("pwdReqNumber"))
        .regex(/[^A-Za-z0-9]/, t("pwdReqSpecial")),
      confirmPassword: z.string().min(1, t("passwordRequired")),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: t("passwordsMustMatch"),
      path: ["confirmPassword"],
    })

export type PasswordResetData = z.infer<ReturnType<typeof createPasswordResetSchema>>
