// Legacy EmailSignup - now powered by UltimateEmailSignup
import UltimateEmailSignup from "./UltimateEmailSignup";
import { trackButtonClick } from "../lib/analytics";

export default function EmailSignup() {
  const handleSuccess = (_data: unknown) => {
    // Track using existing analytics
    trackButtonClick("email_signup", "landing_page");
  };

  return (
    <UltimateEmailSignup
      variant="inline"
      ctaText="Get Updates"
      source="landing_page"
      onSuccess={handleSuccess}
      showSocialProof={false}
    />
  );
}
