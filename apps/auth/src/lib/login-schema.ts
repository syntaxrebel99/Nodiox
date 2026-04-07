import { z } from "zod";

/**
 * Validation schema for the login flow.
 */
export const createLoginSchema = () => z.object({
  loginMethod: z.enum(["email", "phone"]),
  email: z.string().optional(),
  phoneNumber: z.string().optional(),
  password: z.string().min(1, "passwordRequired"),
  rememberMe: z.boolean(),
}).superRefine((data, ctx) => {
  if (data.loginMethod === "email") {
    if (!data.email || data.email === "") {
      ctx.addIssue({
        path: ["email"],
        code: z.ZodIssueCode.custom,
        message: "emailRequired",
      });
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      ctx.addIssue({
        path: ["email"],
        code: z.ZodIssueCode.custom,
        message: "emailError",
      });
    }
  }

  if (data.loginMethod === "phone") {
    if (!data.phoneNumber || data.phoneNumber === "") {
      ctx.addIssue({
        path: ["phoneNumber"],
        code: z.ZodIssueCode.custom,
        message: "phoneRequired",
      });
    } else {
      const cleaned = data.phoneNumber.replace(/[\s\-\(\)]/g, "");
 
      // Strict Algerian Mobile check (+213, 00213, or 0 followed by 5/6/7 and 8 digits)
      if (!/^(?:\+213|00213|0)[567]\d{8}$/.test(cleaned)) {
        ctx.addIssue({
          path: ["phoneNumber"],
          code: z.ZodIssueCode.custom,
          message: "phoneError",
        });
      }
    }
  }
});

export type LoginData = z.infer<ReturnType<typeof createLoginSchema>>;
