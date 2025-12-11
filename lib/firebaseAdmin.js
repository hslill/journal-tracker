import admin from "firebase-admin";

if (!admin.apps.length) {
  const {
    FIREBASE_PROJECT_ID,
    FIREBASE_PRIVATE_KEY,
    FIREBASE_CLIENT_EMAIL,
    FIREBASE_PRIVATE_KEY_ID,
    FIREBASE_CLIENT_ID
  } = process.env;

    admin.initializeApp({
      credential: admin.credential.cert({
        type: "service_account",
        project_id: FIREBASE_PROJECT_ID,
        private_key_id: FIREBASE_PRIVATE_KEY_ID,
        private_key: FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
        client_email: FIREBASE_CLIENT_EMAIL,
        client_id: FIREBASE_CLIENT_ID,
        token_uri: "https://oauth2.googleapis.com/token",
      }),
    });
}

export const db = admin.firestore();
