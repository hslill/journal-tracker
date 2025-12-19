import React, { useState, useEffect } from "react";
import styles from "../styles/Home.module.css";

export default function Home() {
  const [allJournals, setAllJournals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [updatedOnly, setUpdatedOnly] = useState(false);
  
// pages/index.js
async function fetchJournals() {
  setLoading(true);
  try {
    // ✅ relative path, works in dev and production
    const res = await fetch("/api/alljournals");

    if (!res.ok) throw new Error(`Server returned ${res.status}`);

    const data = await res.json();

    const mapped = data.map(j => ({
      issn: j.issn,
      title: j.title,
      previousTitle: j.oldTitle || null,
      changed: j.oldTitle && j.oldTitle !== j.title,
      dateChecked: new Date().toISOString().split("T")[0],
    }));

    setAllJournals(mapped);
  } catch (err) {
    console.error("Error fetching journals:", err);
    alert("Error fetching journals: " + err.message);
  } finally {
    setLoading(false);
  }
}

  useEffect(() => {
    fetchJournals();
  }, []);

  function applyFilters() {
    return allJournals
      .filter(j => 
        (!search || j.issn.includes(search) || j.title.toLowerCase().includes(search.toLowerCase()))
      )
      .filter(j => !fromDate || new Date(j.dateChecked) >= new Date(fromDate))
      .filter(j => !toDate || new Date(j.dateChecked) <= new Date(toDate))
      .filter(j => !updatedOnly || j.changed);
  }

  function downloadCSV(filename, journals) {
    const header = ["ISSN", "Title", "Previous Title", "Status"];
    const rows = journals.map(j => [
      j.issn, j.title, j.previousTitle || "", j.changed ? "Updated" : "Unchanged"
    ]);
    const csv = [header, ...rows].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload-excel", { method: "POST", body: formData });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || `Server returned ${res.status}`);
      alert(`Excel uploaded! ${result.count ?? 0} journals updated.`);
      await fetchJournals();
    } catch (err) {
      alert("Upload failed: " + err.message);
      console.error(err);
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  }

  const filtered = applyFilters();

  return (
  <div className={styles.container}>
    <h1>Journal Title Tracker</h1>
    <p>Track changes in the journal titles over time.</p>

    <button onClick={fetchJournals}>Update</button>

    <div className={styles.controls}>
      <input
        placeholder="Search ISSN or Title"
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
      <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} />

      <label>
        Updated only
        <input
          type="checkbox"
          checked={updatedOnly}
          onChange={e => setUpdatedOnly(e.target.checked)}
        />
      </label>

      <button onClick={() => downloadCSV("all_journals.csv", filtered)}>Export CSV</button>
      <button onClick={() => downloadCSV("changes_only.csv", filtered.filter(j => j.changed))}>
        Export Changes Only
      </button>

      <label className={styles.fileUploadLabel}>
        Update Collection
        <input type="file" style={{ display: "none" }} onChange={handleUpload} />
      </label>
    </div>

    {loading && <div>Loading journals...</div>}

    <table className={styles.table}>
      <thead>
        <tr>
          <th>ISSN</th>
          <th>Title</th>
          <th>Previous Title</th>
          <th>Status</th>
        </tr>
      </thead>

      <tbody>
        {filtered.map(j => (
          <tr
            key={j.issn}
            className={j.changed ? styles.changedRow : ""}
          >
            <td>{j.issn}</td>
            <td>{j.title}</td>
            <td>{j.previousTitle || "-"}</td>
            <td>{j.changed ? "Updated" : "Unchanged"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);
}
