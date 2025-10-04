import { db } from '../services/firebase';
import { collection, addDoc, serverTimestamp, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { analyticsService, EventCategory } from '../services/analytics';

// Add a new check-in
export async function addCheckIn(userId, spotId) {
  try {
    const checkIn = await addDoc(collection(db, 'checkins'), {
      userId,
      spotId,
      checkedInAt: serverTimestamp(),
    });

    // Log check-in event
    await analyticsService.logCheckIn(userId, spotId);

    return checkIn;
  } catch (error) {
    // Log error
    analyticsService.logError(error, {
      category: EventCategory.CHECK_IN,
      action: 'create_check_in',
      userId,
      spotId,
    });
    throw error;
  }
}

// Subscribe to real-time check-ins for a spot or shop
export function subscribeToCheckIns(spotId, cb) {
  const q = query(
    collection(db, 'checkins'),
    where('spotId', '==', spotId),
    orderBy('checkedInAt', 'desc')
  );
  // Listen for changes (add/remove/update)
  return onSnapshot(q, (snapshot) => {
    // Each time the list updates, call the callback with the new array
    cb(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
  });
}
