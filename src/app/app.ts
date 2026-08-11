/**
 * @file アプリシェル。router-outlet（メインコンテンツ）とナビゲーション（`#bottomNav`）を配置する。
 * ナビはモバイル幅では画面下部の固定タブバー、PC幅（768px以上）では折りたたみ可能な
 * サイドバーに変形する（study-english と同じレイアウト方式）。`sidebarCollapsed` signal で
 * サイドバーの格納/展開を管理し、`isDev`（`!environment.production`）で開発用タブの表示可否を制御する。
 * テーマ反映は `ThemeService`、ボトムナビ高さの監視は `BottomNavHeightService` に委譲する。
 * 起動時に未読バージョンのリリースノートがあれば「新機能」モーダル（`WhatsNewDialog`）を開き、
 * 閉じた時点で現在バージョンを既読として記録する（`ReleaseNotesService`）。
 */
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { filter, map } from 'rxjs';
import { environment } from '../environments/environment';
import { ThemeService } from '@core/theme';
import { BottomNavHeightService } from '@core/layout/bottom-nav-height';
import { RestaurantSyncService } from '@services/restaurant-sync.service';
import { ReleaseNotesService } from '@core/release-notes/release-notes.service';
import { APP_VERSION } from '../version';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatIconModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  // 起動時に生成することでテーマ反映・ログイン監視・クラウド同期の effect を有効化する（他では未使用のため注入のみ必要）。
  private readonly theme = inject(ThemeService);
  private readonly restaurantSync = inject(RestaurantSyncService);
  private readonly bottomNavHeight = inject(BottomNavHeightService);
  private readonly router = inject(Router);
  private readonly releaseNotes = inject(ReleaseNotesService);
  private readonly injector = inject(Injector);

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
    afterNextRender(() => {
      const el = this.bottomNav();
      if (el) this.bottomNavHeight.observe(el, this.desktopMedia);
    });
    this.showWhatsNew();
  }

  // ── 未読のリリースノートがあれば新機能モーダルを開き、閉じたら既読として記録する ──
  // MatDialog とモーダル本体は動的 import する。アプリシェルから静的に参照すると
  // ダイアログ一式が初回ロードの main バンドルに入り、サイズ予算（budgets）を超えるため。
  private async showWhatsNew() {
    const entries = await this.releaseNotes.getUnseenNotes(APP_VERSION);
    if (!entries.length) return;

    const [{ MatDialog }, { WhatsNewDialog }] = await Promise.all([
      import('@angular/material/dialog'),
      import('./core/release-notes/whats-new-dialog/whats-new-dialog'),
    ]);
    this.injector
      .get(MatDialog)
      .open(WhatsNewDialog, { data: entries, maxWidth: '90vw', width: '480px' })
      .afterClosed()
      .subscribe(() => this.releaseNotes.markSeen(APP_VERSION));
  }

  // ── サイドバー格納ボタン: 表示⇔格納をトグル ─────────────────
  toggleSidebar() {
    this.sidebarCollapsed.update((v) => !v);
  }
}
