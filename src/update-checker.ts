import { t } from './i18n';

const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

interface VersionResponse {
  version?: unknown;
}

export function initializeUpdateChecker(): void {
  const currentVersion = document.querySelector<HTMLMetaElement>('meta[name="app-version"]')?.content;
  const notice = document.getElementById('update-notice');
  const reloadButton = document.getElementById('update-notice-reload');
  const copy = document.getElementById('update-notice-copy');
  if (!currentVersion || !notice || !reloadButton || !copy) return;

  copy.textContent = t('检测到新版本，刷新页面即可更新。');
  reloadButton.textContent = t('刷新');
  reloadButton.addEventListener('click', () => window.location.reload());

  let checking = false;
  const checkForUpdate = async (): Promise<void> => {
    if (checking) return;
    checking = true;
    try {
      const versionUrl = new URL('./version.json', window.location.href);
      versionUrl.searchParams.set('check', String(Date.now()));
      const response = await fetch(versionUrl, { cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json() as VersionResponse;
      if (typeof data.version === 'string' && data.version !== currentVersion) {
        notice.classList.remove('hidden');
      }
    } catch {
      // A failed check should never interrupt the current game session.
    } finally {
      checking = false;
    }
  };

  void checkForUpdate();
  window.setInterval(() => void checkForUpdate(), UPDATE_CHECK_INTERVAL_MS);
}
