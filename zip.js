const UTF8_FLAG = 0x0800;
const STORE_METHOD = 0;
const DEFLATE_METHOD = 8;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8");

let crcTable = null;

function getCrcTable() {
  if (crcTable) {
    return crcTable;
  }

  crcTable = new Uint32Array(256);

  for (let i = 0; i < 256; i += 1) {
    let value = i;

    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }

    crcTable[i] = value >>> 0;
  }

  return crcTable;
}

function crc32(bytes) {
  const table = getCrcTable();
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16(view, offset, value) {
  view.setUint16(offset, value, true);
}

function writeUint32(view, offset, value) {
  view.setUint32(offset, value >>> 0, true);
}

function getDosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = Math.floor(date.getSeconds() / 2);

  return {
    date: ((year - 1980) << 9) | (month << 5) | day,
    time: (hours << 11) | (minutes << 5) | seconds,
  };
}

function encodeZipName(name) {
  return textEncoder.encode(String(name).replace(/\\/g, "/"));
}

function getUniqueZipName(name, usedNames) {
  const normalized = String(name || "output.json").replace(/\\/g, "/").replace(/^\/+/, "");
  const parts = normalized.split("/");
  const leaf = parts.pop() || "output.json";
  const folder = parts.length ? `${parts.join("/")}/` : "";
  const dotIndex = leaf.lastIndexOf(".");
  const stem = dotIndex > 0 ? leaf.slice(0, dotIndex) : leaf;
  const ext = dotIndex > 0 ? leaf.slice(dotIndex) : "";
  let candidate = `${folder}${leaf}`;
  let index = 2;

  while (usedNames.has(candidate.toLowerCase())) {
    candidate = `${folder}${stem}-${index}${ext}`;
    index += 1;
  }

  usedNames.add(candidate.toLowerCase());
  return candidate;
}

function buildLocalHeader(nameBytes, data, dos) {
  const header = new Uint8Array(30 + nameBytes.length);
  const view = new DataView(header.buffer);

  writeUint32(view, 0, 0x04034b50);
  writeUint16(view, 4, 20);
  writeUint16(view, 6, UTF8_FLAG);
  writeUint16(view, 8, STORE_METHOD);
  writeUint16(view, 10, dos.time);
  writeUint16(view, 12, dos.date);
  writeUint32(view, 14, crc32(data));
  writeUint32(view, 18, data.length);
  writeUint32(view, 22, data.length);
  writeUint16(view, 26, nameBytes.length);
  writeUint16(view, 28, 0);
  header.set(nameBytes, 30);

  return header;
}

function buildCentralHeader(nameBytes, data, dos, localOffset) {
  const header = new Uint8Array(46 + nameBytes.length);
  const view = new DataView(header.buffer);

  writeUint32(view, 0, 0x02014b50);
  writeUint16(view, 4, 20);
  writeUint16(view, 6, 20);
  writeUint16(view, 8, UTF8_FLAG);
  writeUint16(view, 10, STORE_METHOD);
  writeUint16(view, 12, dos.time);
  writeUint16(view, 14, dos.date);
  writeUint32(view, 16, crc32(data));
  writeUint32(view, 20, data.length);
  writeUint32(view, 24, data.length);
  writeUint16(view, 28, nameBytes.length);
  writeUint16(view, 30, 0);
  writeUint16(view, 32, 0);
  writeUint16(view, 34, 0);
  writeUint16(view, 36, 0);
  writeUint32(view, 38, 0);
  writeUint32(view, 42, localOffset);
  header.set(nameBytes, 46);

  return header;
}

function buildEndOfCentralDirectory(entryCount, centralSize, centralOffset) {
  const header = new Uint8Array(22);
  const view = new DataView(header.buffer);

  writeUint32(view, 0, 0x06054b50);
  writeUint16(view, 4, 0);
  writeUint16(view, 6, 0);
  writeUint16(view, 8, entryCount);
  writeUint16(view, 10, entryCount);
  writeUint32(view, 12, centralSize);
  writeUint32(view, 16, centralOffset);
  writeUint16(view, 20, 0);

  return header;
}

async function createZipBlob(files) {
  const localParts = [];
  const centralParts = [];
  const usedNames = new Set();
  let offset = 0;

  for (const file of files) {
    const name = getUniqueZipName(file.filename, usedNames);
    const nameBytes = encodeZipName(name);
    const data = textEncoder.encode(file.text);
    const dos = getDosDateTime();
    const localHeader = buildLocalHeader(nameBytes, data, dos);
    const centralHeader = buildCentralHeader(nameBytes, data, dos, offset);

    localParts.push(localHeader, data);
    centralParts.push(centralHeader);
    offset += localHeader.length + data.length;
  }

  const centralOffset = offset;
  const centralSize = centralParts.reduce((total, part) => total + part.length, 0);
  const endHeader = buildEndOfCentralDirectory(files.length, centralSize, centralOffset);

  return new Blob([...localParts, ...centralParts, endHeader], {
    type: "application/zip",
  });
}

function findEndOfCentralDirectory(view) {
  const minOffset = Math.max(0, view.byteLength - 22 - 0xffff);

  for (let offset = view.byteLength - 22; offset >= minOffset; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      return offset;
    }
  }

  throw new Error("无法读取 ZIP 文件目录。");
}

function decodeZipName(bytes, flags) {
  if (flags & UTF8_FLAG) {
    return textDecoder.decode(bytes);
  }

  try {
    return new TextDecoder("gbk").decode(bytes);
  } catch {
    return textDecoder.decode(bytes);
  }
}

function readCentralDirectory(buffer) {
  const view = new DataView(buffer);
  const endOffset = findEndOfCentralDirectory(view);
  const totalEntries = view.getUint16(endOffset + 10, true);
  const centralOffset = view.getUint32(endOffset + 16, true);
  const entries = [];
  let offset = centralOffset;

  for (let index = 0; index < totalEntries; index += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) {
      throw new Error("ZIP 文件目录结构不完整。");
    }

    const flags = view.getUint16(offset + 8, true);
    const compressionMethod = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const fileNameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const nameBytes = new Uint8Array(buffer, offset + 46, fileNameLength);
    const name = decodeZipName(nameBytes, flags);

    entries.push({
      name,
      flags,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
      directory: name.endsWith("/"),
    });

    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

async function inflateRaw(bytes) {
  if (typeof DecompressionStream !== "function") {
    throw new Error("当前浏览器不支持解压 deflate ZIP，请使用新版 Chrome 或 Edge。");
  }

  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch (error) {
    throw new Error(`解压 ZIP 条目失败：${error.message}`);
  }
}

async function readEntryData(buffer, entry) {
  const view = new DataView(buffer);
  const localOffset = entry.localHeaderOffset;

  if (view.getUint32(localOffset, true) !== 0x04034b50) {
    throw new Error(`${entry.name} 的 ZIP 本地文件头无效。`);
  }

  const fileNameLength = view.getUint16(localOffset + 26, true);
  const extraLength = view.getUint16(localOffset + 28, true);
  const dataOffset = localOffset + 30 + fileNameLength + extraLength;
  const compressed = new Uint8Array(buffer, dataOffset, entry.compressedSize);

  if (entry.compressionMethod === STORE_METHOD) {
    return compressed.slice();
  }

  if (entry.compressionMethod === DEFLATE_METHOD) {
    const inflated = await inflateRaw(compressed);

    if (entry.uncompressedSize && inflated.length !== entry.uncompressedSize) {
      throw new Error(`${entry.name} 解压后的大小与 ZIP 目录不一致。`);
    }

    return inflated;
  }

  throw new Error(`${entry.name} 使用了不支持的 ZIP 压缩算法 ${entry.compressionMethod}。`);
}

async function extractJsonFilesFromZip(file) {
  const buffer = await file.arrayBuffer();
  const entries = readCentralDirectory(buffer);
  const jsonEntries = entries.filter(
    (entry) => !entry.directory && /\.(json|cpa)$/i.test(entry.name)
  );

  if (!jsonEntries.length) {
    throw new Error(`${file.name} 中没有找到 .json 或 .cpa 文件。`);
  }

  const files = [];

  for (const entry of jsonEntries) {
    const data = await readEntryData(buffer, entry);
    files.push({
      name: entry.name,
      text: textDecoder.decode(data),
      archiveName: file.name,
    });
  }

  return files;
}

export { createZipBlob, extractJsonFilesFromZip };
