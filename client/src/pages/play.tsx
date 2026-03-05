import { useSearch } from "wouter";
import ChallengeLobby from "./ChallengeLobby";
import SkateGamePage from "./skate-game";

export default function PlayPage() {
  const search = useSearch();
  const gameId = new URLSearchParams(search).get("gameId");

  if (gameId) {
    return <SkateGamePage />;
  }

  return <ChallengeLobby />;
}
