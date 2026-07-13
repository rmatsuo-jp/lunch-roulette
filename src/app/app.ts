/**
 * @file アプリシェル。router-outlet（メインコンテンツ）とナビゲーション（`#bottomNav`）を配置する。
 * ナビはモバイル幅では画面下部の固定タブバー、PC幅（768px以上）では折りたたみ可能な
 * サイドバーに変形する（study-english と同じレイアウト方式）。`sidebarCollapsed` signal で
 * サイドバーの格納/展開を管理し、`isDev`（`!environment.production`）で開発用タブの表示可否を制御する。
 * ボトムナビの実高さは ResizeObserver で監視し `--bottom-nav-height` に反映することで、
 * ラベル折り返し等による高さ変動時も `.app-content` の下端がタブバーに隠れないようにする
 * （PC のサイドバー表示時は app.scss 側で `--bottom-nav-height` を 0 に固定するため対象外）。
 */
import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, DestroyRef, effect, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { filter, map } from 'rxjs';
import { environment } from '../environments/environment';
import { SettingsStore } from './services/settings-store';
import { RestaurantSyncService } from './services/restaurant-sync.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatIconModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly settings = inject(SettingsStore);
  // 起動時に生成することでログイン監視・クラウド同期の effect を有効化する（他では未使用のため注入のみ必要）。
  private readonly restaurantSync = inject(RestaurantSyncService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);

  private bottomNav = viewChild<ElementRef<HTMLElement>>('bottomNav');
  private readonly desktopMedia = window.matchMedia('(min-width: 768px)');

  // ── サイドバー（PCレイアウト時のみ）の格納状態。既定値 false = 表示中 ──
  protected sidebarCollapsed = signal(false);

  // ── モバイル用ページヘッダーに表示する現在ルートのタイトル（app.routes.ts の title を再利用） ──
  protected readonly pageTitle = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(() => {
        let route = this.router.routerState.snapshot.root;
        while (route.firstChild) route = route.firstChild;
        return route.title ?? '';
      }),
    ),
    { initialValue: this.router.routerState.snapshot.root.title ?? '' },
  );

  // ── 開発用ナビ項目の表示可否（本番ビルドでは /dev ルート自体が存在しないため非表示にする） ──
  protected readonly isDev = !environment.production;

  constructor() {
    // 設定画面のテーマ選択を body の color-scheme に反映する。
    // Angular Material 3 の mat.theme() は color-scheme の値に応じて
    // システム変数（--mat-sys-*）を自動でライト/ダーク切り替えるため、
    // ここでの値の書き換えだけでアプリ全体の配色が切り替わる。
    //
    // 加えて、ダークモード時は独自の配色（styles.scss の
    // `html[data-color-scheme="dark"]` ブロック）で --mat-sys-* を
    // 上書きするため、実際に適用される配色（light / dark）を
    // data-color-scheme 属性として html に反映する。'system' の場合は
    // OS 設定を prefers-color-scheme で判定し、変更も監視する。
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

    afterNextRender(() => this.observeBottomNavHeight());
  }

  // ── bottom-nav の実高さを監視し、--bottom-nav-height に反映（PCサイドバー時は対象外） ──
  private observeBottomNavHeight() {
    const el = this.bottomNav()?.nativeElement;
    const shell = el?.closest<HTMLElement>('.app-shell');
    if (!el || !shell) return;

    let lastHeight = -1;
    let rafId = -1;
    const applyHeight = () => {
      // pull-to-refresh中のchrome表示アニメーション等、viewport変化の過渡フレームで
      // offsetHeightを誤読しないよう1フレーム遅延させてから読み取る。
      window.cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(() => {
        if (this.desktopMedia.matches) return;
        const height = el.offsetHeight;
        if (height === lastHeight) return;
        lastHeight = height;
        shell.style.setProperty('--bottom-nav-height', `${height}px`);
      });
    };

    const observer = new ResizeObserver(applyHeight);
    observer.observe(el);
    this.desktopMedia.addEventListener('change', applyHeight);
    window.visualViewport?.addEventListener('resize', applyHeight);
    const deferredCheck = window.setTimeout(applyHeight, 300);
    applyHeight();

    this.destroyRef.onDestroy(() => {
      observer.disconnect();
      this.desktopMedia.removeEventListener('change', applyHeight);
      window.visualViewport?.removeEventListener('resize', applyHeight);
      window.clearTimeout(deferredCheck);
      window.cancelAnimationFrame(rafId);
    });
  }

  // ── サイドバー格納ボタン: 表示⇔格納をトグル ─────────────────
  toggleSidebar() {
    this.sidebarCollapsed.update((v) => !v);
  }
}
