import { db } from "../../lib/firebaseAdmin";

export default async function handler(req, res) {
  try {
    const snapshot = await db.collection("journals").get();
    const journals = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.status(200).json(journals);
  } catch (err) {
    console.error("Error fetching journals:", err);
    res.status(500).json({ error: "Unable to fetch journals" });
  }
}
