import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useEmailVerification } from '@/hooks/useEmailVerification';
import { auth } from '@/lib/firebase';
import { queryClient } from '@/lib/queryClient';

interface ChallengeButtonProps {
  challengedId: string;
  challengedHandle: string;
}

export function ChallengeButton({ challengedId, challengedHandle }: ChallengeButtonProps) {
  const { toast } = useToast();
  const { requiresVerification } = useEmailVerification();
  const [busy, setBusy] = useState(false);

  const handleChallenge = async () => {
    try {
      setBusy(true);
      const user = auth.currentUser;
      
      if (!user) {
        toast({
          title: 'Sign in required',
          description: 'Log in to issue a challenge.',
          variant: 'destructive',
        });
        return;
      }

      if (requiresVerification) {
        toast({
          title: 'Email verification required',
          description: 'Verify your email to start S.K.A.T.E. challenges.',
          variant: 'destructive',
        });
        return;
      }

      const response = await fetch('/api/challenges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengedId }),
      });
      if (!response.ok) throw new Error('Failed to send challenge');

      queryClient.invalidateQueries({ queryKey: ['/api/challenges'] });

      toast({
        title: 'Challenge sent',
        description: `@${challengedHandle} has been challenged. Respect the game.`,
      });
    } catch (error: any) {
      toast({
        title: 'Could not challenge',
        description: error.message ?? 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      onClick={handleChallenge}
      disabled={busy}
      className="bg-orange-500 hover:bg-orange-600 text-black font-bold"
      data-testid="button-challenge"
    >
      {busy ? 'Sending…' : 'Challenge'}
    </Button>
  );
}
