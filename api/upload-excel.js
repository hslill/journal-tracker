import { Octokit } from "@octokit/rest";
import multer from "multer";
import XLSX from "xlsx";
import nextConnect from "next-connect";

// Multer in-memory storage
const upload = multer({ storage: multer.memoryStorage() });

const apiRoute = nextConnect({
  onError(error, req, res) {
    res.status(500).json({ error: error.message });
  },
  onNoMatch(req, res) {
    res.status(405).json({ error: `Method ${req.method} not allowed` });
  },
});

apiRoute.use(upload.single("file"));

apiRoute.post(async (req, res) => {
  try {
    const file = req.file;
    if (!file) throw new Error("No file uploaded");

    const workbook = XLSX.read(file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet);

    function normalizeISSN(issn) {
      if (!issn) return null;
      return issn.replace(/[^0-9Xx]/g, "").toUpperCase();
    }

    const journals = data
      .filter((row) => row.Title && row.ISSN)
      .map((row) => ({
        title: row.Title.trim(),
        issn: normalizeISSN(row.ISSN),
      }))
      .filter((j) => j.issn);

    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
    const owner = "hslill";
    const repo = "journal-tracker";
    const pathInRepo = "alljournals/journals.json";

    const { data: currentFile } = await octokit.repos.getContent({
      owner,
      repo,
      path: pathInRepo,
    });

    const base64Content = Buffer.from(JSON.stringify(journals, null, 2)).toString("base64");

    await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: pathInRepo,
      message: `Update journals.json via web upload (${new Date().toISOString()})`,
      content: base64Content,
      sha: currentFile.sha,
    });

    res.status(200).json({ success: true, count: journals.length });
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default apiRoute;
export const config = { api: { bodyParser: false } };
