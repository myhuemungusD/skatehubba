import {
  collection,
  onSnapshot,
  query,
  type QueryConstraint,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "../firebase/config";

export interface ListenerError {
  code?: string;
  message?: string;
}

export const listenToCollection = <T>(
  path: string,
  constraints: QueryConstraint[],
  onNext: (items: T[]) => void,
  onError?: (error: ListenerError) => void
): Unsubscribe => {
  const collectionRef = collection(db, path);
  const q = constraints.length ? query(collectionRef, ...constraints) : collectionRef;

  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as T[];
      onNext(items);
    },
    (error) => {
      onError?.({ code: error.code, message: error.message });
    }
  );
};
