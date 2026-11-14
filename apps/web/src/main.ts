// Sastra Dungeon — app entry.
// Import order matters: game.ts registers window.startGame first, then
// intro.ts wraps it with the story cinematic, then music.ts starts the audio tick.
import './styles.css';
import './telemetry';   // first: a crash during boot is the one we most need
import './game';
import './intro';
import './music';
