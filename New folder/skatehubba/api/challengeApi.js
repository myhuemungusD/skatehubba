import { db } from '../services/firebase';
import { collection, query, where, orderBy, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, Timestamp, arrayUnion, setDoc, getDoc, writeBatch } from 'firebase/firestore';
import { GAME_TYPES, hasPlayerLost } from '../constants/gameTypes';

// Subscribe to user's challenges (both sent and received)
export function subscribeToChallenges(userId, callback) {
  // Query challenges where user is either challenger or challenged
  const q = query(
    collection(db, 'challenges'),
    where('participants', 'array-contains', userId),
    orderBy('createdAt', 'desc')
  );

  return onSnapshot(q, (snapshot) => {
    const challenges = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    callback(challenges);
  });
}

/**
 * Creates a new challenge
 * @param {Object} challengeData
 * @param {string} challengeData.targetUserId - ID of the user being challenged
 * @param {('SKATE'|'SKATE8')} challengeData.gameType - Type of game
 * @param {string} challengeData.status - Initial status of the challenge
 * @returns {Promise<string>} The ID of the created challenge
 */
export async function createChallenge(challengeData) {
  const { uid } = auth.currentUser;
  const challengeRef = doc(collection(db, 'challenges'));

  const challenge = {
    ...challengeData,
    challengerId: uid,
    createdAt: Timestamp.now(),
    currentTurn: uid,
    players: {
      [uid]: { missedTricks: 0 },
      [challengeData.targetUserId]: { missedTricks: 0 }
    },
    moves: [],
    winner: null,
  };

  await setDoc(challengeRef, challenge);
  return challengeRef.id;
}

/**
 * Updates the status of a challenge
 * @param {string} challengeId - The ID of the challenge to update
 * @param {('accepted'|'declined'|'completed')} status - The new status
 * @returns {Promise<void>}
 */
export async function updateChallengeStatus(challengeId, status) {
  const challengeRef = doc(db, 'challenges', challengeId);
  
  await updateDoc(challengeRef, {
    status,
    updatedAt: Timestamp.now(),
    ...(status === 'accepted' ? { acceptedAt: Timestamp.now() } : {}),
    ...(status === 'declined' ? { declinedAt: Timestamp.now() } : {}),
  });
}

/**
 * Plays a move in response to a challenge
 * @param {string} challengeId - The ID of the challenge
 * @param {Object} moveData - The move data
 * @param {string} moveData.trickName - The name of the trick
 * @param {string} moveData.mediaUrl - The URL of the media (video/image)
 * @param {('video'|'image')} moveData.mediaType - The type of media
 * @param {number} moveData.timestamp - The timestamp of the move
 * @returns {Promise<void>}
 */
export async function playMove(challengeId, moveData) {
  const challengeRef = doc(db, 'challenges', challengeId);
  
  await updateDoc(challengeRef, {
    moves: arrayUnion({
      ...moveData,
      createdAt: Timestamp.now(),
    }),
    updatedAt: Timestamp.now(),
    status: 'inProgress',
  });
}

/**
 * Make a move in the challenge (add a letter)
 * @param {string} challengeId - The ID of the challenge
 * @param {string} letter - The letter to add
 * @param {string} nextTurnUserId - The ID of the user who has the next turn
 */
export async function makeChallengeMove(challengeId, letter, nextTurnUserId) {
  const ref = doc(db, 'challenges', challengeId);
  await updateDoc(ref, {
    letters: letter,
    currentTurn: nextTurnUserId,
    updatedAt: serverTimestamp()
  });
}

/**
 * Request a retry for a move
 * @param {string} challengeId - The ID of the challenge
 * @returns {Promise<{granted: boolean}>}
 */
export async function requestMoveRetry(challengeId) {
  const challengeRef = doc(db, 'challenges', challengeId);
  const retryRequestRef = doc(db, 'retryRequests', challengeId);
  
  // Create retry request
  await setDoc(retryRequestRef, {
    challengeId,
    createdAt: Timestamp.now(),
    status: 'pending',
    approvals: [],
    expiresAt: Timestamp.fromMillis(Date.now() + 5 * 60 * 1000), // 5 minutes to respond
  });

  // Listen for all players to approve
  return new Promise((resolve) => {
    const unsubscribe = onSnapshot(retryRequestRef, (doc) => {
      const data = doc.data();
      
      // Check if all players have approved
      if (data.status === 'approved') {
        unsubscribe();
        resolve({ granted: true });
      }
      
      // Check if request expired or was denied
      if (data.status === 'expired' || data.status === 'denied') {
        unsubscribe();
        resolve({ granted: false });
      }
      
      // Check if request has expired
      if (data.expiresAt.toMillis() < Date.now()) {
        updateDoc(retryRequestRef, { status: 'expired' });
        unsubscribe();
        resolve({ granted: false });
      }
    });

    // Automatically cleanup listener after 5.5 minutes (longer than expiry)
    setTimeout(() => {
      unsubscribe();
      resolve({ granted: false });
    }, 5.5 * 60 * 1000);
  });
}

/**
 * Respond to a retry request
 * @param {string} challengeId - The ID of the challenge
 * @param {boolean} approved - Whether the retry is approved
 * @returns {Promise<void>}
 */
export async function respondToRetryRequest(challengeId, approved) {
  const retryRequestRef = doc(db, 'retryRequests', challengeId);
  const { uid } = auth.currentUser;

  await updateDoc(retryRequestRef, {
    approvals: arrayUnion({
      userId: uid,
      approved,
      timestamp: Timestamp.now(),
    }),
  });

  // Get the updated document to check if all players have responded
  const updatedDoc = await getDoc(retryRequestRef);
  const data = updatedDoc.data();
  
  if (data.approvals.length === data.requiredApprovals) {
    // All players have responded
    const allApproved = data.approvals.every(a => a.approved);
    await updateDoc(retryRequestRef, {
      status: allApproved ? 'approved' : 'denied',
    });
  }
}

/**
 * Evaluates a move response and updates game state
 * @param {string} challengeId - The challenge ID
 * @param {string} moveId - The move being responded to
 * @param {boolean} succeeded - Whether the player landed the trick
 */
export async function evaluateMove(challengeId, moveId, succeeded) {
  const challengeRef = doc(db, 'challenges', challengeId);
  const challenge = (await getDoc(challengeRef)).data();
  
  const nextTurn = Object.keys(challenge.players).find(id => 
    id !== challenge.currentTurn
  );

  const batch = writeBatch(db);

  // Update move status
  batch.update(challengeRef, {
    [`moves.${moveId}.responses.${challenge.currentTurn}`]: {
      succeeded,
      timestamp: Timestamp.now()
    }
  });

  if (!succeeded) {
    // Player missed the trick
    const currentMisses = challenge.players[challenge.currentTurn].missedTricks + 1;
    
    batch.update(challengeRef, {
      [`players.${challenge.currentTurn}.missedTricks`]: currentMisses
    });

    // Check if player lost
    if (hasPlayerLost(currentMisses, challenge.gameType)) {
      batch.update(challengeRef, {
        status: 'completed',
        winner: nextTurn,
        completedAt: Timestamp.now()
      });
    }
  }

  // Update turn
  batch.update(challengeRef, {
    currentTurn: nextTurn
  });

  await batch.commit();
}
