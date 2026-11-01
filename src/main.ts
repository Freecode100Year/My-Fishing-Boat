import './styles.css';
import { Game } from './core/Game';
import { applyBrowserLanguage, t } from './i18n';

function boot(): void {
  applyBrowserLanguage();
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
  const error = document.getElementById('boot-error');
  try {
    if (!canvas) throw new Error('未找到游戏画布。');
    new Game(canvas);
  } catch (err) {
    console.error(err);
    if (error) {
      error.classList.remove('hidden');
      error.textContent = t(`RAT TIDE 启动失败\n\n${err instanceof Error ? err.message : String(err)}\n\n请确认浏览器支持 WebGL2，并尝试使用最新版 Chrome / Edge / Firefox。`);
    }
  }
}

boot();
