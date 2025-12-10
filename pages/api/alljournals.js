import { db } from "../../lib/firebaseAdmin";

export default async function handler(req, res) {
  try {
    const snapshot = await db.collection("journals").get();
    const journals = [];

    snapshot.forEach(doc => {
      journals.push(doc.data());
    });

    res.status(200).json(journals);
  } catch (err) {
    console.error("Firestore read error:", err);
    res.status(500).json({ error: err.message });
  }
}
