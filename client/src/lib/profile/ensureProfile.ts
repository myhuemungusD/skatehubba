import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../firebase";

function shortId(uid: string) {
  return uid.slice(0, 6);
}

export async function ensureProfile(uid: string) {
  const ref = doc(db, "profiles", uid);
  const snap = await getDoc(ref);

  if (snap.exists()) return snap.data();

  const profile = {
    uid,
    displayName: `Guest-${shortId(uid)}`,
    isGuest: true,
    createdAt: serverTimestamp(),
  };

  await setDoc(ref, profile, { merge: true });
  return profile;
}
