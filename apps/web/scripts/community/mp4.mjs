/** Minimal ISO BMFF metadata reader for the manual import tool. */
export function isMp4(bytes) {
  if (bytes.length < 12) return false;
  if (bytes.toString("latin1", 4, 8) !== "ftyp") return false;
  const brand = bytes.toString("latin1", 8, 12);
  return ["isom", "iso2", "iso4", "mp41", "mp42", "avc1", "M4V ", "dash", "MSNV"].includes(
    brand
  );
}

function boxes(buffer, start, end) {
  const found = [];
  let offset = start;
  while (offset + 8 <= end) {
    let size = buffer.readUInt32BE(offset);
    const type = buffer.toString("latin1", offset + 4, offset + 8);
    let header = 8;
    if (size === 1) {
      if (offset + 16 > end) break;
      const large = buffer.readBigUInt64BE(offset + 8);
      if (large > BigInt(end - offset)) break;
      size = Number(large);
      header = 16;
    } else if (size === 0) {
      size = end - offset;
    }
    if (size < header || offset + size > end) break;
    found.push({ type, start: offset, body: offset + header, end: offset + size });
    offset += size;
  }
  return found;
}

function durationOfMvhd(buffer, box) {
  if (box.body + 4 > box.end) return null;
  const version = buffer[box.body];
  if (version === 1) {
    if (box.body + 32 > box.end) return null;
    const timescale = buffer.readUInt32BE(box.body + 20);
    const duration = Number(buffer.readBigUInt64BE(box.body + 24));
    return timescale > 0 && duration > 0 ? duration / timescale : null;
  }
  if (box.body + 20 > box.end) return null;
  const timescale = buffer.readUInt32BE(box.body + 12);
  const duration = buffer.readUInt32BE(box.body + 16);
  return timescale > 0 && duration > 0 ? duration / timescale : null;
}

export function probeMp4(bytes) {
  if (!isMp4(bytes)) {
    return { width: null, height: null, durationSeconds: null };
  }
  const top = boxes(bytes, 0, bytes.length);
  const moov = top.find((box) => box.type === "moov");
  if (!moov) return { width: null, height: null, durationSeconds: null };
  const children = boxes(bytes, moov.body, moov.end);
  const mvhd = children.find((box) => box.type === "mvhd");
  let width = null;
  let height = null;
  for (const trak of children.filter((box) => box.type === "trak")) {
    const trakChildren = boxes(bytes, trak.body, trak.end);
    const tkhd = trakChildren.find((box) => box.type === "tkhd");
    if (!tkhd || tkhd.end - tkhd.body < 8) continue;
    const w = bytes.readUInt32BE(tkhd.end - 8) / 65536;
    const h = bytes.readUInt32BE(tkhd.end - 4) / 65536;
    if (w > 0 && h > 0 && w <= 8192 && h <= 8192) {
      width = Math.round(w);
      height = Math.round(h);
      break;
    }
  }
  return {
    width,
    height,
    durationSeconds: mvhd ? durationOfMvhd(bytes, mvhd) : null,
  };
}
