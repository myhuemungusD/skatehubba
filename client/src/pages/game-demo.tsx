import { useState } from 'react';
import { motion } from 'framer-motion';
import { Trophy, Map, Video, Gamepad2, X } from 'lucide-react';
import TrickBattleArena from '../components/skater/TrickBattleArena';
import SpotDiscoveryMap from '../components/map/SpotDiscoveryMap';
import TrickRecorder from '../components/skater/TrickRecorder';

type DemoMode = 'menu' | 'battle' | 'map' | 'recorder';

export default function GameDemo() {
  const [mode, setMode] = useState<DemoMode>('menu');

  const demos = [
    {
      id: 'battle',
      title: 'Trick Battle Arena',
      description: 'Real-time S.K.A.T.E. battles with combo system',
      icon: Trophy,
      color: 'from-orange-500 to-red-500',
    },
    {
      id: 'map',
      title: 'Spot Discovery',
      description: 'Interactive map with spot check-ins',
      icon: Map,
      color: 'from-blue-500 to-cyan-500',
    },
    {
      id: 'recorder',
      title: 'Trick Recorder',
      description: 'Record and submit your tricks',
      icon: Video,
      color: 'from-purple-500 to-pink-500',
    },
  ];

  if (mode === 'battle') {
    return (
      <div className="min-h-screen bg-black p-4">
        <button
          onClick={() => setMode('menu')}
          className="mb-4 bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-lg flex items-center gap-2"
        >
          <X className="w-4 h-4" />
          Back to Menu
        </button>
        <TrickBattleArena spotId="demo-spot-1" />
      </div>
    );
  }

  if (mode === 'map') {
    return (
      <div className="relative h-screen bg-black">
        <button
          onClick={() => setMode('menu')}
          className="absolute top-4 left-4 z-[1001] bg-black/80 hover:bg-black text-white px-4 py-2 rounded-lg flex items-center gap-2 backdrop-blur-sm"
        >
          <X className="w-4 h-4" />
          Back
        </button>
        <SpotDiscoveryMap
          userLat={33.9870}
          userLng={-118.4680}
          onSpotSelect={(spot) => {
            console.log('Selected spot:', spot);
          }}
        />
      </div>
    );
  }

  if (mode === 'recorder') {
    return (
      <TrickRecorder
        spotId="demo-spot-1"
        onRecordComplete={(blob, name) => {
          console.log('Recorded trick:', name, blob);
          alert(`Trick "${name}" recorded! (${(blob.size / 1024 / 1024).toFixed(2)}MB)`);
          setMode('menu');
        }}
        onClose={() => setMode('menu')}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-900 via-black to-zinc-900 text-white p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12 pt-12"
        >
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-orange-500 to-red-500 rounded-full mb-6">
            <Gamepad2 className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-6xl font-bold mb-4 text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-red-500">
            Game Components Demo
          </h1>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto">
            Interactive showcase of SkateHubba's core gameplay features
          </p>
        </motion.div>

        {/* Demo Cards */}
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          {demos.map((demo, index) => {
            const Icon = demo.icon;
            return (
              <motion.button
                key={demo.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                onClick={() => setMode(demo.id as DemoMode)}
                className="group relative bg-zinc-800/50 hover:bg-zinc-800 rounded-2xl p-8 border-2 border-zinc-700 hover:border-orange-500/50 transition-all overflow-hidden text-left"
              >
                {/* Gradient Background */}
                <div className={`absolute inset-0 bg-gradient-to-br ${demo.color} opacity-0 group-hover:opacity-10 transition-opacity`} />

                {/* Content */}
                <div className="relative z-10">
                  <div className={`inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br ${demo.color} rounded-xl mb-4 transform group-hover:scale-110 transition-transform`}>
                    <Icon className="w-8 h-8 text-white" />
                  </div>
                  <h3 className="text-2xl font-bold mb-2 text-white">
                    {demo.title}
                  </h3>
                  <p className="text-gray-400 mb-4">
                    {demo.description}
                  </p>
                  <div className="inline-flex items-center gap-2 text-orange-400 font-semibold group-hover:gap-3 transition-all">
                    Launch Demo
                    <span className="group-hover:translate-x-1 transition-transform">→</span>
                  </div>
                </div>
              </motion.button>
            );
          })}
        </div>

        {/* Features List */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="bg-zinc-800/30 rounded-2xl p-8 border border-zinc-700"
        >
          <h2 className="text-2xl font-bold mb-6 text-white">What's Included</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {[
              'Real-time trick battles with S.K.A.T.E. letter system',
              'Combo multiplier and scoring system',
              'Interactive map with animated markers',
              'Spot filtering (all, unlocked, nearby)',
              'Video recording with camera integration',
              'Trick naming and submission flow',
              'Responsive mobile-first design',
              'Smooth animations with Framer Motion',
            ].map((feature, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-white text-xs">✓</span>
                </div>
                <p className="text-gray-300">{feature}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Tech Stack */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-6 text-center text-gray-500 text-sm"
        >
          Built with React, TypeScript, Framer Motion, Leaflet & MediaStream API
        </motion.div>
      </div>
    </div>
  );
}
