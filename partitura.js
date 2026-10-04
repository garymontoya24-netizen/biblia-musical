"use strict";
/* ───────── Editor de partituras: entrada con el lápiz, sonido y MusicXML ─────────
   Modelo: cada pentagrama guarda una lista de notas "lógicas" (pueden cruzar la barra de compás);
   al dibujar y exportar se parten en notas ligadas que caben en cada compás. */
const VF = Vex.Flow;
const DUR = {w:32, h:16, q:8, "8":4, "16":2};
const DUR_ORDER = ["w","h","q","8","16"];
const DUR_NAME = {w:"Redonda", h:"Blanca", q:"Negra", "8":"Corchea", "16":"Semicorchea"};
const XML_TYPE = {w:"whole", h:"half", q:"quarter", "8":"eighth", "16":"16th"};
const STEPS = ["C","D","E","F","G","A","B"], SEMI = [0,2,4,5,7,9,11];
const CLAVES = {
  treble:  {n:"Sol", vf:"treble", top:5*7+3, shift:0, rest:"b/4", sign:"G", line:2, oct:4},
  treble8: {n:"Sol 8ª baja (tenor)", vf:"treble", ann:"8vb", top:5*7+3, shift:-1, rest:"b/4", sign:"G", line:2, oct:3},
  alto:    {n:"Do en 3ª (viola)", vf:"alto", top:4*7+4, shift:0, rest:"c/4", sign:"C", line:3, oct:3},
  bass:    {n:"Fa", vf:"bass", top:3*7+5, shift:0, rest:"d/3", sign:"F", line:4, oct:3},
};
const SONIDOS = {piano:"Piano", organo:"Órgano", voz:"Voz (coro)", cuerdas:"Cuerdas", flauta:"Flauta"};
const TONOS = [[-6,"Gb","Sol♭ M / mi♭ m"],[-5,"Db","Re♭ M / si♭ m"],[-4,"Ab","La♭ M / fa m"],[-3,"Eb","Mi♭ M / do m"],[-2,"Bb","Si♭ M / sol m"],[-1,"F","Fa M / re m"],
  [0,"C","Do M / la m"],[1,"G","Sol M / mi m"],[2,"D","Re M / si m"],[3,"A","La M / fa♯ m"],[4,"E","Mi M / do♯ m"],[5,"B","Si M / sol♯ m"],[6,"F#","Fa♯ M / re♯ m"]];
const COMPASES = ["4/4","3/4","2/4","2/2","3/2","6/8","9/8","12/8"];
const PLANTILLAS = {
  satb:   {n:"Coro SATB", st:[["Soprano","treble","voz"],["Contralto","treble","voz"],["Tenor","treble8","voz"],["Bajo","bass","voz"]]},
  satbo:  {n:"Coro SATB y órgano", st:[["Soprano","treble","voz"],["Contralto","treble","voz"],["Tenor","treble8","voz"],["Bajo","bass","voz"],["Órgano (m.d.)","treble","organo"],["Órgano (m.i.)","bass","organo"]]},
  vozp:   {n:"Voz y piano", st:[["Voz","treble","voz"],["Piano (m.d.)","treble","piano"],["Piano (m.i.)","bass","piano"]]},
  piano:  {n:"Piano", st:[["Piano (m.d.)","treble","piano"],["Piano (m.i.)","bass","piano"]]},
  melodia:{n:"Una melodía", st:[["Melodía","treble","piano"]]},
};
const SHARPS = [3,0,4,1,5,2,6], FLATS = [6,2,5,1,4,0,3];
const keyAlt = (f, s) => f > 0 ? (SHARPS.indexOf(s) < f ? 1 : 0) : f < 0 ? (FLATS.indexOf(s) < -f ? -1 : 0) : 0;
const midiOf = p => 12 * (p.o + 1) + SEMI[p.s] + p.a;
const dur32 = e => DUR[e.d] * (e.dot ? 1.5 : 1);
const tonoVF = f => (TONOS.find(t => t[0] === f) || TONOS[6])[1];

/* ───────── Estado del editor ───────── */
const P = {hoja:null, sc:null, el:null, sel:null, editSel:false, tool:{d:"q", dot:false, rest:false, chord:false}, undo:[], redo:[], saveT:0,
  hits:[], geo:[], pianoOct:4, playing:null};

function newScoreModel(plantilla){
  const t = PLANTILLAS[plantilla] || PLANTILLAS.satb;
  return {tempo:80, compas:"4/4", tono:0, pentagramas:t.st.map(([nombre, clave, sonido]) => ({nombre, clave, sonido, ev:[]}))};
}
function capOf(sc){ const [n, d] = sc.compas.split("/").map(Number); return n * 32 / d; }

/* Crear partitura: el número decide la plantilla por defecto */
function newScoreDialog(oid, nid){
  const n = nid ? byId(S.numeros, nid) : null;
  const def = n && /coro|coral|turba|fuga/i.test(n.tipo) ? "satb" : n && /aria|arioso|recitativo|dúo/i.test(n.tipo) ? "vozp" : "satb";
  const ov = document.getElementById("overlay");
  ov.innerHTML = `<div class="drawer-back" data-close></div><aside class="drawer" role="dialog" aria-label="Nueva partitura">
    <div style="display:flex;gap:10px"><h3 style="flex:1">Nueva partitura</h3><button class="icon-btn" data-close aria-label="Cerrar">✕</button></div>
    <p class="muted" style="margin:0">Elige los pentagramas. Luego puedes cambiarlos en <b>Instrumentos</b>.</p>
    ${Object.entries(PLANTILLAS).map(([k, t]) => `<button class="obra-card" data-pl="${k}" ${k === def ? 'style="border-color:var(--accent)"' : ""}><h3>${esc(t.n)}</h3><div class="meta">${t.st.map(s => esc(s[0])).join(" · ")}</div></button>`).join("")}
  </aside>`;
  ov.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", closeDrawer));
  ov.querySelectorAll("[data-pl]").forEach(b => b.addEventListener("click", () => { closeDrawer(); createScore(oid, nid, b.dataset.pl); }));
}
async function createScore(oid, nid, plantilla){
  const id = uid(), count = hojasOf(oid, nid).filter(h => h.tipo === "partitura").length;
  const h = {tipo:"partitura", obraId:oid || null, numeroId:nid || null, titulo:`Partitura ${count + 1}`, papel:"partitura", chunks:1, thumb:"", resumen:PLANTILLAS[plantilla].n, createdAt:Date.now(), updatedAt:Date.now()};
  await createDoc("hojas", id, h);
  await Store.setChunk(id, 0, {score:newScoreModel(plantilla)});
  openScore(id);
}

async function openScore(id){
  const h = byId(S.hojas, id); if (!h) return;
  let sc = null;
  try { const ch = await Store.getChunks(id); const c = ch.find(x => x.k === 0); sc = c && c.score; } catch {}
  if (!sc) sc = newScoreModel("satb");
  P.hoja = h; P.sc = sc; P.sel = null; P.undo = []; P.redo = [];
  document.body.classList.add("drawing");
  buildScoreUI(); renderScore();
}

/* ───────── Interfaz ───────── */
function durIcon(d){
  const filled = d !== "w" && d !== "h", stem = d !== "w", flags = d === "8" ? 1 : d === "16" ? 2 : 0;
  return `<svg width="20" height="30" viewBox="0 0 22 30" aria-hidden="true"><ellipse cx="8" cy="23" rx="6" ry="4.3" transform="rotate(-20 8 23)" fill="${filled ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.8"/>${stem ? `<line x1="13.3" y1="22" x2="13.3" y2="3" stroke="currentColor" stroke-width="1.8"/>` : ""}${flags >= 1 ? `<path d="M13.3 3 q7 5 4 12" fill="none" stroke="currentColor" stroke-width="2"/>` : ""}${flags >= 2 ? `<path d="M13.3 8 q7 5 4 12" fill="none" stroke="currentColor" stroke-width="2"/>` : ""}</svg>`;
}
function buildScoreUI(){
  const h = P.hoja, sc = P.sc;
  const parent = h.numeroId ? byId(S.numeros, h.numeroId) : null, obra = h.obraId ? byId(S.obras, h.obraId) : null;
  const el = document.createElement("div"); el.className = "studio score-studio"; P.el = el;
  el.innerHTML = `<div class="toolbar" role="toolbar" aria-label="Partitura">
      <button class="tool" data-a="back">← ${esc(obra ? "Obra" : "Obras")}</button>
      <input class="sheet-title" id="sc-title" value="${esc(h.titulo)}" aria-label="Nombre de la partitura">
      <span class="muted" style="font-size:.85rem;white-space:nowrap">${esc(parent ? (parent.titulo || parent.tipo) : obra ? obra.titulo : "Idea suelta")}</span>
      <span class="sep"></span>
      <button class="tool play" data-a="play" aria-label="Reproducir">▶ Reproducir</button>
      <label class="mini">♩=<input id="sc-tempo" type="number" min="30" max="220" value="${sc.tempo}" inputmode="numeric"></label>
      <select id="sc-compas" aria-label="Compás">${COMPASES.map(c => `<option ${c === sc.compas ? "selected" : ""}>${c}</option>`).join("")}</select>
      <select id="sc-tono" aria-label="Tonalidad">${TONOS.map(t => `<option value="${t[0]}" ${t[0] === sc.tono ? "selected" : ""}>${t[2]}</option>`).join("")}</select>
      <button class="tool" data-a="inst">Instrumentos</button>
      <span class="sep"></span>
      <button class="tool" data-a="xml">Exportar a MuseScore</button>
      <button class="tool" data-a="delete" style="color:var(--danger)">Eliminar</button>
      <span class="status" id="sc-status">Guardado</span>
    </div>
    <div class="toolbar palette" role="toolbar" aria-label="Notas">
      <div class="grp">${DUR_ORDER.map(d => `<button class="tool" data-d="${d}" aria-label="${DUR_NAME[d]}">${durIcon(d)}</button>`).join("")}
        <button class="tool" data-t="dot" aria-label="Puntillo" style="font-size:1.6rem;line-height:0">•</button></div>
      <span class="sep"></span>
      <div class="grp"><button class="tool" data-t="rest">Silencio</button><button class="tool" data-t="chord">Acorde</button></div>
      <span class="sep"></span>
      <div class="grp"><button class="tool acc" data-acc="1" aria-label="Sostenido">♯</button><button class="tool acc" data-acc="-1" aria-label="Bemol">♭</button><button class="tool acc" data-acc="0" aria-label="Becuadro">♮</button>
        <button class="tool" data-a="tie" aria-label="Ligadura">Ligar</button></div>
      <span class="sep"></span>
      <div class="grp"><button class="tool" data-a="up" aria-label="Subir nota">▲</button><button class="tool" data-a="down" aria-label="Bajar nota">▼</button>
        <button class="tool" data-a="prev" aria-label="Nota anterior">◀</button><button class="tool" data-a="next" aria-label="Nota siguiente">▶</button>
        <button class="tool" data-a="del" aria-label="Borrar nota">⌫</button></div>
      <span class="sep"></span>
      <div class="grp"><button class="tool" data-a="undo" aria-label="Deshacer">↶</button><button class="tool" data-a="redo" aria-label="Rehacer">↷</button></div>
      <span class="sep"></span>
      <label class="mini lyr">Letra <input id="sc-ly" placeholder="sí-" autocomplete="off" autocapitalize="off"></label><button class="tool" data-a="lynext">Sílaba →</button>
      <span class="sep"></span>
      <button class="tool" data-a="kbd" aria-label="Teclado">🎹 Teclado</button>
    </div>
    <div class="score-wrap" id="sc-wrap"><div class="score" id="sc-host"></div><div class="playhead" id="sc-ph" hidden></div></div>
    <div class="score-help" id="sc-help"></div>
    <div class="piano" id="sc-piano" hidden></div>`;
  document.body.appendChild(el);
  el.querySelectorAll("[data-d]").forEach(b => b.addEventListener("click", () => setDur(b.dataset.d)));
  el.querySelectorAll("[data-t]").forEach(b => b.addEventListener("click", () => toggleTool(b.dataset.t)));
  el.querySelectorAll("[data-acc]").forEach(b => b.addEventListener("click", () => setAcc(Number(b.dataset.acc))));
  el.querySelectorAll("[data-a]").forEach(b => b.addEventListener("click", () => scoreAction(b.dataset.a, b)));
  el.querySelector("#sc-title").addEventListener("input", e => queueUpdate("hojas", h.id, {titulo:e.target.value}));
  el.querySelector("#sc-tempo").addEventListener("change", e => edit(() => { P.sc.tempo = Math.max(30, Math.min(220, Number(e.target.value) || 80)); }, false));
  el.querySelector("#sc-compas").addEventListener("change", e => edit(() => { P.sc.compas = e.target.value; }));
  el.querySelector("#sc-tono").addEventListener("change", e => edit(() => { P.sc.tono = Number(e.target.value); }));
  const ly = el.querySelector("#sc-ly");
  ly.addEventListener("input", () => { const e = selEv(); if (e) { e.ly = ly.value; scheduleScoreSave(); renderScoreSoon(); } });
  ly.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " " || e.key === "Tab") { e.preventDefault(); if (e.key === " " && !ly.value.endsWith("-")) {} scoreAction("lynext"); } });
  el.querySelector("#sc-host").addEventListener("click", onScoreTap);
  buildPiano();
  window.addEventListener("resize", renderScoreSoon);
  document.addEventListener("keydown", onScoreKey);
  paintScoreTools();
}
function paintScoreTools(){
  if (!P.el) return;
  const e = selEv(), ed = e && P.editSel;
  P.el.querySelectorAll("[data-d]").forEach(b => b.setAttribute("aria-pressed", String((ed ? e.d : P.tool.d) === b.dataset.d)));
  const on = {dot: ed ? !!e.dot : P.tool.dot, rest: ed ? !!e.r : P.tool.rest, chord: P.tool.chord};
  P.el.querySelectorAll("[data-t]").forEach(b => b.setAttribute("aria-pressed", String(on[b.dataset.t])));
  P.el.querySelector('[data-a="tie"]').setAttribute("aria-pressed", String(!!(e && e.tie)));
  P.el.querySelector('[data-a="kbd"]').setAttribute("aria-pressed", String(!P.el.querySelector("#sc-piano").hidden));
  const ly = P.el.querySelector("#sc-ly"); if (ly !== document.activeElement) ly.value = e ? (e.ly || "") : "";
  ly.disabled = !e || e.r;
  const st = P.sel ? P.sc.pentagramas[P.sel.k] : P.sc.pentagramas[0];
  P.el.querySelector("#sc-help").textContent = e
    ? `${st.nombre}: nota ${P.sel.i + 1} de ${st.ev.length} seleccionada. Toca el pentagrama para poner la siguiente nota después de ella.`
    : `Toca un pentagrama con el lápiz donde va la nota. Elige antes la figura (negra, corchea…). Toca una nota para seleccionarla y cambiarla.`;
}
function setStatusScore(t){ const s = P.el && P.el.querySelector("#sc-status"); if (s) s.textContent = t; }

/* ───────── Edición ───────── */
function selEv(){ if (!P.sel) return null; const st = P.sc.pentagramas[P.sel.k]; return st ? st.ev[P.sel.i] || null : null; }
function snapshot(){ return JSON.stringify({sc:P.sc, sel:P.sel}); }
function edit(fn, rerender = true){
  P.undo.push(snapshot()); if (P.undo.length > 200) P.undo.shift(); P.redo = [];
  fn(); scheduleScoreSave(); paintScoreTools(); if (rerender) renderScore();
}
// Como en MuseScore: tras escribir una nota, la figura elegida es para la PRÓXIMA nota;
// si tocaste una nota existente para seleccionarla, la figura cambia ESA nota.
function setDur(d){ P.tool.d = d; const e = selEv(); if (e && P.editSel) edit(() => { e.d = d; }); else paintScoreTools(); }
function toggleTool(t){
  const e = selEv();
  if (t === "chord") { P.tool.chord = !P.tool.chord; paintScoreTools(); return; }
  if (t === "dot") { if (e && P.editSel) edit(() => { e.dot = !e.dot; P.tool.dot = e.dot; }); else { P.tool.dot = !P.tool.dot; paintScoreTools(); } return; }
  if (t === "rest") { if (e && P.editSel) edit(() => { e.r = !e.r; if (!e.r && !e.p.length) e.p = [defaultPitch(P.sel.k)]; P.tool.rest = false; }); else { P.tool.rest = !P.tool.rest; paintScoreTools(); } }
}
function setAcc(a){ const e = selEv(); if (!e || e.r || !e.p.length) return;
  edit(() => { const p = e.p[e.p.length - 1]; p.a = a; }); playEvent(e, P.sc.pentagramas[P.sel.k]); }
function defaultPitch(k){ const c = CLAVES[P.sc.pentagramas[k].clave]; const s = 6, o = c.oct; return {s, o, a:keyAlt(P.sc.tono, s)}; }
function insertAtCursor(k, ev){
  const st = P.sc.pentagramas[k];
  const idx = P.sel && P.sel.k === k ? P.sel.i + 1 : st.ev.length;
  edit(() => { st.ev.splice(idx, 0, ev); P.sel = {k, i:idx}; P.editSel = false; });
}
function enterPitch(k, p){
  const e = selEv(), st = P.sc.pentagramas[k];
  if (P.tool.chord && e && P.sel.k === k && !e.r) {
    if (!e.p.some(q => q.s === p.s && q.o === p.o)) edit(() => { e.p.push(p); e.p.sort((a, b) => midiOf(a) - midiOf(b)); });
    playEvent({p:[p], d:"q"}, st); return;
  }
  insertAtCursor(k, {d:P.tool.d, dot:P.tool.dot, r:P.tool.rest, p:P.tool.rest ? [] : [p], tie:false, ly:""});
  if (!P.tool.rest) playEvent({p:[p], d:"q"}, st);
}
function moveStep(dir){
  const e = selEv(); if (!e || e.r) return;
  edit(() => { e.p = e.p.map(p => { let d = p.o * 7 + p.s + dir; const s = ((d % 7) + 7) % 7; return {s, o:Math.floor(d / 7), a:keyAlt(P.sc.tono, s)}; }); });
  playEvent(e, P.sc.pentagramas[P.sel.k]);
}
function scoreAction(a, btn){
  const e = selEv();
  if (a === "back") return closeScore();
  if (a === "play") return P.playing ? stopPlayback() : startPlayback();
  if (a === "undo" || a === "redo") {
    const from = a === "undo" ? P.undo : P.redo, to = a === "undo" ? P.redo : P.undo; const s = from.pop(); if (!s) return;
    to.push(snapshot()); const o = JSON.parse(s); P.sc = o.sc; P.sel = o.sel; scheduleScoreSave(); syncHeader(); paintScoreTools(); renderScore(); return;
  }
  if (a === "tie") { if (e && !e.r) edit(() => { e.tie = !e.tie; }); return; }
  if (a === "up") return moveStep(1);
  if (a === "down") return moveStep(-1);
  if (a === "prev" || a === "next") { P.editSel = true; if (!P.sel) { P.sel = {k:0, i:0}; if (!selEv()) P.sel = null; }
    else { const n = P.sc.pentagramas[P.sel.k].ev.length; P.sel.i = Math.max(-1, Math.min(n - 1, P.sel.i + (a === "next" ? 1 : -1))); if (P.sel.i < 0) P.sel = null; }
    paintScoreTools(); renderScore(); const s = selEv(); if (s) playEvent(s, P.sc.pentagramas[P.sel.k]); return; }
  if (a === "del") { if (!e) return; edit(() => { P.sc.pentagramas[P.sel.k].ev.splice(P.sel.i, 1); P.sel.i -= 1; if (P.sel.i < 0) P.sel = null; }); return; }
  if (a === "lynext") { if (!P.sel) return; const n = P.sc.pentagramas[P.sel.k].ev;
    let i = P.sel.i + 1; while (i < n.length && n[i].r) i++; if (i < n.length) P.sel.i = i; paintScoreTools(); renderScore();
    const ly = P.el.querySelector("#sc-ly"); ly.value = selEv() ? selEv().ly || "" : ""; ly.focus(); return; }
  if (a === "kbd") { const pz = P.el.querySelector("#sc-piano"); pz.hidden = !pz.hidden; paintScoreTools(); renderScoreSoon(); return; }
  if (a === "inst") return openInstruments();
  if (a === "xml") return exportMusicXML();
  if (a === "delete") {
    if (!btn.classList.contains("armed")) { btn.classList.add("armed"); btn.textContent = "¿Seguro? Toca de nuevo"; setTimeout(() => { if (btn.isConnected) { btn.classList.remove("armed"); btn.textContent = "Eliminar"; } }, 4000); return; }
    const h = P.hoja; clearTimeout(P.saveT); teardownScore(); S.hojas = S.hojas.filter(x => x.id !== h.id); render(true); deleteSheetData(h);
  }
}
function syncHeader(){
  if (!P.el) return;
  P.el.querySelector("#sc-tempo").value = P.sc.tempo; P.el.querySelector("#sc-compas").value = P.sc.compas; P.el.querySelector("#sc-tono").value = String(P.sc.tono);
}
function onScoreKey(ev){
  if (!P.el || ev.target.closest("input,select,textarea")) return;
  const k = ev.key, low = k.toLowerCase();
  const nums = {"1":"16","2":"16","3":"8","4":"q","5":"h","6":"w"};
  if ((ev.metaKey || ev.ctrlKey) && low === "z") { ev.preventDefault(); scoreAction(ev.shiftKey ? "redo" : "undo"); return; }
  if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
  if ("abcdefg".includes(low) && low.length === 1) { ev.preventDefault(); letterNote(low); return; }
  if (nums[k]) { ev.preventDefault(); setDur(nums[k]); return; }
  const map = {".":"dot", "0":"rest"}; if (map[k]) { ev.preventDefault(); toggleTool(map[k]); return; }
  const acts = {ArrowUp:"up", ArrowDown:"down", ArrowLeft:"prev", ArrowRight:"next", Backspace:"del", Delete:"del", " ":"play"};
  if (acts[k]) { ev.preventDefault(); scoreAction(acts[k]); return; }
  if (k === "+") { ev.preventDefault(); scoreAction("tie"); }
}
function letterNote(l){
  const s = "cdefgab".indexOf(l), k = P.sel ? P.sel.k : 0, st = P.sc.pentagramas[k];
  let ref = null; for (let i = (P.sel && P.sel.k === k ? P.sel.i : st.ev.length - 1); i >= 0; i--) if (!st.ev[i].r && st.ev[i].p.length) { ref = st.ev[i].p[0]; break; }
  const refD = ref ? ref.o * 7 + ref.s : CLAVES[st.clave].oct * 7 + 6;
  let best = null; for (let o = 1; o <= 7; o++) { const d = o * 7 + s; if (best === null || Math.abs(d - refD) < Math.abs(best - refD)) best = d; }
  enterPitch(k, {s, o:Math.floor(best / 7), a:keyAlt(P.sc.tono, s)});
}

/* ───────── Instrumentos ───────── */
function openInstruments(){
  const ov = document.getElementById("overlay");
  const draw = () => {
    ov.innerHTML = `<div class="drawer-back" data-close></div><aside class="drawer" role="dialog" aria-label="Instrumentos">
      <div style="display:flex;gap:10px"><h3 style="flex:1">Instrumentos</h3><button class="icon-btn" data-close aria-label="Cerrar">✕</button></div>
      ${P.sc.pentagramas.map((st, k) => `<div class="inst" data-k="${k}">
        <div class="field"><label for="in-n-${k}">Nombre</label><input id="in-n-${k}" data-f="nombre" value="${esc(st.nombre)}"></div>
        <div class="fields" style="margin:0"><div class="field"><label for="in-c-${k}">Clave</label><select id="in-c-${k}" data-f="clave">${Object.entries(CLAVES).map(([id, c]) => `<option value="${id}" ${id === st.clave ? "selected" : ""}>${c.n}</option>`).join("")}</select></div>
        <div class="field"><label for="in-s-${k}">Sonido</label><select id="in-s-${k}" data-f="sonido">${Object.entries(SONIDOS).map(([id, n]) => `<option value="${id}" ${id === st.sonido ? "selected" : ""}>${n}</option>`).join("")}</select></div></div>
        <div class="row-actions"><button class="btn" data-up ${k === 0 ? "disabled" : ""}>↑</button><button class="btn" data-dn ${k === P.sc.pentagramas.length - 1 ? "disabled" : ""}>↓</button><span class="spacer"></span>${P.sc.pentagramas.length > 1 ? `<button class="btn danger" data-rm>Quitar</button>` : ""}</div>
      </div>`).join("")}
      <button class="btn primary" data-add>+ Agregar pentagrama</button></aside>`;
    ov.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", closeDrawer));
    ov.querySelectorAll(".inst").forEach(box => {
      const k = Number(box.dataset.k), st = P.sc.pentagramas[k];
      box.querySelectorAll("[data-f]").forEach(f => f.addEventListener("change", () => edit(() => { st[f.dataset.f] = f.value; })));
      box.querySelector("[data-f=nombre]").addEventListener("input", e => { st.nombre = e.target.value; scheduleScoreSave(); renderScoreSoon(); });
      const mv = d => { edit(() => { const a = P.sc.pentagramas; [a[k], a[k + d]] = [a[k + d], a[k]]; P.sel = null; }); draw(); };
      const up = box.querySelector("[data-up]"), dn = box.querySelector("[data-dn]"), rm = box.querySelector("[data-rm]");
      up.addEventListener("click", () => mv(-1)); dn.addEventListener("click", () => mv(1));
      if (rm) armDelete(rm, "¿Quitar con sus notas?", () => { edit(() => { P.sc.pentagramas.splice(k, 1); P.sel = null; }); draw(); });
    });
    ov.querySelector("[data-add]").addEventListener("click", () => { edit(() => { P.sc.pentagramas.push({nombre:"Nuevo", clave:"treble", sonido:"piano", ev:[]}); }); draw(); });
  };
  draw();
}

/* ───────── Dibujo con VexFlow ───────── */
function splitDur(u){
  const opts = []; for (const d of DUR_ORDER) { opts.push([d, true, DUR[d] * 1.5]); opts.push([d, false, DUR[d]]); }
  opts.sort((a, b) => b[2] - a[2]);
  const out = []; while (u > 0) { const o = opts.find(x => x[2] <= u); if (!o) break; out.push(o); u -= o[2]; }
  return out;
}
function staffMeasures(events, cap){
  const ms = [[]]; let fill = 0, abs = 0;
  events.forEach((e, i) => {
    const total = dur32(e); let u = total, first = true;
    while (u > 0) {
      const take = Math.min(u, cap - fill);
      const parts = first && take === total ? [[e.d, !!e.dot, take]] : splitDur(take);
      parts.forEach((pp, j) => {
        const last = u - take === 0 && j === parts.length - 1;
        ms[ms.length - 1].push({i, d:pp[0], dot:pp[1], u:pp[2], start:abs, r:!!e.r, p:e.p, ly:first && j === 0 ? e.ly : "", tie:!e.r && (last ? !!e.tie : true)});
        abs += pp[2];
      });
      if (!parts.length) abs += take;
      fill += take; u -= take; first = false;
      if (fill >= cap) { ms.push([]); fill = 0; }
    }
  });
  if (ms.length > 1 && !ms[ms.length - 1].length) ms.pop();
  return ms;
}
let rafScore = 0; function renderScoreSoon(){ if (!rafScore) rafScore = requestAnimationFrame(() => { rafScore = 0; renderScore(); }); }
const STAFF_GAP = 96, LEFT = 74;
function renderScore(){
  if (!P.el) return;
  const host = P.el.querySelector("#sc-host"), sc = P.sc, cap = capOf(sc), keyName = tonoVF(sc.tono);
  const [num, den] = sc.compas.split("/").map(Number);
  const width = Math.max(320, Math.min(1400, P.el.querySelector("#sc-wrap").clientWidth - 24));
  const per = sc.pentagramas.map(st => staffMeasures(st.ev, cap));
  const contentM = Math.max(0, ...per.map(ms => ms[0].length ? ms.length : 0));
  const M = contentM + 1; // siempre un compás vacío al final para seguir escribiendo
  // Ancho mínimo de cada compás según cuántas notas tiene
  const minW = []; for (let m = 0; m < M; m++) minW.push(m === contentM ? 170 : 56 + 30 * Math.max(1, ...per.map(ms => (ms[m] || []).length)));
  const prefix = 52 + Math.abs(sc.tono) * 11, avail = width - LEFT - 12;
  const systems = []; let cur = [], used = 0;
  for (let m = 0; m < M; m++) { const w = minW[m] + (cur.length ? 0 : prefix) + (m === 0 ? 34 : 0);
    if (cur.length && used + w > avail) { systems.push(cur); cur = []; used = 0; m--; continue; } cur.push(m); used += w; }
  if (cur.length) systems.push(cur);
  const nSt = sc.pentagramas.length, sysH = nSt * STAFF_GAP + 44;
  host.innerHTML = "";
  const renderer = new VF.Renderer(host, VF.Renderer.Backends.SVG);
  renderer.resize(width, systems.length * sysH + 30);
  const ctx = renderer.getContext();
  P.hits = []; P.geo = [];
  const noteRefs = sc.pentagramas.map(() => []);
  systems.forEach((sys, si) => {
    const y0 = 24 + si * sysH;
    const raw = sys.map((m, j) => minW[m] + (j === 0 ? prefix : 0) + (m === 0 ? 34 : 0));
    const total = raw.reduce((a, b) => a + b, 0);
    const stretch = si < systems.length - 1 || total > avail * 0.65 ? avail / total : 1;
    let x = LEFT; const firstStaves = [];
    sys.forEach((m, j) => {
      const mw = raw[j] * stretch, staves = [], voices = [], beams = [], notesBy = [];
      sc.pentagramas.forEach((st, k) => {
        const cl = CLAVES[st.clave] || CLAVES.treble;
        const stave = new VF.Stave(x, y0 + k * STAFF_GAP, mw);
        if (j === 0) { if (cl.ann) stave.addClef(cl.vf, "default", cl.ann); else stave.addClef(cl.vf); stave.addKeySignature(keyName); }
        if (m === 0) stave.addTimeSignature(sc.compas);
        stave.setContext(ctx).draw(); staves.push(stave);
        if (j === 0) firstStaves.push(stave);
        P.geo.push({si, k, m, x0:x, x1:x + mw, yTop:stave.getYForLine(0), sp:stave.getSpacingBetweenLines()});
        const pieces = per[k][m] || null;
        let notes;
        if (m === contentM) { notes = []; }
        else if (!pieces || !pieces.length) {
          notes = [new VF.StaveNote({keys:[cl.rest], duration:"wr", clef:cl.vf, align_center:true})];
        } else {
          notes = pieces.map(pc => {
            const keys = pc.r || !pc.p.length ? [cl.rest] : pc.p.map(p => STEPS[p.s].toLowerCase() + ({1:"#", "-1":"b", 2:"##", "-2":"bb"}[p.a] || "") + "/" + (p.o - cl.shift));
            const n = new VF.StaveNote({keys, duration:pc.d + (pc.r ? "r" : ""), clef:cl.vf, auto_stem:true});
            if (pc.dot) VF.Dot.buildAndAttach([n], {all:true});
            if (pc.ly) n.addModifier(new VF.Annotation(pc.ly).setFont("Alegreya Sans, sans-serif", 13).setVerticalJustification(VF.Annotation.VerticalJustify.BOTTOM), 0);
            if (P.sel && P.sel.k === k && P.sel.i === pc.i) n.setStyle({fillStyle:"#1F4E99", strokeStyle:"#1F4E99"});
            pc.note = n; pc.si = si; noteRefs[k].push(pc);
            return n;
          });
        }
        if (!notes.length) return;
        const v = new VF.Voice({num_beats:num, beat_value:den}).setMode(VF.Voice.Mode.SOFT).addTickables(notes);
        voices.push(v); notesBy.push(notes); v.__stave = stave;
        try { beams.push(...VF.Beam.generateBeams(notes.filter(n => !n.isRest()))); } catch {}
      });
      const startX = Math.max(...staves.map(s => s.getNoteStartX()));
      staves.forEach(s => s.setNoteStartX(startX));
      if (voices.length) {
        try { VF.Accidental.applyAccidentals(voices, keyName); } catch {}
        const fmt = new VF.Formatter(); voices.forEach(v => fmt.joinVoices([v]));
        fmt.format(voices, Math.max(40, x + mw - startX - 14));
        voices.forEach(v => v.draw(ctx, v.__stave));
      }
      beams.forEach(b => b.setContext(ctx).draw());
      sc.pentagramas.forEach((st, k) => (per[k][m] || []).forEach(pc => { if (pc.note) P.hits.push({si, k, i:pc.i, x:pc.note.getAbsoluteX(), start:pc.start, u:pc.u, y0:staves[0].getYForLine(0), y1:staves[staves.length - 1].getYForLine(4)}); }));
      x += mw;
    });
    if (firstStaves.length > 1) {
      const isPiano = nSt === 2 && sc.pentagramas.every(st => st.sonido === "piano" || st.sonido === "organo");
      new VF.StaveConnector(firstStaves[0], firstStaves[nSt - 1]).setType(isPiano ? VF.StaveConnector.type.BRACE : VF.StaveConnector.type.BRACKET).setContext(ctx).draw();
      new VF.StaveConnector(firstStaves[0], firstStaves[nSt - 1]).setType(VF.StaveConnector.type.SINGLE_LEFT).setContext(ctx).draw();
    }
    ctx.save(); ctx.setFont("Alegreya Sans, sans-serif", 12, "");
    sc.pentagramas.forEach((st, k) => { const nm = si === 0 ? st.nombre : abbrev(st.nombre); ctx.fillText(nm.slice(0, 13), 4, y0 + k * STAFF_GAP + 44); });
    ctx.restore();
  });
  // Ligaduras (también entre compases y sistemas)
  noteRefs.forEach(list => { for (let j = 0; j < list.length - 1; j++) { const a = list[j], b = list[j + 1];
    if (!a.tie || a.r || b.r) continue;
    const idx = a.p.map((_, q) => q);
    try {
      if (a.si === b.si) new VF.StaveTie({first_note:a.note, last_note:b.note, first_indices:idx, last_indices:idx}).setContext(ctx).draw();
      else { new VF.StaveTie({first_note:a.note, last_note:null, first_indices:idx, last_indices:idx}).setContext(ctx).draw();
             new VF.StaveTie({first_note:null, last_note:b.note, first_indices:idx, last_indices:idx}).setContext(ctx).draw(); }
    } catch {}
  } });
  // Cursor: dónde entra la próxima nota
  const k = P.sel ? P.sel.k : 0, list = P.hits.filter(h => h.k === k);
  let cx = null, csi = 0;
  if (P.sel) { const h = list.filter(h => h.i === P.sel.i).pop(); if (h) { cx = h.x + 22; csi = h.si; } }
  else if (list.length) { const h = list[list.length - 1]; cx = h.x + 22; csi = h.si; }
  else { const g = P.geo.find(g => g.k === k && g.m === 0); if (g) { cx = g.x0 + prefix + 40; csi = 0; } }
  const g = P.geo.find(g => g.si === csi && g.k === k);
  if (cx !== null && g) { const svg = host.querySelector("svg"), r = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    r.setAttribute("x", cx - 2); r.setAttribute("y", g.yTop - 6); r.setAttribute("width", 3); r.setAttribute("height", g.sp * 4 + 12); r.setAttribute("rx", 1.5); r.setAttribute("fill", "#1F4E99"); r.setAttribute("opacity", ".45");
    svg.appendChild(r); }
}
function abbrev(n){ return n.replace(/\(.*?\)/g, "").trim().split(/\s+/).map(w => w.slice(0, 3) + ".").join(" "); }

function onScoreTap(e){
  const svg = P.el.querySelector("#sc-host svg"); if (!svg) return;
  const r = svg.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  const g = P.geo.find(g => x >= g.x0 - 30 && x <= g.x1 && y >= g.yTop - 4.5 * g.sp && y <= g.yTop + 8.5 * g.sp);
  if (!g) return;
  const near = P.hits.filter(h => h.si === g.si && h.k === g.k).map(h => ({h, d:Math.abs(h.x + 6 - x)})).sort((a, b) => a.d - b.d)[0];
  if (near && near.d < 13) {
    P.sel = {k:g.k, i:near.h.i}; P.editSel = true; paintScoreTools(); renderScore(); const ev = selEv(); if (ev) playEvent(ev, P.sc.pentagramas[g.k]); return;
  }
  const st = P.sc.pentagramas[g.k], cl = CLAVES[st.clave] || CLAVES.treble;
  const pos = Math.round((y - g.yTop) / (g.sp / 2));
  const d = cl.top - pos + cl.shift * 7, s = ((d % 7) + 7) % 7;
  if (P.sel && P.sel.k !== g.k) P.sel = null;
  enterPitch(g.k, {s, o:Math.floor(d / 7), a:keyAlt(P.sc.tono, s)});
}

/* ───────── Teclado de piano ───────── */
function buildPiano(){
  const pz = P.el.querySelector("#sc-piano");
  const whites = [0,2,4,5,7,9,11], blacks = [[1,0],[3,1],[6,3],[8,4],[10,5]];
  let h = `<div class="pz-oct"><button class="tool" data-o="-1" aria-label="Octava abajo">− 8ª</button><span id="pz-lbl"></span><button class="tool" data-o="1" aria-label="Octava arriba">+ 8ª</button></div><div class="pz-keys">`;
  for (let o = 0; o < 2; o++) {
    whites.forEach((sem, j) => { h += `<button class="pz-w" data-sem="${o * 12 + sem}" style="left:${(o * 7 + j) / 14 * 100}%;width:${100 / 14}%"></button>`; });
    blacks.forEach(([sem, j]) => { h += `<button class="pz-b" data-sem="${o * 12 + sem}" style="left:${((o * 7 + j + 1) / 14 - 0.022) * 100}%;width:4.4%"></button>`; });
  }
  pz.innerHTML = h + "</div>";
  const lbl = () => { pz.querySelector("#pz-lbl").textContent = `Do${P.pianoOct} – Si${P.pianoOct + 1}`; };
  lbl();
  pz.querySelectorAll("[data-o]").forEach(b => b.addEventListener("click", () => { P.pianoOct = Math.max(1, Math.min(6, P.pianoOct + Number(b.dataset.o))); lbl(); }));
  pz.querySelectorAll("[data-sem]").forEach(b => b.addEventListener("click", () => {
    const midi = 12 * (P.pianoOct + 1) + Number(b.dataset.sem), k = P.sel ? P.sel.k : 0;
    enterPitch(k, pitchFromMidi(midi, P.sc.tono));
  }));
}
function pitchFromMidi(m, tono){
  const o = Math.floor(m / 12) - 1, sem = m % 12;
  const nat = SEMI.indexOf(sem);
  if (nat >= 0) { return {s:nat, o, a:0}; }
  if (tono < 0) { const s = SEMI.indexOf(sem + 1); return {s, o, a:-1}; }
  return {s:SEMI.indexOf(sem - 1), o, a:1};
}

/* ───────── Sonido (Web Audio) ───────── */
let AC = null, MASTER = null;
function audio(){
  if (!AC) { const C = window.AudioContext || window.webkitAudioContext; AC = new C();
    const comp = AC.createDynamicsCompressor(); comp.connect(AC.destination); MASTER = AC.createGain(); MASTER.gain.value = 0.55; MASTER.connect(comp); }
  if (AC.state === "suspended") AC.resume();
  return AC;
}
function tone(inst, midi, t0, dur, vel, nodes){
  const ac = audio(), f = 440 * Math.pow(2, (midi - 69) / 12), g = ac.createGain(); g.connect(MASTER);
  const out = [], v = vel;
  const osc = (type, freq, gain, dest) => { const o = ac.createOscillator(); o.type = type; o.frequency.value = freq; const gg = ac.createGain(); gg.gain.value = gain; o.connect(gg); gg.connect(dest); o.start(t0); out.push(o); return o; };
  const vib = (o, depth) => { const l = ac.createOscillator(), lg = ac.createGain(); l.frequency.value = 5.2; lg.gain.value = depth; l.connect(lg); lg.connect(o.frequency); l.start(t0 + 0.15); out.push(l); };
  let end;
  if (inst === "piano") {
    osc("triangle", f, 0.7, g); osc("sine", f * 2, 0.18, g); osc("sine", f * 3, 0.05, g);
    const decay = Math.max(0.6, 2.4 - (midi - 48) / 30);
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(v, t0 + 0.006); g.gain.exponentialRampToValueAtTime(v * 0.35, t0 + 0.25);
    end = t0 + Math.min(dur + 0.25, decay); g.gain.exponentialRampToValueAtTime(0.0008, end);
  } else if (inst === "organo") {
    osc("sine", f, 0.6, g); osc("sine", f * 2, 0.35, g); osc("sine", f * 4, 0.12, g); osc("sine", f / 2, 0.2, g);
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(v * 0.8, t0 + 0.03); end = t0 + dur + 0.06;
    g.gain.setValueAtTime(v * 0.8, t0 + dur); g.gain.linearRampToValueAtTime(0.0001, end);
  } else if (inst === "voz" || inst === "cuerdas") {
    const isV = inst === "voz", mix = ac.createGain(); mix.connect(g);
    const filters = isV ? [[700, 6, 1], [1150, 8, 0.5], [2600, 10, 0.18]] : [[1800, 0.7, 1]];
    const src = ac.createGain(); filters.forEach(([fr, q, gn]) => { const bf = ac.createBiquadFilter(); bf.type = isV ? "bandpass" : "lowpass"; bf.frequency.value = fr; bf.Q.value = q; const bg = ac.createGain(); bg.gain.value = gn; src.connect(bf); bf.connect(bg); bg.connect(mix); });
    const o1 = osc("sawtooth", f, isV ? 1.4 : 0.5, src), o2 = osc("sawtooth", f * 1.004, isV ? 0.6 : 0.35, src);
    vib(o1, f * 0.012); vib(o2, f * 0.01);
    const att = isV ? 0.09 : 0.14; g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(v * (isV ? 1.1 : 0.9), t0 + att);
    end = t0 + dur + 0.12; g.gain.setValueAtTime(v * (isV ? 1.1 : 0.9), t0 + Math.max(att, dur - 0.02)); g.gain.linearRampToValueAtTime(0.0001, end);
  } else {
    const o = osc("sine", f, 0.9, g); osc("sine", f * 2, 0.08, g); vib(o, f * 0.008);
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(v, t0 + 0.05); end = t0 + dur + 0.08;
    g.gain.setValueAtTime(v, t0 + Math.max(0.05, dur - 0.03)); g.gain.linearRampToValueAtTime(0.0001, end);
  }
  out.forEach(o => o.stop(end + 0.05));
  if (nodes) nodes.push(...out);
}
function playEvent(e, st){
  if (!e || e.r || !e.p || !e.p.length) return;
  const ac = audio(), t = ac.currentTime + 0.02;
  e.p.forEach(p => tone(st.sonido, midiOf(p), t, 0.45, 0.22));
}
function startPlayback(){
  const sc = P.sc, ac = audio(), spu = 60 / sc.tempo / 8; // segundos por 1/32 de redonda… (negra = 8 unidades)
  let from = 0;
  if (P.sel) { const st = P.sc.pentagramas[P.sel.k]; for (let i = 0; i < P.sel.i; i++) from += dur32(st.ev[i]); }
  const t0 = ac.currentTime + 0.12, nodes = []; let endU = 0;
  sc.pentagramas.forEach(st => {
    let u = 0; const ev = st.ev;
    for (let i = 0; i < ev.length; i++) {
      const e = ev[i]; let len = dur32(e);
      if (!e.r && e.p.length) {
        let j = i; while (ev[j].tie && ev[j + 1] && !ev[j + 1].r && ev[j + 1].p.length === ev[j].p.length && ev[j + 1].p.every((p, q) => midiOf(p) === midiOf(ev[j].p[q]))) { j++; len += dur32(ev[j]); }
        if (u + len > from) {
          const st0 = Math.max(u, from), voices = e.p.length, vel = (st.sonido === "voz" ? 0.16 : 0.2) / Math.sqrt(voices);
          e.p.forEach(p => tone(st.sonido, midiOf(p), t0 + (st0 - from) * spu, (u + len - st0) * spu * 0.97, vel, nodes));
        }
        u += len; i = j;
      } else u += len;
    }
    endU = Math.max(endU, u);
  });
  if (endU <= from) return;
  const ph = P.el.querySelector("#sc-ph"), wrap = P.el.querySelector("#sc-wrap"), btn = P.el.querySelector('[data-a="play"]');
  btn.textContent = "■ Detener"; btn.setAttribute("aria-pressed", "true");
  const play = {nodes, raf:0};
  P.playing = play;
  const tick = () => {
    if (P.playing !== play) return;
    const cu = from + (ac.currentTime - t0) / spu;
    if (cu >= endU) { stopPlayback(); return; }
    const h = P.hits.filter(h => h.start <= cu && cu < h.start + h.u).sort((a, b) => a.k - b.k)[0];
    if (h) { const svg = P.el.querySelector("#sc-host svg"), sr = svg.getBoundingClientRect(), wr = wrap.getBoundingClientRect();
      ph.hidden = false; ph.style.left = (sr.left - wr.left + wrap.scrollLeft + h.x - 4) + "px"; ph.style.top = (sr.top - wr.top + wrap.scrollTop + h.y0 - 14) + "px"; ph.style.height = (h.y1 - h.y0 + 28) + "px";
      const top = sr.top - wr.top + h.y0; if (top < 20 || top > wrap.clientHeight - 120) wrap.scrollBy({top:top - 80, behavior:"smooth"}); }
    play.raf = requestAnimationFrame(tick);
  };
  play.raf = requestAnimationFrame(tick);
}
function stopPlayback(){
  const p = P.playing; if (!p) return; P.playing = null; cancelAnimationFrame(p.raf);
  p.nodes.forEach(n => { try { n.stop(); } catch {} });
  if (P.el) { P.el.querySelector("#sc-ph").hidden = true; const b = P.el.querySelector('[data-a="play"]'); b.textContent = "▶ Reproducir"; b.setAttribute("aria-pressed", "false"); }
}

/* ───────── Guardar, exportar, cerrar ───────── */
function scheduleScoreSave(){ setStatusScore("Sin guardar…"); clearTimeout(P.saveT); P.saveT = setTimeout(saveScore, 800); }
async function saveScore(){
  if (!P.hoja) return; const h = P.hoja, sc = P.sc;
  try {
    await Store.setChunk(h.id, 0, {score:sc});
    const nNotes = sc.pentagramas.reduce((a, s) => a + s.ev.length, 0), cap = capOf(sc);
    const M = Math.max(0, ...sc.pentagramas.map(s => Math.ceil(s.ev.reduce((a, e) => a + dur32(e), 0) / cap)));
    const resumen = `${sc.pentagramas.length} pentagrama${sc.pentagramas.length === 1 ? "" : "s"} · ${M} compás${M === 1 ? "" : "es"} · ${nNotes} notas`;
    await Store.update("hojas", h.id, {updatedAt:Date.now(), resumen});
    if (P.hoja === h) setStatusScore("Guardado");
  } catch (e) { setStatusScore("Error al guardar"); showBanner("No se pudo guardar la partitura: " + (e.message || e)); }
}
function syl(prevHyphen, ly){ const h = /-$/.test(ly); return prevHyphen ? (h ? "middle" : "end") : (h ? "begin" : "single"); }
function xmlEsc(s){ return String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }
function buildMusicXML(sc, title){
  const cap = capOf(sc), [num, den] = sc.compas.split("/").map(Number), DIV = 8; // divisiones por negra: 1/32 de redonda = 1
  const per = sc.pentagramas.map(st => staffMeasures(st.ev, cap));
  const M = Math.max(1, ...per.map(ms => ms[0].length ? ms.length : 0));
  let x = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">\n<score-partwise version="3.1">\n<work><work-title>${xmlEsc(title)}</work-title></work>\n<identification><encoding><software>Biblia Musical</software></encoding></identification>\n<part-list>\n`;
  sc.pentagramas.forEach((st, k) => { x += `<score-part id="P${k + 1}"><part-name>${xmlEsc(st.nombre)}</part-name></score-part>\n`; });
  x += `</part-list>\n`;
  sc.pentagramas.forEach((st, k) => {
    const cl = CLAVES[st.clave] || CLAVES.treble;
    x += `<part id="P${k + 1}">\n`; let hy = false;
    for (let m = 0; m < M; m++) {
      x += `<measure number="${m + 1}">\n`;
      if (m === 0) x += `<attributes><divisions>${DIV}</divisions><key><fifths>${sc.tono}</fifths></key><time><beats>${num}</beats><beat-type>${den}</beat-type></time><clef><sign>${cl.sign}</sign><line>${cl.line}</line>${cl.shift ? `<clef-octave-change>${cl.shift}</clef-octave-change>` : ""}</clef></attributes>\n<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${sc.tempo}</per-minute></metronome></direction-type><sound tempo="${sc.tempo}"/></direction>\n`;
      const pieces = per[k][m];
      if (!pieces || !pieces.length) x += `<note><rest measure="yes"/><duration>${cap}</duration></note>\n`;
      else pieces.forEach((pc, j) => {
        const prev = j > 0 ? pieces[j - 1] : (m > 0 ? (per[k][m - 1] || []).slice(-1)[0] : null);
        const tiedFrom = prev && prev.tie && !prev.r && !pc.r;
        const tail = `<duration>${pc.u}</duration>${tiedFrom ? `<tie type="stop"/>` : ""}${pc.tie && !pc.r ? `<tie type="start"/>` : ""}<type>${XML_TYPE[pc.d]}</type>${pc.dot ? "<dot/>" : ""}`;
        const nots = (tiedFrom || (pc.tie && !pc.r)) ? `<notations>${tiedFrom ? `<tied type="stop"/>` : ""}${pc.tie ? `<tied type="start"/>` : ""}</notations>` : "";
        if (pc.r || !pc.p.length) { x += `<note><rest/>${tail}</note>\n`; return; }
        pc.p.forEach((p, q) => {
          let lyr = "";
          if (!q && pc.ly) { lyr = `<lyric number="1"><syllabic>${syl(hy, pc.ly)}</syllabic><text>${xmlEsc(pc.ly.replace(/-$/, ""))}</text></lyric>`; hy = /-$/.test(pc.ly); }
          x += `<note>${q ? "<chord/>" : ""}<pitch><step>${STEPS[p.s]}</step>${p.a ? `<alter>${p.a}</alter>` : ""}<octave>${p.o}</octave></pitch>${tail}${nots}${lyr}</note>\n`;
        });
      });
      if (m === M - 1) x += `<barline location="right"><bar-style>light-heavy</bar-style></barline>\n`;
      x += `</measure>\n`;
    }
    x += `</part>\n`;
  });
  return x + `</score-partwise>\n`;
}
async function exportMusicXML(){
  await saveScore();
  const title = P.hoja.titulo || "Partitura", xml = buildMusicXML(P.sc, title);
  const name = title.replace(/[^\p{L}\p{N} _-]/gu, "").trim() || "partitura";
  const ok = await saveFile(new Blob([xml], {type:"application/vnd.recordare.musicxml+xml"}), name + ".musicxml");
  if (ok) setStatusScore("Exportado");
}
function teardownScore(){
  stopPlayback(); window.removeEventListener("resize", renderScoreSoon); document.removeEventListener("keydown", onScoreKey);
  if (P.el) P.el.remove(); P.el = null; P.hoja = null; document.body.classList.remove("drawing");
}
async function closeScore(){ const h = P.hoja; clearTimeout(P.saveT); await saveScore(); teardownScore(); lastSig = ""; if (h && h.numeroId) S.openNum = h.numeroId; render(true); }
window.addEventListener("pagehide", () => { if (P.hoja) saveScore(); });
