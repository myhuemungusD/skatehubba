import { useState } from "react";
import { MapPin, Loader2, CheckCircle, XCircle } from "lucide-react";
import { Button } from "./ui/button";
import { useToast } from "../hooks/use-toast";
import { useAuth } from "../context/AuthProvider";
import { useEmailVerification } from "../hooks/useEmailVerification";
import { useSpotAccess, type SpotAccess } from "../store/useSpotAccess";
import { useCheckIn } from "../features/checkins/useCheckIn";
import { ApiError, getUserFriendlyMessage } from "../lib/api/errors";

interface ARCheckInButtonProps {
  spotId: string;
  spotName: string;
  spotLat: number;
  spotLng: number;
  className?: string;
  onCheckInSuccess?: (access: SpotAccess) => void;
  locationUnavailable?: boolean;
}

export function ARCheckInButton({
  spotId,
  spotName,
  spotLat: _spotLat,
  spotLng: _spotLng,
  className,
  onCheckInSuccess,
  locationUnavailable = false,
}: ARCheckInButtonProps) {
  const authContext = useAuth();
  const user = authContext?.user ?? null;
  const isAuthenticated = authContext?.isAuthenticated ?? false;
  const { requiresVerification } = useEmailVerification();
  const { toast } = useToast();
  const { grantAccess, hasValidAccess, cleanupExpiredAccess } = useSpotAccess();
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const { checkIn, isSubmitting } = useCheckIn();

  const hasAccess = hasValidAccess(spotId);

  const handleCheckInSuccess = () => {
    const now = Date.now();
    const expiresAt = now + 24 * 60 * 60 * 1000;
    const access = {
      spotId,
      accessGrantedAt: now,
      expiresAt,
    };
    grantAccess(access);
    toast({
      title: "✅ Check-In Successful!",
      description: `You're now checked in at ${spotName}. Access expires in 24 hours.`,
    });
    onCheckInSuccess?.(access);
  };

  const handleCheckIn = async () => {
    if (!isAuthenticated) {
      toast({
        title: "Login Required",
        description: "Please log in to check in at spots.",
        variant: "destructive",
      });
      return;
    }

    if (requiresVerification) {
      toast({
        title: "Email verification required",
        description: "Verify your email to check in at spots.",
        variant: "destructive",
      });
      return;
    }

    cleanupExpiredAccess();

    if (hasAccess) {
      toast({
        title: "Already Checked In",
        description: `You already have valid access to ${spotName}.`,
      });
      return;
    }

    if (!navigator.geolocation) {
      toast({
        title: "Geolocation Not Supported",
        description: "Your device does not support geolocation.",
        variant: "destructive",
      });
      return;
    }

    setIsGettingLocation(true);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        setIsGettingLocation(false);
        if (!user) {
          toast({
            title: "Login Required",
            description: "Please log in to check in at spots.",
            variant: "destructive",
          });
          return;
        }
        const { latitude, longitude } = position.coords;
        try {
          await checkIn({
            spotId: Number(spotId),
            lat: latitude,
            lng: longitude,
            userId: user.uid,
          });
          handleCheckInSuccess();
        } catch (err) {
          const apiError = err instanceof ApiError ? err : null;
          toast({
            title: "❌ Check-In Error",
            description: apiError
              ? getUserFriendlyMessage(apiError)
              : "Failed to verify your location.",
            variant: "destructive",
          });
        }
      },
      (error) => {
        setIsGettingLocation(false);
        let errorMessage = "Unable to get your location.";

        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = "Location permission denied. Please enable location access.";
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = "Location information unavailable.";
            break;
          case error.TIMEOUT:
            errorMessage = "Location request timed out.";
            break;
        }

        toast({
          title: "Location Error",
          description: errorMessage,
          variant: "destructive",
        });
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  };

  const isLoading = isGettingLocation || isSubmitting;

  if (hasAccess) {
    return (
      <Button
        variant="outline"
        className={`gap-2 border-success/50 bg-success/10 text-success hover:bg-success/20 ${className}`}
        disabled
        data-testid="button-checked-in"
      >
        <CheckCircle className="w-4 h-4" />
        Checked In
      </Button>
    );
  }

  if (locationUnavailable) {
    return (
      <Button
        variant="outline"
        className={`gap-2 border-gray-600 bg-gray-800/50 text-gray-400 cursor-not-allowed ${className}`}
        disabled
        data-testid="button-check-in-disabled"
      >
        <XCircle className="w-4 h-4" />
        Location Required
      </Button>
    );
  }

  return (
    <Button
      onClick={handleCheckIn}
      disabled={isLoading || !isAuthenticated}
      className={`gap-2 bg-[#ff6a00] hover:bg-[#ff8533] text-white ${className}`}
      data-testid="button-check-in"
    >
      {isLoading ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          {isGettingLocation ? "Getting Location..." : "Verifying..."}
        </>
      ) : (
        <>
          <MapPin className="w-4 h-4" />
          Check In at Spot
        </>
      )}
    </Button>
  );
}
