/**
 * @file 表示テーマ（ライト/ダーク/システム）を `<html data-color-scheme>` / `document.body.style.colorScheme`
 * へ反映するサービス。Angular Material 3 の mat.theme() は color-scheme の値に応じて
 * システム変数（--mat-sys-*）を自動でライト/ダーク切り替えるため、ここでの値の書き換えだけで
 * アプリ全体の配色が切り替わる。加えて、ダークモード時は独自の配色（styles.scss の
 * `html[data-color-scheme="dark"]` ブロック）で --mat-sys-* を上書きするため、実際に適用される
 * 配色（light / dark）を data-color-scheme 属性として html に反映する。'system' の場合は
 * OS 設定を prefers-color-scheme で判定し、変更も監視する。
 * `App` コンポーネントで注入するだけで起動する（他では未使用のため注入のみ必要）。
 */
import { DestroyRef, Injectable, effect, inject } from '@angular/core';
import { SettingsStore } from '@services/settings-store';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly settings = inject(SettingsStore);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const applyResolvedTheme = () => {
      const theme = this.settings.theme();
      const resolved = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme;
      document.documentElement.setAttribute('data-color-scheme', resolved);
    };

    effect(() => {
      const theme = this.settings.theme();
      document.body.style.colorScheme = theme === 'system' ? 'light dark' : theme;
      applyResolvedTheme();
    });
    media.addEventListener('change', applyResolvedTheme);
    this.destroyRef.onDestroy(() => media.removeEventListener('change', applyResolvedTheme));
  }
}
