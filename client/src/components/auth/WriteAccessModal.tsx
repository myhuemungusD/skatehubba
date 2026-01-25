import { useLocation } from "wouter";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";

export type WriteAccessReason = "anonymous" | "profile";

interface WriteAccessModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reason: WriteAccessReason;
}

export function WriteAccessModal({ open, onOpenChange, reason }: WriteAccessModalProps) {
  const [, setLocation] = useLocation();

  const title =
    reason === "profile" ? "Complete your profile to post/check in" : "Create an account to post/check in.";

  const description =
    reason === "profile"
      ? "You can browse in Ghost Mode, but writing requires a complete profile."
      : "Ghost Mode is read-only. Sign in or create an account to post, check in, and join the session.";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-neutral-950 text-white border border-neutral-800">
        <DialogHeader>
          <DialogTitle className="text-yellow-400">{title}</DialogTitle>
          <DialogDescription className="text-neutral-400">{description}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 pt-2">
          {reason === "profile" ? (
            <Button
              className="h-11 bg-yellow-500 text-black hover:bg-yellow-400"
              onClick={() => {
                onOpenChange(false);
                setLocation("/profile/setup");
              }}
            >
              Finish profile
            </Button>
          ) : (
            <>
              <Button
                className="h-11 bg-yellow-500 text-black hover:bg-yellow-400"
                onClick={() => {
                  onOpenChange(false);
                  setLocation("/signin");
                }}
              >
                Sign in
              </Button>
              <Button
                variant="outline"
                className="h-11 border-neutral-700 text-white hover:bg-neutral-900"
                onClick={() => {
                  onOpenChange(false);
                  setLocation("/signup");
                }}
              >
                Sign up
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            className="h-11 text-neutral-400 hover:text-white hover:bg-neutral-900"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

