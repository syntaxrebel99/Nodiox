import { FullNameStep } from "@/components/onboarding/steps/FullNameStep";
import { createClient } from "@/lib/supabase/server";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  
  let firstName = "";
  if (data.user?.user_metadata?.full_name) {
    firstName = data.user.user_metadata.full_name.split(" ")[0] || "";
  } else if (data.user?.user_metadata?.first_name) {
    firstName = data.user.user_metadata.first_name;
  }

  return <FullNameStep firstName={firstName} />;
}
