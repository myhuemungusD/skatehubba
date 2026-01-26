import type { FormEvent } from "react";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, MapPin } from "lucide-react";
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
import { insertSpotSchema, SPOT_TYPES, SPOT_TIERS, type InsertSpot } from "@shared/schema";

const SPOT_TYPE_LABELS: Record<string, string> = {
  rail: " Rail",
  ledge: " Ledge",
  stairs: " Stairs",
  gap: " Gap",
  bank: " Bank",
  "manual-pad": " Manual Pad",
  flat: " Flat Ground",
  bowl: " Bowl",
  "mini-ramp": " Mini Ramp",
  vert: " Vert",
  diy: " DIY",
  park: " Skate Park",
  street: " Street",
  other: " Other",
};

const TIER_LABELS: Record<string, string> = {
  bronze: " Bronze - Local spot",
  silver: " Silver - Worth the trip",
  gold: " Gold - Must skate",
  legendary: " Legendary - Iconic",
};

interface AddSpotModalProps {
  isOpen: boolean;
  onClose: () => void;
  userLocation: { lat: number; lng: number } | null;
}

export function AddSpotModal({ isOpen, onClose, userLocation }: AddSpotModalProps) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [spotType, setSpotType] = useState<string>("street");
  const [tier, setTier] = useState<string>("bronze");

  const isLocationReady = Boolean(userLocation && userLocation.lat !== 0 && userLocation.lng !== 0);

  const mutation = useMutation({
    mutationFn: async (payload: InsertSpot) => {
      const response = await apiRequest("POST", "/api/spots", payload);
      return response.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/spots"] });
      toast({
        title: " Spot Saved!",
        description: "Your spot is now live on the map. Thanks for contributing!",
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
    onClose();
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
      spotType: spotType as (typeof SPOT_TYPES)[number],
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
            Add New Spot
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            Add a spot at your current location. Fill in the details below.
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

          {!isLocationReady && (
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
              placeholder="e.g., Love Park, Hollywood High"
              className="bg-neutral-800 border-neutral-700 text-white placeholder:text-gray-500"
              data-testid="input-spot-name"
              autoFocus
              maxLength={100}
            />
          </div>

          {/* Spot Type */}
          <div className="space-y-2">
            <Label htmlFor="spot-type" className="text-gray-300">
              Spot Type
            </Label>
            <Select value={spotType} onValueChange={setSpotType}>
              <SelectTrigger className="bg-neutral-800 border-neutral-700 text-white">
                <SelectValue placeholder="Select spot type" />
              </SelectTrigger>
              <SelectContent className="bg-neutral-800 border-neutral-700">
                {SPOT_TYPES.map((type) => (
                  <SelectItem key={type} value={type} className="text-white hover:bg-neutral-700">
                    {SPOT_TYPE_LABELS[type] || type}
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
              placeholder="What makes this spot special? Any tips for other skaters?"
              className="bg-neutral-800 border-neutral-700 text-white placeholder:text-gray-500 resize-none"
              rows={3}
              maxLength={1000}
            />
            <p className="text-xs text-gray-500">{description.length}/1000</p>
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
                " Save Spot"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
