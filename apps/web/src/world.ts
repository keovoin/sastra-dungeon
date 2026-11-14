/**
 * World data — realms, creatures and their lore.
 *
 * Second piece to leave `@ts-nocheck`. Pure tables: no DOM, no state, nothing
 * imported. Moving them here means a typo like `speed` spelled `speeed` is now a
 * compile error instead of a creature that silently stands still.
 */

export type EnemyBehavior = 'melee' | 'ranged' | 'leaper' | 'slam' | 'kamikaze' | 'phaser' | 'healer' | 'charger';

export interface EnemyType {
  hp: number;
  speed: number;
  dmg: number;
  r: number;
  color: string;
  dark: string;
  xp: number;
  range: number;
  atkCd: number;
  behavior: EnemyBehavior;
  /** sprite family to reuse when the creature is a palette variant */
  sprite?: string;
  ranged?: boolean;
  attackType?: string;
  chargeCd?: number;
  chargeSpeed?: number;
  healCd?: number;
  leapSpeed?: number;
  slamCd?: number;
  slowOnHit?: boolean;
  teleports?: boolean;
  creatures?: string[];
}

export interface EnemyLore {
  name: string;
  note: string;
}

export interface Biome {
  key: string;
  name: string;
  floorTint: string;
  tint: string;
  torchColor: string;
  edge: string;
  enemies: string[];
  boss: string;
}

export const ENEMY_TYPES: Record<string, EnemyType> = {
  /* ── realm-signature creatures: same sprite families, own palette and stats ── */
  asuraThrall:{hp:70,speed:126,dmg:11,r:14,color:'#c0392b',dark:'#6b1a12',xp:18,range:32,atkCd:0.9,behavior:'melee',sprite:'fallen'},
  vaultWarden:{hp:150,speed:76,dmg:20,r:17,color:'#d8c07a',dark:'#7a6430',xp:34,range:36,atkCd:1.3,behavior:'melee',sprite:'skeleton'},
  rootCrawler:{hp:66,speed:164,dmg:13,r:12,color:'#4a8a52',dark:'#22482a',xp:20,range:32,atkCd:0.85,behavior:'melee',sprite:'spider'},
  mossTroll:{hp:300,speed:54,dmg:30,r:24,color:'#5f7a3a',dark:'#31401c',xp:60,range:44,atkCd:1.6,behavior:'melee',sprite:'brute'},
  rimeShade:{hp:90,speed:112,dmg:15,r:14,color:'#9fdcff',dark:'#3a6a8a',xp:26,range:34,atkCd:1.0,behavior:'melee',sprite:'wraith'},
  iceAcolyte:{hp:78,speed:70,dmg:16,r:13,color:'#bfe8ff',dark:'#5a8aa8',xp:28,range:320,atkCd:2.0,ranged:true,behavior:'ranged',attackType:'bolt',sprite:'mage'},
  ashHound:{hp:110,speed:186,dmg:19,r:14,color:'#ff7a2e',dark:'#8a3208',xp:30,range:34,atkCd:0.9,behavior:'melee',sprite:'charger'},
  slagBrute:{hp:340,speed:50,dmg:34,r:25,color:'#c2401a',dark:'#5a1a08',xp:66,range:46,atkCd:1.7,behavior:'melee',sprite:'brute'},
  bayonWisp:{hp:74,speed:132,dmg:14,r:12,color:'#b47cff',dark:'#4a2a7a',xp:24,range:32,atkCd:0.9,behavior:'melee',sprite:'wraith'},
  tombChan:{hp:120,speed:74,dmg:12,r:15,color:'#9a6aff',dark:'#3a1a5a',xp:32,range:300,atkCd:2.2,ranged:true,behavior:'ranged',attackType:'bolt',sprite:'healer'},
  skyHerald:{hp:96,speed:88,dmg:18,r:14,color:'#ffe9a8',dark:'#7a6a2a',xp:34,range:330,atkCd:1.9,ranged:true,behavior:'ranged',attackType:'arrow',sprite:'sniper'},
  lotusGuard:{hp:420,speed:46,dmg:40,r:26,color:'#e8d8a8',dark:'#7a6a3a',xp:78,range:48,atkCd:1.9,behavior:'melee',sprite:'golem'},

  fallen:{hp:46,speed:118,dmg:8,r:13,color:'#9b59b6',dark:'#5b2c6f',xp:12,range:30,atkCd:0.95,behavior:'melee'},
  skeleton:{hp:82,speed:88,dmg:14,r:15,color:'#bdc3c7',dark:'#6b7373',xp:20,range:34,atkCd:1.25,behavior:'melee'},
  archer:{hp:58,speed:74,dmg:12,r:13,color:'#27ae60',dark:'#145a32',xp:24,range:330,atkCd:1.9,ranged:true,behavior:'ranged',attackType:'arrow'},
  brute:{hp:230,speed:58,dmg:26,r:22,color:'#d35400',dark:'#7e2c00',xp:48,range:42,atkCd:1.5,behavior:'melee'},
  spider:{hp:42,speed:170,dmg:10,r:11,color:'#6b2a4a',dark:'#3a1528',xp:16,range:32,atkCd:0.85,behavior:'leaper',leapSpeed:720},
  golem:{hp:420,speed:44,dmg:32,r:26,color:'#5a4a3a',dark:'#2a1e14',xp:65,range:42,atkCd:1.6,behavior:'slam',slamCd:3.2},
  bomber:{hp:65,speed:135,dmg:40,r:15,color:'#d35400',dark:'#7e2c00',xp:24,range:30,atkCd:1.0,behavior:'kamikaze'},
  sniper:{hp:70,speed:55,dmg:32,r:14,color:'#7a5a8a',dark:'#3a2a4a',xp:30,range:620,atkCd:2.8,ranged:true,behavior:'ranged',attackType:'sniperShot'},
  iceElemental:{hp:140,speed:80,dmg:15,r:18,color:'#7fd4ff',dark:'#2a4a6a',xp:36,range:400,atkCd:2.0,ranged:true,behavior:'ranged',attackType:'iceShard',slowOnHit:true},
  fireImp:{hp:55,speed:150,dmg:12,r:12,color:'#ff5020',dark:'#8a2a10',xp:22,range:360,atkCd:1.7,ranged:true,behavior:'ranged',attackType:'fireball'},
  wraith:{hp:95,speed:115,dmg:18,r:14,color:'#a060ff',dark:'#4a1a7a',xp:32,range:32,atkCd:1.1,behavior:'phaser'},
  healer:{hp:85,speed:62,dmg:8,r:14,color:'#7aff9a',dark:'#2a5a2a',xp:28,range:32,atkCd:1.5,ranged:true,behavior:'healer',healCd:4.5},
  shaman:{hp:105,speed:72,dmg:13,r:15,color:'#8e44ad',dark:'#4a1a5a',xp:30,range:380,atkCd:2.1,ranged:true,behavior:'ranged',attackType:'darkOrb'},
  mage:{hp:90,speed:65,dmg:16,r:14,color:'#5aa9ff',dark:'#1a3a6a',xp:32,range:420,atkCd:2.2,ranged:true,behavior:'ranged',attackType:'arcaneBolt',teleports:true},
  charger:{hp:95,speed:100,dmg:22,r:16,color:'#8a4a2a',dark:'#4a1e0a',xp:34,range:38,atkCd:1.4,behavior:'charger',chargeCd:2.8,chargeSpeed:900}
};

export const ENEMY_LORE: Record<string, EnemyLore> = {
  asuraThrall:   { name:'Asura Thrall',     note:'A failed devotee, kept as muscle for the crypt.' },
  vaultWarden:   { name:'Vault Warden',     note:'Holds a door that no longer exists.' },
  rootCrawler:   { name:'Root Crawler',     note:'Banyan root grown teeth. It resents the light.' },
  mossTroll:     { name:'Moss Troll',       note:'Slow, patient, and older than the gallery it guards.' },
  rimeShade:     { name:'Rime Shade',       note:'A breath of the peak that never warmed up.' },
  iceAcolyte:    { name:'Ice Acolyte',      note:'Prays in a language made of cold.' },
  ashHound:      { name:'Ash Hound',        note:'Hunts by heat. Runs on it too.' },
  slagBrute:     { name:'Slag Brute',       note:'Poured wrong at the forge, and angry about it.' },
  bayonWisp:     { name:'Bayon Wisp',       note:'One of the smiles, loose from the stone.' },
  tombChan:      { name:'Tomb Chan',        note:'Tends graves that were never dug.' },
  skyHerald:     { name:'Sky Herald',       note:'Announces a storm that already arrived.' },
  lotusGuard:    { name:'Lotus Guardian',   note:'Carved to kneel. Never learned how.' },

  fallen:        { name:'Fallen Acolyte',   note:'A temple servant whose vows outlived him.' },
  skeleton:      { name:'Bone Guardian',    note:'Laterite dust and old oaths, still on duty.' },
  archer:        { name:'Temple Archer',    note:'Guarding a lintel that collapsed centuries ago.' },
  brute:         { name:'Laterite Brute',   note:'Carved muscle given an appetite.' },
  spider:        { name:'Silk Widow',       note:'Banyan silk. Patient, and patient again.' },
  golem:         { name:'Stone Golem',      note:'A guardian that forgot what it guards.' },
  bomber:        { name:'Firepot Thrower',  note:'Carries the forge around in a clay jar.' },
  sniper:        { name:'Sky Marksman',     note:'Aims down from a peak nobody can reach.' },
  iceElemental:  { name:'Frost Elemental',  note:'The mountain’s breath, given a shape.' },
  fireImp:       { name:'Ember Imp',        note:'A spark that learned to want.' },
  wraith:        { name:'Shadow Wraith',    note:'What Bayon’s smile leaves behind.' },
  healer:        { name:'Apsara Mender',    note:'She dances, and the wounds close.' },
  shaman:        { name:'Kru Shaman',       note:'Chants older than the temple walls.' },
  mage:          { name:'Pale Caster',      note:'Reads the stone like a page.' },
  charger:       { name:'Horned Charger',   note:'Runs as if the causeway were a race.' },
};

export const BIOMES: Biome[] = [
  { key:'crypt', name:'Angkor Sankranti Crypt', floorTint:'rgba(145,112,82,0.20)', tint:'rgba(55,34,14,0.12)',
    torchColor:'#ff9838', edge:'rgba(8,5,15,0.42)',
    enemies:['fallen','skeleton','archer','spider','shaman','asuraThrall','vaultWarden'], boss:'cryptLord' },
  { key:'caverns', name:'Ta Prohm Root Caverns', floorTint:'rgba(105,145,115,0.20)', tint:'rgba(20,42,28,0.14)',
    torchColor:'#ffb040', edge:'rgba(3,12,8,0.48)',
    enemies:['brute','golem','bomber','spider','skeleton','rootCrawler','mossTroll'], boss:'cavernTitan' },
  { key:'frost', name:'Preah Vihear Sky Peak', floorTint:'rgba(150,185,220,0.22)', tint:'rgba(30,50,80,0.16)',
    torchColor:'#7fd4ff', edge:'rgba(5,10,25,0.48)',
    enemies:['iceElemental','skeleton','sniper','mage','wraith','rimeShade','iceAcolyte'], boss:'frostWyrm' },
  { key:'volcano', name:'Banteay Srei Sacred Forge', floorTint:'rgba(200,115,80,0.20)', tint:'rgba(65,22,12,0.18)',
    torchColor:'#ff5020', edge:'rgba(20,3,0,0.50)',
    enemies:['fireImp','brute','bomber','charger','shaman','ashHound','slagBrute'], boss:'volcanoBehemoth' },
  { key:'shadow', name:'Bayon Shadow Sanctum', floorTint:'rgba(150,115,195,0.20)', tint:'rgba(32,12,55,0.20)',
    torchColor:'#a060ff', edge:'rgba(8,2,15,0.55)',
    enemies:['wraith','skeleton','mage','healer','spider','bayonWisp','tombChan'], boss:'shadowPrince' },
  { key:'celestial', name:'Phnom Bakheng Celestial Court', floorTint:'rgba(215,200,150,0.22)', tint:'rgba(60,55,30,0.10)',
    torchColor:'#ffe9a8', edge:'rgba(30,24,8,0.40)',
    enemies:['golem','wraith','mage','healer','sniper','skyHerald','lotusGuard'], boss:'airava' }
];
