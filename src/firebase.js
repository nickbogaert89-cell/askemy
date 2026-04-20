import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Web config is safe to commit — Firestore security rules enforce access.
const firebaseConfig = {
  apiKey: "AIzaSyAXnbaeZoaruKIQUMhqllP_Gn-rY54OkDc",
  authDomain: "askemy-88b46.firebaseapp.com",
  projectId: "askemy-88b46",
  storageBucket: "askemy-88b46.firebasestorage.app",
  messagingSenderId: "321175569906",
  appId: "1:321175569906:web:42618faea183726dbd976b",
};

export const ADMIN_EMAIL = "nickbogaert89@gmail.com";

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
