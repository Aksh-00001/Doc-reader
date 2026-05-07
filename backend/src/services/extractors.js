import fs from "node:fs/promises";
import path from "node:path";
import mammoth from "mammoth";
import pdf from "pdf-parse";
import { createWorker } from "tesseract.js";
import xlsx from "xlsx";

export const supportedMimeTypes = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/vnd.ms-excel.sheet.macroEnabled.12",
  "text/plain",
  "text/csv",
  "application/csv",
  "image/png",
  "image/jpeg"
]);

export async function processUploadedFile(document) {
  const extension = path.extname(document.originalName).toLowerCase();
  const mimeType = document.mimeType;
  const base = {
    fileName: document.originalName,
    mimeType: document.mimeType,
    size: document.size
  };

  if (mimeType === "application/pdf" || extension === ".pdf") {
    const buffer = await fs.readFile(document.path);
    const result = await pdf(buffer);
    const text = cleanText(result.text);
    return { ...base, kind: "text", text, stats: textStats(text) };
  }

  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || extension === ".docx") {
    const result = await mammoth.extractRawText({ path: document.path });
    const text = cleanText(result.value);
    return { ...base, kind: "text", text, stats: textStats(text) };
  }

  if (mimeType === "text/plain" || extension === ".txt") {
    const text = cleanText(await fs.readFile(document.path, "utf8"));
    return { ...base, kind: "text", text, stats: textStats(text) };
  }

  if (mimeType === "text/csv" || mimeType === "application/csv" || extension === ".csv") {
    const table = readWorkbookTable(document.path, { raw: false });
    return { ...base, kind: "table", table, stats: tableStats(table) };
  }

  if (isExcelFile(mimeType, extension)) {
    const table = readWorkbookTable(document.path);
    return { ...base, kind: "table", table, stats: tableStats(table) };
  }

  if (mimeType.startsWith("image/") || /\.(png|jpe?g)$/i.test(document.originalName)) {
    const text = cleanText(await extractImageText(document.path));
    return { ...base, kind: "text", text, stats: textStats(text) };
  }

  const error = new Error("Unsupported file type.");
  error.status = 415;
  throw error;
}

async function extractImageText(filePath) {
  const worker = await createWorker("eng");
  try {
    const { data } = await worker.recognize(filePath);
    return data.text;
  } finally {
    await worker.terminate();
  }
}

function cleanText(value) {
  const text = value.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) {
    const error = new Error("No readable text could be extracted from this file.");
    error.status = 422;
    throw error;
  }
  return text;
}

function readWorkbookTable(filePath, options = {}) {
  const workbook = xlsx.readFile(filePath, { cellDates: true, dense: false });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  if (!sheet) {
    const error = new Error("No readable sheet was found in this file.");
    error.status = 422;
    throw error;
  }

  const rows = xlsx.utils.sheet_to_json(sheet, {
    header: 1,
    blankrows: false,
    defval: "",
    raw: options.raw ?? false
  });

  const table = rows.slice(0, 1000).map((row) => row.slice(0, 50).map((cell) => String(cell)));
  if (!table.length) {
    const error = new Error("No readable table data could be extracted from this file.");
    error.status = 422;
    throw error;
  }

  return {
    sheetName,
    truncated: rows.length > table.length || rows.some((row) => row.length > 50),
    rows: table
  };
}

function isExcelFile(mimeType, extension) {
  return (
    mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mimeType === "application/vnd.ms-excel" ||
    mimeType === "application/vnd.ms-excel.sheet.macroEnabled.12" ||
    extension === ".xlsx" ||
    extension === ".xls" ||
    extension === ".xlsm"
  );
}

function textStats(text) {
  return {
    characters: text.length,
    lines: text.split("\n").length
  };
}

function tableStats(table) {
  return {
    rows: table.rows.length,
    columns: Math.max(...table.rows.map((row) => row.length)),
    truncated: table.truncated
  };
}
