import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clipboard,
  Download,
  FileText,
  HardDrive,
  Loader2,
  MonitorSmartphone,
  RotateCcw,
  Search,
  Table2,
  UploadCloud,
  Wifi,
  WifiOff,
  X
} from "lucide-react";
import { uploadFile } from "./api.js";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_TYPES = ".pdf,.docx,.txt,.csv,.xls,.xlsx,.png,.jpg,.jpeg";
const FORMAT_LABELS = ["PDF", "DOCX", "TXT", "CSV", "Excel", "JPG", "PNG"];

export default function App() {
  const [result, setResult] = useState(null);
  const [fileName, setFileName] = useState("");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [dragging, setDragging] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [fileUrl, setFileUrl] = useState(null);
  const inputRef = useRef(null);

  const isLoading = status === "loading";
  const hasResult = Boolean(result);
  const title = fileName || "Open a document";
  const summary = useMemo(() => getSummary(result), [result]);
  const matches = useMemo(() => countMatches(result, query), [result, query]);

  useEffect(() => {
    function handleInstallPrompt(event) {
      event.preventDefault();
      setInstallPrompt(event);
    }

    function handleOnline() {
      setOnline(true);
    }

    function handleOffline() {
      setOnline(false);
    }

    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    if ("launchQueue" in window) {
      window.launchQueue.setConsumer(async (launchParams) => {
        if (launchParams.files && launchParams.files.length > 0) {
          const fileHandle = launchParams.files[0];
          const file = await fileHandle.getFile();
          handleFile(file);
        }
      });
    }
  }, []);

  async function handleFile(file) {
    if (!file) return;

    if (file.size > MAX_FILE_SIZE) {
      setError("File is too large. Maximum size is 10 MB.");
      return;
    }

    setFileName(file.name);
    setResult(null);
    setError("");
    setQuery("");
    setStatus("loading");

    try {
      const payload = await uploadFile(file);
      
      if (fileUrl) URL.revokeObjectURL(fileUrl);
      const url = URL.createObjectURL(file);
      setFileUrl(url);
      
      setResult(payload);
      setStatus("ready");
    } catch (err) {
      setError(err.message);
      setStatus("idle");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleInstall() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    setInstallPrompt(null);
  }

  async function handleCopy() {
    if (!result) return;
    const content = result.kind === "table" ? tableToCsv(result.table.rows) : result.text;
    await navigator.clipboard.writeText(content);
  }

  function handleDownload() {
    if (!result) return;
    const isTable = result.kind === "table";
    const content = isTable ? tableToCsv(result.table.rows) : result.text;
    const extension = isTable ? "csv" : "txt";
    const blob = new Blob([content], { type: isTable ? "text/csv" : "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${withoutExtension(result.fileName)}.${extension}`;
    link.click();
    URL.revokeObjectURL(url);
  }

    if (fileUrl) URL.revokeObjectURL(fileUrl);
    setFileUrl(null);
    setResult(null);
    setFileName("");
    setStatus("idle");
    setError("");
    setQuery("");
  }

  function handleDrop(event) {
    event.preventDefault();
    setDragging(false);
    handleFile(event.dataTransfer.files?.[0]);
  }

  return (
    <main className="site-shell">
      <header className="app-header">
        <div className="brand-block">
          <div className="brand-mark">
            <FileText size={22} aria-hidden="true" />
          </div>
          <div>
            <p className="eyebrow">Local document reader</p>
            <h1>Doc Reader</h1>
          </div>
        </div>

        <div className="header-actions">
          <span className={`status-pill ${online ? "online" : "offline"}`}>
            {online ? <Wifi size={15} aria-hidden="true" /> : <WifiOff size={15} aria-hidden="true" />}
            {online ? "Online" : "Offline"}
          </span>
          {installPrompt && (
            <button className="ghost-button" type="button" onClick={handleInstall}>
              <MonitorSmartphone size={17} aria-hidden="true" />
              Install
            </button>
          )}
        </div>
      </header>

      <section className="workspace">
        <section
          className={`upload-zone ${dragging ? "dragging" : ""}`}
          onDragEnter={() => setDragging(true)}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
        >
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_TYPES}
            onChange={(event) => handleFile(event.target.files?.[0])}
            hidden
          />

          <div className="upload-art">
            {isLoading ? <Loader2 className="spin" size={30} aria-hidden="true" /> : <UploadCloud size={30} aria-hidden="true" />}
          </div>

          <div className="upload-content">
            <h2>{title}</h2>
            <p>{summary}</p>
          </div>

          <button className="primary-button" type="button" onClick={() => inputRef.current?.click()} disabled={isLoading}>
            {isLoading ? <Loader2 className="spin" size={18} aria-hidden="true" /> : <UploadCloud size={18} aria-hidden="true" />}
            Choose file
          </button>

          <div className="format-row" aria-label="Supported formats">
            {FORMAT_LABELS.map((format) => (
              <span key={format}>{format}</span>
            ))}
          </div>
        </section>

        <aside className="document-panel">
          <div className="panel-heading">
            <h2>Document</h2>
            {hasResult && (
              <button className="icon-button" type="button" onClick={resetReader} aria-label="Clear document">
                <X size={18} aria-hidden="true" />
              </button>
            )}
          </div>

          <div className="document-meta">
            <MetaItem icon={<FileText size={18} />} label="File" value={fileName || "No file selected"} />
            <MetaItem icon={<HardDrive size={18} />} label="Size" value={result ? formatBytes(result.size) : "Up to 10 MB"} />
            <MetaItem
              icon={result?.kind === "table" ? <Table2 size={18} /> : <CheckCircle2 size={18} />}
              label="Content"
              value={summary}
            />
          </div>
        </aside>
      </section>

      {error && (
        <div className="notice error" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      <section className="reader-shell">
        <div className="reader-toolbar">
          <div className="toolbar-title">
            {result?.kind === "table" ? <Table2 size={19} aria-hidden="true" /> : <FileText size={19} aria-hidden="true" />}
            <div>
              <h2>{result?.kind === "table" ? "Table preview" : "Text preview"}</h2>
              {result?.stats?.truncated && <p>Showing the first 1,000 rows</p>}
            </div>
          </div>

          <div className="toolbar-actions">
            <label className="search-box">
              <Search size={17} aria-hidden="true" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search"
                disabled={!hasResult}
              />
              {query && <span>{matches}</span>}
            </label>

            <button className="tool-button" type="button" onClick={handleCopy} disabled={!hasResult}>
              <Clipboard size={17} aria-hidden="true" />
              Copy
            </button>
            <button className="tool-button" type="button" onClick={handleDownload} disabled={!hasResult}>
              <Download size={17} aria-hidden="true" />
              Export
            </button>
            <button className="icon-button subtle" type="button" onClick={resetReader} disabled={!hasResult} aria-label="Reset reader">
              <RotateCcw size={17} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="reader-body">
          {isLoading ? <LoadingState /> : <Preview result={result} query={query} fileUrl={fileUrl} />}
        </div>
      </section>
    </main>
  );
}

function MetaItem({ icon, label, value }) {
  return (
    <div className="meta-item">
      <div className="meta-icon" aria-hidden="true">
        {icon}
      </div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="loading-state">
      <Loader2 className="spin" size={26} aria-hidden="true" />
      <span>Processing document</span>
    </div>
  );
}

function Preview({ result, query, fileUrl }) {
  if (!result) {
    return (
      <div className="empty-state">
        <FileText size={34} aria-hidden="true" />
        <p>Choose a document to start reading.</p>
      </div>
    );
  }

  // Use native high-fidelity viewer for PDF and Images
  if (result.mimeType === "application/pdf" || result.mimeType.startsWith("image/")) {
    return (
      <div className="native-viewer">
        <object data={fileUrl} type={result.mimeType} width="100%" height="100%">
          <embed src={fileUrl} type={result.mimeType} />
        </object>
      </div>
    );
  }

  if (result.kind === "table") {
    return <TablePreview table={result.table} query={query} />;
  }

  return <pre className="text-preview">{renderHighlightedText(result.text, query)}</pre>;
}

function TablePreview({ table, query }) {
  const rows = table.rows;
  const columnCount = Math.max(...rows.map((row) => row.length));

  return (
    <div className="table-wrap" role="region" aria-label={`${table.sheetName} table`}>
      <table>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {Array.from({ length: columnCount }, (_, columnIndex) => (
                <td key={columnIndex}>{renderHighlightedText(row[columnIndex] || "", query)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderHighlightedText(text, query) {
  if (!query.trim()) return text;

  const parts = text.split(new RegExp(`(${escapeRegExp(query.trim())})`, "gi"));
  return parts.map((part, index) =>
    part.toLowerCase() === query.trim().toLowerCase() ? <mark key={`${part}-${index}`}>{part}</mark> : part
  );
}

function countMatches(result, query) {
  if (!result || !query.trim()) return 0;
  const content = result.kind === "table" ? result.table.rows.flat().join("\n") : result.text;
  return content.match(new RegExp(escapeRegExp(query.trim()), "gi"))?.length || 0;
}

function getSummary(result) {
  if (!result) return "PDF, Word, text, images, CSV, and spreadsheets";
  if (result.kind === "table") {
    return `${result.stats.rows.toLocaleString()} rows and ${result.stats.columns.toLocaleString()} columns`;
  }
  return `${result.stats.characters.toLocaleString()} characters across ${result.stats.lines.toLocaleString()} lines`;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "Unknown";
  const units = ["B", "KB", "MB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function tableToCsv(rows) {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const value = String(cell ?? "");
          return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
        })
        .join(",")
    )
    .join("\n");
}

function withoutExtension(name) {
  return name.replace(/\.[^/.]+$/, "") || "document";
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
