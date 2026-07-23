"use client";

import { useState } from "react";

export default function B2bDemoPage() {
  const [apiKey, setApiKey] = useState("syncraft_test_abcd123");
  const [imageUrl, setImageUrl] = useState("");
  const [mode, setMode] = useState("keep_artwork");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleTestApi = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/v1/generate", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          image_url: imageUrl,
          mode: mode 
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to generate");
      }

      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: "40px", maxWidth: "800px", margin: "0 auto", fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: "2rem", marginBottom: "10px" }}>B2B API Simulator</h1>
      <p style={{ color: "#666", marginBottom: "30px" }}>
        This page simulates what your B2B clients will do. They will send their API Key, an Image URL, and a Feature Mode to your backend.
      </p>

      <form onSubmit={handleTestApi} style={{ display: "flex", flexDirection: "column", gap: "20px", background: "#f9f9f9", padding: "20px", borderRadius: "12px", border: "1px solid #ddd" }}>
        
        <div>
          <label style={{ display: "block", fontWeight: "bold", marginBottom: "5px" }}>B2B API Key (Bearer Token)</label>
          <input
            type="text"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #ccc" }}
            required
          />
        </div>

        <div>
          <label style={{ display: "block", fontWeight: "bold", marginBottom: "5px" }}>Source Image URL</label>
          <input
            type="url"
            placeholder="https://example.com/jersey.jpg"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #ccc" }}
            required
          />
        </div>

        <div>
          <label style={{ display: "block", fontWeight: "bold", marginBottom: "5px" }}>Feature Mode</label>
          <select 
            value={mode} 
            onChange={(e) => setMode(e.target.value)}
            style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #ccc", background: "white" }}
          >
            <option value="keep_artwork">Garment Trace (Keep All Artwork) - 40 Credits</option>
            <option value="extract_pattern">Garment Trace (Extract Pattern Only) - 40 Credits</option>
            <option value="logo_trace">Logo / Wordmark Trace - 40 Credits</option>
            <option value="bg_remover">Background Remover (Fast) - 5 Credits</option>
          </select>
        </div>

        <button 
          type="submit" 
          disabled={loading}
          style={{ 
            padding: "15px", 
            background: loading ? "#999" : "#0070f3", 
            color: "white", 
            border: "none", 
            borderRadius: "6px", 
            fontWeight: "bold",
            cursor: loading ? "not-allowed" : "pointer",
            marginTop: "10px"
          }}
        >
          {loading ? "Generating (This takes 30-60s)..." : "Send API Request"}
        </button>
      </form>

      {error && (
        <div style={{ marginTop: "30px", padding: "20px", background: "#fee2e2", color: "#991b1b", borderRadius: "8px" }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {result && (
        <div style={{ marginTop: "30px", padding: "20px", background: "#dcfce7", color: "#166534", borderRadius: "8px" }}>
          <h2 style={{ marginBottom: "15px", color: "#166534" }}>Success! (Charged {result.credits_charged} Credits)</h2>
          <p><strong>Company:</strong> {result.company}</p>
          <p><strong>Mode Used:</strong> {result.mode}</p>
          <p style={{ marginTop: "10px", marginBottom: "10px" }}><strong>Final {result.type === 'image/png' ? 'PNG' : 'Vector'} Output:</strong></p>
          
          <div style={{ padding: "20px", background: "url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMUlEQVQ4T2NkYNgfQEhD/oMBQww0oJGRgUGMgTpg1ICRDAyjwXAwgGDAaDAYDAaDGABf+jPjGzUjBwAAAABJRU5ErkJggg==')" }}>
            <img 
              src={result.image_url} 
              alt="Final Output" 
              style={{ maxWidth: "100%", borderRadius: "8px", border: "1px solid #166534", display: "block" }} 
            />
          </div>
        </div>
      )}
    </div>
  );
}
