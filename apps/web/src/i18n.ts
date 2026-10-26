// @ts-nocheck
/* Sastra Dungeon — i18n. UI-chrome translation (EN ⇄ KH).
   Class names, skill names, item names stay English (proper nouns). */
const KH: Record<string, string> = {
  'Try Again': 'សាកម្តងទៀត',
  'MAIN MENU': 'ម៉ឺនុយ ចម្បង',
  'RESUME': 'បន្ត',
  'SAVE PROGRESS': 'រក្សាទុកវឌ្ឍនភាព',
  'SAVE & MAIN MENU': 'រក្សាទុក ហើយ ម៉ឺនុយ',
  'PAUSED': 'បានផ្អាក',
  'The shadows wait for you': 'ស្រមោលអង្គុយរង់ចាំអ្នក',
  'YOU DIED': 'អ្នកបានស្លាប់',
  'VICTORY': 'ជ័យជម្នះ',
  'The Rift is sealed… for now. But the dark never sleeps.': 'គម្លាតបានបិទ… យ៉ាងណាក៏ដោយ។ ប៉ុន្តែភាពងងឹតមិនចេះគេងទេ។',
  'NEW GAME+ (HARDER · KEEP BUILD)': 'ចាប់ផ្ដើមថ្មី+ (ពិបាកជាង · រក្សា Build)',
  'CONTINUE ENDLESS': 'បន្ត Endless',
  'RESUME GAME': 'បន្តលេង',
  'CONTINUE SAVED GAME': 'បន្តលេងពី Save ដែលបានរក្សាទុក',
  'GAME SAVED': 'បានរក្សាទុកហើយ',
  'SAVE LOADED': 'បានផ្ទុក Save',
  'LEVEL UP!': 'ឡើង Level!',
  ' +1 TREE POINT ': ' +1 ចំណុចដើម ',
  'press T to spend it on spells': 'ចុច T ដើម្បីចាយលើស្កីល',
  'AUTO-ATTACK ON': 'វាយស្វ័យប្រវត្តិ: បើក',
  'AUTO-ATTACK OFF': 'វាយស្វ័យប្រវត្តិ: បិទ',
  'AUTO-PLAY ON': 'លេងស្វ័យប្រវត្តិ: បើក',
  'AUTO-PLAY OFF': 'លេងស្វ័យប្រវត្តិ: បិទ',
  'Right-click to toggle': 'ចុចក្តាប់ ដើម្បីបិទ/បើក',
  'Inventory Full': 'ប្រអប់ពេញហើយ',
  'Equip or sell something first': 'ពាក់ ឬ លក់ របស់មួយមុនសិន',
  'Not enough gold': 'មាសមិនគ្រប់គ្រាន់',
  'Purchased': 'បានទិញ',
  'Equipped': 'បានពាក់',
  'Refresh': 'បង្ហាញឡើងវិញ',
  'SKILL TREE': 'ដើមស្កីល',
  'points available': 'ចំណុចដែលនៅសល់',
  'SKILLS': 'ស្កីល',
  'ULTIMATE': 'កំណាព្យ',
  'Press T to open the Skill Tree': 'ចុច T ដើម្បីបើកដើមស្កីល',
  'Potion used!': 'បានប្រើថ្នាំ!',
  'No potions — buy one in the shop [B]': 'គ្មានថ្នាំ — ទិញនៅហាង [B]',
  'Already at full health': 'HP ពេញរួចហើយ',
  'Healing Potion': 'ថ្នាំព្យាបាល',
  'Restores 40% HP · use with Q': 'សង្គ្រោះ 40% HP · ប្រើដោយ Q',
  'Wave': 'រលក',
  'kills': 'សម្លាប់',
  'left': 'នៅសល់',
  'EASY': 'ងាយ',
  'NORMAL': 'ធម្មតា',
  'HARD': 'ពិបាក',
  'DIFFICULTY': 'កម្រិត',
  'Your best run': 'ការលេងល្អបំផុតរបស់អ្នក',
  'TUTORIAL': 'ការណែនាំ',
  'GOT IT': 'យល់ហើយ',
  'SKIP': 'លោតដក',
  'MOVE — WASD or click / joystick to move': 'ផ្លាស់ទី — WASD ឬចុច / ជូយស្ទីក ដើម្បីផ្លាស់ទី',
  'ATTACK — your basic attack is automatic. Toggle with right-click / ⚔': 'វាយ — ការវាយមូលដ្ឋានគឺស្វ័យប្រវត្តិ។ បិទ/បើក ដោយចុចក្តាប់ / ⚔',
  'SKILLS — press 1 · 2 · 3 to cast your spells': 'ស្កីល — ចុច 1 · 2 · 3 ដើម្បីប្រើស្កីល',
  'LEVEL UP — XP fills the bar. Press T to spend tree points': 'ឡើង Level — XP បំពេញរបារ។ ចុច T ដើម្បីចាយចំណុចដើម',
  'SHOP — press B to buy gear · O toggles AUTO-PLAY': 'ហាង — ចុច B ដើម្បីទិញ · O ប្ដូរ AUTO-PLAY',
  'THE FIVE THRONES HAVE FALLEN': 'សិណាសព្រួនប្រាំ បានបង្អួងចុះ',
  'The Rift is sealed': 'គម្លាតបានបិទ',
  'NEW GAME+ — the dark remembers': 'NEW GAME+ — ភាពងងឹតចាំអ្នក',
  'ENDLESS — the dark never sleeps': 'ENDLESS — ភាពងងឹតមិនចេះគេង',
  'SFX ON': 'សំឡេង: បើក',
  'SFX OFF': 'សំឡេង: បិទ',
};
let lang = 'en';
try { lang = localStorage.getItem('sd_lang') === 'kh' ? 'kh' : 'en' } catch (e) {}

export function getLang() { return lang }
export function tr(s: string): string {
  if (lang === 'en' || !s) return s;
  return KH[s] || s;
}
export function setLang(l: string) {
  lang = l === 'kh' ? 'kh' : 'en';
  try { localStorage.setItem('sd_lang', lang) } catch (e) {}
  applyLang();
}
export function toggleLang() { setLang(lang === 'kh' ? 'en' : 'kh'); return lang }
/* Translate all static [data-i18n] elements + a few known ids. */
export function applyLang() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const k = el.getAttribute('data-i18n');
    if (k) (el as HTMLElement).textContent = tr(k);
  });
  const lb = document.getElementById('langBtn');
  if (lb) lb.textContent = lang === 'kh' ? 'English' : 'ខ្មែរ';
  /* re-render dynamic-ish labels if a run is live */
  const g = (window as any).G;
  if (g && g.player) {
    const wt = document.getElementById('waveTxt'), kt = document.getElementById('killTxt'), ec = document.getElementById('enemyCount');
    if (wt) wt.textContent = tr('Wave') + ' ' + g.wave + (g.endless ? ' ∞' : '');
    if (kt) kt.textContent = g.kills + ' ' + tr('kills');
    if (ec) ec.textContent = g.enemies.filter(e => !e.dead).length + ' ' + tr('left');
  }
}
