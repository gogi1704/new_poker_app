export interface TelegramWebApp {
  initData: string;
  ready: () => void;
  expand: () => void;
  showConfirm: (message: string, callback: (confirmed: boolean) => void) => void;
}

declare global {
  interface Window {
    Telegram?: { WebApp: TelegramWebApp };
  }
}
