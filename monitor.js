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

// Rilevamento velocità di risposta
let ultimoInterazione = Date.now();

// --- Avvia il quiz dopo inserimento matricola ---
function avviaQuiz() {
  var input = document.getElementById('matricola-input').value.trim();

  if (!input || input.length < 4) {
    document.getElementById('matricola-input').style.borderColor = '#c0392b';
    document.getElementById('matricola-input').placeholder = 'Inserisci la matricola!';
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
  document.getElementById('header-matricola').textContent = 'Matricola: ' + studentId;

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

  // Quando lo studente torna sulla pagina dopo il form,
  // controlliamo se l'URL contiene una matricola diversa
  window.addEventListener('focus', function() {
    verificaMatricola();
  });

  document.addEventListener('visibilitychange', function() {
    if (!document.hidden) {
      verificaMatricola();
    }
  });

  // Log inizio sessione con info dispositivo
  logEvent('session_start', {
    userAgent: navigator.userAgent,
    dispositivo: isMobile ? 'mobile' : 'desktop',
    screen: screen.width + 'x' + screen.height,
    language: navigator.language,
    touchscreen: ('ontouchstart' in window),
    ora_inizio: new Date().toLocaleTimeString('it-IT')
  });

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
        banner.textContent = '⚠️ Anomalia matricola rilevata e registrata';
        banner.style.display = 'block';
        setTimeout(function() {
          banner.textContent = '⚠️ Comportamento anomalo rilevato — verrà registrato.';
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
  // 1. VISIBILITYCHANGE — funziona su MOBILE!
  // Il segnale più affidabile su smartphone.
  // Scatta quando: cambio app, schermo spento,
  // notifica aperta, split screen attivato.
  // =========================================
  document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
      blurTime = Date.now();

      logEvent('app_switch', {
        direzione: 'uscita',
        note: 'Studente ha lasciato la pagina (switch app o schermo spento)'
      });

    } else {
      // Calcola quanto tempo è stato via
      if (blurTime) {
        var secondiFuori = Math.round((Date.now() - blurTime) / 1000);
        totalAppSwitchSec += secondiFuori;
        appSwitchCount++;

        logEvent('app_return', {
          direzione: 'rientro',
          secondi_fuori: secondiFuori,
          totale_fuori_sec: totalAppSwitchSec,
          n_switch: appSwitchCount,
          sospetto: secondiFuori > 15 // >15 secondi fuori = sospetto
        });

        // Aggiorna il riepilogo nella sessione
        try {
          firebase.database()
            .ref('sessioni/' + sessionId + '/riepilogo')
            .set({
              totale_fuori_sec: totalAppSwitchSec,
              n_switch: appSwitchCount,
              studentId: studentId
            });
        } catch(e) {}

        blurTime = null;
      }
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
