import { useState, useRef } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "./ui/sheet";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { useToast } from "../hooks/use-toast";
import { logger } from "../lib/logger";
import { MapPin, Camera, X } from "lucide-react";

const MAX_PHOTO_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

interface AddSpotDialogProps {
  isOpen: boolean;
  onClose: () => void;
  lat: number;
  lng: number;
}

interface SpotDraft {
  name: string;
  description: string;
  spotType: string;
  tier: string;
  lat: number;
  lng: number;
  photoPreview: string | null;
  createdAt: string;
}

const SPOT_TYPES = [
  { value: "rail", label: "Rail" },
  { value: "ledge", label: "Ledge" },
  { value: "stairs", label: "Stairs" },
  { value: "gap", label: "Gap" },
  { value: "bank", label: "Bank" },
  { value: "manual-pad", label: "Manual Pad" },
  { value: "flatground", label: "Flatground" },
  { value: "park", label: "Skatepark" },
  { value: "plaza", label: "Plaza" },
  { value: "diy", label: "DIY Spot" },
  { value: "other", label: "Other" },
];

export function AddSpotDialog({ isOpen, onClose, lat, lng }: AddSpotDialogProps) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [spotType, setSpotType] = useState<string>("");
  const [tier, setTier] = useState<string>("beginner");
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({
        title: "Invalid file",
        description: "Please select an image file.",
        variant: "destructive",
      });
      return;
    }

    if (file.size > MAX_PHOTO_SIZE_BYTES) {
      toast({
        title: "Image too large",
        description: "Photo must be under 5 MB.",
        variant: "destructive",
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      setPhotoPreview(ev.target?.result as string);
    };
    reader.onerror = () => {
      toast({
        title: "Failed to read image",
        description: "Try another file.",
        variant: "destructive",
      });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleClose = () => {
    setName("");
    setDescription("");
    setSpotType("");
    setTier("beginner");
    setPhotoPreview(null);
    onClose();
  };

  const handleSaveDraft = () => {
    if (!name.trim()) {
      toast({
        title: "Name Required",
        description: "Give this spot a name before saving.",
        variant: "destructive",
      });
      return;
    }

    const draft: SpotDraft = {
      name: name.trim(),
      description: description.trim(),
      spotType,
      tier,
      lat,
      lng,
      photoPreview,
      createdAt: new Date().toISOString(),
    };

    let existingDrafts: SpotDraft[] = [];
    try {
      existingDrafts = JSON.parse(localStorage.getItem("spotDrafts") || "[]");
    } catch {
      logger.warn("[SpotDraft] Failed to parse existing drafts, starting fresh");
    }
    existingDrafts.push(draft);

    try {
      localStorage.setItem("spotDrafts", JSON.stringify(existingDrafts));
    } catch (storageErr) {
      // DataURL photo may exceed localStorage quota — retry without the photo
      if (draft.photoPreview) {
        logger.warn("[SpotDraft] Storage quota exceeded with photo, retrying without it");
        const draftWithoutPhoto: SpotDraft = { ...draft, photoPreview: null };
        existingDrafts[existingDrafts.length - 1] = draftWithoutPhoto;
        try {
          localStorage.setItem("spotDrafts", JSON.stringify(existingDrafts));
        } catch {
          logger.error("[SpotDraft] Storage quota exceeded even without photo", storageErr);
          toast({
            title: "Storage Full",
            description: "Could not save draft — clear some space and try again.",
            variant: "destructive",
          });
          return;
        }
      } else {
        logger.error("[SpotDraft] Storage quota exceeded", storageErr);
        toast({
          title: "Storage Full",
          description: "Could not save draft — clear some space and try again.",
          variant: "destructive",
        });
        return;
      }
    }

    logger.log("[SpotDraft] Saved draft:", draft);

    toast({
      title: "Spot Saved!",
      description: `"${name}" has been saved as a draft. It'll be added once you're online.`,
    });

    handleClose();
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <SheetContent
        side="bottom"
        className="bg-neutral-900 border-neutral-700 text-white rounded-t-2xl max-h-[85vh] overflow-y-auto"
      >
        <SheetHeader className="text-left pb-4 border-b border-neutral-800">
          <SheetTitle className="flex items-center gap-2 text-[#ff6a00] text-xl">
            <MapPin className="w-6 h-6" />
            Name This Spot
          </SheetTitle>
          <SheetDescription className="text-gray-400">
            Drop a pin, share it with the crew.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 pt-5">
          <div>
            <Label htmlFor="spot-name" className="text-gray-300 text-sm font-medium">
              Spot Name <span className="text-[#ff6a00]">*</span>
            </Label>
            <Input
              id="spot-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Hollywood High 16, EMB, Love Park"
              className="bg-neutral-800 border-neutral-700 text-white mt-1.5 h-12"
              data-testid="input-spot-name"
            />
          </div>

          <div>
            <Label htmlFor="spot-type" className="text-gray-300 text-sm font-medium">
              Spot Type
            </Label>
            <Select value={spotType} onValueChange={setSpotType}>
              <SelectTrigger
                className="bg-neutral-800 border-neutral-700 text-white mt-1.5 h-12"
                data-testid="select-spot-type"
              >
                <SelectValue placeholder="What kind of spot is this?" />
              </SelectTrigger>
              <SelectContent className="bg-neutral-800 border-neutral-700 text-white">
                {SPOT_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="spot-description" className="text-gray-300 text-sm font-medium">
              Description
            </Label>
            <Textarea
              id="spot-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Waxed ledge, security kicks you out after 6pm, best on weekends..."
              className="bg-neutral-800 border-neutral-700 text-white mt-1.5 min-h-[80px]"
              data-testid="textarea-spot-description"
            />
          </div>

          <div>
            <Label htmlFor="spot-tier" className="text-gray-300 text-sm font-medium">
              Difficulty
            </Label>
            <Select value={tier} onValueChange={setTier}>
              <SelectTrigger
                className="bg-neutral-800 border-neutral-700 text-white mt-1.5 h-12"
                data-testid="select-spot-tier"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-neutral-800 border-neutral-700 text-white">
                <SelectItem value="beginner">Beginner</SelectItem>
                <SelectItem value="intermediate">Intermediate</SelectItem>
                <SelectItem value="pro">Pro</SelectItem>
                <SelectItem value="legendary">Legendary</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-gray-300 text-sm font-medium">Photo</Label>
            <div className="mt-1.5 space-y-2">
              {photoPreview ? (
                <div className="relative w-20 h-20 rounded-lg overflow-hidden border border-neutral-700">
                  <img
                    src={photoPreview}
                    alt="Spot preview"
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setPhotoPreview(null)}
                    className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/70 flex items-center justify-center"
                    aria-label="Remove photo"
                  >
                    <X className="w-3 h-3 text-white" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full p-4 border border-dashed border-neutral-700 rounded-lg bg-neutral-800/30 text-center hover:border-[#ff6a00]/50 hover:bg-neutral-800/50 transition-colors"
                >
                  <Camera className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                  <p className="text-sm text-gray-400">Tap to add a photo</p>
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoSelect}
                className="hidden"
              />
            </div>
          </div>

          <div className="bg-neutral-800/50 p-3 rounded-lg border border-neutral-700">
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <MapPin className="w-4 h-4 text-[#ff6a00]" />
              <span>
                Pin dropped at {lat.toFixed(5)}, {lng.toFixed(5)}
              </span>
            </div>
          </div>

          <div className="flex gap-3 pt-2 pb-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              className="flex-1 h-12 border-neutral-700 text-white hover:bg-neutral-800"
              data-testid="button-cancel-spot"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSaveDraft}
              className="flex-1 h-12 bg-[#ff6a00] hover:bg-[#ff6a00]/90 text-black font-semibold disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed"
              disabled={!name.trim()}
              data-testid="button-submit-spot"
            >
              Save Spot
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
