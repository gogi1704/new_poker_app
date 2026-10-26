/**
 * Telegram's WebView does not reliably support window.confirm() (especially on
 * mobile), so this prefers the native Telegram.WebApp.showConfirm API. That API
 * throws "WebAppMethodUnsupported" when the page isn't running inside a real
 * Telegram client (e.g. the standalone telegram-web-app.js loaded in a plain
 * browser during local testing) — and because the throw happens inside the
 * executor, the Promise constructor turns it into a *rejected* promise rather
 * than letting it escape synchronously, so the fallback has to `await` and
 * catch the rejection rather than try/catch the `new Promise(...)` call itself.
 */
export async function confirmDialog(message: string): Promise<boolean> {
  const tg = window.Telegram?.WebApp;
  if (tg?.showConfirm) {
    try {
      return await new Promise<boolean>((resolve, reject) => {
        try {
          tg.showConfirm(message, resolve);
        } catch (err) {
          reject(err);
        }
      });
    } catch {
      // WebAppMethodUnsupported outside a real Telegram client — fall through.
    }
  }
  return window.confirm(message);
}
