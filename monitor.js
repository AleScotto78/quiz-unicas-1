// =============================================
// QUIZ MONITOR — UniCassino CyberChallenge.IT
// Ottimizzato per MOBILE + Desktop
// =============================================

let studentId = null;
let sessionId = null;
let startTime = null;
let alertCount = 0;
let isMobile = false;

// Tempi per rilevare app-switch su mobile
let blurTime = null;
let totalAppSwitchSec = 0;
let appSwitchCount = 0;

// Timer quiz
const DURATA_QUIZ_MIN = 30;
let timerInterval = null;

// --- Avvia il quiz dopo inserimento matricola ---
function avviaQuiz() {
  var input = document.getElementById('matricola-input').value.trim();

  if (!input || input.length < 4) {
    document.getElementById('matricola-input').style.borderColor = '#c0392b';
    document.getElementById('matricola-input').placeholder = 'Please enter your student ID!';
    return;
  }

  studentId = input;
  sessionId = studentId + '_' + Date.now();
  startTime = Date.now();

  // Rileva se mobile
  isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

  // Nascondi popup, mostra quiz
  document.getElementById('matricola-box').style.display = 'none';
  document.getElementById('quiz-container').style.display = 'block';
  document.getElementById('header').style.display = 'flex';
  document.getElementById('status-bar').style.display = 'flex';
  document.getElementById('header-matricola').textContent = 'Student ID: ' + studentId;

  // Costruisce il link Google Form con matricola pre-compilata
  // Usa sempre l'URL senza /u/X/ per evitare problemi con account multipli
  var formBase = "https://docs.google.com/forms/d/e/1FAIpQLSfw__-VcgEdEl15oPAvf6JKy01WY2IKPezdxEFVTP6X4FvZiQ/viewform";
  var formUrl  = formBase + "?entry.733158104=" + encodeURIComponent(studentId);

  document.getElementById('quiz-link').href = formUrl;

  // Salva la matricola attesa su Firebase come riferimento
  try {
    firebase.database()
      .ref('sessioni/' + sessionId + '/verifica')
      .set({
        matricola_attesa: studentId,
        form_url_inviato: formUrl,
        timestamp: Date.now()
      });
  } catch(e) {}

  // La verifica matricola viene gestita dentro avviaMonitor()
  // insieme al visibilitychange principale — evita listener doppi

  // Log inizio sessione con info dispositivo
  logEvent('session_start', {
    userAgent: navigator.userAgent,
    dispositivo: isMobile ? 'mobile' : 'desktop',
    screen: screen.width + 'x' + screen.height,
    language: navigator.language,
    touchscreen: ('ontouchstart' in window),
    ora_inizio: new Date().toLocaleTimeString('it-IT')
  });

  avviaTimer();
  avviaMonitor();
}

// --- Registra evento su Firebase ---
function logEvent(type, detail) {
  detail = detail || {};

  var evento = {
    type: type,
    timestamp: Date.now(),
    elapsed_sec: Math.round((Date.now() - startTime) / 1000),
    studentId: studentId,
    dispositivo: isMobile ? 'mobile' : 'desktop'
  };

  Object.assign(evento, detail);

  // Salva su Firebase
  try {
    firebase.database()
      .ref('sessioni/' + sessionId + '/eventi')
      .push(evento);
  } catch (e) {
    console.warn('Errore Firebase:', e);
  }

  // Aggiorna contatore alert
  var tipiSospetti = [
    'app_switch',       // mobile: switch ad altra app
    'cambio_tab',       // browser: cambio scheda
    'incolla',          // copia-incolla
    'touch_sospetto',   // mobile: gesture anomala
    'velocita_sospetta' // risposta troppo rapida
  ];

  if (tipiSospetti.includes(type)) {
    alertCount++;
    document.getElementById('alert-count').textContent = alertCount;

    var banner = document.getElementById('warning-banner');
    banner.style.display = 'block';
    setTimeout(function() {
      banner.style.display = 'none';
    }, 3000);
  }

  console.log('[MONITOR]', evento);
}

// =============================================
// TIMER 30 MINUTI
// =============================================
function avviaTimer() {
  var durataTotaleMs = DURATA_QUIZ_MIN * 60 * 1000;
  var fineQuiz = Date.now() + durataTotaleMs;

  // Salva ora di fine su Firebase
  try {
    firebase.database()
      .ref('sessioni/' + sessionId + '/timer')
      .set({
        inizio: Date.now(),
        fine: fineQuiz,
        durata_min: DURATA_QUIZ_MIN,
        studentId: studentId
      });
  } catch(e) {}

  timerInterval = setInterval(function() {
    var rimanente = fineQuiz - Date.now();
    var display = document.getElementById('timer-display');

    if (rimanente <= 0) {
      // TEMPO SCADUTO
      clearInterval(timerInterval);
      display.textContent = '00:00';
      display.className = 'danger';

      // Blocca il pulsante del quiz
      var link = document.getElementById('quiz-link');
      if (link) {
        link.style.background = '#888';
        link.style.pointerEvents = 'none';
        link.textContent = '⏰ Tempo scaduto';
      }

      // Mostra schermata tempo scaduto
      var exp = document.getElementById('expired-screen');
      if (exp) exp.style.display = 'flex';

      // Log su Firebase
      logEvent('tempo_scaduto', {
        durata_min: DURATA_QUIZ_MIN,
        n_switch: appSwitchCount,
        totale_fuori_sec: totalAppSwitchSec
      });

      return;
    }

    // Calcola minuti e secondi
    var minuti  = Math.floor(rimanente / 60000);
    var secondi = Math.floor((rimanente % 60000) / 1000);
    var testo   = (minuti < 10 ? '0' : '') + minuti + ':' + (secondi < 10 ? '0' : '') + secondi;

    display.textContent = testo;

    // Colore warning sotto 5 minuti
    if (rimanente < 5 * 60 * 1000) {
      display.className = 'danger';
    } else if (rimanente < 10 * 60 * 1000) {
      display.className = 'warning';
    } else {
      display.className = '';
    }

  }, 1000);
}

// =============================================
// VERIFICA MATRICOLA
// Controlla se lo studente ha modificato
// il numero di matricola nel form
// =============================================
var verificheEseguite = 0;

function verificaMatricola() {
  // Esegui al massimo 10 verifiche per non spammare Firebase
  if (verificheEseguite >= 10) return;
  verificheEseguite++;

  // Leggi la matricola salvata su Firebase e confrontala
  firebase.database()
    .ref('sessioni/' + sessionId + '/verifica/matricola_attesa')
    .once('value', function(snap) {
      var attesa = snap.val();
      if (!attesa) return;

      // Se la matricola corrente è diversa da quella attesa
      if (attesa !== studentId) {
        logEvent('matricola_cambiata', {
          matricola_originale: attesa,
          matricola_attuale: studentId,
          sospetto: true,
          note: 'Lo studente ha modificato la matricola dopo l\'apertura del form'
        });

        // Mostra avviso visivo
        var banner = document.getElementById('warning-banner');
        banner.textContent = '⚠️ Student ID anomaly detected and recorded';
        banner.style.display = 'block';
        setTimeout(function() {
          banner.textContent = '⚠️ Suspicious behaviour detected — it will be recorded.';
          banner.style.display = 'none';
        }, 4000);
      }
    });
}

// =============================================
// MONITOR PRINCIPALE
// =============================================
function avviaMonitor() {

  // =========================================
  // 1. VISIBILITYCHANGE — unico listener
  // Gestisce sia il tracking che la verifica
  // matricola. Un solo listener evita conteggi
  // doppi su mobile.
  // =========================================
  document.addEventListener('visibilitychange', function() {

    if (document.hidden) {
      // --- USCITA dalla pagina ---
      blurTime = Date.now();
      appSwitchCount++;

      logEvent('app_switch', {
        n_switch: appSwitchCount
      });

    } else {
      // --- RIENTRO nella pagina ---

      // 1. Calcola tempo fuori
      if (blurTime) {
        var secondiFuori = Math.round((Date.now() - blurTime) / 1000);
        totalAppSwitchSec += secondiFuori;

        // Calcola punteggio sospetto
        var punteggioSwitch = 0;
        var motivazione = '';

        if (secondiFuori >= 60) {
          punteggioSwitch = 40;
          motivazione = 'Away >60s — highly suspicious';
        } else if (secondiFuori >= 30) {
          punteggioSwitch = 25;
          motivazione = 'Away 30-60s — suspicious';
        } else if (secondiFuori >= 15) {
          punteggioSwitch = 15;
          motivazione = 'Away 15-30s — possible consultation';
        } else if (secondiFuori >= 5) {
          punteggioSwitch = 5;
          motivazione = 'Away 5-15s — notification or distraction';
        } else {
          punteggioSwitch = 0;
          motivazione = 'Away <5s — likely accidental';
        }

        if (appSwitchCount >= 5) {
          punteggioSwitch += 10;
          motivazione += ' + frequent switches';
        }

        logEvent('app_return', {
          secondi_fuori: secondiFuori,
          totale_fuori_sec: totalAppSwitchSec,
          n_switch: appSwitchCount,
          punteggio_switch: punteggioSwitch,
          motivazione: motivazione,
          sospetto: secondiFuori > 15
        });

        // Aggiorna riepilogo su Firebase
        try {
          firebase.database()
            .ref('sessioni/' + sessionId + '/riepilogo')
            .set({
              totale_fuori_sec: totalAppSwitchSec,
              n_switch: appSwitchCount,
              studentId: studentId,
              ultimo_switch_sec: secondiFuori
            });
        } catch(e) {}

        // Banner visivo se sospetto
        if (secondiFuori >= 15) {
          var banner = document.getElementById('warning-banner');
          banner.style.display = 'block';
          setTimeout(function() { banner.style.display = 'none'; }, 3000);
        }

        blurTime = null;
      }

      // 2. Verifica matricola al rientro
      verificaMatricola();
    }
  });

  // =========================================
  // 2. PAGEHIDE — alternativa a beforeunload
  // Su mobile beforeunload non è affidabile,
  // pagehide funziona meglio su iOS/Android.
  // =========================================
  window.addEventListener('pagehide', function() {
    logEvent('sessione_fine', {
      durata_sec: Math.round((Date.now() - startTime) / 1000),
      totale_fuori_sec: totalAppSwitchSec,
      n_switch: appSwitchCount
    });
  });

  // Mantieni anche beforeunload per desktop
  window.addEventListener('beforeunload', function() {
    logEvent('sessione_fine', {
      durata_sec: Math.round((Date.now() - startTime) / 1000),
      totale_fuori_sec: totalAppSwitchSec,
      n_switch: appSwitchCount
    });
  });

  // =========================================
  // 3. TOUCH ANOMALO — solo mobile
  // Rileva gesture multitouch insolite
  // (es. screenshot con due dita, zoom rapido)
  // =========================================
  if (isMobile) {
    var touchCount = 0;
    var touchRapidi = 0;
    var ultimoTouch = 0;

    document.addEventListener('touchstart', function(e) {
      var ora = Date.now();

      // Touch molto rapido (meno di 200ms dall'ultimo) = copia automatica?
      if (ora - ultimoTouch < 200) {
        touchRapidi++;
        if (touchRapidi > 5) {
          logEvent('touch_sospetto', {
            tipo: 'tap_rapidi',
            count: touchRapidi,
            note: 'Possibile copia automatica o interazione anomala'
          });
          touchRapidi = 0;
        }
      } else {
        touchRapidi = 0;
      }

      // Multitouch (>2 dita = screenshot su molti telefoni)
      if (e.touches.length >= 3) {
        logEvent('touch_sospetto', {
          tipo: 'multitouch',
          dita: e.touches.length,
          note: 'Possibile screenshot (3+ dita)'
        });
      }

      ultimoTouch = ora;
    }, { passive: true });
  }

  // =========================================
  // 4. INCOLLA — funziona anche su mobile
  // se lo studente copia da un'altra app
  // e incolla nel form (raro ma possibile)
  // =========================================
  document.addEventListener('paste', function(e) {
    var testo = '';
    if (e.clipboardData) {
      testo = e.clipboardData.getData('text') || '';
    }
    logEvent('incolla', {
      lunghezza: testo.length,
      anteprima: testo.slice(0, 80),
      sospetto_ai: testo.length > 80 // testo lungo = probabilmente da AI
    });
  });

  // =========================================
  // 5. VELOCITÀ DI RISPOSTA SOSPETTA
  // Monitora il tempo totale della sessione.
  // Un quiz da 20 domande completato in <3 min
  // su mobile è statisticamente anomalo.
  // =========================================
  setInterval(function() {
    var elapsed = Math.round((Date.now() - startTime) / 1000);

    // Salva snapshot ogni 30 secondi
    try {
      firebase.database()
        .ref('sessioni/' + sessionId + '/snapshot')
        .set({
          elapsed_sec: elapsed,
          n_switch: appSwitchCount,
          totale_fuori_sec: totalAppSwitchSec,
          alert_count: alertCount,
          studentId: studentId,
          ultimo_aggiornamento: new Date().toLocaleTimeString('it-IT')
        });
    } catch(e) {}
  }, 30000);

  // =========================================
  // 6. PING ogni 60 secondi
  // Verifica presenza continua dello studente
  // =========================================
  setInterval(function() {
    logEvent('ping', {
      elapsed_sec: Math.round((Date.now() - startTime) / 1000),
      n_switch_totali: appSwitchCount,
      secondi_fuori_totali: totalAppSwitchSec
    });
  }, 60000);

  // =========================================
  // 7. DESKTOP ONLY — eventi non mobile
  // =========================================
  if (!isMobile) {

    // DevTools
    var devToolsOpen = false;
    setInterval(function() {
      var diffW = window.outerWidth - window.innerWidth;
      var diffH = window.outerHeight - window.innerHeight;
      if (diffW > 160 || diffH > 160) {
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

    // Scorciatoie tastiera
    document.addEventListener('keydown', function(e) {
      var desc = '';
      if (e.key === 'F12') desc = 'F12';
      if (e.ctrlKey && e.shiftKey && e.key === 'I') desc = 'Ctrl+Shift+I';
      if (e.ctrlKey && e.shiftKey && e.key === 'J') desc = 'Ctrl+Shift+J';
      if (e.ctrlKey && e.key === 'u') desc = 'Ctrl+U';
      if (desc) logEvent('scorciatoia_sospetta', { tasto: desc });
    });

    // Tasto destro
    document.addEventListener('contextmenu', function() {
      logEvent('tasto_destro');
    });
  }
}
