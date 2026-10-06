export class Timestamp {
  seconds: number;
  nanoseconds: number;
  constructor(seconds: number, nanoseconds: number) {
    this.seconds = seconds;
    this.nanoseconds = nanoseconds;
  }
  static fromDate(d: Date): Timestamp {
    return new Timestamp(Math.floor(d.getTime() / 1000), 0);
  }
  static now(): Timestamp {
    return Timestamp.fromDate(new Date());
  }
  toDate(): Date {
    return new Date(this.seconds * 1000);
  }
  toMillis(): number {
    return this.seconds * 1000;
  }
}

export class GeoPoint {
  latitude: number;
  longitude: number;
  constructor(latitude: number, longitude: number) {
    this.latitude = latitude;
    this.longitude = longitude;
  }
}

export const addDoc = jest.fn();
export const collection = jest.fn(() => ({ withConverter: () => ({}) }));
export const collectionGroup = jest.fn(() => ({ withConverter: () => ({}) }));
export const connectFirestoreEmulator = jest.fn();
export const deleteDoc = jest.fn();
export const doc = jest.fn(() => ({ withConverter: () => ({}) }));
export const getCountFromServer = jest.fn();
export const getDoc = jest.fn();
export const getDocs = jest.fn();
export const getDocsFromCache = jest.fn();
export const getFirestore = jest.fn(() => ({}));
export const increment = jest.fn();
export const initializeFirestore = jest.fn();
export const limit = jest.fn();
export const onSnapshot = jest.fn(() => () => undefined);
export const orderBy = jest.fn();
export const query = jest.fn();
export const serverTimestamp = jest.fn();
export const setDoc = jest.fn();
export const startAfter = jest.fn();
export const updateDoc = jest.fn();
export const where = jest.fn();
export const writeBatch = jest.fn();
