// upload-excel.js
import { Octokit } from "@octokit/rest";
import multer from "multer";
import nextConnect from "next-connect";
import XLSX from "xlsx";
import fs from "fs";
import path from "path";

const CHUNK_SIZE = 50; // adjust if needed
const upload = multer({ storage: multer.memoryStorage() });
const LOCAL_FILE = path.join(process.cwd(), "alljournals", "journals.json");

const apiRoute = nextConnect({
  onError(error, req, res) {
    console.error("API error:", error);
    res.status(500).json({ error: error.message || "Server error" });
  },
  onNoMatch(req, res) {
    res.status(405).json({ error: `Method ${req.method} not allowed` });
  },
});

apiRoute.use(upload.single("file"));

function normalizeISSN(issn) {
  if (!issn) return null;
  return issn.toString().trim().replace(/[^0-9Xx]/g, "").toUpperCase();
}

// Helper: push a chunk to GitHub
async function pushChunkToGitHub(journalsChunk, octokit, owner, repo, pathInRepo, prevSha) {
  const base64Content = Buffer.from(JSON.stringify(journalsChunk, null, 2)).toString("base64");
  const commitMessage = `Update journals.json chunk (${new Date().toISOString()})`;
  const options = {
    owner,
    repo,
    path: pathInRepo,
    message: commitMessage,
    content: base64Content,
  };
  if (prevSha) options.sha = prevSha;

  const result = await octokit.repos.createOrUpdateFileContents(options);
  return result.data.content.sha;
}

// ===============================
// POST handler: upload Excel
// ===============================
apiRoute.post(async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: "No file uploaded." });

    const workbook = XLSX.read(file.buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const totalRows = XLSX.utils.sheet_to_json(sheet, { header: 1 }).length - 1; // minus header row

    const isServerless = !!process.env.GITHUB_TOKEN;

    let allJournals = []; // for local storage
    let prevSha = null;

    if (isServerless) {
      const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
      const owner = "hslill";
      const repo = "journal-tracker";
      const pathInRepo = "alljournals/journals.json";

      // Get current SHA for the first commit
      const { data: currentFile } = await octokit.repos.getContent({ owner, repo, path: pathInRepo });
      prevSha = currentFile.sha;

      // Process in chunks
      for (let start = 0; start < totalRows; start += CHUNK_SIZE) {
        const end = Math.min(start + CHUNK_SIZE, totalRows);
        const chunkRows = XLSX.utils.sheet_to_json(sheet, { range: `${start + 1}:${end}` }); // skip header row

        const journalsChunk = chunkRows
          .filter(r => r.Title && r.ISSN)
          .map(r => ({ title: r.Title.toString().trim(), issn: normalizeISSN(r.ISSN) }))
          .filter(j => j.issn);

        if (!journalsChunk.length) continue;

        // Commit this chunk
        prevSha = await pushChunkToGitHub(journalsChunk, octokit, owner, repo, pathInRepo, prevSha);
      }

      return res.status(200).json({ success: true, count: totalRows, source: "GitHub" });
    } else {
      // Local Node.js: read all, merge, and overwrite
      const data = XLSX.utils.sheet_to_json(sheet);
      allJournals = data
        .filter(r => r.Title && r.ISSN)
        .map(r => ({ title: r.Title.toString().trim(), issn: normalizeISSN(r.ISSN) }))
        .filter(j => j.issn);

      fs.writeFileSync(LOCAL_FILE, JSON.stringify(allJournals, null, 2));
      return res.status(200).json({ success: true, count: allJournals.length, source: "local" });
    }
  } catch (err) {
    console.error("Excel upload error:", err);
    return res.status(500).json({ error: err.message || "Unknown server error" });
  }
});

export default apiRoute;
export const config = { api: { bodyParser: false } };
