// =============================================
// QUIZ MONITOR — UniCassino CyberChallenge.IT
// =============================================

let studentId = null;
let sessionId = null;
let startTime = null;
let alertCount = 0;
let devToolsOpen = false;

// --- Avvia il quiz dopo inserimento matricola ---
function avviaQuiz() {
  const input = document.getElementById('matricola-input').value.trim();

  if (!input || input.length < 4) {
    document.getElementById('matricola-input').style.borderColor = '#c0392b';
    document.getElementById('matricola-input').placeholder = 'Inserisci la matricola!';
    return;
  }

  studentId = input;
  sessionId = studentId + '_' + Date.now();
  startTime = Date.now();

  // Nascondi popup, mostra quiz
  document.getElementById('matricola-box').style.display = 'none';
  document.getElementById('quiz-container').style.display = 'block';
  document.getElementById('header').style.display = 'flex';
  document.getElementById('status-bar').style.display = 'flex';
  document.getElementById('header-matricola').textContent = 'Matricola: ' + studentId;

  // Log inizio sessione
  logEvent('session_start', {
    userAgent: navigator.userAgent,
    screen: screen.width + 'x' + screen.height,
    language: navigator.language
  });

  // Avvia tutti i monitor
  avviaMonitor();
}

// --- Registra evento su Firebase ---
function logEvent(type, detail) {
  detail = detail || {};

  const evento = {
    type: type,
    timestamp: Date.now(),
    elapsed_sec: Math.round((Date.now() - startTime) / 1000),
    studentId: studentId
  };

  // Unisci i dettagli extra
  Object.assign(evento, detail);

  // Salva su Firebase
  try {
    firebase.database()
      .ref('sessioni/' + sessionId + '/eventi')
      .push(evento);
  } catch (e) {
    console.warn('Errore Firebase:', e);
  }

  // Aggiorna contatore alert visibile
  const tipiSospetti = ['cambio_tab', 'incolla', 'devtools', 'finestra_ridotta'];
  if (tipiSospetti.includes(type)) {
    alertCount++;
    document.getElementById('alert-count').textContent = alertCount;

    // Mostra banner rosso per 3 secondi
    const banner = document.getElementById('warning-banner');
    banner.style.display = 'block';
    setTimeout(function() {
      banner.style.display = 'none';
    }, 3000);
  }

  console.log('[MONITOR]', evento);
}

// --- Avvia tutti i listener ---
function avviaMonitor() {

  // 1. Cambio di tab (lo studente passa ad un'altra scheda)
  document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
      logEvent('cambio_tab', { nascosto: true });
    } else {
      logEvent('ritorno_tab', { nascosto: false });
    }
  });

  // 2. Finestra perde il focus (es. passa ad altra app)
  window.addEventListener('blur', function() {
    logEvent('finestra_blur');
  });

  window.addEventListener('focus', function() {
    logEvent('finestra_focus');
  });

  // 3. Incolla testo (copia-incolla da ChatGPT o simili)
  document.addEventListener('paste', function(e) {
    var testo = '';
    if (e.clipboardData) {
      testo = e.clipboardData.getData('text') || '';
    }
    logEvent('incolla', {
      lunghezza: testo.length,
      anteprima: testo.slice(0, 60)
    });
  });

  // 4. Rilevamento DevTools aperti (tramite differenza dimensioni finestra)
  setInterval(function() {
    var soglia = 160;
    var diffW = window.outerWidth - window.innerWidth;
    var diffH = window.outerHeight - window.innerHeight;

    if (diffW > soglia || diffH > soglia) {
      if (!devToolsOpen) {
        devToolsOpen = true;
        logEvent('devtools', { aperto: true });
      }
    } else {
      if (devToolsOpen) {
        devToolsOpen = false;
        logEvent('devtools', { aperto: false });
      }
    }
  }, 2000);

  // 5. Ridimensionamento anomalo della finestra
  var lastW = window.innerWidth;
  window.addEventListener('resize', function() {
    var nuovaW = window.innerWidth;
    if (Math.abs(nuovaW - lastW) > 200) {
      logEvent('finestra_ridotta', {
        larghezza: nuovaW,
        altezza: window.innerHeight
      });
    }
    lastW = nuovaW;
  });

  // 6. Tasto destro (potrebbe aprire ispeziona elemento)
  document.addEventListener('contextmenu', function() {
    logEvent('tasto_destro');
  });

  // 7. Scorciatoie da tastiera sospette (F12, Ctrl+Shift+I, Ctrl+U)
  document.addEventListener('keydown', function(e) {
    var sospetto = false;
    var desc = '';

    if (e.key === 'F12') {
      sospetto = true; desc = 'F12';
    }
    if (e.ctrlKey && e.shiftKey && e.key === 'I') {
      sospetto = true; desc = 'Ctrl+Shift+I';
    }
    if (e.ctrlKey && e.shiftKey && e.key === 'J') {
      sospetto = true; desc = 'Ctrl+Shift+J';
    }
    if (e.ctrlKey && e.key === 'u') {
      sospetto = true; desc = 'Ctrl+U (visualizza sorgente)';
    }

    if (sospetto) {
      logEvent('scorciatoia_sospetta', { tasto: desc });
    }
  });

  // 8. Log di chiusura pagina
  window.addEventListener('beforeunload', function() {
    logEvent('sessione_fine', {
      durata_sec: Math.round((Date.now() - startTime) / 1000)
    });
  });

  // 9. Ping ogni 60 secondi (verifica che lo studente sia ancora presente)
  setInterval(function() {
    logEvent('ping', {
      durata_sec: Math.round((Date.now() - startTime) / 1000)
    });
  }, 60000);
}
