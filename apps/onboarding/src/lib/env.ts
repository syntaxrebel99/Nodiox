import { z } from "zod";

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url("NEXT_PUBLIC_SUPABASE_URL must be a valid URL"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY is required"),
});

export type OnboardingEnv = z.infer<typeof envSchema> & {
  NODE_ENV: "development" | "test" | "production";
};

let cachedEnv: OnboardingEnv | null = null;

export function getOnboardingEnv(): OnboardingEnv {
  if (cachedEnv) {
    return cachedEnv;
  }

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid onboarding environment configuration:\n${parsed.error.issues.map((i) => `- ${i.message}`).join("\n")}`);
  }

  const env: OnboardingEnv = {
    ...parsed.data,
    NODE_ENV: (process.env.NODE_ENV as "development" | "test" | "production") || "development",
  };

  cachedEnv = env;
  return env;
}
