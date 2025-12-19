"use client";

import React, { useState, useEffect } from "react";
import styles from "../styles/Home.module.css";

export default function Home() {
  // --- State ---
  const [allJournals, setAllJournals] = useState([]);
  const [filteredJournals, setFilteredJournals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [updatedOnly, setUpdatedOnly] = useState(false);
  const [activeLetter, setActiveLetter] = useState("All");
  const [expandAll, setExpandAll] = useState(false);
  const [updateMessage, setUpdateMessage] = useState("No updates yet.");
  const [autoUpdateIntervalId, setAutoUpdateIntervalId] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: "changed", asc: false });

  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

  // --- Fetch journals from Firestore API ---
  async function fetchJournals() {
    setLoading(true);
    try {
      const res = await fetch("/api/alljournals");
      if (!res.ok) throw new Error(`HTTP error! Status: ${res.status}`);
      const data = await res.json();

      const mapped = data.map((j) => ({
        issn: j.issn,
        title: j.title,
        previousTitle: j.oldTitle || null,
        changed: j.oldTitle && j.oldTitle !== j.title,
        dateChecked: new Date().toISOString().split("T")[0],
        expanded: false,
      }));

      setAllJournals(mapped);
      setFilteredJournals(mapped);
      return mapped; // return for auto-update comparison
    } catch (err) {
      console.error("Error fetching journals:", err);
      alert("Error fetching journals: " + err.message);
      return [];
    } finally {
      setLoading(false);
    }
  }

  // --- Auto-update with logging ---
  async function autoUpdateWithLogging() {
    const oldTitles = allJournals.map((j) => ({ issn: j.issn, title: j.title }));

    const newJournals = await fetchJournals();

    const hasChanges = newJournals.some((j) => {
      const old = oldTitles.find((o) => o.issn === j.issn);
      return old && old.title !== j.title;
    });

    const now = new Date().toLocaleString();
    setUpdateMessage(
      hasChanges ? `New Update since ${now}` : `No changes at ${now}`
    );
  }

  // --- Apply filters & sorting ---
  function applyFilters() {
    let filtered = [...allJournals];

    if (search.trim()) {
      filtered = filtered.filter(
        (j) =>
          j.issn.includes(search.trim()) ||
          j.title.toLowerCase().includes(search.toLowerCase())
      );
    }

    if (fromDate) {
      filtered = filtered.filter(
        (j) => new Date(j.dateChecked) >= new Date(fromDate)
      );
    }

    if (toDate) {
      filtered = filtered.filter(
        (j) => new Date(j.dateChecked) <= new Date(toDate)
      );
    }

    if (updatedOnly) filtered = filtered.filter((j) => j.changed);

    if (activeLetter !== "All") {
      filtered = filtered.filter(
        (j) => j.title && j.title[0].toUpperCase() === activeLetter
      );
    }

    // Sorting
    if (sortConfig.key) {
      filtered.sort((a, b) => {
        let valA = a[sortConfig.key];
        let valB = b[sortConfig.key];

        if (sortConfig.key === "changed") {
          valA = a.changed ? 1 : 0;
          valB = b.changed ? 1 : 0;
        } else {
          valA = valA?.toString().toLowerCase() || "";
          valB = valB?.toString().toLowerCase() || "";
        }

        if (valA < valB) return sortConfig.asc ? -1 : 1;
        if (valA > valB) return sortConfig.asc ? 1 : -1;
        return 0;
      });
    }

    setFilteredJournals(filtered);
  }

  // --- CSV Export ---
  function downloadCSV(filename, journals) {
    const header = ["ISSN", "Title", "Previous Title", "Status"];
    const rows = journals.map((j) => [
      j.issn,
      j.title,
      j.previousTitle || "",
      j.changed ? "Updated" : "Unchanged",
    ]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // --- Row expand/collapse ---
  function toggleRowExpansion(index) {
    const updated = [...filteredJournals];
    updated[index].expanded = !updated[index].expanded;
    setFilteredJournals(updated);
  }

  function toggleExpandAllRows() {
    const updated = filteredJournals.map((j) => ({ ...j, expanded: !expandAll }));
    setFilteredJournals(updated);
    setExpandAll(!expandAll);
  }

  // --- A-Z index ---
  function handleLetterClick(letter) {
    setActiveLetter(letter);
  }

  // --- Sorting handler ---
  function handleSort(key) {
    setSortConfig((prev) => ({
      key,
      asc: prev.key === key ? !prev.asc : true,
    }));
  }

  // --- Metrics ---
  const total = filteredJournals.length;
  const updated = filteredJournals.filter((j) => j.changed).length;
  const unchanged = total - updated;

  // --- Effects ---
  useEffect(() => {
    fetchJournals();
  }, []);

  useEffect(() => {
    applyFilters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, fromDate, toDate, updatedOnly, activeLetter, allJournals, sortConfig]);

  return (
    <div className={styles.container}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
        <img
          src="https://d2jv02qf7xgjwx.cloudfront.net/accounts/129950/images/NYUL-Health_logo_Purple_RGB_300ppi.png"
          alt="NYU Langone Health"
          style={{ height: "auto", width: 200 }}
        />
        <span style={{ fontSize: "1rem", color: "#555" }}>
          <strong>Health Sciences Library</strong>
        </span>
      </div>

      <h1>Journal Title Tracker</h1>
      <p>Track changes in the journal titles over time.</p>

      {/* Controls */}
      <div className={styles.controls}>
        <button onClick={autoUpdateWithLogging}>Update</button>
        <select
          value={autoUpdateIntervalId || 0}
          onChange={(e) => {
            const ms = parseInt(e.target.value, 10);
            if (autoUpdateIntervalId) clearInterval(autoUpdateIntervalId);
            if (ms > 0) {
              const id = setInterval(autoUpdateWithLogging, ms);
              setAutoUpdateIntervalId(id);
            } else {
              setAutoUpdateIntervalId(null);
            }
          }}
        >
          <option value="0">Off</option>
          <option value="30000">30 seconds</option>
          <option value="60000">1 minute</option>
          <option value="3600000">1 hour</option>
          <option value="86400000">1 day</option>
        </select>
        <span>{updateMessage}</span>
      </div>

      <div className={styles.controls}>
        <input
          type="text"
          placeholder="Search ISSN or Title"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        <label>
          Updated only
          <input
            type="checkbox"
            checked={updatedOnly}
            onChange={(e) => setUpdatedOnly(e.target.checked)}
          />
        </label>
        <button onClick={() => downloadCSV("all_journals.csv", filteredJournals)}>Export CSV</button>
        <button
          onClick={() =>
            downloadCSV(
              "changes_only.csv",
              filteredJournals.filter((j) => j.changed)
            )
          }
        >
          Export Changes Only
        </button>
      </div>

      {/* Dashboard */}
      <div className={styles.dashboard}>
        <div className={styles.metric}>
          <span className={styles.metricValue}>{total}</span>
          <span className={styles.metricLabel}>Total Journals</span>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricValue}>{updated}</span>
          <span className={styles.metricLabel}>Updated</span>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricValue}>{unchanged}</span>
          <span className={styles.metricLabel}>Unchanged</span>
        </div>
      </div>

      {/* A-Z Index */}
      <div className={styles.indexBar}>
        <button
          className={activeLetter === "All" ? styles.activeIndex : ""}
          onClick={() => handleLetterClick("All")}
        >
          All
        </button>
        {alphabet.map((l) => (
          <button
            key={l}
            className={activeLetter === l ? styles.activeIndex : ""}
            onClick={() => handleLetterClick(l)}
          >
            {l}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading && <div>Loading journals...</div>}
      <table className={styles.table}>
        <thead>
          <tr>
            <th onClick={() => handleSort("issn")}>ISSN</th>
            <th onClick={() => handleSort("title")}>Title</th>
            <th onClick={() => handleSort("previousTitle")}>Previous Title</th>
            <th onClick={() => handleSort("changed")}>Status</th>
          </tr>
        </thead>
        <tbody>
          {filteredJournals.map((j, i) => (
            <React.Fragment key={j.issn}>
              <tr className={j.changed ? styles.changedRow : styles.unchangedRow}>
                <td>{j.issn}</td>
                <td title={j.title}><span className={styles.truncate}>{j.title}</span></td>
                <td>{j.previousTitle || "-"}</td>
                <td>
                  <span className={j.changed ? styles.statusUpdated : styles.statusUnchanged}>
                    {j.changed ? "Updated" : "Unchanged"}
                  </span>
                  <button onClick={() => toggleRowExpansion(i)}>
                    {j.expanded ? "▾" : "▸"}
                  </button>
                </td>
              </tr>
              {j.expanded && (
                <tr className={styles.detailsRow}>
                  <td colSpan={4}>
                    <div className={styles.details}>
                      <div><strong>ISSN:</strong> {j.issn}</div>
                      <div><strong>Previous Title:</strong> {j.previousTitle || "-"}</div>
                      <div><strong>Last Checked:</strong> {j.dateChecked || "-"}</div>
                    </div>
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>

      <button onClick={toggleExpandAllRows}>
        {expandAll ? "Collapse All" : "Expand All"}
      </button>

      {/* Stats */}
      <div>
        <strong>Total:</strong> {total} | <strong>Updated:</strong> {updated} | <strong>Unchanged:</strong> {unchanged}
      </div>
    </div>
  );
}
