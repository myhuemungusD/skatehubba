// client/src/components/PlaySkateGame.tsx
import { useState, useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { logger } from "../lib/logger";

interface Game {
  id: string;
  players?: string[];
  letters?: string[];
  status?: string;
}

interface PlaySkateGameProps {
  spotId: string;
  userToken: { uid: string } | null;
}

export default function PlaySkateGame({ spotId, userToken }: PlaySkateGameProps) {
  const [game, setGame] = useState<Game | null>(null);
  const [trick, setTrick] = useState("");
  const socketRef = useRef<Socket | null>(null);

  // Initialize socket connection
  useEffect(() => {
    socketRef.current = io();
    const socket = socketRef.current;

    socket.on("update", (updatedGame: Game) => setGame(updatedGame));

    return () => {
      socket.off("update");
      socket.disconnect();
    };
  }, []);

  const create = async () => {
    if (!userToken?.uid) return;

    try {
      const response = await fetch("/api/playskate/create", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${userToken.uid}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ spotId }),
      });
      const data: { gameId: string } = await response.json();
      setGame({ id: data.gameId });
      socketRef.current?.emit("joinGame", data.gameId);
    } catch (error) {
      logger.error("Failed to create game:", error);
    }
  };

  const sendClip = async () => {
    if (!game || !userToken?.uid) return;

    try {
      // In real app you'd upload to Firebase Storage first
      await fetch(`/api/playskate/${game.id}/clip`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${userToken.uid}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ clipUrl: "https://example.com/clip.mp4", trickName: trick }),
      });
    } catch (error) {
      logger.error("Failed to send clip:", error);
    }
  };

  if (!game) {
    return (
      <button
        onClick={create}
        className="bg-orange-600 text-white px-6 py-3 rounded"
        disabled={!userToken?.uid}
      >
        Start Play S.K.A.T.E.
      </button>
    );
  }

  const myIdx = game.players?.indexOf(userToken?.uid || "") ?? 0;
  const myLetters = game.letters?.[myIdx] || "";

  return (
    <div className="bg-black text-white p-6 rounded-xl" role="region" aria-label="S.K.A.T.E. game">
      <h2 className="text-2xl mb-4">Play S.K.A.T.E. ({game.players?.length || 0}/4)</h2>
      {game.status === "ended" ? (
        <h1 className="text-4xl" role="status" aria-live="polite">
          WINNER!
        </h1>
      ) : (
        <>
          <p aria-live="polite">
            Your letters:{" "}
            <span className="text-4xl text-red-600" aria-label={`Letters: ${myLetters || "none"}`}>
              {myLetters || ""}
            </span>
          </p>
          <label htmlFor="trick-input" className="sr-only">
            Trick name
          </label>
          <input
            id="trick-input"
            placeholder="kickflip boardslide"
            className="bg-gray-900 p-3 rounded w-full my-4"
            value={trick}
            onChange={(e) => setTrick(e.target.value)}
            aria-label="Enter trick name"
          />
          <button
            onClick={sendClip}
            className="bg-success px-8 py-4 rounded text-xl"
            aria-label="Submit trick clip"
          >
            LAND IT
          </button>
        </>
      )}
    </div>
  );
}
