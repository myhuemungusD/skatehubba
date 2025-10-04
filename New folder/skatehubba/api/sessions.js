// Mock API for live sessions - replace with your Firestore implementation
export const getLiveSessions = async () => {
  // Mock data for development
  return [
    {
      id: '1',
      hostName: 'Jamie',
      hostAvatar: 'https://via.placeholder.com/38',
      spotName: 'Hollenbeck Park',
      isLive: true,
      isFull: false,
      participants: 3,
      maxParticipants: 8,
      viewers: 12,
      createdAt: new Date(),
      location: { lat: 34.0522, lng: -118.2437 }
    },
    {
      id: '2',
      hostName: 'Dre',
      hostAvatar: 'https://via.placeholder.com/38',
      spotName: 'Hollywood High',
      isLive: true,
      isFull: false,
      participants: 5,
      maxParticipants: 8,
      viewers: 8,
      createdAt: new Date(),
      location: { lat: 34.0982, lng: -118.3467 }
    },
    {
      id: '3',
      hostName: 'Liz',
      hostAvatar: 'https://via.placeholder.com/38',
      spotName: 'El Toro',
      isLive: false,
      isFull: true,
      participants: 8,
      maxParticipants: 8,
      viewers: 25,
      createdAt: new Date(),
      location: { lat: 33.6189, lng: -117.9298 }
    },
    {
      id: '4',
      hostName: 'Alex',
      hostAvatar: 'https://via.placeholder.com/38',
      spotName: 'Venice Beach',
      isLive: true,
      isFull: false,
      participants: 2,
      maxParticipants: 6,
      viewers: 15,
      createdAt: new Date(),
      location: { lat: 33.9850, lng: -118.4695 }
    }
  ];
};

// Real implementation would use Firestore with real-time listeners:
/*
import { collection, query, where, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { db } from '../services/firebase';

export const getLiveSessions = async () => {
  return new Promise((resolve, reject) => {
    try {
      const sessionsRef = collection(db, 'liveSessions');
      const q = query(
        sessionsRef,
        where('isActive', '==', true),
        orderBy('createdAt', 'desc'),
        limit(20)
      );
      
      // Use onSnapshot for real-time updates
      const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const sessions = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          sessions.push({
            id: doc.id,
            ...data,
            createdAt: data.createdAt?.toDate(),
            isFull: data.participants >= data.maxParticipants
          });
        });
        resolve(sessions);
      });
      
      return unsubscribe; // Return for cleanup
    } catch (error) {
      console.error('Error fetching live sessions:', error);
      reject(error);
    }
  });
};

export const joinSession = async (sessionId, userId) => {
  try {
    const sessionRef = doc(db, 'liveSessions', sessionId);
    await updateDoc(sessionRef, {
      participants: increment(1),
      participantIds: arrayUnion(userId),
      updatedAt: serverTimestamp()
    });
    return true;
  } catch (error) {
    console.error('Error joining session:', error);
    return false;
  }
};

export const spectateSession = async (sessionId, userId) => {
  try {
    const sessionRef = doc(db, 'liveSessions', sessionId);
    await updateDoc(sessionRef, {
      viewers: increment(1),
      viewerIds: arrayUnion(userId),
      updatedAt: serverTimestamp()
    });
    return true;
  } catch (error) {
    console.error('Error spectating session:', error);
    return false;
  }
};

export const createSession = async (hostId, spotId, spotName, maxParticipants = 8) => {
  try {
    const sessionRef = await addDoc(collection(db, 'liveSessions'), {
      hostId,
      spotId,
      spotName,
      isLive: false,
      isActive: true,
      participants: 1,
      maxParticipants,
      viewers: 0,
      participantIds: [hostId],
      viewerIds: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    return sessionRef.id;
  } catch (error) {
    console.error('Error creating session:', error);
    return null;
  }
};
*/
