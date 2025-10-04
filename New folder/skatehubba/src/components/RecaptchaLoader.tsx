import { useEffect } from 'react';
import { Platform } from 'react-native';

interface RecaptchaLoaderProps {
  siteKey?: string;
}

export default function RecaptchaLoader({ siteKey }: RecaptchaLoaderProps) {
  useEffect(() => {
    // Only load reCAPTCHA on web platform
    if (Platform.OS !== 'web') return;

    const recaptchaSiteKey = siteKey || process.env.EXPO_PUBLIC_RECAPTCHA_SITE_KEY || process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
    
    if (!recaptchaSiteKey) {
      console.warn('reCAPTCHA site key not found');
      return;
    }

    // Check if reCAPTCHA is already loaded
    if ((window as any).grecaptcha) {
      return;
    }

    // Create and append the reCAPTCHA script
    const script = document.createElement('script');
    script.src = `https://www.google.com/recaptcha/api.js?render=${recaptchaSiteKey}`;
    script.async = true;
    script.defer = true;
    
    script.onload = () => {
      console.log('reCAPTCHA loaded successfully');
    };
    
    script.onerror = () => {
      console.error('Failed to load reCAPTCHA');
    };

    document.head.appendChild(script);

    // Cleanup function
    return () => {
      const existingScript = document.querySelector(`script[src*="recaptcha/api.js"]`);
      if (existingScript) {
        existingScript.remove();
      }
    };
  }, [siteKey]);

  // This component doesn't render anything visible
  return null;
}