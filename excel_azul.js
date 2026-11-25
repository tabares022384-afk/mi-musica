// Excel (.xlsx) con el formato "azul petróleo" de Edwin, armado en el navegador sin librerías externas (03-11-2026).
// Encabezado #0B4F5C letra blanca negrita con ajuste (alto 30), bordes #7FA7AF, filas pares #E3EFF1, todo centrado,
// encabezado fijo, filtros y separador de miles. Uso:
//   excelAzul.descargar('archivo.xlsx', [{ nombre: 'Hoja', columnas: [{ t: 'PLU', tipo: 'txt' | 'int' | 'dec1' | 'dec2' }], filas: [[...], ...] }])
(function () {
  const TCRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = TCRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const enc = new TextEncoder();
  async function comprimir(b) {
    if (!window.CompressionStream) return null;
    try { return new Uint8Array(await new Response(new Blob([b]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer()); } catch { return null; }
  }
  async function zip(archivos) {
    const partes = [], central = []; let off = 0;
    for (const a of archivos) {
      const nom = enc.encode(a.nombre), crc = crc32(a.datos), comp = await comprimir(a.datos), met = comp ? 8 : 0, d = comp || a.datos;
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, met, true);
      h.setUint16(12, 0x21, true); h.setUint32(14, crc, true); h.setUint32(18, d.length, true); h.setUint32(22, a.datos.length, true); h.setUint16(26, nom.length, true);
      partes.push(h, nom, d);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, met, true);
      c.setUint16(14, 0x21, true); c.setUint32(16, crc, true); c.setUint32(20, d.length, true); c.setUint32(24, a.datos.length, true); c.setUint16(28, nom.length, true); c.setUint32(42, off, true);
      central.push(c, nom);
      off += 30 + nom.length + d.length;
    }
    const tam = central.reduce((s, x) => s + x.byteLength, 0), e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, archivos.length, true); e.setUint16(10, archivos.length, true); e.setUint32(12, tam, true); e.setUint32(16, off, true);
    return new Blob([...partes, ...central, e], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
  const x = s => String(s ?? '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const letra = i => { let s = ''; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s; return s; };
  // estilos: 1 encabezado; 2/3 texto (impar/par); 4/5 entero; 6/7 un decimal; 8/9 dos decimales
  const ESTILOS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.0"/></numFmts>
<fonts count="2"><font><sz val="10"/><name val="Calibri"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>
<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF0B4F5C"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFE3EFF1"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color rgb="FF7FA7AF"/></left><right style="thin"><color rgb="FF7FA7AF"/></right><top style="thin"><color rgb="FF7FA7AF"/></top><bottom style="thin"><color rgb="FF7FA7AF"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="10"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
${[[0, 0], [0, 3], [3, 0], [3, 3], [164, 0], [164, 3], [4, 0], [4, 3]].map(([nf, fl]) =>
  `<xf numFmtId="${nf}" fontId="0" fillId="${fl}" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>`).join('')}
</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  const BASE_ESTILO = { txt: 2, int: 4, dec1: 6, dec2: 8 };

  function hojaXml(h) {
    const cols = h.columnas, nf = h.filas.length;
    const ancho = cols.map((c, j) => {
      let m = String(c.t).length * 0.9;
      for (let i = 0; i < Math.min(nf, 300); i++) { const v = h.filas[i][j]; if (v != null) m = Math.max(m, String(typeof v === 'number' ? Math.round(v).toLocaleString('es-CO') : v).length); }
      return Math.max(9, Math.min(50, Math.ceil(m + 3)));
    });
    const p = [`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${ancho.map((w, j) => `<col min="${j + 1}" max="${j + 1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>`,
      `<row r="1" ht="30" customHeight="1">${cols.map((c, j) => `<c r="${letra(j)}1" t="inlineStr" s="1"><is><t>${x(c.t)}</t></is></c>`).join('')}</row>`];
    const L = cols.map((_, j) => letra(j));
    for (let i = 0; i < nf; i++) {
      const f = h.filas[i], r = i + 2, par = i % 2;
      let s = `<row r="${r}">`;
      for (let j = 0; j < cols.length; j++) {
        const v = f[j], tipo = cols[j].tipo || 'txt', st = BASE_ESTILO[tipo] + par;
        if (v == null || v === '' || (typeof v === 'number' && !isFinite(v))) s += `<c r="${L[j]}${r}" s="${st}"/>`;
        else if (tipo !== 'txt' && typeof v === 'number') s += `<c r="${L[j]}${r}" s="${st}"><v>${v}</v></c>`;
        else s += `<c r="${L[j]}${r}" t="inlineStr" s="${BASE_ESTILO.txt + par}"><is><t>${x(v)}</t></is></c>`;
      }
      p.push(s + '</row>');
    }
    p.push(`</sheetData><autoFilter ref="A1:${letra(cols.length - 1)}${nf + 1}"/></worksheet>`);
    return enc.encode(p.join(''));
  }

  async function armar(hojas) {
    const usados = new Set();
    const nombres = hojas.map(h => {   // Excel: máx. 31 caracteres, sin : \ / ? * [ ] y sin repetir
      let n = String(h.nombre || 'Hoja').replace(/[:\\\/?*\[\]]/g, ' ').slice(0, 31).trim() || 'Hoja', k = 2;
      while (usados.has(n.toLowerCase())) n = n.slice(0, 27) + ' (' + k++ + ')';
      usados.add(n.toLowerCase()); return n;
    });
    const ct = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${hojas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`;
    const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
    const wb = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>
${nombres.map((n, i) => `<sheet name="${x(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>
<definedNames>${nombres.map((n, i) => `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${x(n.replace(/'/g, "''"))}'!$A$1:$${letra(hojas[i].columnas.length - 1)}$${hojas[i].filas.length + 1}</definedName>`).join('')}</definedNames></workbook>`;
    const wbRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${hojas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}
<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
    return zip([
      { nombre: '[Content_Types].xml', datos: enc.encode(ct) }, { nombre: '_rels/.rels', datos: enc.encode(rels) },
      { nombre: 'xl/workbook.xml', datos: enc.encode(wb) }, { nombre: 'xl/_rels/workbook.xml.rels', datos: enc.encode(wbRels) },
      { nombre: 'xl/styles.xml', datos: enc.encode(ESTILOS) },
      ...hojas.map((h, i) => ({ nombre: `xl/worksheets/sheet${i + 1}.xml`, datos: hojaXml(h) }))
    ]);
  }

  async function descargar(archivo, hojas) {
    const b = await armar(hojas), a = document.createElement('a');
    a.href = URL.createObjectURL(b); a.download = archivo.replace(/[\\\/:*?"<>|]/g, '-'); a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    return b;
  }
  // 04-11-2026: atajo para las descargas que antes eran CSV: cabecera + filas, el tipo de cada columna se deduce
  // (códigos como PLU, ítem, EAN, LPN, pedido o ubicación quedan como texto, sin punto de miles). Sin fórmulas.
  const ES_CODIGO = /\b(plu|item|ítem|ean|lpn|material|pedido|c[oó]digo|ubicaci[oó]n|lote|almac[eé]n|zona|l[ií]nea)\b/i;
  function tipoDe(t, filas, j) {
    if (ES_CODIGO.test(String(t))) return 'txt';
    let num = 0, dec = false, hay = 0;
    for (let i = 0; i < filas.length && hay < 2000; i++) {
      const v = filas[i][j]; if (v == null || v === '') continue; hay++;
      if (typeof v === 'number' && isFinite(v)) { num++; if (!Number.isInteger(v)) dec = true; } else return 'txt';
    }
    return !num ? 'txt' : dec ? 'dec2' : 'int';
  }
  function tabla(archivo, nombreHoja, cab, filas) {
    return descargar(archivo.replace(/\.csv$/i, '.xlsx'), [{ nombre: nombreHoja, columnas: cab.map((t, j) => ({ t, tipo: tipoDe(t, filas, j) })), filas }]);
  }
  window.excelAzul = { armar, descargar, tabla };
})();
