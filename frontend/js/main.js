/**
 * NETRA32 — 3D Simulation frontend
 * ---------------------------------
 * Connects to the FastAPI backend over WebSocket (20Hz state broadcast),
 * renders a live 3D radar viewport with Three.js + OrbitControls, and
 * drives the telemetry / haptic-pattern sidebars from the same data.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

/* ============================================================
   CONFIG — change these if your backend runs somewhere else
   ============================================================ */
const CONFIG = {
  WS_URL: 'ws://localhost:8000/ws',
  API_BASE: 'http://localhost:8000',
  DETECTION_RADIUS_M: 6,
  CRITICAL_RADIUS_M: 2,
};

const COLORS = {
  green: 0x3ddc84,
  yellow: 0xf5c542,
  red: 0xff4d4d,
  gold: 0xe8a838,
};
const COLORS_CSS = { green: '#3ddc84', yellow: '#f5c542', red: '#ff4d4d', gold: '#e8a838' };

/* ============================================================
   DOM REFS
   ============================================================ */
const el = (id) => document.getElementById(id);
const wsDot = el('wsDot'), wsLabel = el('wsLabel');
const telHz = el('telHz'), telTargets = el('telTargets'), telClosest = el('telClosest'),
      telUptime = el('telUptime'), telScenario = el('telScenario');
const cntGreen = el('cntGreen'), cntYellow = el('cntYellow'), cntRed = el('cntRed');
const capTag = el('capTag'), capTxt = el('capTxt');
const stateLed = el('stateLed'), stateTxt = el('stateTxt'), patternDesc = el('patternDesc');
const pulseTrack = el('pulseTrack');
const audioToggle = el('audioToggle');
const logPanel = el('logPanel');
const viewportEl = el('viewport');

/* ============================================================
   EVENT LOG
   ============================================================ */
const logStart = performance.now();
function logEvent(msg, type = 'info') {
  const line = document.createElement('div');
  line.className = 'log-line ' + type;
  const secs = ((performance.now() - logStart) / 1000).toFixed(1);
  line.innerHTML = `<span class="ts">[${secs}s]</span>${msg}`;
  logPanel.appendChild(line);
  logPanel.scrollTop = logPanel.scrollHeight;
  while (logPanel.children.length > 100) logPanel.removeChild(logPanel.firstChild);
}
logEvent('Frontend initialized — awaiting backend connection', 'sys');

/* ============================================================
   THREE.JS SCENE SETUP
   ============================================================ */
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x020304, 0.045);
scene.background = new THREE.Color(0x020304);

const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
camera.position.set(9, 8, 11);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
viewportEl.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.domElement.style.position = 'absolute';
labelRenderer.domElement.style.top = '0';
labelRenderer.domElement.style.left = '0';
labelRenderer.domElement.style.pointerEvents = 'none';
viewportEl.appendChild(labelRenderer.domElement);

// belt-and-suspenders: force the WebGL canvas itself to sit flush at (0,0)
// inside its container too, in case the container's own layout shifts it.
renderer.domElement.style.position = 'absolute';
renderer.domElement.style.top = '0';
renderer.domElement.style.left = '0';
renderer.domElement.style.display = 'block';

const controls = new OrbitControls(camera, labelRenderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.set(0, 1.2, 0);
controls.minDistance = 3;
controls.maxDistance = 32;
controls.maxPolarAngle = Math.PI * 0.49;

// lighting
// NOTE: Three.js r155+ uses physically-correct light units by default, so
// point-light intensities need to be much higher than the old "legacy
// lights" scale (roughly a 10x jump) to read as visible in the scene.
scene.add(new THREE.AmbientLight(0x28343a, 1.4));
const key = new THREE.PointLight(0xe8a838, 18, 30);
key.position.set(4, 8, 4);
scene.add(key);
const rim = new THREE.PointLight(0x3d7a9c, 9, 30);
rim.position.set(-6, 4, -6);
scene.add(rim);

// grid floor
const grid = new THREE.GridHelper(30, 30, 0x8a672a, 0x14191c);
grid.material.opacity = 0.35;
grid.material.transparent = true;
scene.add(grid);

// range rings on the floor (2m critical, 6m detection)
function makeRing(radius, color, opacity) {
  const pts = [];
  const segs = 96;
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * radius, 0.02, Math.sin(a) * radius));
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
  return new THREE.Line(geo, mat);
}
scene.add(makeRing(CONFIG.CRITICAL_RADIUS_M, COLORS.red, 0.55));
scene.add(makeRing(CONFIG.DETECTION_RADIUS_M, COLORS.gold, 0.4));

// radar boundary dome (hemisphere), color driven by current alert state
const domeGeo = new THREE.SphereGeometry(CONFIG.DETECTION_RADIUS_M, 32, 20, 0, Math.PI * 2, 0, Math.PI / 2);
const domeMat = new THREE.MeshBasicMaterial({
  color: COLORS.green, transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false,
});
const dome = new THREE.Mesh(domeGeo, domeMat);
scene.add(dome);

const domeWireMat = new THREE.MeshBasicMaterial({ color: COLORS.green, wireframe: true, transparent: true, opacity: 0.18 });
const domeWire = new THREE.Mesh(domeGeo.clone(), domeWireMat);
scene.add(domeWire);

function setDomeColor(hex) {
  domeMat.color.setHex(hex);
  domeWireMat.color.setHex(hex);
}

// wearer avatar: glowing core + thin vertical pole for scale
const wearerGroup = new THREE.Group();
const wearerCore = new THREE.Mesh(
  new THREE.IcosahedronGeometry(0.22, 1),
  new THREE.MeshStandardMaterial({ color: COLORS.gold, emissive: COLORS.gold, emissiveIntensity: 0.6, roughness: 0.4 })
);
wearerCore.position.y = 1.5;
wearerGroup.add(wearerCore);

const pole = new THREE.Mesh(
  new THREE.CylinderGeometry(0.015, 0.015, 1.5, 8),
  new THREE.MeshBasicMaterial({ color: 0x3a4750, transparent: true, opacity: 0.5 })
);
pole.position.y = 0.75;
wearerGroup.add(pole);

const wearerLight = new THREE.PointLight(COLORS.gold, 10, 5);
wearerLight.position.y = 1.5;
wearerGroup.add(wearerLight);
scene.add(wearerGroup);

/* ============================================================
   TARGET MESH POOL
   ============================================================ */
const targetMeshes = new Map(); // id -> { group, capsule, label, currentPos: THREE.Vector3 }

function zoneColor(zone) {
  return zone === 'red' ? COLORS.red : zone === 'yellow' ? COLORS.yellow : COLORS.green;
}

function createTargetMesh(id) {
  const group = new THREE.Group();

  const capsule = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.22, 0.9, 4, 8),
    new THREE.MeshStandardMaterial({ color: COLORS.green, emissive: COLORS.green, emissiveIntensity: 0.35, roughness: 0.5 })
  );
  group.add(capsule);

  // grounding tether: a thin vertical line from the capsule down to its
  // floor position, so height (e.g. a crouching target) reads clearly
  // against the grid instead of the capsule looking like it's floating.
  const tetherGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, 0),
  ]);
  const tether = new THREE.Line(tetherGeo, new THREE.LineBasicMaterial({ color: COLORS.green, transparent: true, opacity: 0.4 }));
  group.add(tether);

  // floor marker ring directly beneath the target
  const floorDot = new THREE.Mesh(
    new THREE.RingGeometry(0.08, 0.14, 20),
    new THREE.MeshBasicMaterial({ color: COLORS.green, transparent: true, opacity: 0.7, side: THREE.DoubleSide })
  );
  floorDot.rotation.x = -Math.PI / 2;
  group.add(floorDot);

  const labelDiv = document.createElement('div');
  labelDiv.className = 'target-label';
  labelDiv.textContent = '—';
  const label = new CSS2DObject(labelDiv);
  label.position.set(0, 0.75, 0);
  group.add(label);

  scene.add(group);
  const entry = {
    group, capsule, tether, tetherGeo, floorDot, label: labelDiv,
    currentPos: new THREE.Vector3(0, 1, 0), targetPos: new THREE.Vector3(0, 1, 0),
  };
  targetMeshes.set(id, entry);
  return entry;
}

function removeTargetMesh(id) {
  const entry = targetMeshes.get(id);
  if (!entry) return;
  scene.remove(entry.group);
  targetMeshes.delete(id);
}

function syncTargets(targets) {
  const seenIds = new Set();
  for (const t of targets) {
    seenIds.add(t.id);
    let entry = targetMeshes.get(t.id);
    if (!entry) entry = createTargetMesh(t.id);

    entry.targetPos.set(t.x, t.y, t.z);
    const color = zoneColor(t.zone);
    entry.capsule.material.color.setHex(color);
    entry.capsule.material.emissive.setHex(color);
    entry.tether.material.color.setHex(color);
    entry.floorDot.material.color.setHex(color);
    entry.label.textContent = `${t.distance.toFixed(1)}m · ${t.speed.toFixed(1)}m/s`;
    entry.label.style.borderColor = t.zone === 'red' ? 'rgba(255,77,77,0.6)' : t.zone === 'yellow' ? 'rgba(245,197,66,0.6)' : 'rgba(61,220,132,0.5)';
  }
  for (const id of Array.from(targetMeshes.keys())) {
    if (!seenIds.has(id)) removeTargetMesh(id);
  }
}

/* ============================================================
   HAPTIC PULSE ENGINE (mirrors the physical device's patterns)
   ============================================================ */
const PATTERNS = {
  idle:       { segs: [], label: 'Idle — No Targets', desc: "Wearer's personal space is clear. No haptic output.", cls: '' },
  one:        { segs: [['short',150],['gap',150],['long',480],['gap',650]], label: '1 Person Nearby', desc: 'Pattern: short pulse, long pulse (• —).', cls: '' },
  two:        { segs: [['short',150],['gap',120],['short',150],['gap',150],['long',480],['gap',650]], label: '2 People Nearby', desc: 'Pattern: two short pulses, one long pulse (•• —).', cls: '' },
  three:      { segs: [['short',150],['gap',120],['short',150],['gap',120],['short',150],['gap',150],['long',480],['gap',650]], label: '3+ People Nearby', desc: 'Pattern: three short pulses, one long pulse (••• —).', cls: '' },
  rapid:      { segs: [['short',90],['gap',80],['short',90],['gap',80],['short',90],['gap',80],['short',90],['gap',380]], label: 'Rapid Approach', desc: 'Fast flash warning grid (• • • •). A target is closing distance quickly.', cls: 'rapid' },
  continuous: { segs: [['long',280],['gap',90],['long',280],['gap',90],['long',280],['gap',90],['long',280],['gap',560]], label: 'Continuous Proximity', desc: 'Sustained steady pulse (•••• ———). A target has remained within critical range.', cls: 'continuous' },
};

let currentState = 'idle';
let cycleStart = performance.now();
let lastSegIndex = -1;

function renderPatternSegs(pattern) {
  pulseTrack.innerHTML = '';
  const total = pattern.segs.reduce((a, s) => a + s[1], 0) || 1;
  pattern.segs.forEach(([type, dur]) => {
    const seg = document.createElement('div');
    seg.className = 'pulse-seg' + (type === 'gap' ? ' gap' : '');
    seg.style.flex = (dur / total).toFixed(4);
    pulseTrack.appendChild(seg);
  });
  if (pattern.segs.length === 0) {
    const seg = document.createElement('div');
    seg.style.flex = '1'; seg.style.textAlign = 'center'; seg.style.color = 'var(--text-dim)'; seg.style.fontSize = '0.68rem';
    seg.textContent = '— NO SIGNAL —';
    pulseTrack.appendChild(seg);
  }
}

function setHapticState(newState) {
  if (newState === currentState) return;
  const prev = currentState;
  currentState = newState;
  cycleStart = performance.now();
  lastSegIndex = -1;
  const p = PATTERNS[newState];
  stateTxt.textContent = p.label;
  patternDesc.textContent = p.desc;
  stateLed.className = 'led' + (newState === 'idle' ? '' : ' active');
  stateLed.style.color = newState === 'rapid' ? COLORS_CSS.red : newState === 'continuous' ? COLORS_CSS.yellow : COLORS_CSS.gold;
  renderPatternSegs(p);
  setDomeColor(newState === 'rapid' || newState === 'continuous' || newState === 'three' ? COLORS.red :
               newState === 'one' || newState === 'two' ? COLORS.yellow : COLORS.green);

  if (newState !== 'idle' && prev !== newState) {
    const typeMap = { one: 'info', two: 'warn', three: 'warn', rapid: 'crit', continuous: 'crit' };
    logEvent('Haptic engine → ' + p.label, typeMap[newState] || 'info');
  } else if (newState === 'idle' && prev !== 'idle') {
    logEvent('Haptic engine → idle, no targets within range', 'ok');
  }
}

function updateHapticEngine(now) {
  const pattern = PATTERNS[currentState];
  if (pattern.segs.length === 0) return;
  const total = pattern.segs.reduce((a, s) => a + s[1], 0);
  const t = (now - cycleStart) % total;
  let acc = 0, idx = 0;
  for (let i = 0; i < pattern.segs.length; i++) {
    if (t < acc + pattern.segs[i][1]) { idx = i; break; }
    acc += pattern.segs[i][1];
  }
  if (idx !== lastSegIndex) {
    lastSegIndex = idx;
    const children = pulseTrack.children;
    for (let i = 0; i < children.length; i++) children[i].classList.remove('lit');
    const [type, dur] = pattern.segs[idx];
    if (type !== 'gap') {
      children[idx].classList.add('lit');
      if (pattern.cls) children[idx].classList.add(pattern.cls);
      thud(dur, type);
    }
  }
}

/* ---- audio (Web Audio API "motor feel") ---- */
let audioOn = false, actx = null;
audioToggle.addEventListener('click', () => {
  audioOn = !audioOn;
  audioToggle.classList.toggle('on', audioOn);
  if (audioOn && !actx) actx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioOn && actx.state === 'suspended') actx.resume();
});
function thud(durMs, kind) {
  if (!audioOn || !actx) return;
  const now = actx.currentTime;
  const osc = actx.createOscillator();
  const gain = actx.createGain();
  osc.type = 'sine';
  osc.frequency.value = kind === 'long' ? 62 : 90;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.35, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + durMs / 1000);
  osc.connect(gain).connect(actx.destination);
  osc.start(now);
  osc.stop(now + durMs / 1000 + 0.02);
}

/* ============================================================
   TELEMETRY / CAPTION UPDATES FROM BACKEND STATE
   ============================================================ */
const CAPTIONS = {
  idle: ['STANDBY', 'Perimeter clear — no targets within the detection field.'],
  one: ['IN RANGE', 'One person detected within the 6m field.'],
  two: ['WARNING', 'Two people detected within the 6m field.'],
  three: ['WARNING', 'Three or more people detected within the 6m field.'],
  rapid: ['CRITICAL', 'A target is closing distance rapidly.'],
  continuous: ['CRITICAL', 'A target has held critical range for an extended period.'],
};

let lastScenario = null;
let serverStartWallClock = null;

function applyState(state) {
  // telemetry
  telTargets.textContent = state.targets.length;
  const closest = state.alert.closest_distance;
  telClosest.textContent = closest === null || closest === undefined ? '— m' : closest.toFixed(2) + ' m';
  telClosest.className = 'val' + (closest == null ? '' : closest < 2 ? ' red' : closest <= 6 ? ' yellow' : ' green');
  telScenario.textContent = state.scenario.replace(/_/g, ' ');

  if (serverStartWallClock === null) serverStartWallClock = Date.now() - state.server_time * 1000;
  const uptimeSec = Math.floor(state.server_time);
  const hh = String(Math.floor(uptimeSec / 3600)).padStart(2, '0');
  const mm = String(Math.floor((uptimeSec % 3600) / 60)).padStart(2, '0');
  const ss = String(uptimeSec % 60).padStart(2, '0');
  telUptime.textContent = `${hh}:${mm}:${ss}`;

  // zone counts
  let g = 0, y = 0, r = 0;
  state.targets.forEach(t => { if (t.zone === 'red') r++; else if (t.zone === 'yellow') y++; else g++; });
  cntGreen.textContent = g; cntYellow.textContent = y; cntRed.textContent = r;

  // scenario change caption + log
  if (state.scenario !== lastScenario) {
    if (lastScenario !== null) logEvent(`Scenario switched → "${state.scenario.replace(/_/g,' ')}"`, 'sys');
    lastScenario = state.scenario;
  }
  const [tag, txt] = CAPTIONS[state.alert.state] || CAPTIONS.idle;
  capTag.textContent = tag;
  capTxt.textContent = txt;

  // haptic engine + 3D scene
  setHapticState(state.alert.state);
  syncTargets(state.targets);
}

/* ============================================================
   WEBSOCKET CLIENT (with auto-reconnect)
   ============================================================ */
let ws = null;
let lastMessageAt = 0;
let tickIntervalsMs = [];

function connectWebSocket() {
  wsLabel.textContent = 'Connecting to backend…';
  ws = new WebSocket(CONFIG.WS_URL);

  ws.onopen = () => {
    wsDot.className = 'dot online';
    wsLabel.textContent = 'Backend connected — ' + CONFIG.WS_URL;
    logEvent('WebSocket connected to simulation backend', 'ok');
  };

  ws.onmessage = (ev) => {
    const now = performance.now();
    if (lastMessageAt) {
      tickIntervalsMs.push(now - lastMessageAt);
      if (tickIntervalsMs.length > 40) tickIntervalsMs.shift();
      const avg = tickIntervalsMs.reduce((a, b) => a + b, 0) / tickIntervalsMs.length;
      telHz.textContent = avg > 0 ? (1000 / avg).toFixed(1) + ' Hz' : '— Hz';
    }
    lastMessageAt = now;

    let state;
    try { state = JSON.parse(ev.data); } catch { return; }
    if (state.type === 'state') applyState(state);
  };

  ws.onclose = () => {
    wsDot.className = 'dot offline';
    wsLabel.textContent = 'Disconnected — retrying in 2s…';
    logEvent('WebSocket disconnected — attempting reconnect', 'warn');
    setTimeout(connectWebSocket, 2000);
  };

  ws.onerror = () => { ws.close(); };
}
connectWebSocket();

/* ---- scenario control buttons ---- */
const scenarioButtons = document.querySelectorAll('[data-scenario]');
scenarioButtons.forEach(btn => {
  btn.addEventListener('click', async () => {
    const name = btn.getAttribute('data-scenario');
    scenarioButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    try {
      await fetch(`${CONFIG.API_BASE}/api/scenario/${name}`, { method: 'POST' });
      logEvent(`Requested scenario → "${name.replace(/_/g,' ')}"`, 'sys');
    } catch (e) {
      logEvent('Failed to reach backend REST API — is it running on :8000?', 'crit');
    }
  });
});
document.getElementById('btnAuto').classList.add('active');

/* ============================================================
   RENDER LOOP (smooths target motion between 20Hz backend ticks)
   ============================================================ */
function resize() {
  const w = viewportEl.clientWidth, h = viewportEl.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  labelRenderer.setSize(w, h);
}
window.addEventListener('resize', resize);
resize();

function animate(now) {
  requestAnimationFrame(animate);

  // smooth-interpolate targets toward their latest backend position
  // (group.y comes straight from the backend's height field, so a
  // crouching target's capsule visibly drops — no extra local offset here,
  // that would cancel out the height animation)
  targetMeshes.forEach(entry => {
    entry.currentPos.lerp(entry.targetPos, 0.25);
    entry.group.position.copy(entry.currentPos);
    entry.label.style.color = '#e6ecef';

    // stretch the tether from the capsule (local origin) down to the floor
    const groundLocalY = -entry.currentPos.y;
    const posAttr = entry.tetherGeo.getAttribute('position');
    posAttr.setXYZ(0, 0, 0, 0);
    posAttr.setXYZ(1, 0, groundLocalY, 0);
    posAttr.needsUpdate = true;
    entry.floorDot.position.y = groundLocalY;
  });

  // gentle idle motion for the wearer core + dome breathing
  const pulse = 1 + Math.sin(now / 500) * 0.06;
  wearerCore.scale.setScalar(pulse);
  domeWire.rotation.y += 0.0009;

  updateHapticEngine(now);

  controls.update();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}
requestAnimationFrame(animate);

setHapticState('idle');
renderPatternSegs(PATTERNS.idle);
