/* Panel: mi día, mi semana, mis tareas, mis fechas y mi avance.
   Todo se guarda solo en este celular (localStorage). Respaldo con Exportar / Importar en Ajustes. */
(function () {
  'use strict';

  var KEY = 'panel-v1';
  var DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  var VISTAS = { hoy: 'Hoy', semana: 'Semana', tareas: 'Tareas', fechas: 'Fechas', avance: 'Avance' };
  var MIN_FOCO = 25; // un "bloque" de foco, para contar avance

  /* ---------- Utilidades ---------- */
  var $ = function (s, r) { return (r || document).querySelector(s); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function pad(n) { return String(n).padStart(2, '0'); }
  function dstr(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseD(s) { var p = String(s || '').split('-'); return p.length === 3 ? new Date(+p[0], +p[1] - 1, +p[2]) : null; }
  function validD(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s || ''); }
  // El día termina a las 5:00: lo que anotas a la 1 de la mañana sigue siendo "hoy".
  function hoy() { return dstr(new Date(Date.now() - 5 * 3600000)); }
  function addDays(s, n) { var d = parseD(s); d.setDate(d.getDate() + n); return dstr(d); }
  function diff(s) { return Math.round((parseD(s) - parseD(hoy())) / 86400000); }
  function dow(s) { return (parseD(s).getDay() + 6) % 7; }
  function lunesDe(s) { return addDays(s, -dow(s)); }
  function fmt(s, largo) {
    var o = largo ? { weekday: 'long', day: 'numeric', month: 'long' } : { weekday: 'short', day: 'numeric', month: 'short' };
    return new Intl.DateTimeFormat('es-CL', o).format(parseD(s)).replace(/\./g, '');
  }
  function rel(n) {
    if (n < -1) return 'hace ' + (-n) + ' días';
    if (n === -1) return 'ayer';
    if (n === 0) return 'hoy';
    if (n === 1) return 'mañana';
    return 'en ' + n + ' días';
  }
  function horas(min) { var h = Math.floor(min / 60), m = min % 60; return h ? h + ' h' + (m ? ' ' + m + ' min' : '') : m + ' min'; }
  function byFecha(a, b) { return (a.fecha || '9999').localeCompare(b.fecha || '9999') || (a.creada || 0) - (b.creada || 0); }
  function obj(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function vibrar(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} }

  /* ---------- Estado ---------- */
  function blank() { return { v: 1, tareas: [], fechas: [], semana: [], registro: {}, foco: {}, cierres: {}, logros: {}, focoActivo: null }; }
  function norm(r) {
    var b = blank(); r = obj(r);
    if (Array.isArray(r.tareas)) b.tareas = r.tareas.filter(function (t) { return t && t.id && typeof t.t === 'string'; });
    if (Array.isArray(r.fechas)) b.fechas = r.fechas.filter(function (f) { return f && f.id && typeof f.t === 'string' && validD(f.fecha); });
    if (Array.isArray(r.semana)) b.semana = r.semana.filter(function (s) { return s && s.id && typeof s.t === 'string' && s.dia >= 0 && s.dia <= 6; });
    b.registro = obj(r.registro); b.foco = obj(r.foco); b.cierres = obj(r.cierres); b.logros = obj(r.logros);
    if (r.focoActivo && typeof r.focoActivo === 'object' && r.focoActivo.dur) b.focoActivo = r.focoActivo;
    return b;
  }
  var S = blank();
  try { var raw = localStorage.getItem(KEY); if (raw) S = norm(JSON.parse(raw)); } catch (e) {}
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); }
    catch (e) { toast('No se pudo guardar. Exporta un respaldo desde Ajustes.'); }
  }
  // Pide al navegador que no borre los datos si falta espacio.
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}

  var hashIni = location.hash.slice(1);
  var vista = VISTAS[hashIni] ? hashIni : 'hoy';
  var semOff = 0, editSemana = false, verHechas = false, diaBloque = 0, hoja = '';

  /* ---------- Avisos breves ---------- */
  var toastTimer = null, undoFn = null;
  function toast(msg, undo) {
    var el = $('#toast');
    undoFn = undo || null;
    el.innerHTML = esc(msg) + (undo ? '<button type="button" data-action="deshacer">Deshacer</button>' : '');
    el.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('on'); undoFn = null; }, undo ? 5000 : 2800);
  }

  /* ---------- Métricas de avance ---------- */
  function cerradasEn(d) { return S.tareas.filter(function (x) { return x.done && x.cerrada === d; }).length; }
  function focoEn(d) { return +S.foco[d] || 0; }
  function puntaje(d) { return cerradasEn(d) + Math.floor(focoEn(d) / MIN_FOCO); }
  function cuenta(d) { return puntaje(d) > 0; }
  function diaBajo(d) { var r = S.registro[d]; return !!r && typeof r.energia === 'number' && r.energia <= 3; }
  // Racha amable: los días con energía baja registrada no la cortan, y cada semana tiene un comodín.
  function racha() {
    var t = hoy(), d = cuenta(t) ? t : addDays(t, -1), n = 0, usados = {}, guard = 0;
    while (guard++ < 730) {
      if (cuenta(d)) n++;
      else if (!diaBajo(d)) {
        var w = lunesDe(d);
        if (usados[w]) break;
        usados[w] = d;
      }
      d = addDays(d, -1);
    }
    return { n: n, comodin: !usados[lunesDe(t)] };
  }
  function totalCerradas() { return S.tareas.filter(function (x) { return x.done; }).length; }
  function totalFoco() { return Object.keys(S.foco).reduce(function (a, k) { return a + (+S.foco[k] || 0); }, 0); }
  function semanaNumeros(lunes, hasta) {
    var r = { cerradas: 0, foco: 0, dias: 0, reg: 0, energia: 0, animo: 0, nE: 0, nA: 0 };
    for (var i = 0; i < 7; i++) {
      var d = addDays(lunes, i); if (d > hasta) break;
      r.cerradas += cerradasEn(d); r.foco += focoEn(d); if (cuenta(d)) r.dias++;
      var g = S.registro[d];
      if (g) {
        if (typeof g.energia === 'number') { r.energia += g.energia; r.nE++; }
        if (typeof g.animo === 'number') { r.animo += g.animo; r.nA++; }
        if (typeof g.energia === 'number' || typeof g.animo === 'number') r.reg++;
      }
    }
    r.energia = r.nE ? r.energia / r.nE : null; r.animo = r.nA ? r.animo / r.nA : null;
    return r;
  }

  /* ---------- Logros ---------- */
  var LOGROS = [
    ['primer-paso', 'Primer paso', 'Cerraste tu primera tarea.', function () { return totalCerradas() >= 1; }],
    ['tres', 'Tres de tres', 'Cerraste 3 cosas en un mismo día.', function () { return Object.keys(diasConCierre()).some(function (d) { return cerradasEn(d) >= 3; }); }],
    ['diez', 'Diez cerradas', 'Llevas 10 tareas hechas.', function () { return totalCerradas() >= 10; }],
    ['cincuenta', 'Cincuenta', 'Llevas 50 tareas hechas.', function () { return totalCerradas() >= 50; }],
    ['semana', 'Semana completa', '5 días con avance en una misma semana.', function () { return semanaNumeros(lunesDe(hoy()), hoy()).dias >= 5 || semanaNumeros(addDays(lunesDe(hoy()), -7), addDays(lunesDe(hoy()), -1)).dias >= 5; }],
    ['racha7', 'Siete seguidos', 'Racha de 7 días.', function () { return racha().n >= 7; }],
    ['racha30', 'Un mes', 'Racha de 30 días.', function () { return racha().n >= 30; }],
    ['foco1', 'Primer foco', 'Terminaste tu primer bloque de foco.', function () { return totalFoco() >= MIN_FOCO; }],
    ['foco10', 'Diez horas', '10 horas de foco en total.', function () { return totalFoco() >= 600; }],
    ['conocerse', 'Conocerte', '7 días registrando cómo estás.', function () { return Object.keys(S.registro).length >= 7; }],
    ['cierre7', 'Ritual', '7 cierres del día.', function () { return Object.keys(S.cierres).length >= 7; }],
    ['hito', 'Hito superado', 'Pasaste una fecha de tu camino a la titulación.', function () { return S.fechas.some(function (f) { return f.hito && f.fecha < hoy(); }); }]
  ];
  function diasConCierre() { var o = {}; S.tareas.forEach(function (x) { if (x.done && x.cerrada) o[x.cerrada] = 1; }); return o; }
  function revisarLogros() {
    var nuevos = LOGROS.filter(function (l) { return !S.logros[l[0]] && l[3](); });
    nuevos.forEach(function (l) { S.logros[l[0]] = hoy(); });
    if (nuevos.length) {
      save();
      var msg = nuevos.length === 1 ? 'Logro: ' + nuevos[0][1] + '. ' + nuevos[0][2] : '¡' + nuevos.length + ' logros nuevos! Míralos en Avance.';
      setTimeout(function () { celebrar(nuevos.length > 1); toast(msg); }, 400);
    }
    return nuevos.length;
  }

  /* ---------- Frases según cómo estás ---------- */
  var FRASES = {
    sin: ['Cuéntale a la app cómo estás y ajustamos el día a eso.', 'Un toque en energía y otro en ánimo, y partimos.'],
    baja: ['Hoy toca ir lento. Una cosa bien hecha vale más que cinco a medias.', 'Con poca energía, avanzar un poco ya es avanzar.', 'Descansar también es parte del plan.', 'Elige lo más pequeño que te acerque a algo importante.', 'No tienes que ganarte el descanso.'],
    media: ['Un bloque de foco y ya habrás movido el día.', 'Parte por lo que más pesa mientras tienes energía.', 'Primero una cosa. Después vemos.', 'Lo que cierres hoy es menos carga para mañana.', 'No hace falta que sea perfecto: hace falta que avance.'],
    alta: ['Buen día para lo difícil. Parte por eso.', 'Aprovecha la energía: un bloque de 50 minutos en lo que más importa.', 'Hoy puedes adelantar algo que venías postergando.', 'Con esta energía, lo que empieces hoy te va a rendir.'],
    noche: ['Cierra el día: marca lo hecho y deja listo mañana.', 'Lo que no salió hoy se mueve a mañana, sin culpa.', 'Antes de dormir, treinta segundos para cerrar el día.'],
    listo: ['¡Día cerrado! Lo demás puede esperar.', 'Hiciste lo que te propusiste. Descansa con gusto.', 'Bien hecho. Mañana se sigue.']
  };
  function frase(tipo) {
    var l = FRASES[tipo], t = hoy(), h = 0;
    for (var i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0;
    return l[Math.abs(h + tipo.length) % l.length];
  }
  function fraseDelDia(reg, pend, total) {
    var hh = new Date().getHours();
    if (total && !pend) return frase('listo');
    if ((hh >= 20 || hh < 5) && !S.cierres[hoy()]) return frase('noche');
    if (typeof reg.energia !== 'number') return frase('sin');
    return reg.energia <= 3 ? frase('baja') : reg.energia <= 6 ? frase('media') : frase('alta');
  }

  /* ---------- Celebración ---------- */
  function celebrar(grande) {
    vibrar(grande ? [30, 60, 30, 60, 80] : [25, 40, 25]);
    if (reduce) return;
    var box = document.createElement('div'); box.className = 'confeti'; box.setAttribute('aria-hidden', 'true');
    var colores = ['#14B39A', '#FF6B4A', '#F2A93B', '#7A5CF0', '#3CCFB4', '#FF5470'];
    var n = grande ? 70 : 34;
    for (var i = 0; i < n; i++) {
      var p = document.createElement('i');
      p.style.left = Math.random() * 100 + '%';
      p.style.background = colores[i % colores.length];
      p.style.animationDelay = Math.random() * .35 + 's';
      p.style.animationDuration = 1.1 + Math.random() * .9 + 's';
      p.style.setProperty('--x', (Math.random() * 160 - 80) + 'px');
      p.style.setProperty('--r', (Math.random() * 720 - 360) + 'deg');
      box.appendChild(p);
    }
    document.body.appendChild(box);
    setTimeout(function () { box.remove(); }, 2400);
  }

  /* ---------- Piezas comunes ---------- */
  function tareaMeta(t) {
    if (t.done) return t.cerrada ? '<span class="meta">Hecha ' + rel(diff(t.cerrada)) + '</span>' : '';
    if (!t.fecha) return '';
    var n = diff(t.fecha);
    if (n < 0) return '<span class="meta late">Atrasada · era para ' + fmt(t.fecha) + '</span>';
    if (n <= 1) return '<span class="meta">' + (n === 0 ? 'Hoy' : 'Mañana') + '</span>';
    return '<span class="meta">' + fmt(t.fecha) + ' · ' + rel(n) + '</span>';
  }
  function tareaLi(t, extra, accion) {
    return '<li class="' + (t.done ? 'done' : '') + '">' +
      '<button class="chk" type="button" data-action="' + (accion || 'toggle') + '" data-id="' + t.id + '" aria-label="' + (t.done ? 'Marcar como pendiente' : 'Marcar como hecha') + '"><span></span></button>' +
      '<button class="txt" type="button" data-action="editar" data-id="' + t.id + '"><span class="t">' + esc(t.t) + '</span>' + tareaMeta(t) + '</button>' +
      (extra || '') + '</li>';
  }
  var ICON_PLAY = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>';
  function bloquesDe(dia) {
    return S.semana.filter(function (b) { return b.dia === dia; }).sort(function (a, b) { return (a.hora || '99').localeCompare(b.hora || '99'); });
  }
  function proximasFechas(n) {
    var t = hoy();
    return S.fechas.filter(function (f) { return f.fecha >= t; }).sort(byFecha).slice(0, n);
  }
  // Color del bloque según la hora: mañana ámbar, tarde verde azulado, noche violeta.
  function franja(hora) {
    if (!hora) return '';
    var hh = +hora.slice(0, 2);
    return hh < 12 ? 't-man' : hh < 19 ? 't-tar' : 't-noc';
  }
  function bloqueLi(b) { return '<li class="' + franja(b.hora) + '"><b>' + esc(b.hora || '—') + '</b><span>' + esc(b.t) + '</span></li>'; }
  function fechaRow(f) {
    var n = diff(f.fecha), cls = n < 0 ? ' past' : n === 0 ? ' today' : n <= 3 ? ' urgent' : n <= 7 ? ' soon' : '';
    var num = n < 0 ? '<span class="fecha-n past">✓</span>' :
      '<span class="fecha-n' + cls + '">' + (n === 0 ? 'Hoy' : n) + (n === 0 ? '' : '<small>' + (n === 1 ? 'día' : 'días') + '</small>') + '</span>';
    return '<button class="fecha-row" type="button" data-action="editar-fecha" data-id="' + f.id + '">' + num +
      '<span class="fecha-b">' + esc(f.t) + (f.hito ? ' <em class="hito-tag">hito</em>' : '') + '<span>' + fmt(f.fecha) + (f.nota ? ' · ' + esc(f.nota) : '') + '</span></span></button>';
  }

  /* ---------- Hoy ---------- */
  // Cada número tiene su color: de rojo (1) a verde (10).
  function tono(i) { return Math.round((i - 1) * 14); }
  function nivel(v) { return v <= 3 ? 'Baja' : v <= 6 ? 'Media' : v <= 8 ? 'Buena' : 'Muy alta'; }
  function escala(k, label, v) {
    var b = '';
    for (var i = 1; i <= 10; i++) b += '<button type="button" data-action="registro" data-k="' + k + '" data-v="' + i + '" style="--h:' + tono(i) + '" aria-pressed="' + (v === i) + '" aria-label="' + label + ' ' + i + '">' + i + '</button>';
    var estado = typeof v === 'number' ? '<span class="on" style="--sc-c:hsl(' + tono(v) + ' 70% 42%)">' + v + ' · ' + nivel(v) + '</span>' : '<span>1 muy baja · 10 muy alta</span>';
    return '<div class="scale"><p class="scale-l">' + label + estado + '</p><div class="sc" role="group" aria-label="' + label + '">' + b + '</div></div>';
  }
  function saludo() { var h = new Date().getHours(); return h >= 5 && h < 12 ? 'Buenos días' : h >= 12 && h < 20 ? 'Buenas tardes' : 'Buenas noches'; }
  function anillo(hechas, total) {
    var r = 38, c = 2 * Math.PI * r, p = total ? hechas / total : 0;
    return '<svg class="ring" viewBox="0 0 96 96" role="img" aria-label="' + hechas + ' de ' + total + ' hechas">' +
      '<circle class="ring-bg" cx="48" cy="48" r="' + r + '"/>' +
      (p > 0 ? '<circle class="ring-fg" cx="48" cy="48" r="' + r + '" stroke-dasharray="' + (c * p).toFixed(1) + ' ' + c.toFixed(1) + '" transform="rotate(-90 48 48)"/>' : '') +
      '<text class="ring-n" x="48" y="50" text-anchor="middle">' + hechas + '/' + total + '</text>' +
      '<text class="ring-l" x="48" y="66" text-anchor="middle">hechas</text></svg>';
  }
  function pendientesHoy() { var t = hoy(); return S.tareas.filter(function (x) { return !x.done && x.fecha && x.fecha <= t; }).sort(byFecha); }
  function hechasDeHoy() { var t = hoy(); return S.tareas.filter(function (x) { return x.done && x.cerrada === t; }); }
  function renderHoy() {
    var t = hoy(), reg = S.registro[t] || {};
    var pend = pendientesHoy(), hechasHoy = hechasDeHoy();
    var baja = diaBajo(t), limite = baja ? 1 : 3;
    var registrado = typeof reg.energia === 'number' && typeof reg.animo === 'number';
    var como = '<section class="card"><h2>¿Cómo estás?</h2><p class="sub">Un toque en cada una. Puedes cambiarlo cuando quieras.</p>' +
      escala('energia', 'Energía', reg.energia) + escala('animo', 'Ánimo', reg.animo) + '</section>';
    var total = pend.length + hechasHoy.length, prox1 = proximasFechas(1)[0], ra = racha();
    var heroT = !total ? 'Día en blanco' : !pend.length ? '¡Día cerrado!' : pend.length + (pend.length === 1 ? ' cosa por hacer' : ' cosas por hacer');
    var heroP = prox1 ? 'Próximo: <b>' + esc(prox1.t) + '</b> ' + rel(diff(prox1.fecha)) + '.' : 'Sin fechas clave a la vista.';
    var h = '<section class="hero"><div><p class="hero-s">' + saludo() + (ra.n ? ' · <span class="racha-mini">racha de ' + ra.n + (ra.n === 1 ? ' día' : ' días') + '</span>' : '') + '</p><p class="hero-t">' + heroT + '</p><p class="hero-p">' + heroP + '</p></div>' + anillo(hechasHoy.length, total) +
      '<p class="hero-f">' + esc(fraseDelDia(reg, pend.length, total)) + '</p></section>';
    if (S.focoActivo) h += '<button class="foco-vivo" type="button" data-action="foco-abrir">' + ICON_PLAY + '<span>Modo foco en curso: <b>' + esc(S.focoActivo.t || 'sin tarea') + '</b></span></button>';
    // Si aún no registras cómo estás, va primero: la energía decide cuánto cabe en el día.
    if (!registrado) h += como;
    h += '<section class="card"><div class="card-h"><h2>Para hoy</h2><span class="count">' + hechasHoy.length + ' hechas · ' + pend.length + ' por hacer</span></div>';
    if (baja && pend.length > 1) h += '<p class="note calm">Energía baja. Elige una sola cosa para hoy y mueve el resto a mañana, sin culpa.</p>';
    if (pend.length || hechasHoy.length) {
      h += '<ul class="list">' + pend.map(function (x) {
        return tareaLi(x, '<button class="mini-btn icon" type="button" data-action="foco" data-id="' + x.id + '" aria-label="Modo foco en ' + esc(x.t) + '">' + ICON_PLAY + '</button>' +
          '<button class="mini-btn" type="button" data-action="manana" data-id="' + x.id + '">Mañana</button>');
      }).join('') + hechasHoy.map(function (x) { return tareaLi(x); }).join('') + '</ul>';
    } else {
      h += '<div class="empty-big"><b>Nada anotado para hoy</b>Toca el botón + para agregar algo.</div>';
    }
    if (pend.length > limite && !baja) h += '<p class="note">Tienes ' + pend.length + ' cosas para hoy. Tres es un buen máximo: mueve el resto a mañana.</p>';
    if (pend.length < limite) {
      var sugeridas = S.tareas.filter(function (x) { return !x.done && (!x.fecha || x.fecha > t); }).sort(byFecha).slice(0, 3);
      if (sugeridas.length) {
        h += '<p class="group-t" style="margin-top:16px">¿Sumar alguna?</p><ul class="list">' + sugeridas.map(function (x) {
          return tareaLi(x, '<button class="mini-btn go" type="button" data-action="a-hoy" data-id="' + x.id + '">+ Hoy</button>');
        }).join('') + '</ul>';
      }
    }
    h += '<button class="btn ghost block" type="button" data-action="foco" style="margin-top:14px">' + ICON_PLAY + ' Modo foco</button></section>';

    // Cierre del día: aparece desde las 19:00.
    var hh = new Date().getHours();
    if (S.cierres[t]) h += '<section class="card cierre-ok"><h2>Día cerrado ✓</h2><p class="sub" style="margin:0">Mañana ya está listo. ' + esc(frase('listo')) + '</p></section>';
    else if (hh >= 19 || hh < 5) h += '<section class="card cierre"><h2>Cierre del día</h2><p class="sub">Treinta segundos: marca lo hecho y deja listo mañana.</p><button class="btn block" type="button" data-action="cierre">Cerrar el día</button></section>';

    if (registrado) h += como;

    // Domingo: tu semana en números.
    if (dow(t) === 6) {
      var sn = semanaNumeros(lunesDe(t), t);
      h += '<button class="card resumen" type="button" data-action="vista" data-v="avance"><h2>Tu semana en números</h2><p class="sub" style="margin:0">' + sn.cerradas + ' cerradas · ' + horas(sn.foco) + ' de foco · ' + sn.dias + ' de 7 días con avance. Ver más →</p></button>';
    }

    var bl = bloquesDe(dow(t));
    if (bl.length) {
      h += '<section class="card"><h2>Tu ' + DIAS[dow(t)].toLowerCase() + '</h2><p class="sub">De tu semana tipo.</p><ul class="blocks">' +
        bl.map(bloqueLi).join('') + '</ul></section>';
    }

    var prox = proximasFechas(3);
    if (prox.length) h += '<section class="card"><h2>Lo que viene</h2>' + prox.map(fechaRow).join('') + '</section>';

    $('#app').innerHTML = h;
  }

  /* ---------- Semana ---------- */
  function renderSemana() {
    if (editSemana) return renderEditorSemana();
    var t = hoy(), lunes = addDays(lunesDe(t), 7 * semOff);
    var domingo = addDays(lunes, 6);
    var titulo = semOff === 0 ? 'Esta semana' : semOff === 1 ? 'Próxima semana' : semOff === -1 ? 'Semana pasada' :
      parseD(lunes).getDate() + ' ' + new Intl.DateTimeFormat('es-CL', { month: 'short' }).format(parseD(lunes)).replace('.', '') + ' al ' + parseD(domingo).getDate();
    var h = '<div class="week-nav"><button class="nav-btn" type="button" data-action="sem" data-d="-1" aria-label="Semana anterior">‹</button><p>' + titulo + '</p>' +
      '<button class="nav-btn" type="button" data-action="sem" data-d="1" aria-label="Semana siguiente">›</button></div>';
    for (var i = 0; i < 7; i++) {
      var ds = addDays(lunes, i), n = diff(ds);
      var fe = S.fechas.filter(function (f) { return f.fecha === ds; });
      var ta = S.tareas.filter(function (x) { return !x.done && x.fecha === ds; });
      var bl = bloquesDe(i);
      var body = fe.map(function (f) { return '<span class="pill fecha">' + esc(f.t) + '</span>'; }).join('') +
        ta.map(function (x) { return '<span class="pill tarea">' + esc(x.t) + '</span>'; }).join('');
      if (bl.length) body += '<ul class="blocks" style="margin-top:' + (fe.length || ta.length ? '8px' : '0') + '">' + bl.map(bloqueLi).join('') + '</ul>';
      if (!body) body = '<p class="empty">Libre</p>';
      var hechoDia = n <= 0 && cuenta(ds) ? '<em class="hecho-dia">' + cerradasEn(ds) + ' ✓</em>' : '';
      h += '<section class="day' + (n === 0 ? ' is-today' : n < 0 ? ' is-past' : '') + '"><h3>' + DIAS[i] + hechoDia + '<span>' + parseD(ds).getDate() + (n === 0 ? ' · hoy' : '') + '</span></h3>' + body + '</section>';
    }
    h += '<button class="btn ghost block" type="button" data-action="editar-semana">' + (S.semana.length ? 'Editar mi semana tipo' : 'Armar mi semana tipo') + '</button>';
    if (!S.semana.length) h += '<p class="help" style="margin-top:8px">La semana tipo son tus bloques fijos: práctica, viajes, entreno, horas de estudio. Los defines una vez y aparecen todas las semanas.</p>';
    $('#app').innerHTML = h;
  }
  function renderEditorSemana() {
    var h = '<section class="card"><h2>Semana tipo</h2><p class="sub">Tus bloques fijos. Aparecen cada semana en la pestaña Semana y en Hoy.</p>' +
      '<form id="f-bloque" class="row" style="margin-bottom:6px">' +
      '<select class="fld" id="b-dia" aria-label="Día">' + DIAS.map(function (d, i) { return '<option value="' + i + '"' + (i === diaBloque ? ' selected' : '') + '>' + d + '</option>'; }).join('') + '</select>' +
      '<input class="fld" id="b-hora" type="time" aria-label="Hora" style="flex:0 1 120px">' +
      '<input class="fld" id="b-t" type="text" placeholder="Por ejemplo: Práctica en Castro" aria-label="Qué haces" autocomplete="off" required style="flex-basis:100%">' +
      '<button class="btn block" type="submit">Agregar bloque</button></form></section>';
    DIAS.forEach(function (d, i) {
      var bl = bloquesDe(i);
      h += '<div class="ed-day"><h3>' + d + '</h3>' + (bl.length ? bl.map(function (b) {
        return '<div class="ed-row"><b>' + esc(b.hora || '—') + '</b><span>' + esc(b.t) + '</span><button class="x" type="button" data-action="borrar-bloque" data-id="' + b.id + '" aria-label="Borrar ' + esc(b.t) + '">×</button></div>';
      }).join('') : '<p class="empty" style="font-size:.88rem;margin:0">Sin bloques</p>') + '</div>';
    });
    h += '<button class="btn block" type="button" data-action="fin-semana">Listo</button>';
    $('#app').innerHTML = h;
  }

  /* ---------- Tareas ---------- */
  function renderTareas() {
    var t = hoy(), abiertas = S.tareas.filter(function (x) { return !x.done; }).sort(byFecha);
    var grupos = [
      ['Atrasadas', abiertas.filter(function (x) { return x.fecha && x.fecha < t; }), 'var(--coral)'],
      ['Hoy', abiertas.filter(function (x) { return x.fecha === t; }), 'var(--teal)'],
      ['Próximas', abiertas.filter(function (x) { return x.fecha && x.fecha > t; }), 'var(--amber)'],
      ['Sin fecha', abiertas.filter(function (x) { return !x.fecha; }), 'var(--violet)']
    ];
    var h = '<section class="card">';
    if (!abiertas.length) h += '<p class="empty">No tienes tareas abiertas. Toca <b>+</b> para anotar una.</p>';
    grupos.forEach(function (g) {
      if (!g[1].length) return;
      h += '<p class="group-t" style="--c:' + g[2] + '"><i></i>' + g[0] + ' · ' + g[1].length + '</p><ul class="list">' + g[1].map(function (x) { return tareaLi(x); }).join('') + '</ul>';
    });
    var hechas = S.tareas.filter(function (x) { return x.done; }).sort(function (a, b) { return (b.cerrada || '').localeCompare(a.cerrada || ''); });
    if (hechas.length) {
      h += '<button class="link" type="button" data-action="ver-hechas">' + (verHechas ? 'Ocultar hechas' : 'Ver hechas (' + hechas.length + ')') + '</button>';
      if (verHechas) h += '<ul class="list">' + hechas.slice(0, 50).map(function (x) { return tareaLi(x); }).join('') + '</ul>';
    }
    h += '</section>';
    $('#app').innerHTML = h;
  }

  /* ---------- Fechas ---------- */
  function renderFechas() {
    var t = hoy();
    var fut = S.fechas.filter(function (f) { return f.fecha >= t; }).sort(byFecha);
    var pas = S.fechas.filter(function (f) { return f.fecha < t; }).sort(byFecha).reverse();
    var h = '<section class="card"><h2>Fechas clave</h2><p class="sub">Entregas, citas y plazos, con los días que faltan.</p>';
    h += fut.length ? fut.map(fechaRow).join('') : '<p class="empty">No hay fechas próximas. Toca <b>+</b> y elige «Fecha clave».</p>';
    if (pas.length) {
      h += '<button class="link" type="button" data-action="ver-hechas">' + (verHechas ? 'Ocultar pasadas' : 'Ver pasadas (' + pas.length + ')') + '</button>';
      if (verHechas) h += pas.map(fechaRow).join('');
    }
    h += '</section>';
    $('#app').innerHTML = h;
  }

  /* ---------- Avance ---------- */
  function nivelDia(d) { var p = puntaje(d); return p === 0 ? 0 : p === 1 ? 1 : p === 2 ? 2 : p <= 4 ? 3 : 4; }
  function calendario() {
    var t = hoy(), semanas = 16, ini = addDays(lunesDe(t), -7 * (semanas - 1)), cells = '', meses = '', mesPrev = -1;
    for (var c = 0; c < semanas; c++) {
      var lun = addDays(ini, c * 7), m = parseD(lun).getMonth();
      meses += '<span>' + (m !== mesPrev ? new Intl.DateTimeFormat('es-CL', { month: 'short' }).format(parseD(lun)).replace('.', '') : '') + '</span>';
      mesPrev = m;
      for (var r = 0; r < 7; r++) {
        var d = addDays(ini, c * 7 + r);
        if (d > t) { cells += '<i class="fut"></i>'; continue; }
        var lv = nivelDia(d), desc = fmt(d) + ': ' + cerradasEn(d) + ' cerradas' + (focoEn(d) ? ', ' + horas(focoEn(d)) + ' de foco' : '');
        cells += '<i class="l' + lv + (d === t ? ' hoy' : '') + (lv === 0 && diaBajo(d) ? ' baja' : '') + '" title="' + esc(desc) + '"></i>';
      }
    }
    return '<div class="cal-meses" style="--n:' + semanas + '">' + meses + '</div><div class="cal" style="--n:' + semanas + '" role="img" aria-label="Días con avance en las últimas 16 semanas">' + cells + '</div>' +
      '<div class="cal-ley"><span>Menos</span><i class="l0"></i><i class="l1"></i><i class="l2"></i><i class="l3"></i><i class="l4"></i><span>Más</span><span class="cal-baja"><i class="l0 baja"></i>energía baja</span></div>';
  }
  function comparar(a, b, fmtFn) {
    var txt = fmtFn ? fmtFn(a) : a;
    if (b === null || a === null || a === b) return '<b>' + txt + '</b>';
    return '<b>' + txt + '</b><small class="' + (a > b ? 'sube' : 'baja') + '">' + (a > b ? '▲' : '▼') + '</small>';
  }
  function grafico() {
    var t = hoy(), n = 28, W = 320, H = 150, top = 12, bot = 128, bw = W / n;
    var dias = []; for (var i = n - 1; i >= 0; i--) dias.push(addDays(t, -i));
    var maxC = Math.max(3, Math.max.apply(null, dias.map(cerradasEn)));
    var g = '<line class="gr-eje" x1="0" y1="' + bot + '" x2="' + W + '" y2="' + bot + '"/>';
    dias.forEach(function (d, i) {
      var c = cerradasEn(d); if (!c) return;
      var hgt = (c / maxC) * (bot - top) * .8;
      g += '<rect class="gr-bar" x="' + (i * bw + 2).toFixed(1) + '" y="' + (bot - hgt).toFixed(1) + '" width="' + (bw - 4).toFixed(1) + '" height="' + hgt.toFixed(1) + '" rx="2"/>';
    });
    function linea(k, cls) {
      var path = '', abierto = false, puntos = '';
      dias.forEach(function (d, i) {
        var r = S.registro[d], v = r && typeof r[k] === 'number' ? r[k] : null;
        if (v === null) { abierto = false; return; }
        var x = (i * bw + bw / 2).toFixed(1), y = (bot - (v / 10) * (bot - top)).toFixed(1);
        path += (abierto ? 'L' : 'M') + x + ' ' + y; abierto = true;
        puntos += '<circle class="' + cls + '-p" cx="' + x + '" cy="' + y + '" r="2.6"/>';
      });
      return (path ? '<path class="' + cls + '" d="' + path + '"/>' : '') + puntos;
    }
    g += linea('energia', 'gr-e') + linea('animo', 'gr-a');
    [0, 7, 14, 21, 27].forEach(function (i) { g += '<text class="gr-t" x="' + (i * bw + bw / 2).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle">' + parseD(dias[i]).getDate() + '</text>'; });
    return '<svg class="grafico" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Tareas cerradas, energía y ánimo de los últimos 28 días">' + g + '</svg>' +
      '<div class="gr-ley"><span><i class="k-bar"></i>Cerradas</span><span><i class="k-e"></i>Energía</span><span><i class="k-a"></i>Ánimo</span></div>';
  }
  function hallazgo() {
    var altos = [], bajos = [];
    Object.keys(S.registro).forEach(function (d) {
      var r = S.registro[d]; if (!r || typeof r.energia !== 'number' || d >= hoy()) return;
      (r.energia >= 6 ? altos : bajos).push(puntaje(d));
    });
    if (altos.length < 3 || bajos.length < 3) {
      var faltan = Math.max(0, 3 - altos.length) + Math.max(0, 3 - bajos.length);
      return '<p class="note calm">Cuando tengas más días registrados, aquí verás cómo cambia tu avance según tu energía. Faltan unos ' + Math.max(faltan, 1) + ' días con registro.</p>';
    }
    var prom = function (a) { return a.reduce(function (x, y) { return x + y; }, 0) / a.length; };
    var pa = prom(altos), pb = prom(bajos);
    var txt = pa > pb * 1.3 ? 'Los días con energía 6 o más avanzas ' + (pb ? (pa / pb).toFixed(1).replace('.', ',') + ' veces más' : 'bastante más') + ' que los días de energía baja. Cuidar el sueño y el descanso también es avanzar.' :
      pb >= pa ? 'Aunque tengas energía baja, sigues avanzando parecido a los días buenos. Eso habla de constancia.' :
      'Tu avance cambia poco según la energía: eres bastante parejo.';
    return '<p class="note calm"><b>Lo que dicen tus datos:</b> ' + txt + ' <span class="mono">(' + altos.length + ' días altos, ' + bajos.length + ' bajos)</span></p>';
  }
  function camino() {
    var hitos = S.fechas.filter(function (f) { return f.hito; }).sort(byFecha);
    if (!hitos.length) return '<p class="empty">Marca tus entregas importantes como «Hito de mi titulación» (al crear o editar una fecha clave) y aquí verás tu camino hasta el final.</p>';
    var t = hoy(), hechos = hitos.filter(function (f) { return f.fecha < t; }).length, pct = Math.round(hechos / hitos.length * 100);
    var h = '<div class="camino-bar"><i style="width:' + pct + '%"></i></div><p class="sub" style="margin:8px 0 12px">' + hechos + ' de ' + hitos.length + ' hitos superados</p><ol class="camino">';
    var actual = false;
    hitos.forEach(function (f) {
      var pasado = f.fecha < t, cls = pasado ? 'ok' : !actual ? 'ahora' : '';
      if (!pasado) actual = true;
      h += '<li class="' + cls + '"><b>' + esc(f.t) + '</b><span>' + fmt(f.fecha) + (pasado ? ' · superado' : ' · ' + rel(diff(f.fecha))) + '</span></li>';
    });
    return h + '</ol>';
  }
  function renderAvance() {
    var t = hoy(), ra = racha();
    // Se compara con la semana pasada hasta el mismo día, para que un martes no compita contra una semana completa.
    var esta = semanaNumeros(lunesDe(t), t), pasada = semanaNumeros(addDays(lunesDe(t), -7), addDays(t, -7));
    var r1 = function (v) { return v === null ? '—' : v.toFixed(1).replace('.', ','); };
    var h = '<section class="hero hero-avance"><div><p class="hero-s">Racha amable</p><p class="hero-t">' + ra.n + (ra.n === 1 ? ' día' : ' días') + '</p>' +
      '<p class="hero-p">' + (ra.comodin ? 'Tienes un comodín esta semana: un día sin avance no corta la racha.' : 'Ya usaste el comodín de esta semana.') + ' Los días de energía baja tampoco la cortan.</p></div>' +
      '<div class="hero-num"><b>' + totalCerradas() + '</b><span>cerradas<br>en total</span></div></section>';

    h += '<section class="card"><h2>Tus días</h2><p class="sub">Cada cuadro es un día. Más color, más avance: tareas cerradas y bloques de foco.</p>' + calendario() + '</section>';

    h += '<section class="card"><h2>Tu semana en números</h2><p class="sub">Esta semana, comparada con la anterior hasta el mismo día.</p><div class="nums">' +
      '<div><span>Cerradas</span>' + comparar(esta.cerradas, pasada.cerradas) + '</div>' +
      '<div><span>Foco</span>' + comparar(esta.foco, pasada.foco, horas) + '</div>' +
      '<div><span>Días con avance</span>' + comparar(esta.dias, pasada.dias, function (v) { return v + '/' + (dow(t) + 1); }) + '</div>' +
      '<div><span>Energía promedio</span>' + comparar(esta.energia === null ? null : +esta.energia.toFixed(1), pasada.energia === null ? null : +pasada.energia.toFixed(1), r1) + '</div>' +
      '</div></section>';

    h += '<section class="card"><h2>Energía y avance</h2><p class="sub">Últimos 28 días.</p>' + grafico() + hallazgo() + '</section>';

    h += '<section class="card"><h2>Camino a la titulación</h2>' + camino() + '</section>';

    var nLog = LOGROS.filter(function (l) { return S.logros[l[0]]; }).length;
    h += '<section class="card"><div class="card-h"><h2>Logros</h2><span class="count">' + nLog + ' de ' + LOGROS.length + '</span></div><div class="logros">' +
      LOGROS.map(function (l) {
        var ok = S.logros[l[0]];
        return '<div class="logro' + (ok ? ' ok' : '') + '"><i>' + (ok ? '★' : '☆') + '</i><b>' + l[1] + '</b><span>' + l[2] + '</span></div>';
      }).join('') + '</div></section>';
    $('#app').innerHTML = h;
  }

  /* ---------- Render general ---------- */
  function render() {
    $('#titulo').textContent = VISTAS[vista];
    $('#fecha-hoy').textContent = fmt(hoy(), true);
    document.querySelectorAll('.tabbar button').forEach(function (b) {
      if (b.dataset.v === vista) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    if (vista === 'hoy') renderHoy();
    else if (vista === 'semana') renderSemana();
    else if (vista === 'tareas') renderTareas();
    else if (vista === 'avance') renderAvance();
    else renderFechas();
    if (hoja === 'cierre' && sheet.open) abrirCierre();
  }
  function irA(v) {
    vista = v; verHechas = false; editSemana = false; semOff = 0;
    try { history.replaceState(null, '', '#' + v); } catch (e) {}
    render(); window.scrollTo(0, 0);
  }

  /* ---------- Hoja inferior ---------- */
  var sheet = $('#sheet');
  function abrir(html, focoSel, modo) {
    hoja = modo || '';
    var y = sheet.open && modo && modo === sheet.dataset.modo ? sheet.scrollTop : 0;
    sheet.dataset.modo = hoja;
    sheet.innerHTML = '<div class="sheet-in">' + html + '</div>';
    if (!sheet.open) sheet.showModal();
    sheet.scrollTop = y;
    if (focoSel) { var f = $(focoSel, sheet); if (f) setTimeout(function () { f.focus(); }, 30); }
  }
  function cerrar() { if (sheet.open) sheet.close(); }
  sheet.addEventListener('close', function () { hoja = ''; sheet.dataset.modo = ''; });
  sheet.addEventListener('click', function (e) { if (e.target === sheet) cerrar(); });
  function cabecera(t) { return '<div class="sheet-h"><h2 id="sheet-t">' + t + '</h2><button class="x" type="button" data-action="cerrar" aria-label="Cerrar">×</button></div>'; }

  // Selector de fecha con botones rápidos. `sinFecha` permite elegir "Sin fecha".
  function chipsFecha(sel, sinFecha) {
    var t = hoy(), op = [['hoy', 'Hoy', t], ['manana', 'Mañana', addDays(t, 1)]];
    var viernes = addDays(t, (4 - dow(t) + 7) % 7 || 7);
    if (diff(viernes) > 1) op.push(['viernes', 'Viernes', viernes]);
    var html = op.map(function (o) { return '<button type="button" class="chip" data-action="chip-fecha" data-f="' + o[2] + '" aria-pressed="' + (sel === o[2]) + '">' + o[1] + '</button>'; }).join('');
    if (sinFecha) html += '<button type="button" class="chip" data-action="chip-fecha" data-f="" aria-pressed="' + (!sel) + '">Sin fecha</button>';
    return '<div class="chips" id="chips-f">' + html + '</div><input class="fld" type="date" id="f-fecha" value="' + (sel || '') + '" aria-label="Otra fecha">';
  }
  function leerFecha() { var i = $('#f-fecha', sheet); return i && validD(i.value) ? i.value : ''; }
  function checkHito(on) { return '<label class="check"><input type="checkbox" id="n-hito"' + (on ? ' checked' : '') + '><span>Hito de mi titulación</span></label>'; }

  var nuevoTipo = 'tarea';
  function abrirNuevo() {
    var def = vista === 'hoy' ? hoy() : '';
    abrir(cabecera('Anotar') +
      '<div class="seg" role="group" aria-label="Tipo"><button type="button" data-action="tipo" data-t="tarea" aria-pressed="' + (nuevoTipo === 'tarea') + '">Tarea</button><button type="button" data-action="tipo" data-t="fecha" aria-pressed="' + (nuevoTipo === 'fecha') + '">Fecha clave</button></div>' +
      '<form id="f-nuevo" style="display:grid;gap:14px"><textarea class="fld" id="n-t" rows="2" placeholder="' + (nuevoTipo === 'tarea' ? 'Qué tienes que hacer' : 'Qué pasa ese día (entrega, cita, plazo)') + '" aria-label="Texto" enterkeyhint="done"></textarea>' +
      '<p class="lbl">' + (nuevoTipo === 'tarea' ? '¿Para cuándo?' : '¿Qué día?') + '</p>' + chipsFecha(nuevoTipo === 'tarea' ? def : '', nuevoTipo === 'tarea') +
      (nuevoTipo === 'fecha' ? checkHito(false) : '') +
      '<button class="btn block" type="submit">Guardar</button></form>' +
      '<p class="help">Para dictar, toca el micrófono del teclado.</p>', '#n-t');
  }
  function abrirEditarTarea(id) {
    var x = S.tareas.filter(function (t) { return t.id === id; })[0]; if (!x) return;
    abrir(cabecera('Tarea') +
      '<form id="f-tarea" data-id="' + id + '" style="display:grid;gap:14px"><textarea class="fld" id="n-t" rows="2" aria-label="Texto">' + esc(x.t) + '</textarea>' +
      '<p class="lbl">¿Para cuándo?</p>' + chipsFecha(x.fecha || '', true) +
      '<button class="btn block" type="submit">Guardar</button></form>' +
      (x.done ? '' : '<button class="btn ghost block" type="button" data-action="foco" data-id="' + id + '">' + ICON_PLAY + ' Modo foco en esta tarea</button>') +
      '<button class="btn danger block" type="button" data-action="borrar-tarea" data-id="' + id + '">Eliminar tarea</button>');
  }
  function abrirEditarFecha(id) {
    var f = S.fechas.filter(function (x) { return x.id === id; })[0]; if (!f) return;
    abrir(cabecera('Fecha clave') +
      '<form id="f-fecha-ed" data-id="' + id + '" style="display:grid;gap:14px"><input class="fld" id="n-t" type="text" value="' + esc(f.t) + '" aria-label="Qué pasa">' +
      '<input class="fld" id="n-nota" type="text" value="' + esc(f.nota || '') + '" placeholder="Nota (opcional)" aria-label="Nota">' +
      '<p class="lbl">¿Qué día?</p>' + chipsFecha(f.fecha, false) + checkHito(f.hito) +
      '<button class="btn block" type="submit">Guardar</button></form>' +
      '<button class="btn danger block" type="button" data-action="borrar-fecha" data-id="' + id + '">Eliminar fecha</button>');
  }

  /* ---------- Cierre del día ---------- */
  function abrirCierre() {
    var t = hoy(), man = addDays(t, 1), reg = S.registro[t] || {};
    var pend = pendientesHoy(), hechas = hechasDeHoy();
    var paraManana = S.tareas.filter(function (x) { return !x.done && x.fecha === man; });
    var candidatas = S.tareas.filter(function (x) { return !x.done && (!x.fecha || x.fecha > man); }).sort(byFecha).slice(0, 5);
    var h = cabecera('Cierre del día') + '<p class="help">Marca lo hecho, deja listo mañana y descansa.</p>';
    h += '<p class="lbl">Hoy</p>';
    if (pend.length || hechas.length) {
      h += '<ul class="list">' + pend.map(function (x) {
        return tareaLi(x, '<button class="mini-btn" type="button" data-action="manana" data-id="' + x.id + '">Mañana</button>');
      }).join('') + hechas.map(function (x) { return tareaLi(x); }).join('') + '</ul>';
    } else h += '<p class="empty">No había nada anotado para hoy.</p>';
    if (typeof reg.energia !== 'number' || typeof reg.animo !== 'number') {
      h += '<p class="lbl">¿Cómo estuvo el día?</p>' + escala('energia', 'Energía', reg.energia) + escala('animo', 'Ánimo', reg.animo);
    }
    h += '<p class="lbl">Mañana · ' + paraManana.length + ' de 3</p>';
    if (paraManana.length) h += '<ul class="list">' + paraManana.map(function (x) { return tareaLi(x, '<button class="x" type="button" data-action="quitar-manana" data-id="' + x.id + '" aria-label="Quitar de mañana">×</button>'); }).join('') + '</ul>';
    if (paraManana.length < 3) {
      if (candidatas.length) h += '<ul class="list">' + candidatas.map(function (x) { return tareaLi(x, '<button class="mini-btn go" type="button" data-action="a-manana" data-id="' + x.id + '">+ Mañana</button>'); }).join('') + '</ul>';
      h += '<form id="f-manana" class="row"><input class="fld" id="m-t" type="text" placeholder="Algo nuevo para mañana" aria-label="Algo nuevo para mañana" autocomplete="off"><button class="btn" type="submit">Agregar</button></form>';
    }
    h += '<button class="btn block" type="button" data-action="cerrar-dia">' + (pend.length ? 'Cerrar el día (lo pendiente pasa a mañana)' : 'Cerrar el día') + '</button>';
    abrir(h, null, 'cierre');
  }
  function cerrarDia() {
    var t = hoy(), man = addDays(t, 1), movidas = 0;
    pendientesHoy().forEach(function (x) { x.fecha = man; movidas++; });
    S.cierres[t] = 1;
    save(); cerrar(); render();
    celebrar(true);
    toast((movidas ? movidas + (movidas === 1 ? ' pendiente pasa' : ' pendientes pasan') + ' a mañana. ' : '') + frase('listo'));
    revisarLogros();
  }

  /* ---------- Modo foco ---------- */
  var focoTimer = null, wakeLock = null;
  var fz = $('#foco');
  function restante() {
    var f = S.focoActivo; if (!f) return 0;
    if (f.pausa != null) return f.pausa;
    return f.fin ? Math.max(0, f.fin - Date.now()) : f.dur * 60000;
  }
  function mmss(ms) { var s = Math.ceil(ms / 1000); return pad(Math.floor(s / 60)) + ':' + pad(s % 60); }
  function pedirPantalla() {
    try { if ('wakeLock' in navigator && !wakeLock) navigator.wakeLock.request('screen').then(function (w) { wakeLock = w; w.addEventListener('release', function () { wakeLock = null; }); }).catch(function () {}); } catch (e) {}
  }
  function soltarPantalla() { try { if (wakeLock) wakeLock.release(); } catch (e) {} wakeLock = null; }
  function iniciarFoco(id) {
    var x = id ? tarea(id) : null;
    if (!S.focoActivo || (x && S.focoActivo.id !== id && !S.focoActivo.fin)) S.focoActivo = { id: x ? x.id : '', t: x ? x.t : '', dur: 25, fin: 0, pausa: null, estado: 'elegir' };
    save(); cerrar(); renderFoco();
  }
  function renderFoco() {
    var f = S.focoActivo;
    clearInterval(focoTimer);
    if (!f) { fz.hidden = true; soltarPantalla(); document.body.classList.remove('con-foco'); return; }
    fz.hidden = false; document.body.classList.add('con-foco');
    var total = f.dur * 60000, rest = restante(), p = 1 - rest / total, r = 110, c = 2 * Math.PI * r;
    var cuerpo;
    if (f.estado === 'elegir') {
      cuerpo = '<p class="fz-s">¿Cuánto rato?</p><div class="fz-durs">' + [15, 25, 50].map(function (m) {
        return '<button type="button" class="fz-dur" data-action="foco-dur" data-m="' + m + '" aria-pressed="' + (f.dur === m) + '">' + m + '<small>min</small></button>';
      }).join('') + '</div><button class="fz-btn main" type="button" data-action="foco-iniciar">Empezar</button>';
    } else if (f.estado === 'listo') {
      cuerpo = '<p class="fz-s">¡Bloque terminado! ' + f.dur + ' minutos de foco.</p>' +
        (f.id && tarea(f.id) && !tarea(f.id).done ? '<button class="fz-btn main" type="button" data-action="foco-hecha">Terminé la tarea</button><button class="fz-btn" type="button" data-action="foco-otro">Otro bloque</button>' :
          '<button class="fz-btn main" type="button" data-action="foco-otro">Otro bloque</button>') +
        '<button class="fz-btn ghost" type="button" data-action="foco-salir">Salir</button>';
    } else {
      cuerpo = '<div class="fz-ctl">' + (f.estado === 'pausa' ? '<button class="fz-btn main" type="button" data-action="foco-seguir">Seguir</button>' : '<button class="fz-btn main" type="button" data-action="foco-pausa">Pausa</button>') +
        '<button class="fz-btn ghost" type="button" data-action="foco-terminar">Terminar</button></div>';
    }
    fz.innerHTML = '<div class="fz-in"><button class="fz-x" type="button" data-action="foco-salir" aria-label="Salir del modo foco">×</button>' +
      '<p class="fz-k">Modo foco</p><h2 class="fz-t">' + esc(f.t || 'Concentración libre') + '</h2>' +
      '<div class="fz-reloj"><svg viewBox="0 0 240 240" aria-hidden="true"><circle class="fz-bg" cx="120" cy="120" r="' + r + '"/><circle class="fz-fg" id="fz-arc" cx="120" cy="120" r="' + r + '" stroke-dasharray="' + (c * p).toFixed(1) + ' ' + c.toFixed(1) + '" transform="rotate(-90 120 120)"/></svg>' +
      '<span id="fz-num" role="timer" aria-live="off">' + mmss(f.estado === 'elegir' ? f.dur * 60000 : rest) + '</span></div>' + cuerpo +
      '<p class="fz-h">' + (f.estado === 'corriendo' ? 'La pantalla queda encendida. Si sales de la app, el tiempo sigue corriendo.' : 'Hoy llevas ' + horas(focoEn(hoy())) + ' de foco.') + '</p></div>';
    if (f.estado === 'corriendo') {
      pedirPantalla();
      focoTimer = setInterval(tick, 1000); tick();
    } else soltarPantalla();
  }
  function tick() {
    var f = S.focoActivo; if (!f || f.estado !== 'corriendo') return;
    var rest = restante(), total = f.dur * 60000, c = 2 * Math.PI * 110;
    var n = $('#fz-num'), a = $('#fz-arc');
    if (n) n.textContent = mmss(rest);
    if (a) a.setAttribute('stroke-dasharray', (c * (1 - rest / total)).toFixed(1) + ' ' + c.toFixed(1));
    if (rest <= 0) terminarFoco(true);
  }
  function sumarFoco(min) { var t = hoy(); if (min > 0) S.foco[t] = focoEn(t) + min; }
  function terminarFoco(completo) {
    var f = S.focoActivo; if (!f) return;
    var hechoMin = completo ? f.dur : Math.floor((f.dur * 60000 - restante()) / 60000);
    if (completo || hechoMin >= 5) sumarFoco(hechoMin);
    if (completo) { f.estado = 'listo'; f.fin = 0; f.pausa = null; save(); vibrar([200, 100, 200]); celebrar(); renderFoco(); revisarLogros(); }
    else { S.focoActivo = null; save(); renderFoco(); render(); toast(hechoMin >= 5 ? 'Sumaste ' + horas(hechoMin) + ' de foco' : 'Foco terminado'); revisarLogros(); }
  }

  /* ---------- Ajustes y respaldo ---------- */
  function abrirAjustes() {
    var n = S.tareas.length, f = S.fechas.length, d = Object.keys(S.registro).length;
    abrir(cabecera('Ajustes') +
      '<p class="help">Tus datos viven solo en este celular: ' + n + ' tareas, ' + f + ' fechas, ' + S.semana.length + ' bloques y ' + d + ' días registrados. Si borras los datos de Chrome o cambias de teléfono, se pierden, así que exporta un respaldo de vez en cuando.</p>' +
      '<button class="btn block" type="button" data-action="exportar">Exportar respaldo</button>' +
      '<label class="btn ghost block" style="text-align:center">Importar respaldo<input type="file" id="importar" accept="application/json,.json" hidden></label>' +
      '<p class="help">Importar suma lo del archivo a lo que ya tienes; no borra nada.</p>' +
      '<p class="help">Atajos: mantén presionado el ícono de la app para ir directo a «Anotar», «Cierre del día» o «Modo foco».</p>');
  }
  function exportar() {
    var blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'panel-respaldo-' + hoy() + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    toast('Respaldo descargado');
  }
  function importar(file) {
    var r = new FileReader();
    r.onload = function () {
      var data;
      try { data = norm(JSON.parse(r.result)); } catch (e) { toast('Ese archivo no es un respaldo válido'); return; }
      var suma = 0;
      ['tareas', 'fechas', 'semana'].forEach(function (k) {
        var ids = {}; S[k].forEach(function (x) { ids[x.id] = 1; });
        data[k].forEach(function (x) { if (!ids[x.id]) { S[k].push(x); suma++; } });
      });
      ['registro', 'foco', 'cierres', 'logros'].forEach(function (k) {
        Object.keys(data[k]).forEach(function (d) { if (S[k][d] == null) { S[k][d] = data[k][d]; suma++; } });
      });
      save(); cerrar(); render();
      toast(suma ? 'Importados ' + suma + ' elementos' : 'No había nada nuevo en el archivo');
    };
    r.readAsText(file);
  }

  /* ---------- Acciones ---------- */
  function tarea(id) { return S.tareas.filter(function (t) { return t.id === id; })[0]; }
  function guardarConDeshacer(msg) {
    var antes = JSON.stringify(S);
    return function () { save(); render(); toast(msg, function () { S = norm(JSON.parse(antes)); save(); render(); }); };
  }
  function alternar(x) {
    var t = hoy(), antes = pendientesHoy().length;
    x.done = !x.done; x.cerrada = x.done ? t : '';
    save(); render();
    if (!x.done) return;
    // Celebración: grande si con esto quedó cerrado todo lo de hoy.
    var todo = antes > 0 && pendientesHoy().length === 0;
    celebrar(todo);
    toast(todo ? '¡Día cerrado! ' + frase('listo') : '¡Hecha!', todo ? null : function () { x.done = false; x.cerrada = ''; save(); render(); });
    revisarLogros();
  }

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]'); if (!el) return;
    var a = el.dataset.action, id = el.dataset.id, x;
    switch (a) {
      case 'vista': irA(el.dataset.v); break;
      case 'nuevo': abrirNuevo(); break;
      case 'ajustes': abrirAjustes(); break;
      case 'cerrar': cerrar(); break;
      case 'exportar': exportar(); break;
      case 'deshacer': if (undoFn) { var f = undoFn; undoFn = null; $('#toast').classList.remove('on'); f(); } break;
      case 'tipo': {
        var escrito = $('#n-t', sheet) ? $('#n-t', sheet).value : '';
        nuevoTipo = el.dataset.t; abrirNuevo(); $('#n-t', sheet).value = escrito;
        break;
      }
      case 'chip-fecha':
        sheet.querySelectorAll('#chips-f .chip').forEach(function (c) { c.setAttribute('aria-pressed', c === el ? 'true' : 'false'); });
        $('#f-fecha', sheet).value = el.dataset.f;
        break;
      case 'toggle': x = tarea(id); if (x) alternar(x); break;
      case 'manana': x = tarea(id); if (x) { var fin = guardarConDeshacer('Movida a mañana'); x.fecha = addDays(hoy(), 1); fin(); } break;
      case 'a-hoy': x = tarea(id); if (x) { x.fecha = hoy(); save(); render(); } break;
      case 'a-manana': x = tarea(id); if (x) { x.fecha = addDays(hoy(), 1); save(); render(); } break;
      case 'quitar-manana': x = tarea(id); if (x) { x.fecha = ''; save(); render(); } break;
      case 'editar': if (hoja !== 'cierre') abrirEditarTarea(id); break;
      case 'editar-fecha': abrirEditarFecha(id); break;
      case 'borrar-tarea': { var fin2 = guardarConDeshacer('Tarea eliminada'); S.tareas = S.tareas.filter(function (t) { return t.id !== id; }); cerrar(); fin2(); break; }
      case 'borrar-fecha': { var fin3 = guardarConDeshacer('Fecha eliminada'); S.fechas = S.fechas.filter(function (f) { return f.id !== id; }); cerrar(); fin3(); break; }
      case 'borrar-bloque': { var fin4 = guardarConDeshacer('Bloque eliminado'); S.semana = S.semana.filter(function (b) { return b.id !== id; }); fin4(); break; }
      case 'registro': {
        var t = hoy(), k = el.dataset.k, v = +el.dataset.v;
        S.registro[t] = S.registro[t] || {};
        S.registro[t][k] = v;
        save(); render(); revisarLogros();
        break;
      }
      case 'sem': semOff += +el.dataset.d; renderSemana(); break;
      case 'editar-semana': editSemana = true; renderSemana(); window.scrollTo(0, 0); break;
      case 'fin-semana': editSemana = false; renderSemana(); window.scrollTo(0, 0); break;
      case 'ver-hechas': verHechas = !verHechas; render(); break;
      case 'cierre': abrirCierre(); break;
      case 'cerrar-dia': cerrarDia(); break;
      case 'foco': iniciarFoco(id); break;
      case 'foco-abrir': renderFoco(); break;
      case 'foco-dur': S.focoActivo.dur = +el.dataset.m; save(); renderFoco(); break;
      case 'foco-iniciar': case 'foco-otro': {
        var fa = S.focoActivo; if (!fa) break;
        fa.estado = 'corriendo'; fa.pausa = null; fa.fin = Date.now() + fa.dur * 60000;
        save(); renderFoco(); vibrar(20);
        break;
      }
      case 'foco-pausa': S.focoActivo.pausa = restante(); S.focoActivo.estado = 'pausa'; save(); renderFoco(); break;
      case 'foco-seguir': S.focoActivo.fin = Date.now() + S.focoActivo.pausa; S.focoActivo.pausa = null; S.focoActivo.estado = 'corriendo'; save(); renderFoco(); break;
      case 'foco-terminar': terminarFoco(false); break;
      case 'foco-hecha': {
        x = tarea(S.focoActivo.id); S.focoActivo = null; save(); renderFoco();
        if (x && !x.done) alternar(x); else render();
        break;
      }
      case 'foco-salir': {
        var fs = S.focoActivo;
        if (fs && (fs.estado === 'corriendo' || fs.estado === 'pausa')) { fz.hidden = true; document.body.classList.remove('con-foco'); clearInterval(focoTimer); render(); toast('El foco sigue corriendo. Vuelve desde Hoy.'); }
        else { S.focoActivo = null; save(); renderFoco(); render(); }
        break;
      }
    }
  });

  document.addEventListener('change', function (e) {
    if (e.target.id === 'f-fecha') {
      var v = e.target.value;
      sheet.querySelectorAll('#chips-f .chip').forEach(function (c) { c.setAttribute('aria-pressed', c.dataset.f === v ? 'true' : 'false'); });
    }
    if (e.target.id === 'importar' && e.target.files[0]) importar(e.target.files[0]);
  });

  // Enter guarda en el campo de texto (Shift+Enter hace salto de línea).
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey && e.target.id === 'n-t' && e.target.tagName === 'TEXTAREA') {
      e.preventDefault(); e.target.form.requestSubmit();
    }
  });

  document.addEventListener('submit', function (e) {
    var f = e.target; e.preventDefault();
    var txt = $('#n-t', f) ? $('#n-t', f).value.trim() : '';
    var hito = $('#n-hito', f) ? $('#n-hito', f).checked : false;
    if (f.id === 'f-nuevo') {
      if (!txt) { $('#n-t', f).focus(); return; }
      var fecha = leerFecha();
      if (nuevoTipo === 'fecha') {
        if (!fecha) { toast('Elige el día de la fecha clave'); return; }
        S.fechas.push({ id: uid(), t: txt, fecha: fecha, nota: '', hito: hito, creada: Date.now() });
      } else {
        S.tareas.push({ id: uid(), t: txt, fecha: fecha, done: false, cerrada: '', creada: Date.now() });
      }
      save(); cerrar(); render();
      toast(nuevoTipo === 'fecha' ? 'Fecha guardada' : 'Anotada');
    } else if (f.id === 'f-tarea') {
      var x = tarea(f.dataset.id); if (!x || !txt) return;
      x.t = txt; x.fecha = leerFecha();
      save(); cerrar(); render();
    } else if (f.id === 'f-fecha-ed') {
      var fe = S.fechas.filter(function (y) { return y.id === f.dataset.id; })[0];
      var nf = leerFecha(); if (!fe || !txt) return;
      if (!nf) { toast('Elige el día'); return; }
      fe.t = txt; fe.fecha = nf; fe.nota = $('#n-nota', f).value.trim(); fe.hito = hito;
      save(); cerrar(); render();
    } else if (f.id === 'f-manana') {
      var mt = $('#m-t', f).value.trim(); if (!mt) return;
      S.tareas.push({ id: uid(), t: mt, fecha: addDays(hoy(), 1), done: false, cerrada: '', creada: Date.now() });
      save(); render();
      var mi = $('#m-t', sheet); if (mi) mi.focus();
    } else if (f.id === 'f-bloque') {
      var bt = $('#b-t').value.trim(); if (!bt) return;
      diaBloque = +$('#b-dia').value;
      S.semana.push({ id: uid(), dia: diaBloque, hora: $('#b-hora').value || '', t: bt });
      save(); renderSemana();
      toast('Bloque agregado');
      var inp = $('#b-t'); if (inp) inp.focus();
    }
  });

  // Si la app queda abierta de un día para otro, se pone al día al volver.
  var ultimoDia = hoy();
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible') return;
    if (hoy() !== ultimoDia) { ultimoDia = hoy(); render(); }
    if (S.focoActivo && !fz.hidden) { if (S.focoActivo.estado === 'corriendo') { wakeLock = null; pedirPantalla(); } tick(); }
  });
  // Atajos desde el ícono de la app (#anotar, #cierre, #foco) y pestañas por dirección.
  function atajo(h) {
    if (h === 'anotar') { irA('hoy'); abrirNuevo(); return true; }
    if (h === 'cierre') { irA('hoy'); abrirCierre(); return true; }
    if (h === 'foco') { irA('hoy'); iniciarFoco(''); return true; }
    return false;
  }
  window.addEventListener('hashchange', function () { var v = location.hash.slice(1); if (atajo(v)) return; if (VISTAS[v] && v !== vista) irA(v); });

  render();
  revisarLogros();
  if (!atajo(hashIni) && S.focoActivo) {
    // Un foco que terminó mientras la app estaba cerrada se cuenta al volver.
    if (S.focoActivo.estado === 'corriendo' && restante() <= 0) terminarFoco(true);
    else renderFoco();
  }
})();
