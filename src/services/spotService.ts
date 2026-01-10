import { getAuth } from 'firebase/auth';
import { getFirestore, collection, addDoc, serverTimestamp, GeoPoint } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

interface CreateSpotParams {
  coordinates: [number, number]; // [Longitude, Latitude]
  description: string;
  imageUri: string;
}

export const createSpot = async ({ coordinates, description, imageUri }: CreateSpotParams) => {
  const auth = getAuth();
  const db = getFirestore();
  const storage = getStorage();

  if (!auth.currentUser) throw new Error('User must be logged in to add a spot.');

  // 1. Upload Image
  const response = await fetch(imageUri);
  const blob = await response.blob();

  const filename = `spots/${auth.currentUser.uid}/${Date.now()}.jpg`;
  const storageRef = ref(storage, filename);

  // FIX #2: Explicit Content Type
  await uploadBytes(storageRef, blob, {
    contentType: 'image/jpeg',
  });

  const downloadUrl = await getDownloadURL(storageRef);

  // 2. Save Data to Firestore
  await addDoc(collection(db, 'spots'), {
    creatorId: auth.currentUser.uid,
    description: description.trim(),
    imageUrl: downloadUrl,

    // FIX #1: Native GeoPoint for easy querying later
    geo: new GeoPoint(coordinates[1], coordinates[0]), // MUST BE [Lat, Lng]

    coordinates: {
      longitude: coordinates[0],
      latitude: coordinates[1],
    },
    location: {
      type: 'Point',
      coordinates: coordinates, // [Lng, Lat]
    },
    createdAt: serverTimestamp(),
    verified: false,
  });

  return true;
};
