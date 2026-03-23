import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBVf9moMKtRt_HoEEqhFinjjYvEnKf8Qmg",
  authDomain: "lifhur-b12e5.firebaseapp.com",
  projectId: "lifhur-b12e5",
  storageBucket: "lifhur-b12e5.firebasestorage.app",
  messagingSenderId: "1001411308492",
  appId: "1:1001411308492:web:3e553677c22f0294ef4b69"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);