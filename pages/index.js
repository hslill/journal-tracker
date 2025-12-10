import { useState, useEffect, useRef } from "react";

export default function Home() {
  const [allJournals, setAllJournals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [updatedOnly, setUpdatedOnly] = useState(false);

  const fileInputRef = useRef(null);

  // Fetch journals
  const fetchJournals = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/alljournals");
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = await res.json();
      const mapped = data.map(j => ({
        issn: j.issn,
        title: j.title,
        previousTitle: j.oldTitle || null,
        changed: j.oldTitle && j.oldTitle !== j.title,
        dateChecked: new Date().toISOString().split("T")[0]
      }));
      setAllJournals(mapped);
    } catch (err) {
      console.error("Error fetching journals:", err);
      alert("Error fetching journals: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJournals();
  }, []);

  // Upload Excel
  const handleUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload-excel", {
        method: "POST",
        body: formData
      });

      const text = await res.text();
      let result;
      try {
        result = JSON.parse(text);
      } catch {
        throw new Error(`Server reply was not JSON: ${text}`);
      }

      if (!res.ok) {
        throw new Error(result?.error || `Server error: ${res.status}`);
      }

      alert(
        `Excel uploaded!\n` +
        `${result.count ?? 0} journals updated.` +
        (result.mergedCount ? `\nMerged: ${result.mergedCount}` : "")
      );

      fetchJournals();
    } catch (err) {
      console.error("Error uploading Excel:", err);
      alert("Error uploading Excel file: " + err.message);
    } finally {
      fileInputRef.current.value = "";
      setLoading(false);
    }
  };

  // Filtering
  const filteredJournals = allJournals.filter(j => {
    let match = true;
    if (searchQuery) {
      match = j.issn.includes(searchQuery) || j.title.toLowerCase().includes(searchQuery.toLowerCase());
    }
    if (match && fromDate) match = new Date(j.dateChecked) >= new Date(fromDate);
    if (match && toDate) match = new Date(j.dateChecked) <= new Date(toDate);
    if (match && updatedOnly) match = j.changed;
    return match;
  });

  // CSV export
  const downloadCSV = (filename, journals) => {
    const header = ['ISSN','Title','Previous Title','Status'];
    const rows = journals.map(j => [j.issn, j.title, j.previousTitle || '', j.changed ? 'Updated' : 'Unchanged']);
    const csv = [header, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ margin: "20px", fontFamily: "Segoe UI, Tahoma, Geneva, Verdana, sans-serif" }}>
      <h1>Journal Title Tracker</h1>
      <p>Track changes in the journal titles over time.</p>

      <button onClick={fetchJournals} disabled={loading}>Update</button>

      <div style={{ margin: "15px 0" }}>
        <input type="text" placeholder="Search ISSN or Title" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
        <label>From: <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} /></label>
        <label>To: <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} /></label>
        <label>Updated only <input type="checkbox" checked={updatedOnly} onChange={e => setUpdatedOnly(e.target.checked)} /></label>
        <button onClick={() => downloadCSV("all_journals.csv", filteredJournals)}>Export CSV</button>
        <button onClick={() => downloadCSV("changes_only.csv", filteredJournals.filter(j => j.changed))}>Export Changes Only</button>
        <label style={{ cursor: "pointer", color: "blue", textDecoration: "underline" }}>
          Update Collection
          <input type="file" ref={fileInputRef} style={{ display: "none" }} accept=".xlsx" onChange={handleUpload} />
        </label>
      </div>

      {loading && <div style={{ fontWeight: "bold", margin: "10px 0" }}>Loading journals...</div>}

      <div style={{ margin: "10px 0", fontWeight: "bold" }}>
        <strong>Total:</strong> {filteredJournals.length} | 
        <strong> Updated:</strong> {filteredJournals.filter(j => j.changed).length} | 
        <strong> Unchanged:</strong> {filteredJournals.filter(j => !j.changed).length}
      </div>

      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr style={{ backgroundColor: "#f4f4f4" }}>
            <th style={{ border: "1px solid #ccc", padding: "8px" }}>ISSN</th>
            <th style={{ border: "1px solid #ccc", padding: "8px" }}>Title</th>
            <th style={{ border: "1px solid #ccc", padding: "8px" }}>Previous Title</th>
            <th style={{ border: "1px solid #ccc", padding: "8px" }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {filteredJournals.map((j, idx) => (
            <tr key={idx} style={{ backgroundColor: j.changed ? "#ffeb3b" : "transparent" }}>
              <td style={{ border: "1px solid #ccc", padding: "8px" }}>{j.issn}</td>
              <td style={{ border: "1px solid #ccc", padding: "8px" }}>{j.title}</td>
              <td style={{ border: "1px solid #ccc", padding: "8px" }}>{j.previousTitle || "-"}</td>
              <td style={{ border: "1px solid #ccc", padding: "8px" }}>{j.changed ? "Updated" : "Unchanged"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
