// Native Clouds · Floating Island — a hand-built low-poly 3D background (three.js, no generated images).
// A flat disc-world floats in space: sea on top, land tapering to a point below, a town on a central
// island, ships and balloons that sail/fly in to deliver desktop widgets. Day/night + live weather.
// Original toy shapes only — no copied game art or characters.
//
//   import { createIsland } from '/livebg/island.js'
//   const bg = createIsland(canvas, { input:'off' })
//   import { attachWidgets } from '/livebg/widgets.js'; attachWidgets(bg)
//   bg.deliver('clock', { by:'airship' })   // airship->balloon, eagle->parrot, balloon->ship

import * as THREE from './vendor/three.module.min.js';
import { fetchWeather, geocode, WEATHER_PRESETS } from './livebg.js';

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
const rand = (a, b) => a + Math.random() * (b - a);

// ---------- palette (warm toy island) ----------
const COL = {
  sea: 0x37b6d3, seaDeep: 0x1f7fa8, sand: 0xf2d79b, grass: 0x7cc45a, grassDk: 0x5aa23e,
  rock: 0x8a7d6b, rockDk: 0x6f6456, soil: 0x9c6b43, soilDk: 0x6e4a2e,
  wood: 0xb4794a, woodDk: 0x7c5230, sail: 0xf6efe0, hull: 0xc0693a,
  roofA: 0xe4572e, roofB: 0xf3a712, roofC: 0x4b84c4, wall: 0xf4ead2, wallB: 0xe8d7b0,
  palmTrunk: 0xa9743f, leaf: 0x4fae53, leafDk: 0x3c8a44, parrot: 0xef476f, parrotWing: 0x06d6a0,
};
const SKY = { // [top, horizon] by phase
  night: [[10, 14, 40], [26, 30, 66]], golden: [[70, 78, 150], [255, 150, 92]],
  day: [[60, 140, 230], [175, 214, 246]], overcast: [[120, 128, 146], [176, 184, 198]],
};
const mix = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
const toCol = (rgb) => new THREE.Color(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255);

function mat(color, opts = {}) { return new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.9, metalness: 0, ...opts }); }

export function createIsland(canvas, opts = {}) {
  const listeners = {};
  const emit = (e, d) => (listeners[e] || []).forEach((f) => { try { f(d); } catch { /* ignore */ } });
  const R = 10; // world disc radius

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setClearColor(0x05060e, 1);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);
  const camBase = new THREE.Vector3(0, R * 0.62, R * 2.35);
  camera.position.copy(camBase);

  const S = {
    t: 0, dt: 0, raf: 0, last: 0,
    location: opts.location || { lat: 41.7151, lon: 44.8271, name: 'Тбилиси' },
    weatherMode: 'live', weather: { ...WEATHER_PRESETS.partly }, live: null,
    timeMode: 'live', hour: 12, speed: 0, curH: 12,
    flyers: { far: { ship: 2, balloon: 0, parrot: 2 }, mid: { ship: 1, balloon: 1, parrot: 1 }, near: { ship: 0, balloon: 0, parrot: 0 } },
    couriers: [], ships: [], birds: [], balloons: [], courierSeq: 1,
    W: 1, H: 1,
  };

  // ---------- lights ----------
  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x4a5238, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2d0, 1.1);
  scene.add(sun);
  const ambient = new THREE.AmbientLight(0xffffff, 0.25);
  scene.add(ambient);
  const fillBelow = new THREE.PointLight(0x5566aa, 0.3, 60); fillBelow.position.set(0, -R, 0); scene.add(fillBelow);

  // ---------- sky dome + space (shader gradient) ----------
  const skyUniforms = {
    top: { value: toCol(SKY.day[0]) }, horizon: { value: toCol(SKY.day[1]) },
    space: { value: new THREE.Color(0x05060e) }, sunDir: { value: new THREE.Vector3(0, 1, 0) },
    sunColor: { value: new THREE.Color(0xffe9b0) }, sunI: { value: 1 },
  };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(200, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, uniforms: skyUniforms,
    vertexShader: 'varying vec3 vD; void main(){ vD=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `varying vec3 vD; uniform vec3 top,horizon,space,sunColor,sunDir; uniform float sunI;
      void main(){ float y=vD.y;
        vec3 c = y>0.0 ? mix(horizon,top,pow(clamp(y,0.0,1.0),0.55)) : mix(horizon,space,pow(clamp(-y*1.3,0.0,1.0),0.5));
        float s=max(dot(vD,normalize(sunDir)),0.0); c+=sunColor*pow(s,160.0)*sunI*1.6; c+=sunColor*pow(s,8.0)*0.12*sunI;
        gl_FragColor=vec4(c,1.0); }`,
  }));
  scene.add(sky);

  // stars (visible against space + at night)
  const starGeo = new THREE.BufferGeometry();
  const starN = 1400, sp = new Float32Array(starN * 3);
  for (let i = 0; i < starN; i++) { const r = rand(60, 180), th = rand(0, Math.PI * 2), ph = Math.acos(rand(-1, 1)); sp[i * 3] = r * Math.sin(ph) * Math.cos(th); sp[i * 3 + 1] = r * Math.cos(ph); sp[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th); }
  starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.6, sizeAttenuation: true, transparent: true, opacity: 0.8, depthWrite: false }));
  scene.add(stars);

  // ---------- sun / moon disc ----------
  const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(2.2, 24), new THREE.MeshBasicMaterial({ color: 0xffe9a8 }));
  const moonDisc = new THREE.Mesh(new THREE.CircleGeometry(1.7, 24), new THREE.MeshBasicMaterial({ color: 0xeaf0ff }));
  scene.add(sunDisc, moonDisc);

  // ---------- the floating world ----------
  const world = new THREE.Group(); scene.add(world);

  // rock plate (land mass) — low cylinder
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 0.96, 1.6, 7), mat(COL.rock));
  plate.position.y = -0.8; world.add(plate);
  // soil band
  const soil = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.99, R * 0.9, 0.9, 7), mat(COL.soil));
  soil.position.y = -0.2; world.add(soil);
  // underside cone -> point
  const under = new THREE.Mesh(new THREE.ConeGeometry(R * 0.95, R * 1.7, 7, 1, true), mat(COL.rockDk));
  under.position.y = -1.6 - R * 0.85; under.rotation.y = Math.PI / 7; world.add(under);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(R * 0.28, R * 0.9, 6), mat(COL.rockDk));
  tip.position.y = -1.6 - R * 1.25; world.add(tip);
  // hanging rocks under the island
  for (let i = 0; i < 7; i++) { const r = new THREE.Mesh(new THREE.IcosahedronGeometry(rand(0.5, 1.4), 0), mat(Math.random() < 0.5 ? COL.rock : COL.rockDk)); r.position.set(rand(-R * 0.6, R * 0.6), -R * rand(0.9, 1.9), rand(-R * 0.6, R * 0.6)); r.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3)); world.add(r); }

  // sea on top (a disc, slightly transparent, gentle waves)
  const seaGeo = new THREE.CircleGeometry(R * 0.93, 48, 0, Math.PI * 2);
  seaGeo.rotateX(-Math.PI / 2);
  const sea = new THREE.Mesh(seaGeo, mat(COL.sea, { transparent: true, opacity: 0.86, roughness: 0.3, metalness: 0.1, emissive: new THREE.Color(COL.seaDeep), emissiveIntensity: 0.15 }));
  sea.position.y = 0.35; world.add(sea);
  const seaBase = Float32Array.from(seaGeo.attributes.position.array);

  // sandy ring at the rim (beach of the whole world)
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R * 0.9, 0.5, 6, 40), mat(COL.sand));
  rim.position.y = 0.3; rim.rotation.x = Math.PI / 2; world.add(rim);

  // central island rising from the sea
  const island = new THREE.Group(); island.position.y = 0.35; world.add(island);
  const mound = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.3, R * 0.42, 2.2, 8), mat(COL.grass));
  mound.position.y = 1; island.add(mound);
  const beach = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.44, R * 0.48, 0.5, 8), mat(COL.sand));
  beach.position.y = 0.1; island.add(beach);
  const hill = new THREE.Mesh(new THREE.ConeGeometry(R * 0.15, 1.6, 8), mat(COL.grassDk));
  hill.position.set(-R * 0.14, 2.9, -R * 0.14); island.add(hill);

  // palm builder
  function palm(x, z, s = 1) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1 * s, 0.16 * s, 1.8 * s, 5), mat(COL.palmTrunk));
    trunk.position.y = 0.9 * s; trunk.rotation.z = rand(-0.12, 0.12); g.add(trunk);
    for (let i = 0; i < 6; i++) { const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.22 * s, 1.3 * s, 4), mat(Math.random() < 0.5 ? COL.leaf : COL.leafDk)); leaf.position.y = 1.8 * s; leaf.rotation.z = Math.PI / 2.4; leaf.rotation.y = (i / 6) * Math.PI * 2; leaf.position.x = Math.cos(i / 6 * Math.PI * 2) * 0.5 * s; leaf.position.z = Math.sin(i / 6 * Math.PI * 2) * 0.5 * s; g.add(leaf); }
    g.position.set(x, 2.0, z); island.add(g); return g;
  }
  for (let i = 0; i < 7; i++) { const a = rand(0, 6.28), r = rand(R * 0.12, R * 0.26); palm(Math.cos(a) * r, Math.sin(a) * r, rand(0.8, 1.3)); }

  // town: cluster of houses + a lighthouse
  function house(x, z, h, roofCol) {
    const g = new THREE.Group();
    const bw = rand(0.7, 1.1);
    const body = new THREE.Mesh(new THREE.BoxGeometry(bw, h, bw), mat(Math.random() < 0.5 ? COL.wall : COL.wallB));
    body.position.y = h / 2; g.add(body);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(bw * 0.85, h * 0.7, 4), mat(roofCol));
    roof.position.y = h + h * 0.35; roof.rotation.y = Math.PI / 4; g.add(roof);
    g.position.set(x, 3.1, z); g.rotation.y = rand(0, 6.28); island.add(g); return g;
  }
  const roofs = [COL.roofA, COL.roofB, COL.roofC];
  for (let i = 0; i < 10; i++) { const a = rand(-1.2, 4.3), r = rand(R*0.03, R * 0.2); house(Math.cos(a) * r, Math.abs(Math.sin(a)) * r * 0.6 + r*0.4, rand(0.9, 1.6), roofs[i % 3]); }
  // lighthouse
  const lh = new THREE.Group();
  const lhBody = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.4, 3, 8), mat(COL.wall)); lhBody.position.y = 1.5; lh.add(lhBody);
  const lhTop = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.5, 8), mat(COL.roofA)); lhTop.position.y = 3.2; lh.add(lhTop);
  const lhLight = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), new THREE.MeshBasicMaterial({ color: 0xfff2a0 })); lhLight.position.y = 3.2; lh.add(lhLight);
  lh.position.set(R * 0.12, 3.1, R * 0.08); island.add(lh);
  const beacon = new THREE.PointLight(0xffe9a0, 0, 20); beacon.position.set(R * 0.12, 6.3, R * 0.08); island.add(beacon);

  // small outer islets
  for (let i = 0; i < 3; i++) { const a = rand(0, 6.28), r = R * rand(0.6, 0.78); const islet = new THREE.Mesh(new THREE.CylinderGeometry(rand(0.6, 1), rand(0.9, 1.3), 0.8, 6), mat(COL.sand)); islet.position.set(Math.cos(a) * r, 0.5, Math.sin(a) * r); world.add(islet); palm(Math.cos(a) * r, Math.sin(a) * r, 0.7); }

  // ---------- ship / balloon / parrot builders (couriers + ambient) ----------
  function makeShip() {
    const g = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.28, 1.5, 6, 1, false, 0, Math.PI), mat(COL.hull));
    hull.rotation.z = Math.PI / 2; hull.rotation.y = Math.PI / 2; hull.scale.set(1, 1, 0.7); g.add(hull);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 0.6), mat(COL.woodDk)); deck.position.y = 0.05; g.add(deck);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.4, 5), mat(COL.woodDk)); mast.position.y = 0.75; g.add(mast);
    const sail = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.9), mat(COL.sail, { side: THREE.DoubleSide })); sail.position.set(0, 0.85, 0); g.add(sail);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.16), mat(COL.roofA, { side: THREE.DoubleSide })); flag.position.set(0.14, 1.42, 0); g.add(flag);
    g.scale.setScalar(0.9); return g;
  }
  function makeBalloon() {
    const g = new THREE.Group();
    const stripes = [COL.roofA, COL.sail, COL.roofC, COL.sail];
    const env = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 10), mat(COL.roofB)); env.scale.y = 1.25; env.position.y = 0.7; g.add(env);
    for (let i = 0; i < 4; i++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.605, 10, 10, i / 4 * Math.PI * 2, Math.PI / 2 / 2), mat(stripes[i])); s.scale.y = 1.25; s.position.y = 0.7; g.add(s); }
    const basket = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.26, 0.3), mat(COL.wood)); basket.position.y = 0; g.add(basket);
    return g;
  }
  function makeParrot() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), mat(COL.parrot)); body.scale.set(1, 1, 1.4); g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), mat(COL.parrot)); head.position.set(0, 0.08, 0.22); g.add(head);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 5), mat(0xf4b400)); beak.position.set(0, 0.05, 0.34); beak.rotation.x = Math.PI / 2; g.add(beak);
    const wingL = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.5, 4), mat(COL.parrotWing)); wingL.rotation.z = Math.PI / 2; wingL.position.x = -0.22; g.add(wingL);
    const wingR = wingL.clone(); wingR.position.x = 0.22; wingR.rotation.z = -Math.PI / 2; g.add(wingR);
    g.userData.wings = [wingL, wingR];
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.4, 4), mat(0x3aa0ff)); tail.position.z = -0.3; tail.rotation.x = -Math.PI / 2; g.add(tail);
    g.scale.setScalar(0.9); return g;
  }
  const BUILD = { ship: makeShip, balloon: makeBalloon, parrot: makeParrot };

  // ambient flyers: ships circle on the sea; parrots/balloons drift in the sky
  function rebuildFlyers() {
    for (const arr of [S.ships, S.birds, S.balloons]) { for (const o of arr) world.remove(o.mesh); arr.length = 0; }
    const want = { ship: 0, balloon: 0, parrot: 0 };
    for (const plan of ['far', 'mid', 'near']) for (const k of ['ship', 'balloon', 'parrot']) want[k] += S.flyers[plan][k] || 0;
    for (let i = 0; i < want.ship; i++) addAmbient('ship');
    for (let i = 0; i < want.balloon; i++) addAmbient('balloon');
    for (let i = 0; i < want.parrot; i++) addAmbient('parrot');
  }
  function addAmbient(kind) {
    const mesh = BUILD[kind](); world.add(mesh);
    if (kind === 'ship') { mesh.scale.multiplyScalar(1.5); const o = { mesh, a: rand(0, 6.28), r: R * rand(0.6, 0.82), sp: rand(0.05, 0.1) * (Math.random() < 0.5 ? 1 : -1) }; S.ships.push(o); }
    else if (kind === 'parrot') { const o = { mesh, a: rand(0, 6.28), r: R * rand(0.3, 0.7), y: rand(4, 8), sp: rand(0.2, 0.4) * (Math.random() < 0.5 ? 1 : -1), ph: rand(0, 6.28) }; S.birds.push(o); }
    else { const o = { mesh, a: rand(0, 6.28), r: R * rand(0.4, 0.75), y: rand(5, 9), sp: rand(0.03, 0.08) }; S.balloons.push(o); }
  }

  // ---------- clouds ----------
  const clouds = new THREE.Group(); scene.add(clouds);
  const cloudMat = mat(0xffffff, { transparent: true, opacity: 0.95, roughness: 1 });
  function makeCloud() {
    const g = new THREE.Group(); const n = 3 + (Math.random() * 4 | 0);
    for (let i = 0; i < n; i++) { const p = new THREE.Mesh(new THREE.IcosahedronGeometry(rand(0.8, 1.6), 0), cloudMat); p.position.set(rand(-2, 2), rand(-0.3, 0.3), rand(-1, 1)); p.scale.y = 0.6; g.add(p); }
    g.userData = { a: rand(0, 6.28), r: R * rand(0.9, 1.6), y: rand(7, 12), sp: rand(0.01, 0.04) };
    g.position.set(Math.cos(g.userData.a) * g.userData.r, g.userData.y, Math.sin(g.userData.a) * g.userData.r);
    clouds.add(g); return g;
  }
  for (let i = 0; i < 10; i++) makeCloud();

  // ---------- precipitation ----------
  const precip = new THREE.Group(); scene.add(precip);
  const rainN = 1500, rainPos = new Float32Array(rainN * 3), rainGeo = new THREE.BufferGeometry();
  for (let i = 0; i < rainN; i++) { rainPos[i * 3] = rand(-R, R); rainPos[i * 3 + 1] = rand(0, 16); rainPos[i * 3 + 2] = rand(-R, R); }
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.Points(rainGeo, new THREE.PointsMaterial({ color: 0xbfd4ec, size: 0.12, transparent: true, opacity: 0.6, depthWrite: false })); precip.add(rain);
  const snow = new THREE.Points(rainGeo.clone(), new THREE.PointsMaterial({ color: 0xffffff, size: 0.22, transparent: true, opacity: 0.9, depthWrite: false })); precip.add(snow);

  // ---------- time / weather ----------
  function localHour() {
    if (S.timeMode === 'fixed') return S.hour;
    const off = S.live?.utcOffset ?? -new Date().getTimezoneOffset() * 60;
    return ((Date.now() / 1000 + off) % 86400 + 86400) % 86400 / 3600;
  }
  function solar() {
    const rise = S.live?.sunrise ?? 7.2, set = S.live?.sunset ?? 17.8, h = S.curH;
    if (h >= rise && h <= set) { const t = (h - rise) / (set - rise); return { day: true, t, el: Math.sin(Math.PI * t) }; }
    const len = 24 - (set - rise), since = h > set ? h - set : h + 24 - set, t = since / len;
    return { day: false, t, el: -Math.sin(Math.PI * t) };
  }
  const weather = () => (S.weatherMode === 'live' && S.live ? S.live : S.weather);

  function grade() {
    const s = solar(), w = weather();
    const el = s.el, gray = clamp(w.cloud * 0.5 + w.rain * 0.4 + (w.storm ? 0.3 : 0));
    // sun azimuth across the sky
    const az = (s.t - 0.5) * Math.PI * 1.1;
    const dir = new THREE.Vector3(Math.sin(az) * 0.8, Math.max(el, -0.3), -Math.cos(az) * 0.5).normalize();
    sun.position.copy(dir).multiplyScalar(60);
    sun.intensity = s.day ? lerp(0.25, 1.15, clamp(el)) * (1 - gray * 0.6) : 0.05;
    // sky colors
    let top, hor;
    if (el < 0) { const k = smooth(-el / 0.3); top = mix(SKY.golden[0], SKY.night[0], k); hor = mix(SKY.golden[1], SKY.night[1], k); }
    else { const k = smooth(el / 0.32); top = mix(SKY.golden[0], SKY.day[0], k); hor = mix(SKY.golden[1], SKY.day[1], k); }
    const oc = SKY.overcast; top = mix(top, oc[0], gray * 0.7); hor = mix(hor, oc[1], gray * 0.7);
    skyUniforms.top.value.copy(toCol(top)); skyUniforms.horizon.value.copy(toCol(hor));
    skyUniforms.sunDir.value.copy(dir); skyUniforms.sunI.value = s.day ? (1 - gray) : 0;
    const warm = s.day && el < 0.25 ? 1 - smooth(el / 0.25) : 0;
    skyUniforms.sunColor.value.setRGB(1, lerp(0.92, 0.6, warm), lerp(0.8, 0.4, warm));
    sun.color.setRGB(1, lerp(0.95, 0.62, warm), lerp(0.84, 0.42, warm));
    hemi.intensity = s.day ? lerp(0.3, 0.95, clamp(el)) * (1 - gray * 0.3) : 0.18;
    ambient.intensity = s.day ? 0.25 : 0.12;
    // fog tints distance into the horizon/space
    scene.fog = new THREE.Fog(toCol(mix(hor, [8, 10, 24], 0.2)).getHex(), R * 2.6, 95);
    renderer.setClearColor(toCol(mix([6, 7, 16], hor, s.day ? 0.08 : 0)).getHex(), 1);
    // sun/moon discs
    const sunPos = dir.clone().multiplyScalar(120); sunDisc.position.copy(sunPos); sunDisc.visible = s.day && el > -0.1; sunDisc.lookAt(camera.position);
    const moonPos = dir.clone().multiplyScalar(-120); moonPos.y = Math.abs(moonPos.y); moonDisc.position.copy(moonPos); moonDisc.visible = !s.day || el < 0.1; moonDisc.lookAt(camera.position);
    sunDisc.material.color.copy(skyUniforms.sunColor.value);
    // stars + beacon by darkness
    const dark = clamp(-el * 2.5 + (1 - clamp(el)) * 0.1);
    stars.material.opacity = clamp(0.25 + dark * 0.7);
    beacon.intensity = dark > 0.3 ? (0.6 + 0.4 * Math.sin(S.t * 2)) : 0;
    lhLight.material.color.setScalar(dark > 0.3 ? 1 : 0.5);
    // precipitation visibility
    rain.visible = w.rain > 0.05 && w.snow <= w.rain; snow.visible = w.snow > 0.05;
    rain.material.opacity = clamp(w.rain) * 0.6; snow.material.opacity = clamp(w.snow) * 0.9;
    cloudMat.opacity = clamp(0.5 + w.cloud * 0.5); cloudMat.color.setScalar(gray > 0.4 ? lerp(1, 0.6, gray) : 1);
    S.cloudCount = Math.round(3 + w.cloud * 7);
    return { s, w };
  }

  // ---------- courier delivery ----------
  const MAP = { airship: 'balloon', balloon: 'ship', eagle: 'parrot' };
  function deliver(widget, o = {}) {
    const kind = MAP[o.by] || 'balloon';
    const at = [clamp(+(o.at?.[0] ?? 0.5), 0.05, 0.95), clamp(+(o.at?.[1] ?? 0.4), 0.1, 0.9)];
    const mesh = BUILD[kind](); mesh.scale.multiplyScalar(kind === 'ship' ? 1.1 : 1); world.add(mesh);
    const a0 = rand(0, 6.28);
    const c = { id: S.courierSeq++, kind, mesh, widget: String(widget).slice(0, 40), data: o.data || null, size: o.size || 'M', tag: o.tag || null, at,
      state: 'in', t: 0, a: a0, r: kind === 'ship' ? R * 0.85 : R * 0.7, y: kind === 'ship' ? 0.5 : rand(5, 7), targetA: a0 - 1.2, dropped: false };
    S.couriers.push(c);
    return new Promise((res) => { c.resolve = res; });
  }
  function screenOf(obj) {
    const v = obj.getWorldPosition(new THREE.Vector3()).project(camera);
    return [(v.x * 0.5 + 0.5) * S.W, (-v.y * 0.5 + 0.5) * S.H];
  }
  function stepCouriers() {
    for (const c of S.couriers) {
      c.t += S.dt;
      if (c.state === 'in') {
        c.a = lerp(c.a, c.targetA, 1 - Math.exp(-S.dt * 1.2));
        if (Math.abs(c.a - c.targetA) < 0.05) { c.state = 'hover'; c.t = 0; }
      } else if (c.state === 'hover') {
        if (!c.dropped && c.t > 0.5) {
          c.dropped = true;
          emit('drop', { id: c.id, widget: c.widget, data: c.data, size: c.size, tag: c.tag, from: screenOf(c.mesh), to: [c.at[0] * S.W, c.at[1] * S.H] });
          c.resolve?.(c.id);
        }
        if (c.t > 1.3) { c.state = 'out'; }
      } else { c.a += (c.kind === 'ship' ? 0.1 : 0.15) * S.dt; }
      const x = Math.cos(c.a) * c.r, z = Math.sin(c.a) * c.r;
      c.mesh.position.set(x, c.y + (c.kind !== 'ship' ? Math.sin(S.t + c.id) * 0.2 : 0), z);
      c.mesh.lookAt(0, c.mesh.position.y, 0); c.mesh.rotateY(Math.PI / 2);
      if (c.kind === 'parrot') { const f = Math.sin(S.t * 12 + c.id) * 0.6; c.mesh.userData.wings?.forEach((w, i) => w.rotation.z = (i ? -1 : 1) * (Math.PI / 2 - f)); }
    }
    S.couriers = S.couriers.filter((c) => { if (c.state === 'out' && c.t > 6) { world.remove(c.mesh); return false; } return true; });
  }

  // ---------- animation ----------
  function resize() {
    const r = canvas.getBoundingClientRect(); S.W = Math.max(1, r.width); S.H = Math.max(1, r.height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.setSize(S.W, S.H, false); camera.aspect = S.W / S.H; camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize); ro.observe(canvas); resize();

  function frame(now) {
    S.raf = requestAnimationFrame(frame);
    if (document.hidden) { S.last = now; return; }
    const dt = Math.min(0.05, (now - (S.last || now)) / 1000); S.last = now; S.dt = dt; S.t += dt;
    if (S.timeMode === 'fixed' && S.speed) S.hour = (S.hour + dt * S.speed / 3600 + 24) % 24;
    S.curH = localHour();
    const { w } = grade();

    // gentle idle camera drift (life, not parallax)
    camera.position.x = camBase.x + Math.sin(S.t * 0.08) * 0.8;
    camera.position.y = camBase.y + Math.sin(S.t * 0.06) * 0.4;
    camera.lookAt(0, 0.5, 0);

    // sea waves
    const pos = sea.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) { const x = seaBase[i * 3], z = seaBase[i * 3 + 2]; pos.setY(i, Math.sin(x * 0.6 + S.t) * 0.08 + Math.cos(z * 0.5 + S.t * 0.8) * 0.08); }
    pos.needsUpdate = true;

    // ambient movers
    for (const o of S.ships) { o.a += o.sp * dt; o.mesh.position.set(Math.cos(o.a) * o.r, 0.5 + Math.sin(S.t * 1.5 + o.a) * 0.08, Math.sin(o.a) * o.r); o.mesh.lookAt(0, 0.5, 0); o.mesh.rotateY(Math.PI / 2); }
    for (const o of S.birds) { o.a += o.sp * dt; o.mesh.position.set(Math.cos(o.a) * o.r, o.y + Math.sin(S.t + o.ph) * 0.4, Math.sin(o.a) * o.r); o.mesh.lookAt(0, o.y, 0); o.mesh.rotateY(Math.PI / 2); const f = Math.sin(S.t * 12 + o.ph) * 0.6; o.mesh.userData.wings?.forEach((w, i) => w.rotation.z = (i ? -1 : 1) * (Math.PI / 2 - f)); }
    for (const o of S.balloons) { o.a += o.sp * dt; o.mesh.position.set(Math.cos(o.a) * o.r, o.y + Math.sin(S.t * 0.5 + o.a) * 0.3, Math.sin(o.a) * o.r); }

    // clouds drift + count
    let shown = 0;
    clouds.children.forEach((c) => { const u = c.userData; u.a += u.sp * dt * (0.4 + (w.wind || 4) * 0.02); c.position.set(Math.cos(u.a) * u.r, u.y, Math.sin(u.a) * u.r); c.visible = shown++ < (S.cloudCount || 5); });

    // precip fall
    if (rain.visible || snow.visible) {
      const target = rain.visible ? rain : snow, p = target.geometry.attributes.position;
      const fall = rain.visible ? 22 : 4, slant = (w.wind || 3) * 0.3;
      for (let i = 0; i < p.count; i++) { let y = p.getY(i) - fall * dt; let x = p.getX(i) + slant * dt * 0.1; if (y < 0.4) { y = rand(10, 16); x = rand(-R, R); } p.setY(i, y); p.setX(i, x); }
      p.needsUpdate = true;
    }

    stepCouriers();
    renderer.render(scene, camera);
  }

  // ---------- weather / location ----------
  let wTimer = 0;
  async function refreshWeather() { clearTimeout(wTimer); wTimer = setTimeout(() => refreshWeather().catch(() => {}), 15 * 60e3); try { S.live = await fetchWeather(S.location.lat, S.location.lon); emit('weather', { ...S.live, location: S.location }); } catch (e) { emit('weather', { error: e.message }); } }
  function setWeather(wv) {
    if (wv === 'live') { S.weatherMode = 'live'; refreshWeather(); return; }
    S.weatherMode = 'manual'; const b = typeof wv === 'string' ? WEATHER_PRESETS[wv] : { ...S.weather, ...wv };
    if (!b) throw new Error('weather: live | ' + Object.keys(WEATHER_PRESETS).join(' | '));
    S.weather = { cloud: clamp(+b.cloud || 0), rain: clamp(+b.rain || 0), snow: clamp(+b.snow || 0), storm: !!b.storm, fog: clamp(+b.fog || 0), wind: clamp(+b.wind || 0, 0, 40) };
    emit('weather', S.weather);
  }

  const api = {
    is3D: true, scene, renderer,
    deliver, on(e, f) { (listeners[e] ||= []).push(f); return () => { listeners[e] = listeners[e].filter((x) => x !== f); }; },
    setWeather, refreshWeather, getWeather: () => ({ mode: S.weatherMode, ...(weather() || {}), location: S.location }),
    async setLocation(loc) { S.location = typeof loc === 'string' ? await geocode(loc) : loc; return refreshWeather(); },
    setTime(h, speed = 0) { if (h == null || h === 'live') { S.timeMode = 'live'; S.speed = 0; } else { S.timeMode = 'fixed'; S.hour = ((+h % 24) + 24) % 24; S.speed = +speed || 0; } },
    getTime: () => ({ mode: S.timeMode, hour: S.curH, sunrise: S.live?.sunrise ?? 7.2, sunset: S.live?.sunset ?? 17.8 }),
    setFlyers(counts) { for (const p of Object.keys(counts || {})) if (S.flyers[p]) for (const k of Object.keys(counts[p])) { const kk = MAP[k] || k; if (S.flyers[p][kk] != null) S.flyers[p][kk] = clamp(+counts[p][k] | 0, 0, 8); } rebuildFlyers(); return JSON.parse(JSON.stringify(S.flyers)); },
    getFlyers: () => JSON.parse(JSON.stringify(S.flyers)),
    setInput() {}, calibrate() {}, setStrength() {}, setEffects() {}, getInput: () => 'off',
    getScene: () => ({ name: 'Летающий остров', is3D: true }),
    destroy() { cancelAnimationFrame(S.raf); ro.disconnect(); clearTimeout(wTimer); renderer.dispose(); },
    _state: S,
  };

  if (opts.bridge !== false) {
    window.addEventListener('message', async (e) => {
      const m = e.data; if (!m || m.type !== 'livebg' || typeof api[m.cmd] !== 'function' || m.cmd.startsWith('_') || m.cmd === 'on' || m.cmd === 'destroy') return;
      if (opts.bridgeOrigin && e.origin !== opts.bridgeOrigin) return;
      let reply; try { reply = { ok: true, result: await api[m.cmd](...(m.args || [])) }; } catch (err) { reply = { ok: false, error: err.message }; }
      e.source?.postMessage?.({ type: 'livebg:reply', id: m.id, ...reply }, e.origin === 'null' ? '*' : e.origin);
    });
  }

  rebuildFlyers();
  setWeather(opts.weather || 'live');
  S.raf = requestAnimationFrame(frame);
  return api;
}
