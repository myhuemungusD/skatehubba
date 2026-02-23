import type { ChangeEvent, FormEvent } from "react";
import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertCircle, Camera, Loader2, MapPin, X } from "lucide-react";
import type { GeolocationStatus } from "@/hooks/useGeolocation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { insertSpotSchema, SPOT_TIERS, type InsertSpot } from "@shared/schema";

// Street spot types only — parks, bowls, ramps are pre-loaded from OSM
const STREET_SPOT_TYPES = [
  { value: "rail", label: "Rail" },
  { value: "ledge", label: "Ledge" },
  { value: "stairs", label: "Stairs" },
  { value: "gap", label: "Gap" },
  { value: "bank", label: "Bank" },
  { value: "manual-pad", label: "Manual Pad" },
  { value: "flat", label: "Flat Ground" },
  { value: "diy", label: "DIY" },
  { value: "street", label: "Street" },
  { value: "other", label: "Other" },
] as const;

type StreetSpotType = (typeof STREET_SPOT_TYPES)[number]["value"];

const TIER_LABELS: Record<string, string> = {
  bronze: "Bronze - Local spot",
  silver: "Silver - Worth the trip",
  gold: "Gold - Must skate",
  legendary: "Legendary - Iconic",
};

const MAX_IMAGES = 3;
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

interface ImagePreview {
  id: number;
  dataUrl: string;
}

let nextImageId = 0;

interface AddSpotModalProps {
  isOpen: boolean;
  onClose: () => void;
  userLocation: { lat: number; lng: number } | null;
  geolocationStatus?: GeolocationStatus;
  geolocationErrorCode?: "denied" | "timeout" | "unavailable" | "unsupported" | null;
}

export function AddSpotModal({
  isOpen,
  onClose,
  userLocation,
  geolocationStatus,
  geolocationErrorCode,
}: AddSpotModalProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [spotType, setSpotType] = useState<string>("street");
  const [tier, setTier] = useState<string>("bronze");
  const [imagePreviews, setImagePreviews] = useState<ImagePreview[]>([]);

  const isLocationReady = Boolean(userLocation && userLocation.lat !== 0 && userLocation.lng !== 0);

  const mutation = useMutation({
    mutationFn: async (payload: InsertSpot) => {
      const response = await apiRequest("POST", "/api/spots", payload);
      return response.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/spots"] });
      toast({
        title: "Spot Saved!",
        description: "Your spot is now live on the map.",
      });
      handleClose();
    },
    onError: (error) => {
      toast({
        title: "Unable to save spot",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleClose = () => {
    setName("");
    setDescription("");
    setSpotType("street");
    setTier("bronze");
    setImagePreviews([]);
    onClose();
  };

  const handleImageSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    const remaining = MAX_IMAGES - imagePreviews.length;
    if (remaining <= 0) {
      toast({
        title: "Max images reached",
        description: `You can upload up to ${MAX_IMAGES} images.`,
        variant: "destructive",
      });
      return;
    }

    const filesToProcess = Array.from(files).slice(0, remaining);

    for (const file of filesToProcess) {
      if (file.size > MAX_IMAGE_SIZE_BYTES) {
        toast({
          title: "Image too large",
          description: `${file.name} exceeds 5 MB. Pick a smaller image.`,
          variant: "destructive",
        });
        continue;
      }

      if (!file.type.startsWith("image/")) {
        continue;
      }

      const reader = new FileReader();
      const imageId = nextImageId++;
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        setImagePreviews((prev) => {
          if (prev.length >= MAX_IMAGES) return prev;
          return [...prev, { id: imageId, dataUrl }];
        });
      };
      reader.onerror = () => {
        toast({
          title: "Failed to read image",
          description: `Could not load ${file.name}. Try another file.`,
          variant: "destructive",
        });
      };
      reader.readAsDataURL(file);
    }

    // Reset input so the same file can be selected again
    event.target.value = "";
  };

  const removeImage = (id: number) => {
    setImagePreviews((prev) => prev.filter((img) => img.id !== id));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedName = name.trim();
    if (!trimmedName) {
      toast({
        title: "Name Required",
        description: "Give this spot a name before saving.",
        variant: "destructive",
      });
      return;
    }

    if (!userLocation || !isLocationReady) {
      toast({
        title: "Location Required",
        description: "We need your location to pin the spot.",
        variant: "destructive",
      });
      return;
    }

    const payload = insertSpotSchema.parse({
      name: trimmedName,
      description: description.trim() || undefined,
      spotType: spotType as StreetSpotType,
      tier: tier as (typeof SPOT_TIERS)[number],
      lat: userLocation.lat,
      lng: userLocation.lng,
    });

    mutation.mutate(payload);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="bg-neutral-900 border-neutral-700 text-white sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[#ff6a00] flex items-center gap-2">
            <MapPin className="w-5 h-5" />
            Add Street Spot
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            Pinned at your current location.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSubmit}>
          {/* Location indicator */}
          {isLocationReady && userLocation && (
            <div className="flex items-center gap-2 p-2 bg-green-900/30 rounded-md border border-green-700/50">
              <MapPin className="w-4 h-4 text-green-400" />
              <span className="text-sm text-green-400">
                {userLocation.lat.toFixed(5)}, {userLocation.lng.toFixed(5)}
              </span>
            </div>
          )}

          {!isLocationReady && geolocationStatus === "browse" && geolocationErrorCode === "denied" && (
            <div className="flex items-start gap-2 p-2 bg-red-900/30 rounded-md border border-red-700/50">
              <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
              <span className="text-sm text-red-400">
                Location access was denied. Enable location in your browser settings and retry.
              </span>
            </div>
          )}

          {!isLocationReady && geolocationStatus === "browse" && (geolocationErrorCode === "timeout" || geolocationErrorCode === "unavailable") && (
            <div className="flex items-start gap-2 p-2 bg-orange-900/30 rounded-md border border-orange-700/50">
              <AlertCircle className="w-4 h-4 text-orange-400 mt-0.5 shrink-0" />
              <span className="text-sm text-orange-400">
                {geolocationErrorCode === "timeout"
                  ? "Location timed out. Move to an open area and retry."
                  : "Location unavailable. Move to an open area and retry."}
              </span>
            </div>
          )}

          {!isLocationReady &&
            geolocationStatus === "browse" &&
            (!geolocationErrorCode || geolocationErrorCode === "unsupported") && (
              <div className="flex items-center gap-2 p-2 bg-neutral-800 rounded-md border border-neutral-700">
                <MapPin className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-400">
                  {geolocationErrorCode === "unsupported"
                    ? "Location is not supported by your browser."
                    : "Browsing without location. Cannot pin a spot."}
                </span>
              </div>
            )}

          {!isLocationReady && (!geolocationStatus || geolocationStatus === "idle" || geolocationStatus === "locating") && (
            <div className="flex items-center gap-2 p-2 bg-orange-900/30 rounded-md border border-orange-700/50">
              <Loader2 className="w-4 h-4 text-orange-400 animate-spin" />
              <span className="text-sm text-orange-400">Getting your location...</span>
            </div>
          )}

          {/* Spot Name */}
          <div className="space-y-2">
            <Label htmlFor="spot-name" className="text-gray-300">
              Spot Name *
            </Label>
            <Input
              id="spot-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g., Hollywood High 16, Love Park ledge"
              className="bg-neutral-800 border-neutral-700 text-white placeholder:text-gray-500"
              data-testid="input-spot-name"
              autoFocus
              maxLength={100}
            />
          </div>

          {/* Spot Type - street types only */}
          <div className="space-y-2">
            <Label htmlFor="spot-type" className="text-gray-300">
              Spot Type
            </Label>
            <Select value={spotType} onValueChange={setSpotType}>
              <SelectTrigger className="bg-neutral-800 border-neutral-700 text-white">
                <SelectValue placeholder="What kind of spot?" />
              </SelectTrigger>
              <SelectContent className="bg-neutral-800 border-neutral-700">
                {STREET_SPOT_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value} className="text-white hover:bg-neutral-700">
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Tier */}
          <div className="space-y-2">
            <Label htmlFor="spot-tier" className="text-gray-300">
              How good is it?
            </Label>
            <Select value={tier} onValueChange={setTier}>
              <SelectTrigger className="bg-neutral-800 border-neutral-700 text-white">
                <SelectValue placeholder="Rate this spot" />
              </SelectTrigger>
              <SelectContent className="bg-neutral-800 border-neutral-700">
                {SPOT_TIERS.map((t) => (
                  <SelectItem key={t} value={t} className="text-white hover:bg-neutral-700">
                    {TIER_LABELS[t] || t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="spot-description" className="text-gray-300">
              Description (optional)
            </Label>
            <Textarea
              id="spot-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Waxed ledge, security kicks you out after 6pm..."
              className="bg-neutral-800 border-neutral-700 text-white placeholder:text-gray-500 resize-none"
              rows={3}
              maxLength={1000}
            />
          </div>

          {/* Image Upload */}
          <div className="space-y-2">
            <Label className="text-gray-300">
              Photos ({imagePreviews.length}/{MAX_IMAGES})
            </Label>

            {/* Image Previews */}
            {imagePreviews.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {imagePreviews.map((img) => (
                  <div key={img.id} className="relative shrink-0 w-20 h-20 rounded-lg overflow-hidden border border-neutral-700">
                    <img src={img.dataUrl} alt="Spot photo" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeImage(img.id)}
                      className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/70 flex items-center justify-center"
                      aria-label="Remove photo"
                    >
                      <X className="w-3 h-3 text-white" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add Photo Button */}
            {imagePreviews.length < MAX_IMAGES && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full p-3 border border-dashed border-neutral-700 rounded-lg bg-neutral-800/30 text-center hover:border-[#ff6a00]/50 hover:bg-neutral-800/50 transition-colors"
              >
                <Camera className="w-6 h-6 mx-auto mb-1 text-gray-400" />
                <p className="text-sm text-gray-400">Tap to add a photo</p>
              </button>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleImageSelect}
              className="hidden"
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              className="border-neutral-700 text-white hover:bg-neutral-800"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-[#ff6a00] hover:bg-[#ff6a00]/90 text-black font-semibold"
              disabled={!name.trim() || !isLocationReady || mutation.isPending}
              data-testid="button-submit-spot"
            >
              {mutation.isPending ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </span>
              ) : (
                "Save Spot"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
