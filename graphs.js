import { authorizedFetch, getProfile } from './auth-client.js';

const palette = ['#2176c1', '#d94b45', '#dc9c17', '#23966f', '#e9712a', '#22a9b7', '#a855c7', '#9ba720', '#4656c7', '#e55b9d', '#607d8b', '#744b38'];
let root, chart, config, profiles = [], result = null, generatedTitle = '', selectedProfile = null;
let openedGraph = null, snapshotSource = null, editedProfile = null, image = '', revision = 0, imageRevision = 0;
let exporting = false, generatedRevision = -1;
const $ = (selector) => root.querySelector(selector);
const fmt = (value) => value == null ? '—' : Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 2 });

async function api(path, method = 'GET', payload) {
  const response = await authorizedFetch(`/graphics/${path}`, { method, ...(payload ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) } : {}) });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) throw new Error(data?.error || 'Não foi possível acessar o gerador de gráficos.');
  return data;
}

function message(text, error = false) {
  const element = $('#graphMessage');
  element.hidden = !text; element.textContent = text;
  element.classList.toggle('is-error', error);
}

function action(text, icon, callback) {
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'secondary-btn';
  const symbol = document.createElement('i'); symbol.dataset.lucide = icon; symbol.setAttribute('aria-hidden', 'true');
  button.append(symbol, text);
  button.addEventListener('click', async () => {
    button.disabled = true;
    try { await callback(); } catch (error) { message(error.message, true); }
    finally { button.disabled = false; }
  });
  return button;
}

function tab(name) {
  root.querySelectorAll('[data-graph-tab]').forEach((button) => {
    const active = button.dataset.graphTab === name;
    button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1;
    root.querySelector(`#${button.getAttribute('aria-controls')}`).hidden = !active;
  });
  if (name === 'generator') requestAnimationFrame(() => chart?.resize());
  if (name === 'saved') loadSaved().catch((error) => message(error.message, true));
}

function dirty() {
  revision += 1;
  if (result) $('#graphStatus').textContent = 'Parâmetros alterados · gere novamente';
  for (const id of ['saveGraph', 'copyGraph', 'downloadGraph']) $(`#${id}`).disabled = true;
}

function pressures() {
  return $('#graphPressures').value.trim().split(/[,;\s]+/).filter(Boolean).map(Number);
}

function colors(values = null) {
  const previous = new Map([...$('#graphColors').querySelectorAll('input')].map((input) => [input.dataset.pressure, input.value]));
  $('#graphColors').replaceChildren();
  pressures().slice(0, 20).forEach((pressure, index) => {
    if (!Number.isFinite(pressure) || pressure <= 0) return;
    const label = document.createElement('label');
    const input = document.createElement('input'); input.type = 'color'; input.dataset.pressure = pressure;
    input.value = values?.[index] || previous.get(String(pressure)) || palette[index % palette.length];
    input.setAttribute('aria-label', `Cor de ${pressure} Pa`);
    label.append(input, `${fmt(pressure)} Pa`); $('#graphColors').append(label);
  });
}

function parameters() {
  const form = $('#graphForm');
  const data = Object.fromEntries(['x_min', 'x_max', 'x_tick', 'y_min', 'y_max', 'y_tick', 'sample_step', 'line_width'].map((key) => [key, Number(form.elements[key].value)]));
  return { ...data, pressures: pressures(), colors: [...$('#graphColors').querySelectorAll('input')].map((input) => input.value), grid: form.elements.grid.checked, legend: form.elements.legend.checked };
}

function payload() {
  const settings = parameters();
  return { ...(snapshotSource ? { saved_id: snapshotSource } : { profile_id: $('#graphProfile').value }), parameters: settings, title: $('#graphTitle').value.trim() || selectedProfile?.code || 'Gráfico de resistência' };
}

function preview(profile) {
  selectedProfile = profile;
  $('#graphProfileInfo').hidden = !profile;
  $('#graphProfileProperties').replaceChildren();
  $('#graphProfileImage').hidden = !profile?.image;
  if (profile?.image) $('#graphProfileImage').src = profile.image;
  else $('#graphProfileImage').removeAttribute('src');
  if (!profile) return;
  for (const [label, value, unit] of [['Jx', profile.jx, 'mm⁴'], ['Wx', profile.wx, 'mm³'], ['Peso', profile.weight, 'kg/m'], ['Área', profile.area, 'mm²']]) {
    const row = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd');
    dt.textContent = label; dd.textContent = `${fmt(value)} ${unit}`; row.append(dt, dd); $('#graphProfileProperties').append(row);
  }
}

async function chooseProfile(id) {
  const current = ++revision;
  snapshotSource = null;
  if (!id) { preview(null); dirty(); return; }
  const profile = await api(`profiles/${id}`);
  if (current !== revision) return;
  preview(profile); dirty();
}

function renderCatalogue() {
  const list = $('#graphProfilesList'); list.replaceChildren();
  const term = $('#profileSearch').value.toLocaleLowerCase('pt-BR');
  const visible = profiles.filter((profile) => `${profile.code} ${profile.name}`.toLocaleLowerCase('pt-BR').includes(term));
  if (!visible.length) { const cell = list.insertRow().insertCell(); cell.colSpan = 7; cell.textContent = 'Nenhum perfil encontrado.'; }
  visible.forEach((profile) => {
    const row = list.insertRow(), identity = row.insertCell(), code = document.createElement('strong'), name = document.createElement('small');
    code.textContent = profile.code; name.textContent = profile.name; identity.append(code, name);
    for (const value of [profile.alloy, fmt(profile.jx), fmt(profile.wx), fmt(profile.weight), fmt(profile.area)]) row.insertCell().textContent = value;
    const actions = row.insertCell();
    actions.append(action('Usar', 'mouse-pointer-2', async () => { $('#graphProfile').value = profile.id; await chooseProfile(profile.id); tab('generator'); }));
    if (getProfile()?.admin) {
      actions.append(action('Editar', 'pencil', () => editProfile(profile.id)));
      actions.append(action('Excluir', 'trash-2', async () => {
        if (!confirm(`Excluir o perfil ${profile.code}? Gráficos salvos manterão os dados originais.`)) return;
        await api(`profiles/${profile.id}`, 'DELETE');
        if ($('#graphProfile').value === profile.id && !snapshotSource) { preview(null); dirty(); }
        await loadProfiles(); message('Perfil excluído.');
      }));
    }
  });
  window.lucide?.createIcons();
}

async function loadProfiles() {
  profiles = (await api('profiles')).profiles;
  const select = $('#graphProfile'), current = select.value;
  select.replaceChildren(new Option('Selecione um perfil', ''));
  profiles.forEach((profile) => select.add(new Option(`${profile.code} · ${profile.name}`, profile.id)));
  if (snapshotSource && selectedProfile && !profiles.some((profile) => profile.id === current)) select.add(new Option(`${selectedProfile.code} · salvo`, current));
  select.value = current;
  renderCatalogue();
}

function chartOptions(data, title) {
  const p = data?.parameters || { x_min: 600, x_max: 1500, x_tick: 100, y_min: 2200, y_max: 5500, y_tick: 200, grid: true, legend: true, colors: [] };
  const mobile = $('#profileChart').clientWidth < 550;
  return {
    animation: false, backgroundColor: '#ffffff', color: p.colors.length ? p.colors : palette,
    textStyle: { fontFamily: 'Poppins, sans-serif', color: '#47535c' },
    title: { text: title || 'Limites de utilização', subtext: data ? `${data.profile.code} · ${data.profile.alloy} · Jx ${fmt(data.profile.jx)} mm⁴ · Wx ${fmt(data.profile.wx)} mm³` : '', left: 'center', top: 14, textStyle: { fontSize: mobile ? 15 : 18, width: Math.max(160, $('#profileChart').clientWidth - 40), overflow: 'truncate' }, subtextStyle: { fontSize: mobile ? 9 : 11, width: Math.max(200, $('#profileChart').clientWidth - 40), overflow: 'break' } },
    grid: { left: mobile ? 56 : 76, right: mobile ? 24 : 45, top: p.legend ? 135 : 100, bottom: 65 },
    legend: { show: p.legend, type: 'scroll', top: 78, left: 24, right: 24, itemWidth: 22, itemHeight: 3, textStyle: { fontSize: 11 } },
    tooltip: { trigger: 'axis', renderMode: 'richText', axisPointer: { type: 'cross', label: { precision: 0 } }, formatter: (items) => items.map((item) => `${item.seriesName}: ${fmt(item.value[1])} mm · ${data.criteria[item.value[2]]}`).join('\n') },
    xAxis: { type: 'value', name: 'Largura da folha (mm)', nameLocation: 'middle', nameGap: 38, min: p.x_min, max: p.x_max, interval: p.x_tick, axisLabel: { fontSize: 10, hideOverlap: true, formatter: fmt }, splitLine: { show: p.grid, lineStyle: { color: '#e4e8ec' } }, axisLine: { show: true, lineStyle: { color: '#aeb8c0' } } },
    yAxis: { type: 'value', name: 'Altura do perfil (mm)', nameLocation: 'middle', nameGap: 45, nameTextStyle: { fontSize: 10 }, min: p.y_min, max: p.y_max, interval: p.y_tick, axisLabel: { fontSize: 10, hideOverlap: true, formatter: fmt }, splitLine: { show: p.grid, lineStyle: { color: '#e4e8ec' } } },
    series: (data?.curves || []).map((curve) => ({ name: `${fmt(curve.pressure)} Pa`, type: 'line', data: curve.points, showSymbol: false, smooth: false, clip: true, lineStyle: { width: p.line_width }, emphasis: { focus: 'series', lineStyle: { width: p.line_width + 1 } } })),
  };
}

async function generate(event) {
  event?.preventDefault();
  const button = $('#generateGraph'); if (button.disabled) return;
  const current = revision;
  const submitted = payload();
  button.disabled = true; $('#generateGraphTop').disabled = true; message('');
  try {
    const data = await api('generate', 'POST', submitted);
    result = data; generatedRevision = current; generatedTitle = submitted.title;
    chart.setOption(chartOptions(data, generatedTitle), true);
    $('#graphStatus').textContent = `${data.curves.length} curvas · ${data.curves[0].points.length} pontos por curva`;
    $('#graphModel').textContent = `${snapshotSource ? 'Versão salva · ' : ''}${data.profile.code} · ${data.criteria.join(' + ')} · E ${fmt(data.profile.melast)} MPa · LRT ${fmt(data.profile.lrt)} MPa`;
    $('#profileChart').setAttribute('aria-label', `${generatedTitle}. ${data.curves.length} curvas de pressão. Larguras de ${data.parameters.x_min} a ${data.parameters.x_max} mm.`);
    for (const id of ['saveGraph', 'copyGraph', 'downloadGraph']) $(`#${id}`).disabled = current !== revision || (id === 'downloadGraph' && exporting);
    if (current !== revision) $('#graphStatus').textContent = 'Parâmetros alterados · gere novamente';
    if (!data.curves.some((curve) => curve.points[0][1] >= data.parameters.y_min && curve.points.at(-1)[1] <= data.parameters.y_max)) message('As curvas estão fora da faixa de altura exibida. Ajuste os limites do eixo.');
    return data;
  } catch (error) { message(error.message, true); }
  finally { button.disabled = false; $('#generateGraphTop').disabled = false; }
}

async function save(copy = false) {
  if (!result || $('#saveGraph').disabled) return;
  const current = revision;
  $('#saveGraph').disabled = true; $('#copyGraph').disabled = true;
  const data = { ...(snapshotSource ? { saved_id: snapshotSource } : { profile_id: $('#graphProfile').value }), title: generatedTitle, parameters: result.parameters, source_hash: result.source_hash };
  try {
    const saved = await api(openedGraph && !copy ? `saved/${openedGraph}` : 'saved', openedGraph && !copy ? 'PUT' : 'POST', data);
    if (current === revision) { openedGraph = saved.id; snapshotSource = saved.id; }
    message(copy ? 'Cópia salva.' : 'Gráfico salvo.');
    await loadSaved();
  } catch (error) { message(error.message, true); }
  finally { $('#saveGraph').disabled = current !== revision; $('#copyGraph').disabled = current !== revision; }
}

async function loadSaved() {
  const list = $('#savedGraphsList'), entries = (await api('saved')).graphs;
  list.replaceChildren();
  if (!entries.length) { const cell = list.insertRow().insertCell(); cell.colSpan = 4; cell.textContent = 'Nenhum gráfico salvo.'; }
  entries.forEach((entry) => {
    const row = list.insertRow(); row.insertCell().textContent = entry.title; row.insertCell().textContent = entry.profile_snapshot.code;
    row.insertCell().textContent = entry.updated_at ? new Date(entry.updated_at).toLocaleString('pt-BR') : '—';
    row.insertCell().append(action('Abrir', 'folder-open', () => openSaved(entry.id)), action('Excluir', 'trash-2', async () => {
      if (!confirm(`Excluir o gráfico ${entry.title}?`)) return;
      await api(`saved/${entry.id}`, 'DELETE');
      if (openedGraph === entry.id) { openedGraph = null; snapshotSource = null; dirty(); }
      await loadSaved(); message('Gráfico excluído.');
    }));
  });
  window.lucide?.createIcons();
}

async function openSaved(id) {
  const current = ++revision;
  const saved = await api(`saved/${id}`);
  if (current !== revision || root.hidden) return;
  openedGraph = id; snapshotSource = id;
  const select = $('#graphProfile');
  if (![...select.options].some((option) => option.value === saved.profile_id)) select.add(new Option(`${saved.profile_snapshot.code} · salvo`, saved.profile_id));
  select.value = saved.profile_id; preview(saved.profile_snapshot);
  $('#graphTitle').value = saved.title;
  for (const [name, value] of Object.entries(saved.parameters)) {
    const field = $('#graphForm').elements[name];
    if (field) { if (field.type === 'checkbox') field.checked = value; else field.value = value; }
  }
  $('#graphPressures').value = saved.parameters.pressures.join(', '); colors(saved.parameters.colors);
  dirty(); tab('generator');
  const generated = await generate();
  if (generated && saved.model !== generated.model) message('Gráfico recalculado com flecha absoluta de 30 mm. Salve para atualizar a versão gravada; os dados do perfil foram preservados.');
}

function alloyInfo() {
  const alloy = config.alloys[$('#profileEditor').elements.alloy.value];
  $('#profileAlloyInfo').textContent = alloy ? `E ${fmt(alloy.melast)} MPa · LRT ${fmt(alloy.lrt)} MPa` : '';
}

function imagePreview(value) {
  image = value || ''; $('#profileImagePreview').hidden = !image;
  if (image) $('#profileImagePreview').src = image; else $('#profileImagePreview').removeAttribute('src');
}

async function editProfile(id = null) {
  const current = ++imageRevision;
  const profile = id ? await api(`profiles/${id}`) : null;
  if (current !== imageRevision || root.hidden) return;
  editedProfile = id; $('#profileEditor').reset();
  if (profile) for (const [name, value] of Object.entries(profile)) { if ($('#profileEditor').elements[name]) $('#profileEditor').elements[name].value = value ?? ''; }
  $('#profileEditorTitle').textContent = id ? 'Editar perfil' : 'Cadastrar perfil';
  $('#profileEditorError').hidden = true; imagePreview(profile?.image); alloyInfo(); $('#profileEditorDialog').showModal();
}

async function saveProfile(event) {
  event.preventDefault(); const button = $('#saveProfile'); button.disabled = true;
  const data = Object.fromEntries(new FormData($('#profileEditor'))); data.image = image;
  try {
    const profile = await api(editedProfile ? `profiles/${editedProfile}` : 'profiles', editedProfile ? 'PUT' : 'POST', data);
    await loadProfiles(); $('#profileEditorDialog').close();
    if ($('#graphProfile').value === profile.id && !snapshotSource) { preview(profile); dirty(); }
    message('Perfil salvo.');
  } catch (error) { $('#profileEditorError').hidden = false; $('#profileEditorError').textContent = error.message; }
  finally { button.disabled = false; }
}

async function download() {
  if (!result || $('#downloadGraph').disabled) return;
  const data = result, title = generatedTitle;
  const format = $('#graphExportFormat').value, page = $('#graphExportPage').value;
  exporting = true; $('#downloadGraph').disabled = true; $('#downloadGraph').setAttribute('aria-busy', 'true');
  try {
    const { downloadGraph } = await import('./graph-export.js');
    await downloadGraph(data, { title, format, page, colors: data.parameters.colors.length ? data.parameters.colors : palette });
  } catch (error) { message(error.message, true); }
  finally { exporting = false; $('#downloadGraph').disabled = generatedRevision !== revision || !result; $('#downloadGraph').removeAttribute('aria-busy'); }
}

export async function initializeGraphs(view) {
  root = view;
  const stylesheet = document.createElement('link'); stylesheet.rel = 'stylesheet'; stylesheet.href = new URL('./graphs.css', import.meta.url);
  const stylesReady = new Promise((resolve, reject) => { stylesheet.onload = resolve; stylesheet.onerror = () => reject(new Error('Não foi possível carregar o estilo.')); }); document.head.append(stylesheet);
  const library = new Promise((resolve, reject) => {
    if (window.echarts) return resolve();
    const script = document.createElement('script'); script.src = 'https://cdn.jsdelivr.net/npm/echarts@5.6.0/dist/echarts.min.js'; script.onload = resolve; script.onerror = () => reject(new Error('Não foi possível carregar o gráfico.')); document.head.append(script);
  });
  config = await api('config');
  await Promise.all([stylesReady, library]);
  $('#newProfile').hidden = !config.can_edit_profiles;
  Object.keys(config.alloys).forEach((name) => $('#profileEditor').elements.alloy.add(new Option(name, name)));
  root.querySelectorAll('[data-graph-tab]').forEach((button) => {
    button.addEventListener('click', () => tab(button.dataset.graphTab));
    button.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault(); const tabs = [...root.querySelectorAll('[data-graph-tab]')];
      const next = tabs[(tabs.indexOf(button) + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]; next.click(); next.focus();
    });
  });
  $('#graphForm').addEventListener('submit', generate);
  $('#graphForm').addEventListener('input', dirty);
  $('#graphPressures').addEventListener('change', () => colors());
  $('#graphProfile').addEventListener('change', () => chooseProfile($('#graphProfile').value).catch((error) => message(error.message, true)));
  $('#profileSearch').addEventListener('input', renderCatalogue);
  $('#reloadProfiles').addEventListener('click', () => loadProfiles().catch((error) => message(error.message, true)));
  $('#reloadSaved').addEventListener('click', () => loadSaved().catch((error) => message(error.message, true)));
  $('#newProfile').addEventListener('click', () => editProfile().catch((error) => message(error.message, true)));
  $('#closeProfileEditor').addEventListener('click', () => $('#profileEditorDialog').close());
  $('#profileEditorDialog').addEventListener('click', (event) => { if (event.target === $('#profileEditorDialog')) $('#profileEditorDialog').close(); });
  $('#profileEditorDialog').addEventListener('close', () => { imageRevision += 1; });
  $('#profileEditor').addEventListener('submit', saveProfile);
  $('#profileEditor').elements.alloy.addEventListener('change', alloyInfo);
  $('#removeProfileImage').addEventListener('click', () => { imageRevision += 1; $('#profileImageFile').value = ''; imagePreview(''); });
  $('#profileImageFile').addEventListener('change', async () => {
    const file = $('#profileImageFile').files[0], current = ++imageRevision;
    if (!file) return;
    try {
      if (file.size > 1000000 || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Envie PNG, JPEG ou WebP com até 1 MB.');
      const value = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
      if (current === imageRevision) imagePreview(value);
    } catch (error) { $('#profileEditorError').textContent = error.message; $('#profileEditorError').hidden = false; }
  });
  $('#saveGraph').addEventListener('click', () => save()); $('#copyGraph').addEventListener('click', () => save(true));
  $('#downloadGraph').addEventListener('click', download);
  $('#newGraph').addEventListener('click', () => { $('#graphForm').reset(); openedGraph = null; snapshotSource = null; result = null; preview(null); colors(); dirty(); $('#graphStatus').textContent = 'Nenhum gráfico gerado'; chart.setOption(chartOptions(null), true); message(''); });
  colors(); await loadProfiles();
  new ResizeObserver(() => { if (chart && $('#profileChart').clientWidth) { chart.resize(); chart.setOption(chartOptions(result, generatedTitle), true); } }).observe($('#profileChart'));
}

export function showGraphs() {
  document.title = 'Gráficos de perfis | Calculadoras';
  if (!chart) { chart = window.echarts.init($('#profileChart'), null, { renderer: 'canvas' }); chart.setOption(chartOptions(null)); }
  requestAnimationFrame(() => chart.resize());
  $('#newProfile').hidden = !getProfile()?.admin;
  renderCatalogue();
}
