/**
 * Validarea fișierelor încărcate: tipul se stabilește din conținut (semnătura de la început),
 * nu din extensie sau din Content-Type trimis de browser.
 */
export type FileKind = "pdf" | "png" | "jpeg" | "webp" | "docx" | "xlsx" | "pptx" | "odt" | "txt" | "csv";

export const MIME: Record<FileKind, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  odt: "application/vnd.oasis.opendocument.text",
  txt: "text/plain; charset=utf-8",
  csv: "text/csv; charset=utf-8",
};

const ZIP_KINDS: Record<string, FileKind> = { docx: "docx", xlsx: "xlsx", pptx: "pptx", odt: "odt" };

function startsWith(buf: Buffer, bytes: number[], offset = 0) {
  return bytes.every((b, i) => buf[offset + i] === b);
}

/** tipul fișierului din conținut + extensie (pentru containerele ZIP, ca .docx); null = nepermis */
export function detectKind(buf: Buffer, filename: string): FileKind | null {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  if (startsWith(buf, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "pdf"; // %PDF-
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(buf, [0x52, 0x49, 0x46, 0x46]) && startsWith(buf, [0x57, 0x45, 0x42, 0x50], 8)) return "webp";
  if (startsWith(buf, [0x50, 0x4b, 0x03, 0x04])) return ZIP_KINDS[ext] ?? null; // documente Office / ODF
  if ((ext === "txt" || ext === "csv") && isText(buf)) return ext as FileKind;
  return null;
}

function isText(buf: Buffer) {
  const sample = buf.subarray(0, 4096);
  if (sample.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(sample.length < buf.length ? sample.subarray(0, sample.lastIndexOf(0x0a) + 1 || sample.length) : sample);
    return true;
  } catch {
    return false;
  }
}

/** numele fișierului, curățat pentru afișare și pentru antetul Content-Disposition */
export function safeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "fisier";
  const cleaned = base.replace(/[\u0000-\u001f\u007f"<>|:*?]/g, "").replace(/\s+/g, " ").trim().slice(0, 180);
  return cleaned || "fisier";
}

export function contentDisposition(filename: string, inline = false) {
  const ascii = filename.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7e]/g, "_");
  return `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
