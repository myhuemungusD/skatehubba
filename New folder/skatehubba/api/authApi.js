import { auth, db, storage } from '../services/firebase';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc, getDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { analyticsService, EventCategory, EventName } from '../services/analytics';
import { getCachedUser, cacheUser } from '../utils/userCache';

// Sign up new user and create Firestore profile
export async function signUp(email, password, username) {
  try {
    const res = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(res.user, { displayName: username });
    
    // Create user profile in Firestore
    const userData = {
      uid: res.user.uid,
      email,
      username,
      avatar: '',
      isVerified: false,
      role: 'user',
      bio: '',
      sponsors: [],
      createdAt: new Date().toISOString(),
    };
    
    await setDoc(doc(db, 'users', res.user.uid), userData);

    // Log signup success
    await analyticsService.logSignUp('email', res.user.uid);
    
    // Set initial user properties
    await analyticsService.setUserProperties(res.user.uid, userData);

    return res.user;
  } catch (error) {
    // Log signup error
    await analyticsService.logAuthError(error, 'email_signup');
    throw error;
  }
}

// Sign in existing user
export async function signIn(email, password) {
  try {
    const res = await signInWithEmailAndPassword(auth, email, password);
    
    // Log login success
    await analyticsService.logLogin('email', res.user.uid);
    
    return res.user;
  } catch (error) {
    // Log login error
    await analyticsService.logAuthError(error, 'email_login');
    throw error;
  }
}

// Get user profile from Firestore
export async function getUserProfile(uid) {
  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// Avatar upload function
// fileUri: URI from Expo ImagePicker, uid: user ID
export async function uploadAvatar(fileUri, uid) {
  const response = await fetch(fileUri);
  const blob = await response.blob();
  const storageRef = ref(storage, `avatars/${uid}.jpg`);
  await uploadBytes(storageRef, blob);
  const url = await getDownloadURL(storageRef);
  // Update user's Firestore profile
  await updateDoc(doc(db, 'users', uid), { avatar: url });
  return url;
}

// Batch fetch user profiles
export async function getUserProfiles(uids) {
  const uniqueUids = [...new Set(uids)];
  const result = {};
  const toFetch = [];

  // Check cache first
  uniqueUids.forEach(uid => {
    const cached = getCachedUser(uid);
    if (cached) {
      result[uid] = cached;
    } else {
      toFetch.push(uid);
    }
  });

  // Fetch uncached profiles in batches of 10
  if (toFetch.length > 0) {
    for (let i = 0; i < toFetch.length; i += 10) {
      const batch = toFetch.slice(i, i + 10);
      const refs = batch.map(uid => doc(db, 'users', uid));
      const snapshots = await Promise.all(refs.map(ref => getDoc(ref)));
      
      snapshots.forEach((snap) => {
        if (snap.exists()) {
          const userData = { id: snap.id, ...snap.data() };
          result[snap.id] = userData;
          cacheUser(snap.id, userData);
        }
      });
    }
  }

  return result;
}

