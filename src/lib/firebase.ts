import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  getDocFromServer,
  collection,
  onSnapshot,
  setDoc,
  deleteDoc,
  writeBatch,
  Unsubscribe
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { CommissionRecord } from '../types';

const app = initializeApp(firebaseConfig);
export const db = (firebaseConfig as any).firestoreDatabaseId
  ? getFirestore(app, (firebaseConfig as any).firestoreDatabaseId)
  : getFirestore(app);
export const auth = getAuth(app);

// Validate Connection to Firestore on startup
export async function testFirestoreConnection() {
  try {
    await getDocFromServer(doc(db, '_connection_test', 'status'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn("Firestore client is offline or checking connection.");
    }
  }
}
testFirestoreConnection();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

const COLLECTION_RECORDS = 'commission_records';

/**
 * Subscribes to real-time changes in Firestore commission_records collection.
 * Any update made on iPhone, iPad, or Web is immediately broadcasted to all active devices.
 */
export function subscribeToRecords(
  onUpdate: (records: CommissionRecord[]) => void,
  onFirstEmpty?: () => void
): Unsubscribe {
  const colRef = collection(db, COLLECTION_RECORDS);

  return onSnapshot(
    colRef,
    (snapshot) => {
      if (snapshot.empty && onFirstEmpty) {
        onFirstEmpty();
        return;
      }
      const records: CommissionRecord[] = [];
      snapshot.forEach((docSnap) => {
        records.push(docSnap.data() as CommissionRecord);
      });
      onUpdate(records);
    },
    (error) => {
      console.error('Real-time subscription error:', error);
      handleFirestoreError(error, OperationType.GET, COLLECTION_RECORDS);
    }
  );
}

/**
 * Saves or updates a single record in Firestore.
 */
export async function saveRecordToFirestore(record: CommissionRecord): Promise<void> {
  const path = `${COLLECTION_RECORDS}/${record.id}`;
  try {
    const docRef = doc(db, COLLECTION_RECORDS, record.id);
    await setDoc(docRef, record, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Batch saves multiple records to Firestore (in chunks of 450 to avoid Firestore 500 ops limit).
 */
export async function saveBatchRecordsToFirestore(records: CommissionRecord[]): Promise<void> {
  if (!records.length) return;

  const chunkSize = 400;
  for (let i = 0; i < records.length; i += chunkSize) {
    const chunk = records.slice(i, i + chunkSize);
    const batch = writeBatch(db);
    chunk.forEach((rec) => {
      const ref = doc(db, COLLECTION_RECORDS, rec.id);
      batch.set(ref, rec, { merge: true });
    });
    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, COLLECTION_RECORDS);
    }
  }
}

/**
 * Deletes a single record from Firestore.
 */
export async function deleteRecordFromFirestore(recordId: string): Promise<void> {
  const path = `${COLLECTION_RECORDS}/${recordId}`;
  try {
    const docRef = doc(db, COLLECTION_RECORDS, recordId);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/**
 * Replaces or seeds the entire Firestore collection with the provided records.
 */
export async function seedFirestoreRecords(records: CommissionRecord[]): Promise<void> {
  await saveBatchRecordsToFirestore(records);
}
