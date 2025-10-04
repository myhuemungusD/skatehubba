"use client";
import { useState } from "react";

declare global {
  interface Window {
    grecaptcha: {
      execute: (siteKey: string, options: { action: string }) => Promise<string>;
    };
  }
}

export default function RecaptchaCheck() {
  const [verified, setVerified] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleVerify() {
    setLoading(true);
    try {
      const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY!;
      
      if (!window.grecaptcha) {
        console.error("reCAPTCHA not loaded");
        return;
      }

      const token = await window.grecaptcha.execute(siteKey, { action: "submit" });

      const res = await fetch("/api/recaptcha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      const data = await res.json();
      setVerified(data.success);
    } catch (error) {
      console.error("reCAPTCHA verification failed:", error);
      setVerified(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button 
        onClick={handleVerify} 
        disabled={loading}
        className="bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white px-4 py-2 rounded-lg transition-colors"
      >
        {loading ? "Verifying..." : "Verify reCAPTCHA"}
      </button>
      {verified && <p className="text-green-500">Verified ✅</p>}
      {verified === false && !loading && <p className="text-red-500">Verification failed ❌</p>}
    </div>
  );
}