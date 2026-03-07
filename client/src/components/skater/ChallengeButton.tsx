import { useCallback } from "react";
import { useLocation } from "wouter";
import { Swords } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCreateGame } from "@/hooks/useSkateGameApi";

interface ChallengeButtonProps {
  challengedId: string;
  challengedHandle: string;
}

export function ChallengeButton({ challengedId, challengedHandle }: ChallengeButtonProps) {
  const createGame = useCreateGame();
  const [, setLocation] = useLocation();

  const handleChallenge = useCallback(() => {
    createGame.mutate(challengedId, {
      onSuccess: (data) => {
        if (data?.game?.id) {
          setLocation(`/play?gameId=${data.game.id}`);
        }
      },
    });
  }, [challengedId, createGame, setLocation]);

  return (
    <Button
      onClick={handleChallenge}
      disabled={createGame.isPending}
      className="bg-orange-500 hover:bg-orange-600 text-black font-bold"
      data-testid="button-challenge"
    >
      <Swords className="h-4 w-4 mr-2" />
      {createGame.isPending ? "Sending..." : "Challenge"}
    </Button>
  );
}
