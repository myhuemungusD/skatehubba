import { useEffect } from "react";
import { useLocation } from "wouter";

/**
 * Legacy /login route — redirects to /signin with ?next= preserved.
 * All email/password auth now lives on /signin and /signup.
 */
export default function LoginPage() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const next = params.get("next");
    const target = next ? `/signin?next=${encodeURIComponent(next)}` : "/signin";
    setLocation(target, { replace: true });
  }, [setLocation]);

  return null;
}
