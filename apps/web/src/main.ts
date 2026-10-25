// Sastra Dungeon — app entry.
// Import order matters: game.ts registers window.startGame first, then
// intro.ts wraps it with the story cinematic, then music.ts starts the audio tick.
import './styles.css';
import './game';
import './intro';
import './music';
