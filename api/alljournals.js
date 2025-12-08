import fs from "fs";
import path from "path";
import fetch from "node-fetch";

export default async function handler(req, res) {
  const LIBRARY_ID = process.env.BROWZINE_LIBRARY_ID || 3820;
  const API_KEY = process.env.BROWZINE_API_KEY;

  const JOURNALS_FILE = path.join(process.cwd(), "alljournals", "journals.json");

  try {
    const masterList = JSON.parse(fs.readFileSync(JOURNALS_FILE, "utf8"));
    // Example: you could fetch updated info here if desired
    res.status(200).json(masterList);
  } catch (err) {
    res.status(500).json({ error: "Unable to read journals" });
  }
}
