/* Sastra Dungeon — user-supplied asset packs.
   Sources (~/Downloads zips): Free Smoke Fx, Pixel Holy Spell, Magic Weapon
   (129f shimmer), ring-wave strips, animal head sheets (panda/cat/bear),
   isometric street town pack, RPG items tileset.
   Processed into /assets via a PIL pipeline. Game falls back to vector
   drawing if any asset is missing (all draw sites guard on FXI/FX1). */

export const FXI: Record<string, HTMLImageElement[]> = {};
export const FX1: Record<string, HTMLImageElement | HTMLCanvasElement> = {};

const LISTS: Array<[string, string, number]> = [
  ['smoke', 'assets/fx_smoke_%d.png', 4],
  ['holycross', 'assets/fx_holycross_%d.png', 7],
  ['holybeam', 'assets/fx_holybeam_%d.png', 11],
  ['aura', 'assets/fx_aura_%d.png', 13],
  ['summon', 'assets/fx_summon_%d.png', 20],
  ['panda', 'assets/pet_panda_%d.png', 8],
];
const ONES: Record<string, string> = {
  cat: 'assets/pet_cat.png',
  bear: 'assets/pet_bear.png',
  coin: 'assets/icons/coin.png',
  sword: 'assets/icons/sword.png',
  crown: 'assets/icons/crown.png',
  shield: 'assets/icons/shield.png',
  ring: 'assets/icons/ring.png',
  skull: 'assets/icons/skull.png',
  heart: 'assets/icons/heart.png',
  potion: 'assets/icons/potion.png',
  flame: 'assets/icons/flame.png',
  gem: 'assets/icons/gem.png',
  bolt: 'assets/icons/bolt.png',
  t_grass: 'assets/town/Tile_Grass.png',
  t_asfalt: 'assets/town/Tile_Asfalt.png',
  t_house: 'assets/town/Building_House2.png',
  t_resto: 'assets/town/Building_Restaurant.png',
  t_tree1: 'assets/town/Tree1.png',
  t_tree3: 'assets/town/Tree3.png',
  t_lamp: 'assets/town/Decor_StreetLampGlow.png',
  t_car: 'assets/town/CarType2_Front.png',
  t_fence: 'assets/town/PicketFence4.png',
};

function mk(src: string): HTMLImageElement {
  const i = new Image();
  i.src = src;
  return i;
}

/* Compose the menu backdrop: grass field, buildings on the horizon,
   a street with trees/lamp/car, then darkened for UI contrast. */
function composeTownBg(ones: Record<string, HTMLImageElement>): HTMLCanvasElement {
  const Wb = 1920, Hb = 1080;
  const c = document.createElement('canvas');
  c.width = Wb; c.height = Hb;
  const x = c.getContext('2d')!;
  x.imageSmoothingEnabled = true;
  x.filter = 'brightness(1.35) saturate(1.1)';
  // grass field
  const grass = ones.t_grass;
  if (grass) {
    for (let ty = 0; ty < Hb; ty += grass.height)
      for (let tx = 0; tx < Wb; tx += grass.width)
        x.drawImage(grass, tx, ty, grass.width, grass.height);
  }
  const horizonY = 640;
  // buildings on the horizon line
  const bld = (im: HTMLImageElement | undefined, bx: number, scale: number) => {
    if (!im) return;
    const w = im.width * scale, h = im.height * scale;
    x.drawImage(im, bx, horizonY - h + 60, w, h);
  };
  bld(ones.t_house, 180, 0.52);
  bld(ones.t_resto, 560, 0.46);
  bld(ones.t_house, 1050, 0.42);
  bld(ones.t_resto, 1450, 0.5);
  // street
  const road = ones.t_asfalt;
  if (road) {
    for (let tx = 0; tx < Wb; tx += road.width)
      x.drawImage(road, tx, horizonY + 160, road.width, road.width * 0.42);
  }
  // trees along the street
  const trees = [ones.t_tree1, ones.t_tree3, ones.t_tree1, ones.t_tree3, ones.t_tree1];
  const treeXs = [80, 460, 860, 1280, 1700];
  trees.forEach((im, i) => {
    if (!im) return;
    const s = 1.15;
    x.drawImage(im, treeXs[i], horizonY + 120 - im.height * s * 0.15, im.width * s, im.height * s);
  });
  // fence + lamp + car
  if (ones.t_fence) x.drawImage(ones.t_fence, 700, horizonY + 96, 262, 255 * 0.55);
  if (ones.t_lamp) {
    x.drawImage(ones.t_lamp, 620, horizonY - 90, 162, 263 * 0.9);
    x.drawImage(ones.t_lamp, 1560, horizonY - 90, 162, 263 * 0.9);
  }
  if (ones.t_car) x.drawImage(ones.t_car, 980, horizonY + 200, 374 * 0.9, 374 * 0.9 * 0.72);
  // dark grade for menu contrast
  x.filter = 'none';
  x.fillStyle = 'rgba(7,5,18,0.3)';
  x.fillRect(0, 0, Wb, Hb);
  const vg = x.createRadialGradient(Wb / 2, Hb / 2, Hb * 0.3, Wb / 2, Hb / 2, Wb * 0.72);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.25)');
  x.fillStyle = vg;
  x.fillRect(0, 0, Wb, Hb);
  return c;
}

export function preloadFx(): Promise<void> {
  return new Promise(resolve => {
    let left = 0;
    const done = () => { if (--left <= 0) resolve(); };
    let townLeft = 0;
    const townDone = () => {
      if (townLeft === 0 && !FX1.townbg) FX1.townbg = composeTownBg(onesRef);
    };
    const onesRef: Record<string, HTMLImageElement> = {};
    for (const [key, pat, n] of LISTS) {
      const arr: HTMLImageElement[] = new Array(n);
      for (let i = 1; i <= n; i++) {
        const im = mk(pat.replace('%d', String(i)));
        left++;
        im.onload = () => { arr[i - 1] = im; done(); };
        im.onerror = () => { done(); };
      }
      FXI[key] = arr;
    }
    for (const [name, src] of Object.entries(ONES)) {
      const im = mk(src);
      left++; townLeft++;
      im.onload = () => {
        FX1[name] = im;
        onesRef[name] = im;
        townLeft--;
        townDone();
        done();
      };
      im.onerror = () => { townLeft--; townDone(); done(); };
    }
    // if every town img already failed synchronously, leave bg absent
    if (townLeft === 0) townDone();
  });
}
