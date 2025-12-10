// lib/firebaseAdmin.js
import admin from "firebase-admin";

if (!admin.apps.length) {
  // Ensure all required env vars are present
  const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env;

  if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
    throw new Error("Missing one or more Firebase environment variables!");
  }

  // Replace escaped \n with actual newlines for Vercel deployment
  const privateKey = FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n");

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: FIREBASE_PROJECT_ID,
      clientEmail: FIREBASE_CLIENT_EMAIL,
      privateKey,
    }),
  });
}

export const db = admin.firestore();
