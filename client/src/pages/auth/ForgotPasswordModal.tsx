import { useState } from "react";
import { Mail, Loader2 } from "lucide-react";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { useToast } from "../../hooks/use-toast";

interface ForgotPasswordModalProps {
  onClose: () => void;
  resetPassword: ((email: string) => Promise<void>) | undefined;
}

export function ForgotPasswordModal({ onClose, resetPassword }: ForgotPasswordModalProps) {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [isResetting, setIsResetting] = useState(false);

  const handleSubmit = async () => {
    if (!resetPassword) {
      toast({
        title: "Error",
        description: "Authentication not ready. Please refresh.",
        variant: "destructive",
      });
      return;
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast({
        title: "Invalid Email",
        description: "Please enter a valid email address.",
        variant: "destructive",
      });
      return;
    }

    setIsResetting(true);
    try {
      await resetPassword(email);
      toast({
        title: "Reset Email Sent",
        description: "Check your inbox for password reset instructions.",
      });
      onClose();
    } catch (error) {
      const authError = error as { message?: string };
      toast({
        title: "Reset Failed",
        description: authError.message || "Could not send reset email. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
      <Card className="w-full max-w-md bg-[#232323] border-gray-700">
        <CardHeader>
          <CardTitle className="text-xl text-white">Reset Password</CardTitle>
          <CardDescription className="text-gray-400">
            Enter your email and we'll send you a link to reset your password
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reset-email" className="text-gray-300">
              Email
            </Label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                id="reset-email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-10 bg-[#181818] border-gray-600 text-white placeholder:text-gray-500"
              />
            </div>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1 border-gray-600 text-white hover:bg-gray-700"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              className="flex-1 bg-orange-500 hover:bg-orange-600 text-white"
              onClick={handleSubmit}
              disabled={isResetting}
            >
              {isResetting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                "Send Reset Link"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
