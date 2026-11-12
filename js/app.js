/* Panel: mi día, mi semana, mis tareas y mis fechas.
   Todo se guarda solo en este celular (localStorage). Respaldo con Exportar / Importar en Ajustes. */
(function () {
  'use strict';

  var KEY = 'panel-v1';
  var DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  var VISTAS = { hoy: 'Hoy', semana: 'Semana', tareas: 'Tareas', fechas: 'Fechas' };

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
  function byFecha(a, b) { return (a.fecha || '9999').localeCompare(b.fecha || '9999') || (a.creada || 0) - (b.creada || 0); }

  /* ---------- Estado ---------- */
  function blank() { return { v: 1, tareas: [], fechas: [], semana: [], registro: {} }; }
  function norm(r) {
    var b = blank(); r = r && typeof r === 'object' ? r : {};
    if (Array.isArray(r.tareas)) b.tareas = r.tareas.filter(function (t) { return t && t.id && typeof t.t === 'string'; });
    if (Array.isArray(r.fechas)) b.fechas = r.fechas.filter(function (f) { return f && f.id && typeof f.t === 'string' && validD(f.fecha); });
    if (Array.isArray(r.semana)) b.semana = r.semana.filter(function (s) { return s && s.id && typeof s.t === 'string' && s.dia >= 0 && s.dia <= 6; });
    if (r.registro && typeof r.registro === 'object') b.registro = r.registro;
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

  var vista = VISTAS[location.hash.slice(1)] ? location.hash.slice(1) : 'hoy';
  var semOff = 0, editSemana = false, verHechas = false, diaBloque = 0;

  /* ---------- Avisos breves ---------- */
  var toastTimer = null, undoFn = null;
  function toast(msg, undo) {
    var el = $('#toast');
    undoFn = undo || null;
    el.innerHTML = esc(msg) + (undo ? '<button type="button" data-action="deshacer">Deshacer</button>' : '');
    el.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('on'); undoFn = null; }, undo ? 5000 : 2400);
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
  function tareaLi(t, extra) {
    return '<li class="' + (t.done ? 'done' : '') + '">' +
      '<button class="chk" type="button" data-action="toggle" data-id="' + t.id + '" aria-label="' + (t.done ? 'Marcar como pendiente' : 'Marcar como hecha') + '"><span></span></button>' +
      '<button class="txt" type="button" data-action="editar" data-id="' + t.id + '"><span class="t">' + esc(t.t) + '</span>' + tareaMeta(t) + '</button>' +
      (extra || '') + '</li>';
  }
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
      '<span class="fecha-b">' + esc(f.t) + '<span>' + fmt(f.fecha) + (f.nota ? ' · ' + esc(f.nota) : '') + '</span></span></button>';
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
      '<circle class="ring-fg" cx="48" cy="48" r="' + r + '" stroke-dasharray="' + (c * p).toFixed(1) + ' ' + c.toFixed(1) + '" transform="rotate(-90 48 48)"/>' +
      '<text class="ring-n" x="48" y="50" text-anchor="middle">' + hechas + '/' + total + '</text>' +
      '<text class="ring-l" x="48" y="66" text-anchor="middle">hechas</text></svg>';
  }
  function renderHoy() {
    var t = hoy(), reg = S.registro[t] || {};
    var pend = S.tareas.filter(function (x) { return !x.done && x.fecha && x.fecha <= t; }).sort(byFecha);
    var hechasHoy = S.tareas.filter(function (x) { return x.done && x.cerrada === t; });
    var baja = typeof reg.energia === 'number' && reg.energia <= 3;
    var limite = baja ? 1 : 3;

    var registrado = typeof reg.energia === 'number' && typeof reg.animo === 'number';
    var como = '<section class="card"><h2>¿Cómo estás?</h2><p class="sub">Un toque en cada una. Puedes cambiarlo cuando quieras.</p>' +
      escala('energia', 'Energía', reg.energia) + escala('animo', 'Ánimo', reg.animo) + '</section>';
    var total = pend.length + hechasHoy.length, prox1 = proximasFechas(1)[0];
    var heroT = !total ? 'Día en blanco' : !pend.length ? '¡Día cerrado!' : pend.length + (pend.length === 1 ? ' cosa por hacer' : ' cosas por hacer');
    var heroP = prox1 ? 'Próximo: <b>' + esc(prox1.t) + '</b> ' + rel(diff(prox1.fecha)) + '.' : 'Sin fechas clave a la vista.';
    var h = '<section class="hero"><div><p class="hero-s">' + saludo() + '</p><p class="hero-t">' + heroT + '</p><p class="hero-p">' + heroP + '</p></div>' + anillo(hechasHoy.length, total) + '</section>';
    // Si aún no registras cómo estás, va primero: la energía decide cuánto cabe en el día.
    if (!registrado) h += como;
    h += '<section class="card"><div class="card-h"><h2>Para hoy</h2><span class="count">' + hechasHoy.length + ' hechas · ' + pend.length + ' por hacer</span></div>';
    if (baja && pend.length > 1) h += '<p class="note calm">Energía baja. Elige una sola cosa para hoy y mueve el resto a mañana, sin culpa.</p>';
    if (pend.length || hechasHoy.length) {
      h += '<ul class="list">' + pend.map(function (x) {
        return tareaLi(x, '<button class="mini-btn" type="button" data-action="manana" data-id="' + x.id + '">Mañana</button>');
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
    h += '</section>';
    if (registrado) h += como;

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
    var t = hoy(), lunes = addDays(t, -dow(t) + 7 * semOff);
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
      h += '<section class="day' + (n === 0 ? ' is-today' : n < 0 ? ' is-past' : '') + '"><h3>' + DIAS[i] + '<span>' + parseD(ds).getDate() + (n === 0 ? ' · hoy' : '') + '</span></h3>' + body + '</section>';
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
    else renderFechas();
  }
  function irA(v) {
    vista = v; verHechas = false; editSemana = false; semOff = 0;
    try { history.replaceState(null, '', '#' + v); } catch (e) {}
    render(); window.scrollTo(0, 0);
  }

  /* ---------- Hoja inferior ---------- */
  var sheet = $('#sheet');
  function abrir(html, focoSel) {
    sheet.innerHTML = '<div class="sheet-in">' + html + '</div>';
    if (!sheet.open) sheet.showModal();
    if (focoSel) { var f = $(focoSel, sheet); if (f) setTimeout(function () { f.focus(); }, 30); }
  }
  function cerrar() { if (sheet.open) sheet.close(); }
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

  var nuevoTipo = 'tarea';
  function abrirNuevo() {
    var def = vista === 'hoy' ? hoy() : '';
    abrir(cabecera('Anotar') +
      '<div class="seg" role="group" aria-label="Tipo"><button type="button" data-action="tipo" data-t="tarea" aria-pressed="' + (nuevoTipo === 'tarea') + '">Tarea</button><button type="button" data-action="tipo" data-t="fecha" aria-pressed="' + (nuevoTipo === 'fecha') + '">Fecha clave</button></div>' +
      '<form id="f-nuevo" style="display:grid;gap:14px"><textarea class="fld" id="n-t" rows="2" placeholder="' + (nuevoTipo === 'tarea' ? 'Qué tienes que hacer' : 'Qué pasa ese día (entrega, cita, plazo)') + '" aria-label="Texto" enterkeyhint="done"></textarea>' +
      '<p class="lbl">' + (nuevoTipo === 'tarea' ? '¿Para cuándo?' : '¿Qué día?') + '</p>' + chipsFecha(nuevoTipo === 'tarea' ? def : '', nuevoTipo === 'tarea') +
      '<button class="btn block" type="submit">Guardar</button></form>' +
      '<p class="help">Para dictar, toca el micrófono del teclado.</p>', '#n-t');
  }
  function abrirEditarTarea(id) {
    var x = S.tareas.filter(function (t) { return t.id === id; })[0]; if (!x) return;
    abrir(cabecera('Tarea') +
      '<form id="f-tarea" data-id="' + id + '" style="display:grid;gap:14px"><textarea class="fld" id="n-t" rows="2" aria-label="Texto">' + esc(x.t) + '</textarea>' +
      '<p class="lbl">¿Para cuándo?</p>' + chipsFecha(x.fecha || '', true) +
      '<button class="btn block" type="submit">Guardar</button></form>' +
      '<button class="btn danger block" type="button" data-action="borrar-tarea" data-id="' + id + '">Eliminar tarea</button>');
  }
  function abrirEditarFecha(id) {
    var f = S.fechas.filter(function (x) { return x.id === id; })[0]; if (!f) return;
    abrir(cabecera('Fecha clave') +
      '<form id="f-fecha-ed" data-id="' + id + '" style="display:grid;gap:14px"><input class="fld" id="n-t" type="text" value="' + esc(f.t) + '" aria-label="Qué pasa">' +
      '<input class="fld" id="n-nota" type="text" value="' + esc(f.nota || '') + '" placeholder="Nota (opcional)" aria-label="Nota">' +
      '<p class="lbl">¿Qué día?</p>' + chipsFecha(f.fecha, false) +
      '<button class="btn block" type="submit">Guardar</button></form>' +
      '<button class="btn danger block" type="button" data-action="borrar-fecha" data-id="' + id + '">Eliminar fecha</button>');
  }

  /* ---------- Ajustes y respaldo ---------- */
  function abrirAjustes() {
    var n = S.tareas.length, f = S.fechas.length, d = Object.keys(S.registro).length;
    abrir(cabecera('Ajustes') +
      '<p class="help">Tus datos viven solo en este celular: ' + n + ' tareas, ' + f + ' fechas, ' + S.semana.length + ' bloques y ' + d + ' días registrados. Si borras los datos de Chrome o cambias de teléfono, se pierden, así que exporta un respaldo de vez en cuando.</p>' +
      '<button class="btn block" type="button" data-action="exportar">Exportar respaldo</button>' +
      '<label class="btn ghost block" style="text-align:center">Importar respaldo<input type="file" id="importar" accept="application/json,.json" hidden></label>' +
      '<p class="help">Importar suma lo del archivo a lo que ya tienes; no borra nada.</p>');
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
      Object.keys(data.registro).forEach(function (k) { if (!S.registro[k]) { S.registro[k] = data.registro[k]; suma++; } });
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
      case 'toggle':
        x = tarea(id); if (!x) break;
        x.done = !x.done; x.cerrada = x.done ? hoy() : '';
        save(); render();
        if (x.done) toast('¡Hecha!', function () { x.done = false; x.cerrada = ''; save(); render(); });
        break;
      case 'manana': x = tarea(id); if (x) { var fin = guardarConDeshacer('Movida a mañana'); x.fecha = addDays(hoy(), 1); fin(); } break;
      case 'a-hoy': x = tarea(id); if (x) { x.fecha = hoy(); save(); render(); } break;
      case 'editar': abrirEditarTarea(id); break;
      case 'editar-fecha': abrirEditarFecha(id); break;
      case 'borrar-tarea': { var fin2 = guardarConDeshacer('Tarea eliminada'); S.tareas = S.tareas.filter(function (t) { return t.id !== id; }); cerrar(); fin2(); break; }
      case 'borrar-fecha': { var fin3 = guardarConDeshacer('Fecha eliminada'); S.fechas = S.fechas.filter(function (f) { return f.id !== id; }); cerrar(); fin3(); break; }
      case 'borrar-bloque': { var fin4 = guardarConDeshacer('Bloque eliminado'); S.semana = S.semana.filter(function (b) { return b.id !== id; }); fin4(); break; }
      case 'registro': {
        var t = hoy(), k = el.dataset.k, v = +el.dataset.v;
        S.registro[t] = S.registro[t] || {};
        S.registro[t][k] = v;
        save(); render();
        break;
      }
      case 'sem': semOff += +el.dataset.d; renderSemana(); break;
      case 'editar-semana': editSemana = true; renderSemana(); window.scrollTo(0, 0); break;
      case 'fin-semana': editSemana = false; renderSemana(); window.scrollTo(0, 0); break;
      case 'ver-hechas': verHechas = !verHechas; render(); break;
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
    if (f.id === 'f-nuevo') {
      if (!txt) { $('#n-t', f).focus(); return; }
      var fecha = leerFecha();
      if (nuevoTipo === 'fecha') {
        if (!fecha) { toast('Elige el día de la fecha clave'); return; }
        S.fechas.push({ id: uid(), t: txt, fecha: fecha, nota: '', creada: Date.now() });
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
      fe.t = txt; fe.fecha = nf; fe.nota = $('#n-nota', f).value.trim();
      save(); cerrar(); render();
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
    if (document.visibilityState === 'visible' && hoy() !== ultimoDia) { ultimoDia = hoy(); render(); }
  });
  window.addEventListener('hashchange', function () { var v = location.hash.slice(1); if (VISTAS[v] && v !== vista) irA(v); });

  render();
})();
