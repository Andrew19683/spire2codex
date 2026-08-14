import { open } from "node:fs/promises";

const MAGIC = "GDPC";
const DIRECTORY_ENCRYPTED = 1;
const RELATIVE_FILE_BASE = 2;

async function readExact(handle, length, position) {
  const buffer = Buffer.alloc(length);
  const { bytesRead } = await handle.read(buffer, 0, length, position);
  if (bytesRead !== length) throw new Error(`Unexpected end of PCK at ${position}`);
  return buffer;
}

export async function readPckIndex(path) {
  const handle = await open(path, "r");
  try {
    const header = await readExact(handle, 40, 0);
    if (header.toString("ascii", 0, 4) !== MAGIC) throw new Error("Not a Godot PCK file");

    const format = header.readUInt32LE(4);
    if (![2, 3, 4].includes(format)) throw new Error(`Unsupported PCK format ${format}`);

    const engine = [header.readUInt32LE(8), header.readUInt32LE(12), header.readUInt32LE(16)];
    const flags = header.readUInt32LE(20);
    if (flags & DIRECTORY_ENCRYPTED) throw new Error("Encrypted PCK directories are not supported");

    let fileBase = Number(header.readBigUInt64LE(24));
    if (format >= 3 || (flags & RELATIVE_FILE_BASE)) fileBase += 0;

    let cursor;
    if (format >= 3) {
      cursor = Number(header.readBigUInt64LE(32));
    } else {
      cursor = 104; // Header plus sixteen reserved uint32 values.
    }

    const countBuffer = await readExact(handle, 4, cursor);
    const count = countBuffer.readUInt32LE(0);
    cursor += 4;
    const files = new Map();

    for (let index = 0; index < count; index += 1) {
      const nameLengthBuffer = await readExact(handle, 4, cursor);
      const nameLength = nameLengthBuffer.readUInt32LE(0);
      cursor += 4;
      const nameBuffer = await readExact(handle, nameLength, cursor);
      cursor += nameLength;
      const entry = await readExact(handle, 36, cursor);
      cursor += 36;

      const name = nameBuffer.toString("utf8").replace(/\0+$/, "");
      const offset = Number(entry.readBigUInt64LE(0)) + fileBase;
      const size = Number(entry.readBigUInt64LE(8));
      const entryFlags = entry.readUInt32LE(32);
      files.set(name, { offset, size, flags: entryFlags });
    }

    return { format, engine, flags, files };
  } finally {
    await handle.close();
  }
}

export async function readPckFile(pckPath, entry) {
  const handle = await open(pckPath, "r");
  try {
    return await readExact(handle, entry.size, entry.offset);
  } finally {
    await handle.close();
  }
}

