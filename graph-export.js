const SVG = 'http://www.w3.org/2000/svg';
const FONT = 'GraphReport';
const ink = '#233640', muted = '#637680', blue = '#176a9d', border = '#d8e2e8';
const fmt = (value) => value == null ? '\u2014' : Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
let fontsReady, pdfReady;

function base64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(binary);
}

function fonts() {
  if (!fontsReady) fontsReady = Promise.all([['Poppins-Regular.ttf', '400'], ['Poppins-SemiBold.ttf', '600']].map(async ([file, weight]) => {
    const response = await fetch(new URL(`./assets/fonts/${file}`, import.meta.url));
    if (!response.ok) throw new Error('N\u00e3o foi poss\u00edvel carregar a fonte do arquivo. Tente novamente.');
    const buffer = await response.arrayBuffer();
    const face = await new FontFace(FONT, buffer, { weight }).load();
    document.fonts.add(face);
    return { file, weight, encoded: base64(buffer) };
  })).catch((error) => { fontsReady = null; throw error; });
  return fontsReady;
}

function script(url) {
  return new Promise((resolve, reject) => {
    const element = document.createElement('script');
    const fail = () => { clearTimeout(timer); element.remove(); reject(new Error('N\u00e3o foi poss\u00edvel carregar a exporta\u00e7\u00e3o PDF. Tente novamente.')); };
    const timer = setTimeout(fail, 30000);
    element.src = url;
    element.onload = () => { clearTimeout(timer); resolve(); };
    element.onerror = fail;
    document.head.append(element);
  });
}

function pdfLibrary() {
  if (!pdfReady) pdfReady = (async () => {
    if (!window.jspdf?.jsPDF) await script('https://cdn.jsdelivr.net/npm/jspdf@4.2.1/dist/jspdf.umd.min.js');
    if (!window.jspdf?.jsPDF.API.svg) await script('https://cdn.jsdelivr.net/npm/svg2pdf.js@2.7.0/dist/svg2pdf.umd.min.js');
    if (!window.jspdf?.jsPDF.API.svg) throw new Error('A exporta\u00e7\u00e3o PDF n\u00e3o est\u00e1 dispon\u00edvel.');
    return window.jspdf.jsPDF;
  })().catch((error) => { pdfReady = null; throw error; });
  return pdfReady;
}

function node(parent, tag, attributes = {}, content) {
  const element = document.createElementNS(SVG, tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  if (content != null) element.textContent = content;
  parent?.append(element);
  return element;
}

function measure(context, value, size, weight = 400) {
  context.font = `${weight} ${size}px ${FONT}`;
  return context.measureText(String(value)).width;
}

function text(parent, context, value, x, y, { size = 9, weight = 400, color = ink, width, anchor = 'start' } = {}) {
  if (width) size = Math.min(size, size * width / Math.max(1, measure(context, value, size, weight)));
  return node(parent, 'text', { x, y, fill: color, 'font-size': size, 'font-weight': weight === 600 ? 'bold' : 'normal', 'text-anchor': anchor }, value);
}

function wrap(context, value, width, size, weight) {
  const lines = [];
  let line = '';
  for (const word of String(value).split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (measure(context, next, size, weight) <= width) { line = next; continue; }
    if (line) { lines.push(line); line = ''; }
    for (const letter of word) {
      if (line && measure(context, line + letter, size, weight) > width) { lines.push(line); line = ''; }
      line += letter;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function paragraph(parent, context, value, x, y, width, { size = 10, weight = 400, color = ink, maxLines = 2 } = {}) {
  let lines = wrap(context, value, width, size, weight);
  while (lines.length > maxLines && size > 7) { size -= 0.5; lines = wrap(context, value, width, size, weight); }
  lines.forEach((line, i) => text(parent, context, line, x, y + i * size * 1.4, { size, weight, color }));
  return y + (lines.length - 1) * size * 1.4;
}

function image(source) {
  return new Promise((resolve, reject) => {
    const bitmap = new Image();
    bitmap.onload = () => resolve(bitmap);
    bitmap.onerror = () => reject(new Error('N\u00e3o foi poss\u00edvel preparar a imagem do perfil.'));
    bitmap.src = source;
  });
}

function chartSvg(data, width, height, colors) {
  const p = data.parameters;
  const chart = window.echarts.init(null, null, { renderer: 'svg', ssr: true, width, height });
  try {
    chart.setOption({
      animation: false, backgroundColor: '#ffffff', color: colors,
      textStyle: { fontFamily: FONT, fontSize: 8, color: muted },
      grid: { left: 64, right: 18, top: 12, bottom: 44 },
      xAxis: { type: 'value', name: 'Largura da folha (mm)', nameLocation: 'middle', nameGap: 30, nameTextStyle: { fontSize: 9 }, min: p.x_min, max: p.x_max, interval: p.x_tick, axisLabel: { fontSize: 8, hideOverlap: true, formatter: fmt }, splitLine: { show: p.grid, lineStyle: { color: '#e0e6ea', width: 0.6 } }, axisLine: { show: true, lineStyle: { color: '#9eafb9', width: 0.6 } } },
      yAxis: { type: 'value', name: 'Altura do perfil (mm)', nameLocation: 'middle', nameGap: 46, nameTextStyle: { fontSize: 9 }, min: p.y_min, max: p.y_max, interval: p.y_tick, axisLabel: { fontSize: 8, hideOverlap: true, formatter: fmt }, splitLine: { show: p.grid, lineStyle: { color: '#e0e6ea', width: 0.6 } } },
      series: data.curves.map((curve) => ({ name: `${fmt(curve.pressure)} Pa`, type: 'line', data: curve.points, showSymbol: false, smooth: false, clip: true, silent: true, lineStyle: { width: p.line_width * 0.75 } })),
    });
    const document = new DOMParser().parseFromString(chart.renderToSVGString(), 'image/svg+xml');
    if (document.querySelector('parsererror')) throw new Error('N\u00e3o foi poss\u00edvel preparar o gr\u00e1fico.');
    return document.documentElement;
  } finally { chart.dispose(); }
}

async function report(data, { title, page, colors }, faces) {
  // The report has its own fixed physical page; it never inherits the web viewport.
  const landscape = page === 'landscape';
  const width = landscape ? 841.89 : 595.28, height = landscape ? 595.28 : 841.89;
  const margin = 30, inner = width - 2 * margin;
  const svg = node(null, 'svg', { width: landscape ? '297mm' : '210mm', height: landscape ? '210mm' : '297mm', viewBox: `0 0 ${width} ${height}`, 'font-family': FONT });
  node(svg, 'title', {}, title);
  const defs = node(svg, 'defs');
  node(defs, 'style', {}, faces.map((face) => `@font-face{font-family:${FONT};font-style:normal;font-weight:${face.weight};src:url(data:font/ttf;base64,${face.encoded}) format('truetype');}`).join(''));
  node(svg, 'rect', { width, height, fill: '#ffffff' });
  const context = document.createElement('canvas').getContext('2d');
  text(svg, context, 'CALCULOPERFIL', margin, 28, { weight: 600, size: 10, color: blue });
  text(svg, context, 'RESIST\u00caNCIA DE PERFIS DE ALUM\u00cdNIO', width - margin, 28, { size: 7, color: muted, anchor: 'end' });
  node(svg, 'line', { x1: margin, x2: width - margin, y1: 41, y2: 41, stroke: blue, 'stroke-width': 1.5 });

  const profile = data.profile, identityWidth = landscape ? 221 : inner - 124;
  text(svg, context, 'PERFIL DE ALUM\u00cdNIO', margin, 62, { size: 7, color: muted });
  const codeBottom = paragraph(svg, context, profile.code, margin, 87, identityWidth, { size: 22, weight: 600 });
  const nameBottom = paragraph(svg, context, profile.name, margin, codeBottom + 18, identityWidth, { size: 9, color: muted });
  text(svg, context, `Liga ${profile.alloy}`, margin, nameBottom + 20, { size: 9, weight: 600, width: identityWidth });
  const imageX = width - margin - 94;
  node(svg, 'rect', { x: imageX, y: 55, width: 94, height: 94, fill: '#ffffff', stroke: border, 'stroke-width': 0.6, rx: 2 });
  if (profile.image) {
    if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(profile.image)) throw new Error('A imagem do perfil precisa estar no formato PNG do cat\u00e1logo.');
    const bitmap = await image(profile.image), ratio = Math.min(82 / bitmap.naturalWidth, 82 / bitmap.naturalHeight);
    const w = bitmap.naturalWidth * ratio, h = bitmap.naturalHeight * ratio;
    node(svg, 'image', { href: profile.image, x: imageX + (94 - w) / 2, y: 55 + (94 - h) / 2, width: w, height: h });
  } else {
    text(svg, context, 'Imagem n\u00e3o', imageX + 47, 99, { size: 7, color: muted, anchor: 'middle' });
    text(svg, context, 'cadastrada', imageX + 47, 111, { size: 7, color: muted, anchor: 'middle' });
  }

  const metricsX = landscape ? margin + 240 : margin;
  const metricsY = landscape ? 69 : Math.max(162, nameBottom + 38);
  const metricsWidth = landscape ? inner - 354 : inner, column = metricsWidth / 4;
  node(svg, 'rect', { x: metricsX, y: metricsY, width: metricsWidth, height: 51, fill: '#eff5f8' });
  const properties = [['Jx \u00b7 mm', profile.jx, '4'], ['Wx \u00b7 mm', profile.wx, '3'], ['Peso \u00b7 kg/m', profile.weight], ['\u00c1rea \u00b7 mm', profile.area, '2']];
  properties.forEach(([label, value, power], i) => {
    const x = metricsX + column * i + 12;
    const heading = text(svg, context, label, x, metricsY + 17, { size: 7.5, color: muted });
    if (power) node(heading, 'tspan', { dy: -3, 'font-size': 5.5 }, power);
    text(svg, context, fmt(value), x, metricsY + 37, { size: 12, weight: 600, width: column - 24 });
    if (i) node(svg, 'line', { x1: x - 12, x2: x - 12, y1: metricsY + 10, y2: metricsY + 41, stroke: border, 'stroke-width': 0.6 });
  });
  const headerBottom = Math.max(149, metricsY + 51, nameBottom + 20);
  let top = paragraph(svg, context, title, margin, headerBottom + 25, inner, { size: 13, weight: 600 }) + 20;
  if (data.parameters.legend) {
    const columns = Math.max(1, Math.floor(inner / 104)), itemWidth = inner / columns;
    data.curves.forEach((curve, i) => {
      const x = margin + i % columns * itemWidth, y = top + Math.floor(i / columns) * 16;
      node(svg, 'line', { x1: x, x2: x + 15, y1: y - 3, y2: y - 3, stroke: colors[i % colors.length], 'stroke-width': 1.8 });
      text(svg, context, `${fmt(curve.pressure)} Pa`, x + 22, y, { size: 8, width: itemWidth - 26 });
    });
    top += Math.ceil(data.curves.length / columns) * 16 + 5;
  }
  const chart = chartSvg(data, inner, height - 83 - top, colors);
  chart.setAttribute('x', margin); chart.setAttribute('y', top);
  svg.append(chart);

  node(svg, 'line', { x1: margin, x2: width - margin, y1: height - 72, y2: height - 72, stroke: border, 'stroke-width': 0.6 });
  text(svg, context, `Crit\u00e9rios: ${data.criteria.join(' \u00b7 ')}`, margin, height - 57, { size: 7.5, color: muted, width: inner });
  text(svg, context, `Perfil vertical \u00b7 E ${fmt(profile.melast)} MPa \u00b7 LRT ${fmt(profile.lrt)} MPa`, margin, height - 43, { size: 7.5, color: muted, width: inner });
  text(svg, context, 'calculoperfil.gabrielvc.com.br', margin, height - 22, { size: 7, color: blue });
  text(svg, context, '1 / 1', width - margin, height - 22, { size: 7, color: muted, anchor: 'end' });
  return { svg, width, height };
}

async function png(svg, width, height) {
  const source = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }));
  try {
    const bitmap = await image(source), canvas = document.createElement('canvas');
    canvas.width = Math.round(width / 72 * 300); canvas.height = Math.round(height / 72 * 300);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('N\u00e3o foi poss\u00edvel gerar o PNG.')), 'image/png'));
  } finally { URL.revokeObjectURL(source); }
}

export async function downloadGraph(data, options) {
  const faces = await fonts();
  const { svg, width, height } = await report(data, options, faces);
  let blob;
  if (options.format === 'pdf') {
    const PDF = await pdfLibrary();
    const pdf = new PDF({ orientation: options.page === 'landscape' ? 'landscape' : 'portrait', unit: 'pt', format: 'a4', compress: true, putOnlyUsedFonts: true });
    faces.forEach((face) => { pdf.addFileToVFS(face.file, face.encoded); pdf.addFont(face.file, FONT, face.weight === '600' ? 'bold' : 'normal'); });
    pdf.setProperties({ title: options.title, subject: `Perfil ${data.profile.code} - Gr\u00e1fico de resist\u00eancia`, creator: 'Calculoperfil' });
    // Font faces are already registered with jsPDF; only the SVG download embeds CSS.
    svg.querySelector('style').remove();
    await pdf.svg(svg, { x: 0, y: 0, width, height });
    blob = pdf.output('blob');
  } else if (options.format === 'png') blob = await png(svg, width, height);
  else blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url;
  link.download = `${options.title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')}.${options.format}`;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
