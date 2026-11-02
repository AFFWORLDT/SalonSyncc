import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream, type PDFObject } from "pdf-lib";

/** Every string drawn on the pages (standard fonts write hex strings into flate-compressed content streams). */
export async function pdfText(bytes: Uint8Array): Promise<string> {
  const doc = await PDFDocument.load(bytes);
  const out: string[] = [];
  for (const page of doc.getPages()) {
    const contents = page.node.Contents();
    const refs: PDFObject[] = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : [];
    for (const ref of refs) {
      const s = doc.context.lookup(ref);
      if (!(s instanceof PDFRawStream)) continue;
      const raw = Array.from(decodePDFRawStream(s).decode(), (b) => String.fromCharCode(b)).join("");
      for (const m of raw.matchAll(/<([0-9A-Fa-f]*)>\s*Tj/g)) {
        out.push((m[1]!.match(/../g) ?? []).map((h) => String.fromCharCode(parseInt(h, 16))).join(""));
      }
    }
  }
  return out.join("\n");
}
