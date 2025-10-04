import { addCheckIn, subscribeToCheckIns } from '../authApi';
import { db, auth } from '../../services/firebase';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';

describe('Check-in functionality', () => {
  const mockSpotId = 'test-spot-1';
  const mockUserId = 'test-user-1';

  beforeEach(() => {
    // Clear previous test data
    const checkinsRef = collection(db, 'checkins');
    const q = query(checkinsRef, where('spotId', '==', mockSpotId));
    getDocs(q).then(snapshot => {
      snapshot.docs.forEach(doc => doc.ref.delete());
    });
  });

  it('should add a new check-in', async () => {
    const checkin = await addCheckIn(mockUserId, mockSpotId);
    expect(checkin.id).toBeTruthy();
  });

  it('should subscribe to check-ins in real-time', (done) => {
    let callCount = 0;
    
    const unsubscribe = subscribeToCheckIns(mockSpotId, (checkins) => {
      callCount++;
      
      if (callCount === 1) {
        // Initial empty state
        expect(checkins).toHaveLength(0);
        
        // Add a check-in to trigger update
        addCheckIn(mockUserId, mockSpotId);
      }
      
      if (callCount === 2) {
        // Should receive update with new check-in
        expect(checkins).toHaveLength(1);
        expect(checkins[0].spotId).toBe(mockSpotId);
        expect(checkins[0].userId).toBe(mockUserId);
        
        unsubscribe();
        done();
      }
    });
  });
});
