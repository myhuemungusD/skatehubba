import { useState } from "react";
import { Loader2, Copy, Check } from "lucide-react";
import { SiGoogle } from "react-icons/si";
import { Button } from "../../components/ui/button";
import { useToast } from "../../hooks/use-toast";

interface GoogleSignInButtonProps {
  onSignIn: () => Promise<void>;
  isLoading: boolean;
  inEmbeddedBrowser: boolean;
}

export function EmbeddedBrowserWarning() {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  return (
    <div className="bg-yellow-900/30 border border-yellow-600/50 rounded-lg p-3 mb-4">
      <p className="text-yellow-200 text-sm text-center">
        <strong>Google Sign-In not available</strong> in this browser.
        <br />
        <span className="text-yellow-300/80">
          Copy the link below and paste in Safari/Chrome, or use email sign-in above.
        </span>
      </p>
      <Button
        variant="outline"
        size="sm"
        className="w-full mt-2 border-yellow-600 text-yellow-200 hover:bg-yellow-900/50"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(window.location.href);
            setCopied(true);
            toast({
              title: "Link copied!",
              description: "Paste it in Safari or Chrome.",
            });
            setTimeout(() => setCopied(false), 2000);
          } catch {
            toast({ title: "Copy this link", description: window.location.href });
          }
        }}
      >
        {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
        {copied ? "Copied!" : "Copy Link"}
      </Button>
    </div>
  );
}

export function GoogleSignInButton({
  onSignIn,
  isLoading,
  inEmbeddedBrowser,
}: GoogleSignInButtonProps) {
  return (
    <>
      {/* Divider */}
      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-gray-600" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-[#232323] px-2 text-gray-400">Or continue with</span>
        </div>
      </div>

      {inEmbeddedBrowser && <EmbeddedBrowserWarning />}

      <Button
        type="button"
        variant="outline"
        className={`w-full border-gray-600 text-white hover:bg-gray-700 ${
          inEmbeddedBrowser ? "opacity-50 cursor-not-allowed" : ""
        }`}
        onClick={onSignIn}
        disabled={isLoading || inEmbeddedBrowser}
      >
        {isLoading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <SiGoogle className="mr-2 h-4 w-4" />
        )}
        Continue with Google
      </Button>
    </>
  );
}
