import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Flame, Target, Timer, Users } from 'lucide-react';

interface Trick {
  id: string;
  name: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  points: number;
  emoji: string;
}

interface Player {
  id: string;
  name: string;
  score: number;
  combo: number;
  letters: string;
  avatar: string;
}

interface TrickBattleArenaProps {
  spotId: string;
  userId: string;
}

const TRICKS: Trick[] = [
  { id: '1', name: 'Kickflip', difficulty: 2, points: 100, emoji: '🛹' },
  { id: '2', name: 'Heelflip', difficulty: 2, points: 100, emoji: '⚡' },
  { id: '3', name: '360 Flip', difficulty: 4, points: 300, emoji: '🌪️' },
  { id: '4', name: 'Hardflip', difficulty: 3, points: 200, emoji: '💥' },
  { id: '5', name: 'Impossible', difficulty: 5, points: 500, emoji: '🔥' },
  { id: '6', name: 'Backside 180', difficulty: 2, points: 150, emoji: '🔄' },
  { id: '7', name: 'Frontside 180', difficulty: 2, points: 150, emoji: '↪️' },
  { id: '8', name: 'Pop Shuvit', difficulty: 1, points: 50, emoji: '🎯' },
  { id: '9', name: 'Boardslide', difficulty: 3, points: 250, emoji: '🏂' },
  { id: '10', name: 'Nollie Flip', difficulty: 4, points: 350, emoji: '✨' },
];

export default function TrickBattleArena({ spotId, userId }: TrickBattleArenaProps) {
  const [gameState, setGameState] = useState<'waiting' | 'active' | 'ended'>('waiting');
  const [players, setPlayers] = useState<Player[]>([
    { id: '1', name: 'You', score: 0, combo: 0, letters: '', avatar: '🛹' },
    { id: '2', name: 'Opponent', score: 0, combo: 0, letters: '', avatar: '🎮' },
  ]);
  const [currentTrick, setCurrentTrick] = useState<Trick | null>(null);
  const [timeLeft, setTimeLeft] = useState(30);
  const [roundNumber, setRoundNumber] = useState(1);
  const [selectedTrick, setSelectedTrick] = useState<Trick | null>(null);
  const [showTrickPicker, setShowTrickPicker] = useState(false);
  const [lastLanded, setLastLanded] = useState<Trick | null>(null);

  useEffect(() => {
    if (gameState === 'active' && timeLeft > 0) {
      const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
      return () => clearTimeout(timer);
    } else if (timeLeft === 0 && gameState === 'active') {
      // Time's up - opponent gets the letter
      handleMiss();
    }
  }, [gameState, timeLeft]);

  const startGame = () => {
    setGameState('active');
    setTimeLeft(30);
    setRoundNumber(1);
    setShowTrickPicker(true);
  };

  const landTrick = (trick: Trick) => {
    const updatedPlayers = [...players];
    const playerIndex = updatedPlayers.findIndex(p => p.id === '1');
    
    // Add points with combo multiplier
    const comboMultiplier = 1 + (updatedPlayers[playerIndex].combo * 0.5);
    const points = Math.floor(trick.points * comboMultiplier);
    
    updatedPlayers[playerIndex].score += points;
    updatedPlayers[playerIndex].combo += 1;
    
    setPlayers(updatedPlayers);
    setLastLanded(trick);
    setCurrentTrick(trick);
    setShowTrickPicker(false);
    setTimeLeft(30);
    
    // Opponent's turn - simulate AI opponent
    setTimeout(() => {
      simulateOpponentTrick();
    }, 2000);
  };

  const handleMiss = () => {
    const updatedPlayers = [...players];
    const playerIndex = updatedPlayers.findIndex(p => p.id === '1');
    
    // Reset combo on miss
    updatedPlayers[playerIndex].combo = 0;
    
    // Add a letter
    const skateLetters = ['S', 'K', 'A', 'T', 'E'];
    const currentLetterCount = updatedPlayers[playerIndex].letters.length;
    
    if (currentLetterCount < 5) {
      updatedPlayers[playerIndex].letters += skateLetters[currentLetterCount];
    }
    
    setPlayers(updatedPlayers);
    
    // Check if game over
    if (updatedPlayers[playerIndex].letters.length >= 5) {
      setGameState('ended');
    } else {
      setRoundNumber(roundNumber + 1);
      setShowTrickPicker(true);
      setTimeLeft(30);
    }
  };

  const simulateOpponentTrick = () => {
    const updatedPlayers = [...players];
    const opponentIndex = updatedPlayers.findIndex(p => p.id === '2');
    
    // 70% chance opponent lands the trick
    const success = Math.random() > 0.3;
    
    if (success && currentTrick) {
      const comboMultiplier = 1 + (updatedPlayers[opponentIndex].combo * 0.5);
      const points = Math.floor(currentTrick.points * comboMultiplier);
      updatedPlayers[opponentIndex].score += points;
      updatedPlayers[opponentIndex].combo += 1;
    } else {
      // Opponent missed
      updatedPlayers[opponentIndex].combo = 0;
      const skateLetters = ['S', 'K', 'A', 'T', 'E'];
      const currentLetterCount = updatedPlayers[opponentIndex].letters.length;
      
      if (currentLetterCount < 5) {
        updatedPlayers[opponentIndex].letters += skateLetters[currentLetterCount];
      }
      
      if (updatedPlayers[opponentIndex].letters.length >= 5) {
        setGameState('ended');
      }
    }
    
    setPlayers(updatedPlayers);
    setRoundNumber(roundNumber + 1);
    setShowTrickPicker(true);
    setTimeLeft(30);
  };

  const getDifficultyColor = (difficulty: number) => {
    const colors = {
      1: 'text-green-400',
      2: 'text-blue-400',
      3: 'text-yellow-400',
      4: 'text-orange-400',
      5: 'text-red-400',
    };
    return colors[difficulty as keyof typeof colors];
  };

  if (gameState === 'waiting') {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-gradient-to-br from-zinc-900 via-black to-zinc-900 rounded-2xl p-8 text-white shadow-2xl border border-orange-500/20"
      >
        <div className="text-center space-y-6">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-orange-500/10 rounded-full mb-4">
            <Trophy className="w-10 h-10 text-orange-500" />
          </div>
          
          <h2 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-red-500">
            Trick Battle Arena
          </h2>
          
          <p className="text-gray-400 max-w-md mx-auto text-lg">
            Land tricks, build combos, and defeat your opponent. First to S.K.A.T.E. loses!
          </p>
          
          <div className="flex justify-center gap-4 pt-4">
            <div className="bg-zinc-800 rounded-lg p-4 min-w-[120px]">
              <Users className="w-6 h-6 text-blue-400 mx-auto mb-2" />
              <p className="text-sm text-gray-400">Players</p>
              <p className="text-2xl font-bold">2</p>
            </div>
            <div className="bg-zinc-800 rounded-lg p-4 min-w-[120px]">
              <Target className="w-6 h-6 text-green-400 mx-auto mb-2" />
              <p className="text-sm text-gray-400">Tricks</p>
              <p className="text-2xl font-bold">{TRICKS.length}</p>
            </div>
          </div>
          
          <button
            onClick={startGame}
            className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white text-xl font-bold px-12 py-4 rounded-xl shadow-lg transition-all hover:scale-105 hover:shadow-orange-500/50"
          >
            Start Battle
          </button>
        </div>
      </motion.div>
    );
  }

  if (gameState === 'ended') {
    const winner = players[0].letters.length >= 5 ? players[1] : players[0];
    const loser = winner.id === players[0].id ? players[1] : players[0];
    
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="bg-gradient-to-br from-zinc-900 via-black to-zinc-900 rounded-2xl p-8 text-white shadow-2xl border border-orange-500/20"
      >
        <div className="text-center space-y-6">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1, rotate: 360 }}
            transition={{ type: 'spring', duration: 0.8 }}
            className="inline-flex items-center justify-center w-24 h-24 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full mb-4"
          >
            <Trophy className="w-12 h-12 text-white" />
          </motion.div>
          
          <h2 className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500">
            {winner.avatar} {winner.name} Wins!
          </h2>
          
          <div className="bg-zinc-800/50 rounded-xl p-6 max-w-md mx-auto">
            <div className="grid grid-cols-2 gap-4">
              <div className="text-left">
                <p className="text-gray-400 text-sm mb-1">Winner</p>
                <p className="text-2xl font-bold">{winner.name}</p>
                <p className="text-orange-400 text-lg">{winner.score} pts</p>
              </div>
              <div className="text-right">
                <p className="text-gray-400 text-sm mb-1">Opponent</p>
                <p className="text-2xl font-bold">{loser.name}</p>
                <p className="text-red-400 text-lg tracking-[0.5em]">{loser.letters || '—'}</p>
              </div>
            </div>
          </div>
          
          <button
            onClick={() => {
              setGameState('waiting');
              setPlayers([
                { id: '1', name: 'You', score: 0, combo: 0, letters: '', avatar: '🛹' },
                { id: '2', name: 'Opponent', score: 0, combo: 0, letters: '', avatar: '🎮' },
              ]);
              setRoundNumber(1);
            }}
            className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white text-xl font-bold px-12 py-4 rounded-xl shadow-lg transition-all hover:scale-105"
          >
            Play Again
          </button>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-zinc-900 via-black to-zinc-900 rounded-2xl p-6 text-white shadow-2xl border border-orange-500/20">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-2">
          <Timer className="w-5 h-5 text-orange-500" />
          <span className="text-2xl font-bold">{timeLeft}s</span>
        </div>
        <div className="text-center">
          <p className="text-sm text-gray-400">Round</p>
          <p className="text-2xl font-bold text-orange-500">{roundNumber}</p>
        </div>
        <div className="text-right">
          <p className="text-sm text-gray-400">Spot</p>
          <p className="text-xs text-gray-500">{spotId.slice(0, 8)}...</p>
        </div>
      </div>

      {/* Players */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {players.map((player) => (
          <div
            key={player.id}
            className={`bg-zinc-800/50 rounded-xl p-4 border-2 transition-all ${
              player.id === '1' ? 'border-orange-500/50' : 'border-zinc-700'
            }`}
          >
            <div className="flex items-center gap-3 mb-2">
              <span className="text-3xl">{player.avatar}</span>
              <div className="flex-1">
                <p className="font-bold">{player.name}</p>
                <p className="text-sm text-gray-400">{player.score} pts</p>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Flame className={`w-4 h-4 ${player.combo > 0 ? 'text-orange-500' : 'text-gray-600'}`} />
                <span className="text-sm">x{player.combo}</span>
              </div>
              <div className="text-2xl font-bold tracking-[0.3em] text-red-500">
                {player.letters || '—'}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Current Trick */}
      {lastLanded && !showTrickPicker && (
        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          className="bg-gradient-to-r from-orange-500/20 to-red-500/20 rounded-xl p-6 mb-6 border border-orange-500/30"
        >
          <div className="text-center">
            <p className="text-sm text-gray-400 mb-2">Last Landed</p>
            <p className="text-4xl mb-2">{lastLanded.emoji}</p>
            <p className="text-2xl font-bold">{lastLanded.name}</p>
            <p className="text-orange-400">+{lastLanded.points} pts</p>
          </div>
        </motion.div>
      )}

      {/* Trick Picker */}
      <AnimatePresence>
        {showTrickPicker && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <p className="text-center text-gray-400 mb-4">Choose your trick</p>
            <div className="grid grid-cols-2 gap-3">
              {TRICKS.map((trick) => (
                <motion.button
                  key={trick.id}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => landTrick(trick)}
                  className={`bg-zinc-800 hover:bg-zinc-700 rounded-xl p-4 border border-zinc-700 hover:border-orange-500/50 transition-all text-left`}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-3xl">{trick.emoji}</span>
                    <div className="flex-1">
                      <p className="font-bold text-sm">{trick.name}</p>
                      <p className={`text-xs ${getDifficultyColor(trick.difficulty)}`}>
                        {'⭐'.repeat(trick.difficulty)}
                      </p>
                    </div>
                  </div>
                  <p className="text-orange-400 font-bold">{trick.points} pts</p>
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
