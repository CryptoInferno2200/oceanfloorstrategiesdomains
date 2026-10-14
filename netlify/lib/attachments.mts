import { inflateRawSync } from "node:zlib";
import { loadManifest, readUpload, type UploadManifest } from "./uploads.mts";

// Normalized attachment content that each model provider can translate into its own format.
export type AttachmentPart =
  | { kind: "text"; text: string }
  | { kind: "image"; mime: string; data: string }
  | { kind: "pdf"; name: string; data: string }
  | { kind: "media"; name: string; mime: string; data: string };

const MAX_TEXT_CHARS_PER_FILE = 40000;
const MAX_TEXT_CHARS_TOTAL = 120000;
const MAX_BINARY_BYTES_TOTAL = 16 * 1024 * 1024;
const MAX_IMAGE_BYTES = 3.5 * 1024 * 1024;
const MAX_PDF_BYTES = 10 * 1024 * 1024;
const MAX_MEDIA_BYTES = 14 * 1024 * 1024;
const MAX_ARCHIVE_BYTES = 40 * 1024 * 1024;
const MAX_TEXT_FILE_BYTES = 5 * 1024 * 1024;

const VISION_IMAGES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const MEDIA_ALIASES: Record<string, string> = {
  "audio/mpeg": "audio/mp3",
  "audio/x-wav": "audio/wav",
  "audio/wave": "audio/wav",
  "audio/x-m4a": "audio/aac",
  "audio/mp4": "audio/aac",
  "video/quicktime": "video/mov",
  "video/x-msvideo": "video/avi",
  "video/x-ms-wmv": "video/wmv",
};
const TEXT_EXTENSIONS = new Set([
  "txt", "md", "markdown", "csv", "tsv", "json", "jsonl", "xml", "html", "htm", "css", "js", "mjs", "cjs", "ts", "tsx",
  "jsx", "py", "rb", "php", "java", "go", "rs", "c", "h", "cpp", "cs", "swift", "kt", "sql", "yaml", "yml", "toml",
  "ini", "env", "sh", "bat", "ps1", "svg", "vcf", "ics", "log", "rtf", "tex", "srt", "vtt", "conf",
]);
const MIME_BY_EXTENSION: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
  heic: "image/heic", heif: "image/heif", pdf: "application/pdf", zip: "application/zip",
  mp3: "audio/mp3", wav: "audio/wav", ogg: "audio/ogg", flac: "audio/flac", aac: "audio/aac", m4a: "audio/aac",
  aiff: "audio/aiff", mp4: "video/mp4", mov: "video/mov", webm: "video/webm", avi: "video/avi", mpeg: "video/mpeg",
  mpg: "video/mpg", wmv: "video/wmv", "3gp": "video/3gpp", flv: "video/x-flv",
};
const OFFICE_EXTENSIONS = new Set(["docx", "xlsx", "pptx", "odt", "ods", "odp"]);
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

function extension(name: string) {
  const match = /\.([a-z0-9]+)$/i.exec(name);
  return match ? match[1].toLowerCase() : "";
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function toBase64(bytes: Uint8Array) {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64");
}

function decodeText(bytes: Uint8Array) {
  const sample = bytes.subarray(0, 8192);
  if (sample.includes(0)) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function clip(text: string, limit: number) {
  return text.length > limit ? `${text.slice(0, limit)}\n…[truncated, ${text.length - limit} more characters]` : text;
}

function xmlToText(xml: string) {
  return xml
    .replace(/<\/(w:p|a:p|text:p|text:h|row)>/g, "\n")
    .replace(/<(w:tab|text:tab)\/>/g, "\t")
    .replace(/<\/(c|si|table:table-cell)>/g, "\t")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function describeData(name: string, text: string) {
  const notes: string[] = [];
  const ext = extension(name);
  if (ext === "csv" || ext === "tsv") {
    const lines = text.split(/\r?\n/).filter((line) => line.trim());
    if (lines.length) notes.push(`${lines.length - 1} data rows; header: ${lines[0].slice(0, 500)}`);
  }
  const emails = new Set((text.match(EMAIL_PATTERN) || []).map((email) => email.toLowerCase()));
  if (emails.size) notes.push(`${emails.size} unique email addresses detected`);
  return notes.length ? ` (${notes.join("; ")})` : "";
}

type ZipEntry = { name: string; size: number; method: number; compressedSize: number; offset: number };

// Minimal ZIP reader: lists entries and inflates the ones we want to read. Also covers Office files, which are ZIPs.
function listZip(bytes: Uint8Array): ZipEntry[] | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) return null;
  const count = view.getUint16(end + 10, true);
  let pointer = view.getUint32(end + 16, true);
  if (pointer === 0xffffffff) return null;
  const entries: ZipEntry[] = [];
  const decoder = new TextDecoder();
  for (let i = 0; i < count && pointer + 46 <= bytes.length; i++) {
    if (view.getUint32(pointer, true) !== 0x02014b50) break;
    const nameLength = view.getUint16(pointer + 28, true);
    const extraLength = view.getUint16(pointer + 30, true);
    const commentLength = view.getUint16(pointer + 32, true);
    entries.push({
      method: view.getUint16(pointer + 10, true),
      compressedSize: view.getUint32(pointer + 20, true),
      size: view.getUint32(pointer + 24, true),
      offset: view.getUint32(pointer + 42, true),
      name: decoder.decode(bytes.subarray(pointer + 46, pointer + 46 + nameLength)),
    });
    pointer += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function readZipEntry(bytes: Uint8Array, entry: ZipEntry) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(entry.offset, true) !== 0x04034b50) return null;
  const start = entry.offset + 30 + view.getUint16(entry.offset + 26, true) + view.getUint16(entry.offset + 28, true);
  const data = bytes.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return data;
  if (entry.method !== 8) return null;
  return new Uint8Array(inflateRawSync(data, { maxOutputLength: Math.max(entry.size, 1) }));
}

async function officeText(bytes: Uint8Array, ext: string) {
  const entries = listZip(bytes);
  if (!entries) return null;
  const wanted = entries.filter((entry) => {
    if (ext === "docx") return /^word\/(document|footnotes|header\d*|footer\d*)\.xml$/.test(entry.name);
    if (ext === "pptx") return /^ppt\/slides\/slide\d+\.xml$/.test(entry.name);
    if (ext === "xlsx") return entry.name === "xl/sharedStrings.xml" || /^xl\/worksheets\/sheet\d+\.xml$/.test(entry.name);
    return entry.name === "content.xml";
  }).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const chunks: string[] = [];
  for (const entry of wanted) {
    const data = await readZipEntry(bytes, entry);
    if (!data) continue;
    const text = xmlToText(new TextDecoder().decode(data));
    if (text) chunks.push(ext === "pptx" ? `[${entry.name.replace(/^.*\//, "")}]\n${text}` : text);
  }
  return chunks.join("\n\n");
}

async function archiveText(bytes: Uint8Array, budget: number) {
  const entries = listZip(bytes);
  if (!entries) return "Could not read this archive's file list (it may be encrypted, split, or ZIP64).";
  const files = entries.filter((entry) => !entry.name.endsWith("/"));
  const listing = files.slice(0, 400).map((entry) => `- ${entry.name} (${formatSize(entry.size)})`).join("\n");
  const sections = [`${files.length} files:\n${listing}${files.length > 400 ? `\n…and ${files.length - 400} more` : ""}`];
  let used = sections[0].length;
  for (const entry of files) {
    if (used >= budget) break;
    const ext = extension(entry.name);
    if (entry.size > 512 * 1024 || entry.name.includes("__MACOSX") || entry.name.includes("node_modules/")) continue;
    const isOffice = OFFICE_EXTENSIONS.has(ext);
    if (!TEXT_EXTENSIONS.has(ext) && !isOffice) continue;
    const data = await readZipEntry(bytes, entry).catch(() => null);
    if (!data) continue;
    const text = isOffice ? await officeText(data, ext).catch(() => null) : decodeText(data);
    if (!text) continue;
    const section = `--- ${entry.name} ---\n${clip(text, Math.min(12000, budget - used))}`;
    sections.push(section);
    used += section.length;
  }
  return sections.join("\n\n");
}

function resolveMime(manifest: UploadManifest) {
  const declared = manifest.type.split(";")[0].trim().toLowerCase();
  const fromExtension = MIME_BY_EXTENSION[extension(manifest.name)];
  const mime = declared && declared !== "application/octet-stream" ? declared : fromExtension || declared;
  return MEDIA_ALIASES[mime] || mime;
}

type Budget = { text: number; binary: number };

async function toParts(manifest: UploadManifest, budget: Budget): Promise<AttachmentPart[]> {
  const label = `Attached file "${manifest.name}" (${manifest.type || "unknown type"}, ${formatSize(manifest.size)})`;
  const mime = resolveMime(manifest);
  const ext = extension(manifest.name);
  const note = (detail: string): AttachmentPart[] => [{ kind: "text", text: `${label}: ${detail}` }];
  const fitsBinary = (cap: number) => manifest.size <= cap && manifest.size <= budget.binary;

  if (VISION_IMAGES.has(mime)) {
    if (!fitsBinary(MAX_IMAGE_BYTES)) return note("image is too large to view inline; only its details are available.");
    budget.binary -= manifest.size;
    return [{ kind: "text", text: `${label}:` }, { kind: "image", mime, data: toBase64(await readUpload(manifest)) }];
  }
  if (mime === "application/pdf") {
    if (!fitsBinary(MAX_PDF_BYTES)) return note("PDF is too large to read inline; only its details are available.");
    budget.binary -= manifest.size;
    return [{ kind: "text", text: `${label}:` }, { kind: "pdf", name: manifest.name, data: toBase64(await readUpload(manifest)) }];
  }
  if (mime.startsWith("audio/") || mime.startsWith("video/") || mime === "image/heic" || mime === "image/heif") {
    if (!fitsBinary(MAX_MEDIA_BYTES)) return note("media file is stored, but too large to analyze inline; only its details are available.");
    budget.binary -= manifest.size;
    return [{ kind: "text", text: `${label}:` }, { kind: "media", name: manifest.name, mime, data: toBase64(await readUpload(manifest)) }];
  }
  if (budget.text <= 0) return note("stored; skipped reading because this message already includes a lot of file content.");
  if (OFFICE_EXTENSIONS.has(ext) && manifest.size <= MAX_ARCHIVE_BYTES) {
    const text = await officeText(await readUpload(manifest), ext).catch(() => null);
    if (text) {
      const body = clip(text, Math.min(MAX_TEXT_CHARS_PER_FILE, budget.text));
      budget.text -= body.length;
      return note(`extracted text${describeData(manifest.name, text)}:\n${body}`);
    }
  }
  if ((mime.includes("zip") || ext === "zip") && manifest.size <= MAX_ARCHIVE_BYTES) {
    const text = await archiveText(await readUpload(manifest), Math.min(MAX_TEXT_CHARS_PER_FILE, budget.text));
    budget.text -= text.length;
    return note(`archive contents:\n${text}`);
  }
  if (manifest.size <= MAX_TEXT_FILE_BYTES) {
    const raw = await readUpload(manifest);
    const text = decodeText(raw);
    if (text !== null) {
      const body = clip(text, Math.min(MAX_TEXT_CHARS_PER_FILE, budget.text));
      budget.text -= body.length;
      return note(`contents${describeData(manifest.name, text)}:\n${body}`);
    }
  }
  return note("stored safely; this format can't be read directly, so use its name, type, and size as context and ask the user about it if needed.");
}

// Resolves attachment ids for each message, newest first so the latest files get the content budget.
export async function resolveAttachments(idsByMessage: string[][], owner: string) {
  const budget: Budget = { text: MAX_TEXT_CHARS_TOTAL, binary: MAX_BINARY_BYTES_TOTAL };
  const results: AttachmentPart[][] = idsByMessage.map(() => []);
  for (let index = idsByMessage.length - 1; index >= 0; index--) {
    for (const id of idsByMessage[index]) {
      const manifest = await loadManifest(id, owner);
      if (!manifest || !manifest.complete) {
        results[index].push({ kind: "text", text: "An attached file could not be found or did not finish uploading." });
        continue;
      }
      try {
        results[index].push(...(await toParts(manifest, budget)));
      } catch (error) {
        console.error("Attachment read failed", error);
        results[index].push({ kind: "text", text: `Attached file "${manifest.name}" could not be read.` });
      }
    }
  }
  return results;
}
