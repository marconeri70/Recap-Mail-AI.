const $ = (id) => document.getElementById(id);

const state = {
  deferredInstallPrompt: null,
  recognition: null,
  listening: false,
};

const fields = {
  meetingType: $('meetingType'),
  meetingDate: $('meetingDate'),
  topic: $('topic'),
  participants: $('participants'),
  recipient: $('recipient'),
  tone: $('tone'),
  replyWindow: $('replyWindow'),
  notes: $('notes'),
  manualDecisions: $('manualDecisions'),
  manualActions: $('manualActions'),
  manualOpenPoints: $('manualOpenPoints'),
  emailOutput: $('emailOutput'),
  promptOutput: $('promptOutput'),
  subjectPreview: $('subjectPreview'),
  statusBadge: $('statusBadge'),
  historyList: $('historyList'),
};

function init() {
  setDefaultDateTime();
  registerServiceWorker();
  bindEvents();
  setupSpeech();
  renderHistory();
  updatePrompt();
}

document.addEventListener('DOMContentLoaded', init);

function bindEvents() {
  $('generateBtn').addEventListener('click', () => {
    generateEmail();
    toast('Email recap generata.');
  });

  $('saveBtn').addEventListener('click', saveCurrentRecap);
  $('copyBtn').addEventListener('click', () => copyText(fields.emailOutput.value, 'Email copiata.'));
  $('copyPromptBtn').addEventListener('click', () => copyText(fields.promptOutput.value, 'Prompt copiato.'));
  $('mailtoBtn').addEventListener('click', openMailClient);
  $('downloadTxtBtn').addEventListener('click', downloadTxt);
  $('downloadEmlBtn').addEventListener('click', downloadEml);
  $('clearBtn').addEventListener('click', clearForm);
  $('exportHistoryBtn').addEventListener('click', exportHistory);
  $('installBtn').addEventListener('click', installApp);

  Object.values(fields).forEach((el) => {
    if (el && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) {
      el.addEventListener('input', updatePrompt);
    }
  });

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    state.deferredInstallPrompt = event;
    $('installBtn').classList.remove('hidden');
  });
}

function setDefaultDateTime() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  fields.meetingDate.value = now.toISOString().slice(0, 16);
}

function formatDateHuman(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('it-IT', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

function lineList(text) {
  return (text || '')
    .split(/\n+/)
    .map(line => line.trim().replace(/^[-•*]\s*/, ''))
    .filter(Boolean);
}

function unique(arr) {
  return [...new Set(arr.map(item => item.trim()).filter(Boolean))];
}

function stripPrefix(line) {
  return line
    .replace(/^(decisione|decisioni|deciso|abbiamo deciso|si decide|concordato|accordo)\s*[:\-–]?\s*/i, '')
    .replace(/^(azione|azioni|da fare|todo|prossimo passo|prossimi passi|follow up)\s*[:\-–]?\s*/i, '')
    .replace(/^(punto aperto|punti aperti|da chiarire|dubbio|domanda)\s*[:\-–]?\s*/i, '')
    .replace(/^(scadenza|entro)\s*[:\-–]?\s*/i, '')
    .trim();
}

function extractSections(notes) {
  const lines = lineList(notes);
  const decisions = [];
  const actions = [];
  const openPoints = [];
  const discussed = [];

  const decisionRx = /^(decisione|decisioni|deciso|abbiamo deciso|si decide|concordato|accordo)\b|\b(abbiamo concordato|è stato deciso|si è deciso|resta concordato)\b/i;
  const actionRx = /^(azione|azioni|da fare|todo|prossimo passo|prossimi passi|follow up)\b|\b(invia|inviare|manda|mandare|prepara|preparare|chiama|chiamare|verifica|verificare|si occuperà|deve|dovrà|entro)\b/i;
  const openRx = /^(punto aperto|punti aperti|da chiarire|dubbio|domanda)\b|\b(da confermare|resta da capire|da definire|in attesa di conferma)\b/i;

  for (const line of lines) {
    const clean = stripPrefix(line);
    if (openRx.test(line)) openPoints.push(clean);
    else if (decisionRx.test(line)) decisions.push(clean);
    else if (actionRx.test(line)) actions.push(clean);
    else discussed.push(clean);
  }

  return {
    discussed: unique(discussed).slice(0, 9),
    decisions: unique(decisions).slice(0, 9),
    actions: unique(actions).slice(0, 9),
    openPoints: unique(openPoints).slice(0, 9),
  };
}

function bulletList(items, fallback) {
  if (!items || items.length === 0) return `- ${fallback}`;
  return items.map(item => `- ${item}`).join('\n');
}

function toneIntro(tone, type) {
  const t = (tone || 'neutro').toLowerCase();
  const lowerType = (type || 'incontro').toLowerCase();

  if (t === 'formale') {
    return `Gentili,\n\ncon la presente trasmetto un riepilogo della ${lowerType} indicata in oggetto, al fine di lasciare una traccia scritta dei principali punti trattati e degli accordi emersi.`;
  }
  if (t === 'collaborativo') {
    return `Buongiorno,\n\nvi invio un breve riepilogo della ${lowerType}, così da avere tutti lo stesso quadro dei punti trattati, delle decisioni prese e dei prossimi passaggi.`;
  }
  if (t === 'tutelante') {
    return `Buongiorno,\n\nper evitare fraintendimenti e mantenere una traccia chiara di quanto condiviso, invio il seguente riepilogo della ${lowerType}. Naturalmente resto disponibile per eventuali correzioni o integrazioni.`;
  }
  if (t === 'sintetico') {
    return `Buongiorno,\n\nriepilogo di seguito quanto emerso dalla ${lowerType}.`;
  }
  return `Buongiorno,\n\ncome promemoria, invio un riepilogo della ${lowerType} con i punti principali, le decisioni e le attività da seguire.`;
}

function toneClosing(tone, replyWindow) {
  const deadline = replyWindow ? ` entro ${replyWindow}` : '';
  const request = `Vi chiedo gentilmente di segnalare eventuali correzioni o integrazioni${deadline}, così da mantenere il riepilogo allineato a quanto effettivamente condiviso.`;

  if (tone === 'formale') return `${request}\n\nCordiali saluti.`;
  if (tone === 'collaborativo') return `${request}\n\nGrazie a tutti per la collaborazione.`;
  if (tone === 'tutelante') return `${request}\n\nIn assenza di osservazioni, useremo questo riepilogo come base operativa condivisa per i prossimi passaggi.\n\nCordiali saluti.`;
  if (tone === 'sintetico') return `${request}\n\nGrazie.`;
  return `${request}\n\nGrazie.`;
}

function generateSubject() {
  const type = fields.meetingType.value || 'Recap';
  const topic = fields.topic.value.trim() || 'punti condivisi';
  const date = fields.meetingDate.value ? new Date(fields.meetingDate.value).toLocaleDateString('it-IT') : '';
  return `Recap ${type.toLowerCase()}${date ? ` del ${date}` : ''} - ${topic}`;
}

function generateEmail() {
  const parsed = extractSections(fields.notes.value);
  const manualDecisions = lineList(fields.manualDecisions.value);
  const manualActions = lineList(fields.manualActions.value);
  const manualOpen = lineList(fields.manualOpenPoints.value);

  const decisions = unique([...manualDecisions, ...parsed.decisions]);
  const actions = unique([...manualActions, ...parsed.actions]);
  const openPoints = unique([...manualOpen, ...parsed.openPoints]);

  const type = fields.meetingType.value;
  const subject = generateSubject();
  const date = formatDateHuman(fields.meetingDate.value);
  const topic = fields.topic.value.trim() || 'punti trattati';
  const participants = fields.participants.value.trim() || 'partecipanti alla conversazione';

  let body = `${toneIntro(fields.tone.value, type)}\n\n`;
  body += `Oggetto: ${topic}\n`;
  if (date) body += `Data/Ora: ${date}\n`;
  body += `Partecipanti: ${participants}\n\n`;

  body += `Punti trattati\n`;
  body += `${bulletList(parsed.discussed, 'Sono stati riepilogati i principali aspetti della conversazione.')}\n\n`;

  body += `Decisioni / accordi emersi\n`;
  body += `${bulletList(decisions, 'Nessuna decisione specifica indicata negli appunti.')}\n\n`;

  body += `Azioni e prossimi passaggi\n`;
  body += `${bulletList(actions, 'Nessuna azione specifica indicata negli appunti.')}\n\n`;

  body += `Punti aperti o da confermare\n`;
  body += `${bulletList(openPoints, 'Nessun punto aperto indicato.')}\n\n`;

  body += toneClosing(fields.tone.value, fields.replyWindow.value);

  fields.subjectPreview.textContent = subject;
  fields.emailOutput.value = body;
  fields.statusBadge.textContent = 'Generata';
  fields.statusBadge.classList.add('done');
  updatePrompt();
  return { subject, body };
}

function updatePrompt() {
  const email = fields.emailOutput.value.trim();
  const subject = fields.subjectPreview.textContent === 'Oggetto email' ? generateSubject() : fields.subjectPreview.textContent;
  fields.promptOutput.value = `Migliora questa email di recap mantenendo un tono ${fields.tone.value}, chiaro e non aggressivo. Non aggiungere fatti non presenti. Rafforza la chiarezza su decisioni, azioni, scadenze e punti aperti.\n\nOggetto: ${subject}\n\n${email || '[Incolla qui l email generata dall app]'}`;
}

async function copyText(text, message) {
  if (!text.trim()) return toast('Non c’è ancora testo da copiare.');
  try {
    await navigator.clipboard.writeText(text);
    toast(message);
  } catch (error) {
    toast('Copia non riuscita: seleziona e copia manualmente.');
  }
}

function openMailClient() {
  if (!fields.emailOutput.value.trim()) generateEmail();
  const to = encodeURIComponent(fields.recipient.value.trim());
  const subject = encodeURIComponent(fields.subjectPreview.textContent);
  const body = encodeURIComponent(fields.emailOutput.value);
  window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
}

function safeFileName(value) {
  return (value || 'recap-email')
    .toLowerCase()
    .replace(/[^a-z0-9àèéìòù\s-]/gi, '')
    .replace(/\s+/g, '-')
    .slice(0, 80);
}

function downloadBlob(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function downloadTxt() {
  if (!fields.emailOutput.value.trim()) generateEmail();
  const filename = `${safeFileName(fields.topic.value)}.txt`;
  downloadBlob(filename, `${fields.subjectPreview.textContent}\n\n${fields.emailOutput.value}`, 'text/plain;charset=utf-8');
  toast('File TXT scaricato.');
}

function downloadEml() {
  if (!fields.emailOutput.value.trim()) generateEmail();
  const to = fields.recipient.value.trim();
  const subject = fields.subjectPreview.textContent;
  const body = fields.emailOutput.value.replace(/\n/g, '\r\n');
  const eml = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    body
  ].join('\r\n');
  downloadBlob(`${safeFileName(fields.topic.value)}.eml`, eml, 'message/rfc822;charset=utf-8');
  toast('File EML scaricato.');
}

function saveCurrentRecap() {
  if (!fields.emailOutput.value.trim()) generateEmail();
  const item = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    createdAt: new Date().toISOString(),
    type: fields.meetingType.value,
    date: fields.meetingDate.value,
    topic: fields.topic.value.trim() || 'Recap senza titolo',
    participants: fields.participants.value.trim(),
    recipient: fields.recipient.value.trim(),
    subject: fields.subjectPreview.textContent,
    body: fields.emailOutput.value,
    notes: fields.notes.value,
  };
  const history = getHistory();
  history.unshift(item);
  localStorage.setItem('recapMailHistory', JSON.stringify(history.slice(0, 80)));
  renderHistory();
  toast('Recap salvato nello storico locale.');
}

function getHistory() {
  try {
    return JSON.parse(localStorage.getItem('recapMailHistory')) || [];
  } catch (_) {
    return [];
  }
}

function renderHistory() {
  const history = getHistory();
  if (!history.length) {
    fields.historyList.innerHTML = '<p class="subtitle">Nessun recap salvato. Quando salvi una bozza, comparirà qui.</p>';
    return;
  }
  fields.historyList.innerHTML = history.map(item => `
    <article class="history-item">
      <div>
        <h3>${escapeHtml(item.topic)}</h3>
        <p>${escapeHtml(item.type)} · ${escapeHtml(formatDateHuman(item.date) || new Date(item.createdAt).toLocaleString('it-IT'))}</p>
        <p>${escapeHtml(item.subject)}</p>
      </div>
      <div class="history-buttons">
        <button class="ghost small" type="button" data-load="${item.id}">Apri</button>
        <button class="ghost small" type="button" data-copy="${item.id}">Copia</button>
        <button class="ghost small" type="button" data-delete="${item.id}">Elimina</button>
      </div>
    </article>
  `).join('');

  fields.historyList.querySelectorAll('[data-load]').forEach(btn => btn.addEventListener('click', () => loadHistory(btn.dataset.load)));
  fields.historyList.querySelectorAll('[data-copy]').forEach(btn => btn.addEventListener('click', () => copyHistory(btn.dataset.copy)));
  fields.historyList.querySelectorAll('[data-delete]').forEach(btn => btn.addEventListener('click', () => deleteHistory(btn.dataset.delete)));
}

function loadHistory(id) {
  const item = getHistory().find(x => x.id === id);
  if (!item) return;
  fields.meetingType.value = item.type || 'Meeting';
  fields.meetingDate.value = item.date || '';
  fields.topic.value = item.topic || '';
  fields.participants.value = item.participants || '';
  fields.recipient.value = item.recipient || '';
  fields.notes.value = item.notes || '';
  fields.subjectPreview.textContent = item.subject || generateSubject();
  fields.emailOutput.value = item.body || '';
  fields.statusBadge.textContent = 'Caricata';
  fields.statusBadge.classList.add('done');
  updatePrompt();
  toast('Recap caricato.');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function copyHistory(id) {
  const item = getHistory().find(x => x.id === id);
  if (item) copyText(`${item.subject}\n\n${item.body}`, 'Recap copiato.');
}

function deleteHistory(id) {
  const history = getHistory().filter(x => x.id !== id);
  localStorage.setItem('recapMailHistory', JSON.stringify(history));
  renderHistory();
  toast('Recap eliminato.');
}

function exportHistory() {
  const history = getHistory();
  downloadBlob('storico-recap-email.json', JSON.stringify(history, null, 2), 'application/json;charset=utf-8');
  toast('Storico esportato.');
}

function clearForm() {
  if (!confirm('Vuoi cancellare i campi della bozza attuale?')) return;
  fields.topic.value = '';
  fields.participants.value = '';
  fields.recipient.value = '';
  fields.notes.value = '';
  fields.manualDecisions.value = '';
  fields.manualActions.value = '';
  fields.manualOpenPoints.value = '';
  fields.emailOutput.value = '';
  fields.subjectPreview.textContent = 'Oggetto email';
  fields.statusBadge.textContent = 'Bozza';
  fields.statusBadge.classList.remove('done');
  setDefaultDateTime();
  updatePrompt();
  toast('Campi puliti.');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function toast(message) {
  const toastEl = $('toast');
  toastEl.textContent = message;
  toastEl.classList.add('show');
  clearTimeout(toastEl._timer);
  toastEl._timer = setTimeout(() => toastEl.classList.remove('show'), 2600);
}

function setupSpeech() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const micBtn = $('micBtn');
  if (!SpeechRecognition) {
    micBtn.disabled = true;
    micBtn.textContent = '🎙️ Non supportata';
    return;
  }

  state.recognition = new SpeechRecognition();
  state.recognition.lang = 'it-IT';
  state.recognition.continuous = true;
  state.recognition.interimResults = true;

  let finalTranscript = '';
  state.recognition.onresult = (event) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalTranscript += transcript + ' ';
      else interim += transcript;
    }
    fields.notes.value = `${fields.notes.value.replace(/\n?\[Dettatura in corso:.*?\]$/s, '').trim()}\n${finalTranscript.trim()}${interim ? `\n[Dettatura in corso: ${interim}]` : ''}`.trim();
  };

  state.recognition.onend = () => {
    state.listening = false;
    micBtn.textContent = '🎙️ Dettatura';
    fields.notes.value = fields.notes.value.replace(/\n?\[Dettatura in corso:.*?\]$/s, '').trim();
    finalTranscript = '';
  };

  micBtn.addEventListener('click', () => {
    if (!state.listening) {
      const ok = confirm('Avvia la dettatura solo se la conversazione è autorizzata e nel rispetto della privacy. Continuare?');
      if (!ok) return;
      state.listening = true;
      micBtn.textContent = '⏹️ Ferma';
      state.recognition.start();
    } else {
      state.recognition.stop();
    }
  });
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

async function installApp() {
  if (!state.deferredInstallPrompt) return;
  state.deferredInstallPrompt.prompt();
  await state.deferredInstallPrompt.userChoice;
  state.deferredInstallPrompt = null;
  $('installBtn').classList.add('hidden');
}
