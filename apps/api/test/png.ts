/** A real, decodable w x h PNG (8-bit greyscale, flat colour, zlib via CompressionStream): small on disk, w*h pixels to decode. */
export async function makePng(w: number, h: number): Promise<Uint8Array> {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Uint8Array) => {
    let c = 0xffffffff;
    for (const x of b) c = crcTable[(c ^ x) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  const chunk = (type: string, data: Uint8Array) => {
    const td = new Uint8Array([...new TextEncoder().encode(type), ...data]);
    return new Uint8Array([...u32(data.length), ...td, ...u32(crc(td))]);
  };
  const raw = new Uint8Array((w + 1) * h).fill(0x80);
  for (let y = 0; y < h; y++) raw[y * (w + 1)] = 0; // filter byte: none
  const z = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream("deflate"))).arrayBuffer());
  const ihdr = new Uint8Array([...u32(w), ...u32(h), 8, 0, 0, 0, 0]);
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", z), chunk("IEND", new Uint8Array())];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
