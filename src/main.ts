import './styles/main.css';
import { Game } from './game/Game';
import { requireElement } from './ui/dom';

const game = new Game(requireElement('app'));
void game.start();

// Handy for debugging in the browser console during development.
if (import.meta.env.DEV) {
  (window as unknown as { game: Game }).game = game;
}
