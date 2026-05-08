import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clipboard,
  Download,
  FileText,
  HardDrive,
  Leaf,
  Loader2,
  MonitorSmartphone,
  RotateCcw,
  Search,
  Table2,
  UploadCloud,
  Wifi,
  WifiOff,
  X,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import { uploadFile } from "./api.js";
import { renderAsync } from "docx-preview";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { App as CapacitorApp } from "@capacitor/app";
import { Filesystem } from "@capacitor/filesystem";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_TYPES = ".pdf,.docx,.txt,.csv,.xls,.xlsx,.xlsm,.png,.jpg,.jpeg";
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
  const [currentFile, setCurrentFile] = useState(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [zoom, setZoom] = useState(typeof window !== "undefined" && window.innerWidth < 760 ? 0.45 : 1);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1);
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
    setCurrentMatchIndex(matches > 0 ? 0 : -1);
  }, [query, matches]);

  useEffect(() => {
    if (!query || currentMatchIndex === -1) return;
    
    const timer = setTimeout(() => {
      const marks = document.querySelectorAll('mark.search-match');
      document.querySelectorAll('mark.search-match.active').forEach(m => m.classList.remove('active'));
      
      if (marks.length > 0 && currentMatchIndex < marks.length) {
        const activeMark = marks[currentMatchIndex];
        if (activeMark) {
          activeMark.classList.add('active');
          activeMark.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }, 100);
    
    return () => clearTimeout(timer);
  }, [query, currentMatchIndex, result]);

  useEffect(() => {
    async function checkSharedFile() {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get("shared") === "true") {
        try {
          const cache = await caches.open("shared-files");
          const response = await cache.match("/shared-file");
          if (response) {
            const blob = await response.blob();
            const fileName = decodeURIComponent(response.headers.get("X-File-Name") || "shared-document");
            const file = new File([blob], fileName, { type: blob.type });
            handleFile(file);
            await cache.delete("/shared-file");
            // Remove the ?shared=true from URL without reloading
            window.history.replaceState({}, document.title, window.location.pathname);
          }
        } catch (err) {
          console.error("Error loading shared file:", err);
        }
      }
    }
    checkSharedFile();
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

  useEffect(() => {
    // 1. Android Intent Listener (Warm Start)
    const urlOpenListener = CapacitorApp.addListener("appUrlOpen", async (event) => {
      handleAndroidIntentUri(event.url);
    });

    // 2. Android Intent Check (Cold Start)
    const checkLaunch = async () => {
      const launchUrl = await CapacitorApp.getLaunchUrl();
      if (launchUrl && launchUrl.url) {
        handleAndroidIntentUri(launchUrl.url);
      }
    };
    checkLaunch();

    return () => {
      urlOpenListener.then((listener) => listener.remove());
    };
  }, []);

  const resetReader = useCallback(() => {
    if (fileUrl) URL.revokeObjectURL(fileUrl);
    setFileUrl(null);
    setCurrentFile(null);
    setResult(null);
    setFileName("");
    setStatus("idle");
    setError("");
    setQuery("");
    setZoom(window.innerWidth < 760 ? 0.45 : 1);
  }, [fileUrl]);

  useEffect(() => {
    // Android Hardware Back Button Listener
    const backButtonListener = CapacitorApp.addListener("backButton", () => {
      if (result || status !== "idle" || error) {
        resetReader();
      } else {
        CapacitorApp.exitApp();
      }
    });

    return () => {
      backButtonListener.then((listener) => listener.remove());
    };
  }, [result, status, error, resetReader]);

  function getMimeType(fileName) {
    const ext = fileName.split('.').pop().toLowerCase();
    const map = {
      'pdf': 'application/pdf',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'txt': 'text/plain',
      'csv': 'text/csv',
      'xls': 'application/vnd.ms-excel',
      'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'xlsm': 'application/vnd.ms-excel.sheet.macroEnabled.12',
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg'
    };
    return map[ext] || 'application/octet-stream';
  }

  async function handleAndroidIntentUri(uri) {
    if (uri.startsWith("content://") || uri.startsWith("file://")) {
      try {
        setStatus("loading");
        const contents = await Filesystem.readFile({ path: uri });
        
        let name = "Shared_Document";
        try {
           const statInfo = await Filesystem.stat({ path: uri });
           if (statInfo && statInfo.name) name = statInfo.name;
        } catch (e) {
           // Try extracting filename from the URI path itself
           try {
             const uriPath = decodeURIComponent(uri.split("?")[0]);
             const segments = uriPath.split("/");
             const lastSegment = segments[segments.length - 1];
             if (lastSegment && lastSegment.includes(".")) name = lastSegment;
           } catch (_) { /* ignore */ }
        }
        
        const mimeType = getMimeType(name);
        const res = await fetch(`data:${mimeType};base64,${contents.data}`);
        const blob = await res.blob();
        
        const file = new File([blob], name, { type: mimeType });
        handleFile(file);
      } catch (error) {
        console.error("Error reading incoming intent file:", error);
        setError("Failed to open the document from external app.");
        setStatus("idle");
      }
    }
  }

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
    setZoom(window.innerWidth < 760 ? 0.45 : 1);

    try {
      const payload = await uploadFile(file);
      
      if (fileUrl) URL.revokeObjectURL(fileUrl);
      const url = URL.createObjectURL(file);
      setFileUrl(url);
      setCurrentFile(file);
      
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

  function exportAs(format) {
    setShowExportMenu(false);
    if (!result) return;

    const isTable = result.kind === "table";
    const name = withoutExtension(result.fileName);

    if (format === "pdf") {
      const doc = new jsPDF();
      doc.text(name, 14, 15);
      
      if (isTable) {
        autoTable(doc, {
          head: [result.table.rows[0]],
          body: result.table.rows.slice(1),
          startY: 20,
          theme: 'grid',
          headStyles: { fillColor: [22, 163, 74] } // Green for Excel theme
        });
      } else {
        const splitText = doc.splitTextToSize(result.text || "No text available.", 180);
        let y = 25;
        for (let i = 0; i < splitText.length; i++) {
          if (y > 280) {
            doc.addPage();
            y = 20;
          }
          doc.text(splitText[i], 14, y);
          y += 6;
        }
      }
      doc.save(`${name}.pdf`);
      return;
    }

    let content = isTable ? tableToCsv(result.table.rows) : result.text;
    let mimeType = "text/plain";
    if (format === "csv") mimeType = "text/csv";
    
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${name}.${format}`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function handleDrop(event) {
    event.preventDefault();
    setDragging(false);
    handleFile(event.dataTransfer.files?.[0]);
  }

  const themeClass = getDocumentTheme(result);

  if (!hasResult) {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: "var(--color-g-bg)", fontFamily: "var(--font-sans)" }}>
        <header className="frosted organic-border fixed top-0 inset-x-0 z-50 h-16 flex items-center justify-between px-5"
          style={{ borderTop: 0, borderLeft: 0, borderRight: 0 }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: "var(--color-g-primary)", color: "#fff" }}>
              <FileText size={18} />
            </div>
            <span className="text-xl font-bold italic" style={{ color: "var(--color-g-primary)" }}>Doc Reader</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full organic-border"
              style={{ color: online ? "#16805f" : "#b4233a", background: "var(--color-g-surface)" }}>
              {online ? <Wifi size={13} /> : <WifiOff size={13} />}
              {online ? "Online" : "Offline"}
            </span>
            {installPrompt && (
              <button onClick={handleInstall}
                className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full organic-border tactile-active"
                style={{ background: "var(--color-g-surface)", color: "var(--color-g-primary)" }}>
                <MonitorSmartphone size={13} /> Install
              </button>
            )}
          </div>
        </header>
        <main className="flex-1 pt-24 pb-10 px-5 max-w-lg mx-auto w-full">
          <div className="text-center mb-8 mt-2">
            <h2 className="text-2xl font-semibold flex items-center justify-center gap-2 mb-1" style={{ color: "var(--color-g-ink)" }}>
              <Leaf size={22} style={{ color: "var(--color-g-primary)", opacity: 0.8 }} />
              Ready to read.
            </h2>
            <p className="text-sm font-medium" style={{ color: "var(--color-g-outline)" }}>Upload a document to begin.</p>
          </div>
          <section
            className="ghibli-card-lg p-8 flex flex-col items-center text-center cursor-pointer transition-all mb-6"
            style={{ borderStyle: "dashed", borderWidth: 2.5, borderColor: dragging ? "var(--color-g-primary)" : "var(--color-g-outline-light)", background: dragging ? "var(--color-g-primary-light)" : "var(--color-g-surface)" }}
            onDragEnter={() => setDragging(true)}
            onDragOver={(e) => e.preventDefault()}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
          >
            <input ref={inputRef} type="file" accept={ACCEPTED_TYPES}
              onChange={(e) => handleFile(e.target.files?.[0])} hidden />
            <div className="w-20 h-20 rounded-2xl flex items-center justify-center mb-5"
              style={{ background: "var(--color-g-primary-light)", color: "var(--color-g-primary)" }}>
              {isLoading ? <Loader2 size={36} className="spin" /> : <UploadCloud size={36} />}
            </div>
            <h3 className="text-xl font-bold mb-1" style={{ color: "var(--color-g-primary)" }}>
              {isLoading ? "Processing…" : "Tap or Drag & Drop"}
            </h3>
            <p className="text-sm mb-6" style={{ color: "var(--color-g-outline)" }}>
              PDF, DOCX, XLSX, CSV, TXT, PNG, JPG
            </p>
            <button
              className="flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm tactile-active"
              style={{ background: "var(--color-g-primary)", color: "#fff", boxShadow: "var(--shadow-ghibli)" }}
              type="button" disabled={isLoading}
              onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}>
              {isLoading ? <Loader2 size={16} className="spin" /> : <UploadCloud size={16} />}
              Choose file
            </button>
          </section>
          <div className="flex flex-wrap gap-2 justify-center mb-4">
            {FORMAT_LABELS.map((f) => (
              <span key={f} className="text-xs font-bold px-3 py-1.5 rounded-full"
                style={{ background: "var(--color-g-primary-light)", color: "var(--color-g-primary)" }}>{f}</span>
            ))}
          </div>
          {error && (
            <div className="flex items-center gap-2 mt-4 px-4 py-3 rounded-xl text-sm font-semibold"
              style={{ background: "#fff0f2", color: "#8b1e2d" }}>
              <AlertCircle size={16} /> {error}
            </div>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${themeClass}`} style={{ height: "100dvh", background: "var(--color-g-bg)", fontFamily: "var(--font-sans)" }}>
      <div className="frosted flex-shrink-0 z-40" style={{ borderBottom: "2px solid var(--color-g-outline-light)" }}>
        <div className="flex items-center gap-2 px-3 pt-3 pb-1">
          <button className="flex items-center justify-center w-8 h-8 rounded-xl tactile-active"
            style={{ background: "var(--color-g-primary-light)", color: "var(--color-g-primary)" }}
            onClick={resetReader} aria-label="Close">
            <X size={16} />
          </button>
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <span style={{ color: "var(--color-theme)" }}>{result?.kind === "table" ? <Table2 size={16} /> : <FileText size={16} />}</span>
            <span className="font-bold text-sm truncate" style={{ color: "var(--color-g-ink)" }}>{getDocumentTitle(result)}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 px-3 pb-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          <label className="flex items-center gap-1.5 flex-1 min-w-0 px-2.5 rounded-xl h-8 organic-border"
            style={{ background: "var(--color-g-surface-alt)", color: "var(--color-g-outline)", minWidth: 90 }}>
            <Search size={13} style={{ flexShrink: 0 }} />
            <input value={query} onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && matches > 0) { e.preventDefault(); setCurrentMatchIndex(p => (p + 1) % matches); } }}
              placeholder="Search…" className="flex-1 min-w-0 bg-transparent outline-none text-xs font-medium"
              style={{ color: "var(--color-g-ink)" }} />
            {query && <span className="text-xs font-bold whitespace-nowrap" style={{ color: "var(--color-g-primary)" }}>{matches > 0 ? currentMatchIndex + 1 : 0}/{matches}</span>}
          </label>
          {query && (
            <>
              <button className="w-8 h-8 flex items-center justify-center rounded-xl organic-border tactile-active flex-shrink-0"
                style={{ background: "var(--color-g-surface)", color: "var(--color-g-primary)" }}
                disabled={matches === 0} onClick={() => setCurrentMatchIndex(p => (p - 1 + matches) % matches)}><ChevronUp size={15} /></button>
              <button className="w-8 h-8 flex items-center justify-center rounded-xl organic-border tactile-active flex-shrink-0"
                style={{ background: "var(--color-g-surface)", color: "var(--color-g-primary)" }}
                disabled={matches === 0} onClick={() => setCurrentMatchIndex(p => (p + 1) % matches)}><ChevronDown size={15} /></button>
            </>
          )}
          <button className="w-8 h-8 flex items-center justify-center rounded-xl organic-border tactile-active flex-shrink-0"
            style={{ background: "var(--color-g-surface)", color: "var(--color-g-primary)" }}
            disabled={zoom <= 0.25} onClick={() => setZoom(z => Math.max(0.25, z - 0.25))}><ZoomOut size={15} /></button>
          <span className="text-xs font-bold flex-shrink-0" style={{ color: "var(--color-g-outline)", minWidth: 32, textAlign: "center" }}>{Math.round(zoom * 100)}%</span>
          <button className="w-8 h-8 flex items-center justify-center rounded-xl organic-border tactile-active flex-shrink-0"
            style={{ background: "var(--color-g-surface)", color: "var(--color-g-primary)" }}
            disabled={zoom >= 3} onClick={() => setZoom(z => Math.min(3, z + 0.25))}><ZoomIn size={15} /></button>
          <button className="w-8 h-8 flex items-center justify-center rounded-xl organic-border tactile-active flex-shrink-0"
            style={{ background: "var(--color-g-surface)", color: "var(--color-g-primary)" }}
            onClick={handleCopy}><Clipboard size={15} /></button>
          <div className="relative flex-shrink-0">
            <button className="w-8 h-8 flex items-center justify-center rounded-xl organic-border tactile-active"
              style={{ background: "var(--color-g-surface)", color: "var(--color-g-primary)" }}
              onClick={() => setShowExportMenu(v => !v)}><Download size={15} /></button>
            {showExportMenu && (
              <div className="absolute right-0 top-full mt-1 z-50 rounded-xl overflow-hidden"
                style={{ background: "var(--color-g-surface)", border: "1.5px solid var(--color-g-outline-light)", boxShadow: "var(--shadow-ghibli-lg)", minWidth: 148 }}>
                {result?.kind === "table" && <button className="w-full text-left px-4 py-2.5 text-sm font-medium" style={{ color: "var(--color-g-ink)" }} onClick={() => exportAs("csv")}>Export to CSV</button>}
                <button className="w-full text-left px-4 py-2.5 text-sm font-medium" style={{ color: "var(--color-g-ink)" }} onClick={() => exportAs("txt")}>Export to TXT</button>
                <button className="w-full text-left px-4 py-2.5 text-sm font-medium" style={{ color: "var(--color-g-ink)" }} onClick={() => exportAs("pdf")}>Export to PDF</button>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-auto" style={{ background: "#f5f3ef" }}>
        <div style={{ zoom: (result?.mimeType === "application/pdf" || result?.mimeType?.startsWith("image/")) ? 1 : zoom, width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
          <Preview result={result} query={query} fileUrl={fileUrl} file={currentFile} />
        </div>
      </div>
    </div>
  );
}



function Preview({ result, query, fileUrl, file }) {
  if (!result) {
    return (
      <div className="empty-state">
        <FileText size={34} aria-hidden="true" />
        <p>Choose a document to start reading.</p>
      </div>
    );
  }

  // High-fidelity viewer for Images
  if (result.mimeType.startsWith("image/")) {
    return (
      <div className="flex items-center justify-center min-h-full p-4">
        <img src={fileUrl} alt={result.fileName} className="max-w-full h-auto rounded-lg shadow-sm" />
      </div>
    );
  }

  // High-fidelity viewer for PDF
  if (result.mimeType === "application/pdf") {
    return (
      <div className="native-viewer flex-1 h-full">
        <iframe src={`${fileUrl}#toolbar=0`} title="PDF Preview" className="w-full h-full border-none" />
      </div>
    );
  }

  // Original high-fidelity viewer for Word (.docx)
  if (result.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    return <WordPreview file={file} />;
  }

  if (result.kind === "table") {
    return <TablePreview table={result.table} query={query} />;
  }

  return <pre className="text-preview">{renderHighlightedText(result.text, query)}</pre>;
}

function WordPreview({ file }) {
  const containerRef = useRef(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (file && containerRef.current) {
      renderAsync(file, containerRef.current, undefined, {
        className: "docx-viewer",
        inWrapper: true,
        ignoreLastRenderedPageBreak: false
      }).catch((err) => {
        console.error("Word preview error:", err);
        setError("Failed to render Word document layout.");
      });
    }
  }, [file]);

  if (error) {
    return <div className="viewer-error">{error}</div>;
  }

  return <div ref={containerRef} className="word-viewer-container" />;
}

function TablePreview({ table, query }) {
  const rows = table.rows;
  const columnCount = Math.max(...rows.map((row) => row.length));

  return (
    <div className="table-wrap excel-like" role="region" aria-label={`${table.sheetName} table`}>
      <table>
        <thead>
          <tr>
            <th className="row-number-header"></th>
            {Array.from({ length: columnCount }, (_, columnIndex) => (
              <th key={columnIndex} className="col-header">{getColumnLetter(columnIndex)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              <td className="row-number">{rowIndex + 1}</td>
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
    part.toLowerCase() === query.trim().toLowerCase() ? <mark key={`${part}-${index}`} className="search-match">{part}</mark> : part
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

function getDocumentTitle(result) {
  if (!result) return "Preview";
  const name = (result.fileName || "").toLowerCase();
  if (result.mimeType === "application/pdf" || name.endsWith(".pdf")) return "PDF Document";
  if (result.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || name.endsWith(".docx")) return "Word Document";
  if (result.mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" || result.mimeType === "application/vnd.ms-excel" || result.mimeType === "application/vnd.ms-excel.sheet.macroEnabled.12" || name.match(/\.xlsx?$|\.xlsm$/)) return "Excel Spreadsheet";
  if (result.kind === "table") return "CSV Data";
  if (result.mimeType?.startsWith("image/") || name.match(/\.(png|jpe?g)$/)) return "Image Document";
  return "Text Document";
}

function getColumnLetter(colIndex) {
  let letter = "";
  let temp = colIndex;
  while (temp >= 0) {
    letter = String.fromCharCode(65 + (temp % 26)) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
}

function getDocumentTheme(result) {
  if (!result) return "default-theme";
  const name = (result.fileName || "").toLowerCase();
  if (result.mimeType === "application/pdf" || name.endsWith(".pdf")) return "pdf-theme";
  if (result.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || name.endsWith(".docx")) return "word-theme";
  if (result.mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" || result.mimeType === "application/vnd.ms-excel" || result.mimeType === "application/vnd.ms-excel.sheet.macroEnabled.12" || name.match(/\.xlsx?$|\.xlsm$/) || result.kind === "table") return "excel-theme";
  if (result.mimeType?.startsWith("image/") || name.match(/\.(png|jpe?g)$/)) return "image-theme";
  return "default-theme";
}
