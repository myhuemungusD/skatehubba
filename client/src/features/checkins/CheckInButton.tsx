import { useCallback, useMemo } from "react";
import { MapPin, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { WriteAccessModal } from "@/components/auth/WriteAccessModal";
import { useWriteGuard } from "@/hooks/useWriteGuard";
import { useCheckIn } from "./useCheckIn";
import { ApiError, getUserFriendlyMessage } from "@/lib/api/errors";

interface CheckInButtonProps {
  spotId: string;
  spotName: string;
  userLocation?: { lat: number; lng: number } | null;
  className?: string;
  onSuccess?: (spotId: string) => void;
}

export function CheckInButton({
  spotId,
  spotName,
  userLocation,
  className,
  onSuccess,
}: CheckInButtonProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const writeGuard = useWriteGuard();
  const { checkIn, isSubmitting, error, reset } = useCheckIn();

  const isLocationReady = Boolean(userLocation?.lat && userLocation?.lng);

  const inlineMessage = useMemo(() => {
    if (writeGuard.isAnonymous || !user) return "Create an account to check in.";
    if (writeGuard.needsProfileSetup) return "Complete your profile to check in.";
    if (!isLocationReady) return "Enable location to check in.";
    if (!error) return null;
    return getUserFriendlyMessage(error);
  }, [user, isLocationReady, error, writeGuard.isAnonymous, writeGuard.needsProfileSetup]);

  const handleCheckIn = useCallback(async () => {
    if (!writeGuard.guard()) return;

    if (!isLocationReady || !userLocation) {
      toast({
        title: "Location required",
        description: "Turn on location services to verify your check-in.",
        variant: "destructive",
      });
      return;
    }

    if (!user) return;

    reset();

    try {
      const result = await checkIn({
        spotId,
        lat: userLocation.lat,
        lng: userLocation.lng,
        userId: user.uid,
      });

      toast({
        title: "Check-in confirmed",
        description: `You're now checked in at ${spotName}.`,
      });
      onSuccess?.(result.spotId);
    } catch (err) {
      const apiError = err instanceof ApiError ? err : null;
      toast({
        title: "Check-in blocked",
        description: apiError ? getUserFriendlyMessage(apiError) : "Unable to check in right now.",
        variant: "destructive",
      });
    }
  }, [
    writeGuard,
    user,
    isLocationReady,
    userLocation,
    reset,
    checkIn,
    spotId,
    spotName,
    toast,
    onSuccess,
  ]);

  return (
    <div className={className}>
      <Button
        onClick={handleCheckIn}
        disabled={!user || writeGuard.isAnonymous || writeGuard.needsProfileSetup || !isLocationReady || isSubmitting}
        className="w-full h-12 gap-2 bg-yellow-500 text-black hover:bg-yellow-400"
        data-testid="button-check-in"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Verifying...
          </>
        ) : (
          <>
            <MapPin className="h-4 w-4" />
            Check in at {spotName}
          </>
        )}
      </Button>
      {inlineMessage ? (
        <p className="mt-2 text-xs text-neutral-400" role="status">
          {inlineMessage}
        </p>
      ) : null}
      <WriteAccessModal {...writeGuard.modal} />
    </div>
  );
}
