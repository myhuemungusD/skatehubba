import type { FormEvent } from 'react';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { insertSpotSchema, type InsertSpot } from '@shared/schema';

interface AddSpotModalProps {
  isOpen: boolean;
  onClose: () => void;
  userLocation: { lat: number; lng: number } | null;
}

export function AddSpotModal({ isOpen, onClose, userLocation }: AddSpotModalProps) {
  const { toast } = useToast();
  const [name, setName] = useState('');

  const isLocationReady = Boolean(
    userLocation && userLocation.lat !== 0 && userLocation.lng !== 0,
  );

  const mutation = useMutation({
    mutationFn: async (payload: InsertSpot) => {
      const response = await apiRequest('POST', '/api/spots', payload);
      return response.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['/api/spots'] });
      toast({
        title: 'Spot Saved',
        description: 'Your spot is now live on the map.',
      });
      handleClose();
    },
    onError: (error) => {
      toast({
        title: 'Unable to save spot',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    },
  });

  const handleClose = () => {
    setName('');
    onClose();
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedName = name.trim();
    if (!trimmedName) {
      toast({
        title: 'Name Required',
        description: 'Give this spot a name before saving.',
        variant: 'destructive',
      });
      return;
    }

    if (!userLocation || !isLocationReady) {
      return;
    }

    const payload = insertSpotSchema.parse({
      name: trimmedName,
      lat: userLocation.lat,
      lng: userLocation.lng,
      createdBy: null,
    });

    mutation.mutate(payload);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="bg-neutral-900 border-neutral-700 text-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[#ff6a00]">Add Spot</DialogTitle>
          <DialogDescription className="text-gray-400">
            Drop a name and we will save your current location.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <input type="hidden" name="lat" value={userLocation?.lat ?? ''} />
          <input type="hidden" name="lng" value={userLocation?.lng ?? ''} />
          <div className="space-y-2">
            <Label htmlFor="spot-name" className="text-gray-300">
              Spot Name
            </Label>
            <Input
              id="spot-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g., Love Park"
              className="bg-neutral-800 border-neutral-700 text-white"
              data-testid="input-spot-name"
              autoFocus
            />
          </div>
          {!isLocationReady && (
            <p className="text-sm text-orange-400">Waiting for location...</p>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
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
                  Saving
                </span>
              ) : (
                'Save Spot'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
