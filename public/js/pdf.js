// Wraps a JPEG in a single-page A4 PDF (no libraries needed), so the QR
// poster can be downloaded ready to print.
(function (root) {
  // jpeg: Uint8Array of a JPEG file, sized for A4 portrait.
  function jpegToA4Pdf(jpeg, widthPx, heightPx) {
    const W = 595.28; // A4 in points
    const H = 841.89;
    const enc = (s) => {
      const out = new Uint8Array(s.length);
      for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
      return out;
    };
    const content = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;
    const parts = [];
    const offsets = [];
    let length = 0;
    const push = (chunk) => {
      const bytes = typeof chunk === 'string' ? enc(chunk) : chunk;
      parts.push(bytes);
      length += bytes.length;
    };
    const obj = (n, body) => {
      offsets[n] = length;
      push(`${n} 0 obj\n`);
      body();
      push('\nendobj\n');
    };
    push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
    obj(2, () => push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'));
    obj(3, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`));
    obj(4, () => {
      push(`<< /Type /XObject /Subtype /Image /Width ${widthPx} /Height ${heightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
      push(jpeg);
      push('\nendstream');
    });
    obj(5, () => push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
    const xref = length;
    let table = 'xref\n0 6\n0000000000 65535 f \n';
    for (let n = 1; n <= 5; n++) table += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
    push(`${table}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    const out = new Uint8Array(length);
    let at = 0;
    for (const p of parts) { out.set(p, at); at += p.length; }
    return out;
  }

  const api = { jpegToA4Pdf };
  if (typeof module !== 'undefined') module.exports = api;
  else root.Pdf = api;
})(this);
