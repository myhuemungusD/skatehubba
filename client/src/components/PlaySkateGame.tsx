// client/src/components/PlaySkateGame.tsx
import { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';

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

const socket: Socket = io();

export default function PlaySkateGame({ spotId, userToken }: PlaySkateGameProps) {
  const [game, setGame] = useState<Game | null>(null);
  const [trick, setTrick] = useState('');

  const create = () => fetch('/api/playskate/create', { method: 'POST', headers: { Authorization: `Bearer ${userToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({spotId}) }).then(r=>r.json()).then((d: { gameId: string })=> { setGame({id: d.gameId}); socket.emit('joinGame', d.gameId); });
  const sendClip = () => {
    if (!game) return;
    // In real app you'd upload to Firebase Storage first
    fetch(`/api/playskate/${game.id}/clip`, { 
      method: 'POST', 
      headers: { Authorization: `Bearer ${userToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ clipUrl: 'https://example.com/clip.mp4', trickName: trick })
    });
  };

  useEffect(() => { 
    socket.on('update', setGame); 
    return () => { socket.off('update'); };
  }, []);

  if (!game) return <button onClick={create} className="bg-orange-600 text-white px-6 py-3 rounded">Start Play S.K.A.T.E.</button>;

  const myIdx = game.players?.indexOf(userToken?.uid || '') || 0;
  const myLetters = game.letters?.[myIdx] || '';

  return (
    <div className="bg-black text-white p-6 rounded-xl">
      <h2 className="text-2xl mb-4">Play S.K.A.T.E. ({game.players?.length || 0}/4)</h2>
      {game.status === 'ended' ? <h1 className="text-4xl">WINNER!</h1> :
       <>
         <p>Your letters: <span className="text-4xl text-red-600">{myLetters || '—'}</span></p>
         <input placeholder="kickflip boardslide…" className="bg-gray-900 p-3 rounded w-full my-4" onChange={e=>setTrick(e.target.value)} />
         <button onClick={sendClip} className="bg-success px-8 py-4 rounded text-xl">LAND IT</button>
       </>
      }
    </div>
  );
}
