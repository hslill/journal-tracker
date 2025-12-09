// upload-excel.js
import { Octokit } from "@octokit/rest";
import multer from "multer";
import nextConnect from "next-connect";
import XLSX from "xlsx";
import fs from "fs";
import path from "path";

const upload = multer({ storage: multer.memoryStorage() });
const apiRoute = nextConnect();

apiRoute.use(upload.single("file"));

function normalizeISSN(issn) {
  if (!issn) return null;
  return issn.toString().trim().replace(/[^0-9Xx]/g, "").toUpperCase();
}

const LOCAL_FILE = path.join(process.cwd(), "alljournals", "journals.json");
const isServerless = !!process.env.GITHUB_TOKEN;
const CHUNK_SIZE = 500; // Number of journals per commit

apiRoute.post(async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });

    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet);

    const journals = data
      .filter(r => r.Title && r.ISSN)
      .map(r => ({ title: r.Title.toString().trim(), issn: normalizeISSN(r.ISSN) }))
      .filter(j => j.issn);

    if (!journals.length) return res.status(400).json({ error: "No valid journals found." });

    if (isServerless) {
      const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
      const owner = "hslill";
      const repo = "journal-tracker";
      const pathInRepo = "alljournals/journals.json";

      // Step 1: Get current file SHA
      const { data: currentFile } = await octokit.repos.getContent({ owner, repo, path: pathInRepo });
      const currentSHA = currentFile.sha;

      // Step 2: Split journals into chunks
      const chunks = [];
      for (let i = 0; i < journals.length; i += CHUNK_SIZE) {
        chunks.push(journals.slice(i, i + CHUNK_SIZE));
      }

      // Step 3: Sequentially commit each chunk
      let lastSHA = currentSHA;
      for (let i = 0; i < chunks.length; i++) {
        const base64Content = Buffer.from(JSON.stringify(chunks[i], null, 2)).toString("base64");

        await octokit.repos.createOrUpdateFileContents({
          owner,
          repo,
          path: pathInRepo,
          message: `Update journals.json chunk ${i + 1}/${chunks.length} (${new Date().toISOString()})`,
          content: base64Content,
          sha: lastSHA,
        });

        // Update SHA for next commit
        const { data: updatedFile } = await octokit.repos.getContent({ owner, repo, path: pathInRepo });
        lastSHA = updatedFile.sha;
      }

      return res.status(200).json({ success: true, count: journals.length, chunks: chunks.length, source: "GitHub" });
    } else {
      // Local overwrite
      fs.writeFileSync(LOCAL_FILE, JSON.stringify(journals, null, 2));
      return res.status(200).json({ success: true, count: journals.length, source: "local" });
    }

  } catch (err) {
    console.error("Excel upload error:", err);
    return res.status(500).json({ error: err.message || "Unknown server error" });
  }
});

export default apiRoute;
export const config = { api: { bodyParser: false } };
