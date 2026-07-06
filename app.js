const $ = (id) => document.getElementById(id);

const state = {
  deferredInstallPrompt: null,
  recognition: null,
  quickRecognition: null,
  listening: false,
  quickListening: false,
  mediaRecorder: null,
  recordedChunks: [],
  recordedBlob: null,
  audioObjectUrl: null,
};

const fields = {
  sourceMode: $('sourceMode'),
  transcriptionQuality: $('transcriptionQuality'),
  speechContext: $('speechContext'),
  audioFile: $('audioFile'),
  audioPreview: $('audioPreview'),
  transcriptionEndpoint: $('transcriptionEndpoint'),
  transcriptDraft: $('transcriptDraft'),
  transcriptionStatus: $('transcriptionStatus'),
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
  setupLiveTranscription();
  setupQuickSpeech();
  restoreSettings();
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

  $('startLiveBtn').addEventListener('click', startLiveTranscription);
  $('stopLiveBtn').addEventListener('click', stopLiveTranscription);
  $('startRecordingBtn').addEventListener('click', startAudioRecording);
  $('stopRecordingBtn').addEventListener('click', stopAudioRecording);
  $('transcribeFileBtn').addEventListener('click', transcribeFileWithEndpoint);
  $('cleanTranscriptBtn').addEventListener('click', () => {
    fields.transcriptDraft.value = cleanTranscript(fields.transcriptDraft.value);
    toast('Trascrizione pulita.');
  });
  $('insertTranscriptBtn').addEventListener('click', insertTranscriptInNotes);
  $('downloadAudioBtn').addEventListener('click', downloadRecordedAudio);
  fields.audioFile.addEventListener('change', handleAudioFileChange);
  fields.transcriptionEndpoint.addEventListener('change', saveSettings);
  fields.speechContext.addEventListener('change', saveSettings);

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

function restoreSettings() {
  fields.transcriptionEndpoint.value = localStorage.getItem('recapTranscriptionEndpoint') || '';
  fields.speechContext.value = localStorage.getItem('recapSpeechContext') || '';
}

function saveSettings() {
  localStorage.setItem('recapTranscriptionEndpoint', fields.transcriptionEndpoint.value.trim());
  localStorage.setItem('recapSpeechContext', fields.speechContext.value.trim());
}

function setTranscriptionStatus(text, done = false) {
  fields.transcriptionStatus.textContent = text;
  fields.transcriptionStatus.classList.toggle('done', done);
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

  const decisionRx = /^(decisione|decisioni|deciso|abbiamo deciso|si decide|concordato|accordo)\b|\b(abbiamo concordato|è stato deciso|si è deciso|resta concordato|si conferma|confermiamo)\b/i;
  const actionRx = /^(azione|azioni|da fare|todo|prossimo passo|prossimi passi|follow up)\b|\b(invia|inviare|manda|mandare|prepara|preparare|chiama|chiamare|verifica|verificare|controlla|controllare|si occuperà|deve|dovrà|entro|scadenza)\b/i;
  const openRx = /^(punto aperto|punti aperti|da chiarire|dubbio|domanda)\b|\b(da confermare|resta da capire|da definire|in attesa di conferma|da verificare)\b/i;

  for (const line of lines) {
    const clean = stripPrefix(line);
    if (openRx.test(line)) openPoints.push(clean);
    else if (decisionRx.test(line)) decisions.push(clean);
    else if (actionRx.test(line)) actions.push(clean);
    else discussed.push(clean);
  }

  return {
    discussed: unique(discussed).slice(0, 12),
    decisions: unique(decisions).slice(0, 12),
    actions: unique(actions).slice(0, 12),
    openPoints: unique(openPoints).slice(0, 12),
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

function buildTranscriptionPrompt() {
  const context = fields.speechContext.value.trim();
  const participants = fields.participants.value.trim();
  const topic = fields.topic.value.trim();
  return [
    'Trascrivi in italiano in modo fedele, correggendo punteggiatura e parole riconosciute male.',
    'Non inventare contenuti. Mantieni decisioni, scadenze, nomi e importi esattamente come vengono detti.',
    participants ? `Partecipanti noti: ${participants}.` : '',
    topic ? `Tema: ${topic}.` : '',
    context ? `Termini da rispettare: ${context}.` : '',
  ].filter(Boolean).join(' ');
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
  const blob = content instanceof Blob ? content : new Blob([content], { type });
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
    transcript: fields.transcriptDraft.value,
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
  fields.transcriptDraft.value = item.transcript || '';
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
  fields.transcriptDraft.value = '';
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
  toastEl._timer = setTimeout(() => toastEl.classList.remove('show'), 2800);
}

function setupLiveTranscription() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    $('startLiveBtn').disabled = true;
    $('startLiveBtn').textContent = '🎙️ Live non supportato';
    setTranscriptionStatus('Live non supportato');
    return;
  }

  state.recognition = new SpeechRecognition();
  state.recognition.lang = 'it-IT';
  state.recognition.continuous = true;
  state.recognition.interimResults = true;

  let committed = '';
  state.recognition.onresult = (event) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) committed += transcript.trim() + '. ';
      else interim += transcript;
    }
    const base = fields.transcriptDraft.value.replace(/\n?\[In ascolto:.*?\]$/s, '').trim();
    fields.transcriptDraft.value = `${base ? `${base}\n` : ''}${committed.trim()}${interim ? `\n[In ascolto: ${interim}]` : ''}`.trim();
  };

  state.recognition.onerror = () => {
    setTranscriptionStatus('Errore microfono');
    toast('Problema con il microfono o permesso negato.');
  };

  state.recognition.onend = () => {
    if (state.listening) {
      try {
        state.recognition.start();
        return;
      } catch (_) {}
    }
    fields.transcriptDraft.value = fields.transcriptDraft.value.replace(/\n?\[In ascolto:.*?\]$/s, '').trim();
    committed = '';
    $('startLiveBtn').disabled = false;
    $('stopLiveBtn').disabled = true;
    setTranscriptionStatus('Fermata');
  };
}

function startLiveTranscription() {
  if (!state.recognition) return toast('Trascrizione live non supportata su questo browser.');
  const ok = confirm('Avvia la trascrizione solo se hai titolo/autorizzazione a farlo. Continuare?');
  if (!ok) return;
  try {
    saveSettings();
    state.listening = true;
    state.recognition.start();
    $('startLiveBtn').disabled = true;
    $('stopLiveBtn').disabled = false;
    setTranscriptionStatus('In ascolto', true);
    toast('Trascrizione live avviata.');
  } catch (_) {
    toast('Non riesco ad avviare la trascrizione live.');
  }
}

function stopLiveTranscription() {
  if (!state.recognition) return;
  state.listening = false;
  try { state.recognition.stop(); } catch (_) {}
  $('startLiveBtn').disabled = false;
  $('stopLiveBtn').disabled = true;
  fields.transcriptDraft.value = fields.transcriptDraft.value.replace(/\n?\[In ascolto:.*?\]$/s, '').trim();
  setTranscriptionStatus('Fermata');
}

function setupQuickSpeech() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const micBtn = $('micBtn');
  if (!SpeechRecognition) {
    micBtn.disabled = true;
    micBtn.textContent = '🎙️ Non supportata';
    return;
  }

  state.quickRecognition = new SpeechRecognition();
  state.quickRecognition.lang = 'it-IT';
  state.quickRecognition.continuous = true;
  state.quickRecognition.interimResults = true;

  let finalTranscript = '';
  state.quickRecognition.onresult = (event) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalTranscript += transcript + ' ';
      else interim += transcript;
    }
    fields.notes.value = `${fields.notes.value.replace(/\n?\[Dettatura in corso:.*?\]$/s, '').trim()}\n${finalTranscript.trim()}${interim ? `\n[Dettatura in corso: ${interim}]` : ''}`.trim();
  };

  state.quickRecognition.onend = () => {
    state.quickListening = false;
    micBtn.textContent = '🎙️ Dettatura rapida';
    fields.notes.value = fields.notes.value.replace(/\n?\[Dettatura in corso:.*?\]$/s, '').trim();
    finalTranscript = '';
  };

  micBtn.addEventListener('click', () => {
    if (!state.quickListening) {
      const ok = confirm('Avvia la dettatura solo se la conversazione è autorizzata e nel rispetto della privacy. Continuare?');
      if (!ok) return;
      state.quickListening = true;
      micBtn.textContent = '⏹️ Ferma';
      state.quickRecognition.start();
    } else {
      state.quickRecognition.stop();
    }
  });
}

async function startAudioRecording() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return toast('Registrazione non supportata su questo dispositivo.');
  }
  const ok = confirm('La registrazione audio deve essere autorizzata e conforme alla privacy. Continuare?');
  if (!ok) return;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.recordedChunks = [];
    const options = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? { mimeType: 'audio/webm;codecs=opus' } : undefined;
    state.mediaRecorder = new MediaRecorder(stream, options);
    state.mediaRecorder.ondataavailable = event => {
      if (event.data && event.data.size > 0) state.recordedChunks.push(event.data);
    };
    state.mediaRecorder.onstop = () => {
      state.recordedBlob = new Blob(state.recordedChunks, { type: state.mediaRecorder.mimeType || 'audio/webm' });
      stream.getTracks().forEach(track => track.stop());
      showAudioBlob(state.recordedBlob);
      $('downloadAudioBtn').disabled = false;
      $('startRecordingBtn').disabled = false;
      $('stopRecordingBtn').disabled = true;
      setTranscriptionStatus('Audio registrato', true);
      toast('Registrazione audio salvata nella bozza.');
    };
    state.mediaRecorder.start(1000);
    $('startRecordingBtn').disabled = true;
    $('stopRecordingBtn').disabled = false;
    setTranscriptionStatus('Registrazione', true);
    toast('Registrazione avviata.');
  } catch (error) {
    toast('Permesso microfono negato o non disponibile.');
  }
}

function stopAudioRecording() {
  if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
    state.mediaRecorder.stop();
  }
}

function showAudioBlob(blob) {
  if (state.audioObjectUrl) URL.revokeObjectURL(state.audioObjectUrl);
  state.audioObjectUrl = URL.createObjectURL(blob);
  fields.audioPreview.src = state.audioObjectUrl;
  fields.audioPreview.classList.remove('hidden');
}

function handleAudioFileChange() {
  const file = fields.audioFile.files && fields.audioFile.files[0];
  if (!file) return;
  showAudioBlob(file);
  state.recordedBlob = file;
  $('downloadAudioBtn').disabled = false;
  setTranscriptionStatus('File caricato', true);
  toast('File audio caricato.');
}

function getAudioForTranscription() {
  const uploaded = fields.audioFile.files && fields.audioFile.files[0];
  if (uploaded) return uploaded;
  if (state.recordedBlob) return state.recordedBlob;
  return null;
}

async function transcribeFileWithEndpoint() {
  const file = getAudioForTranscription();
  const endpoint = fields.transcriptionEndpoint.value.trim();
  if (!file) return toast('Carica o registra prima un audio.');
  if (!endpoint) {
    toast('Per trascrivere un file serve un endpoint AI backend.');
    return;
  }

  try {
    saveSettings();
    setTranscriptionStatus('Trascrivo...', true);
    $('transcribeFileBtn').disabled = true;

    const form = new FormData();
    form.append('file', file, file.name || `registrazione-${Date.now()}.webm`);
    form.append('context', buildTranscriptionPrompt());
    form.append('quality', fields.transcriptionQuality.value);
    form.append('diarize', fields.transcriptionQuality.value === 'relatori' ? 'true' : 'false');

    const response = await fetch(endpoint, { method: 'POST', body: form });
    if (!response.ok) throw new Error(`Errore ${response.status}`);

    const contentType = response.headers.get('content-type') || '';
    let text = '';
    if (contentType.includes('application/json')) {
      const data = await response.json();
      text = data.text || data.transcript || data.output || '';
      if (!text && Array.isArray(data.segments)) {
        text = data.segments.map(s => `${s.speaker ? `${s.speaker}: ` : ''}${s.text}`).join('\n');
      }
    } else {
      text = await response.text();
    }

    if (!text.trim()) throw new Error('Risposta vuota');
    fields.transcriptDraft.value = cleanTranscript(`${fields.transcriptDraft.value}\n${text}`.trim());
    setTranscriptionStatus('Trascritta', true);
    toast('Trascrizione completata.');
  } catch (error) {
    console.error(error);
    setTranscriptionStatus('Errore');
    toast('Trascrizione non riuscita. Controlla endpoint/backend.');
  } finally {
    $('transcribeFileBtn').disabled = false;
  }
}

function cleanTranscript(text) {
  if (!text.trim()) return '';
  let cleaned = text
    .replace(/\n?\[(In ascolto|Dettatura in corso):.*?\]$/gis, '')
    .replace(/\b(ehm+|mmm+|uhm+)\b/gi, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s+([,.!?;:])/g, '$1')
    .replace(/([,.!?;:])([^\s\n])/g, '$1 $2')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const replacements = parseContextTerms(fields.speechContext.value);
  for (const term of replacements) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    cleaned = cleaned.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), term);
  }

  cleaned = cleaned
    .split(/(?<=[.!?])\s+|\n+/)
    .map(sentence => sentence.trim())
    .filter(Boolean)
    .map(sentence => sentence.charAt(0).toUpperCase() + sentence.slice(1))
    .join('\n');

  if (cleaned && !/[.!?]$/.test(cleaned)) cleaned += '.';
  return cleaned;
}

function parseContextTerms(value) {
  return (value || '')
    .split(/[,;\n]+/)
    .map(x => x.trim())
    .filter(x => x.length > 2 && x.length < 50);
}

function insertTranscriptInNotes() {
  const transcript = cleanTranscript(fields.transcriptDraft.value);
  if (!transcript) return toast('Non c’è una trascrizione da usare.');
  fields.transcriptDraft.value = transcript;
  const header = `Trascrizione ${fields.sourceMode.options[fields.sourceMode.selectedIndex].text} - ${new Date().toLocaleString('it-IT')}`;
  fields.notes.value = `${fields.notes.value.trim() ? `${fields.notes.value.trim()}\n\n` : ''}${header}\n${transcript}`;
  updatePrompt();
  toast('Trascrizione inserita negli appunti del recap.');
}

function downloadRecordedAudio() {
  const file = getAudioForTranscription();
  if (!file) return toast('Nessun audio da scaricare.');
  const ext = file.type.includes('wav') ? 'wav' : file.type.includes('mpeg') || file.type.includes('mp3') ? 'mp3' : 'webm';
  downloadBlob(`audio-recap-${Date.now()}.${ext}`, file, file.type || 'audio/webm');
  toast('Audio scaricato.');
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
