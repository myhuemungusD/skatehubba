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
import { queryClient } from "@/lib/queryClient";
import { SpotCreateInputSchema, SpotTypeSchema, type SpotCreateInput } from "@shared/validation/spots";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { useWriteGuard } from "@/hooks/useWriteGuard";
import { WriteAccessModal } from "@/components/auth/WriteAccessModal";

const SPOT_TYPE_LABELS: Record<string, string> = {
  rail: " Rail",
  ledge: " Ledge",
  stairs: " Stairs",
  gap: " Gap",
  plaza: " Plaza",
  shop: " Skate Shop",
  school: " School",
  park: " Skate Park",
  street: " Street",
  other: " Other",
};

interface AddSpotModalProps {
  isOpen: boolean;
  onClose: () => void;
  userLocation: { lat: number; lng: number } | null;
}

export function AddSpotModal({ isOpen, onClose, userLocation }: AddSpotModalProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const writeGuard = useWriteGuard();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [spotType, setSpotType] = useState<string>("street");
  const [difficulty, setDifficulty] = useState<string>("medium");

  const isLocationReady = Boolean(userLocation && userLocation.lat !== 0 && userLocation.lng !== 0);

  const mutation = useMutation({
    mutationFn: async (payload: SpotCreateInput) => {
      if (!db) throw new Error("Firestore unavailable");
      const docRef = collection(db, "spots");
      const createdByUid = user?.uid ?? null;
      await addDoc(docRef, {
        ...payload,
        createdByUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        status: "active",
        visibility: "public",
        stats: {
          checkins30d: 0,
          checkinsAll: 0,
        },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["spots"] });
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
    setDifficulty("medium");
    onClose();
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!writeGuard.guard()) return;

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

    const payload = SpotCreateInputSchema.parse({
      name: trimmedName,
      description: description.trim() || undefined,
      spotType: spotType as SpotCreateInput["spotType"],
      difficulty: difficulty as SpotCreateInput["difficulty"],
      location: {
        lat: userLocation.lat,
        lng: userLocation.lng,
      },
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
            Drop a pin at your current location to share this spot with the community.
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
                {SpotTypeSchema.options.map((type) => (
                  <SelectItem key={type} value={type} className="text-white hover:bg-neutral-700">
                    {SPOT_TYPE_LABELS[type] || type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Difficulty */}
          <div className="space-y-2">
            <Label htmlFor="spot-difficulty" className="text-gray-300">
              Difficulty
            </Label>
            <Select value={difficulty} onValueChange={setDifficulty}>
              <SelectTrigger className="bg-neutral-800 border-neutral-700 text-white">
                <SelectValue placeholder="Select difficulty" />
              </SelectTrigger>
              <SelectContent className="bg-neutral-800 border-neutral-700">
                <SelectItem value="easy" className="text-white hover:bg-neutral-700">
                  Easy
                </SelectItem>
                <SelectItem value="medium" className="text-white hover:bg-neutral-700">
                  Medium
                </SelectItem>
                <SelectItem value="hard" className="text-white hover:bg-neutral-700">
                  Hard
                </SelectItem>
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
              disabled={
                !name.trim() ||
                !isLocationReady ||
                mutation.isPending ||
                writeGuard.isAnonymous ||
                writeGuard.needsProfileSetup
              }
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
      <WriteAccessModal {...writeGuard.modal} />
    </Dialog>
  );
}
