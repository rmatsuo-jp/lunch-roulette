/**
 * @file 開発者用ページ。店舗データの件数・生JSON、設定・環境情報、ログイン/クラウド同期状態の
 * ダンプを行う。本番ビルドでは app.routes.ts が /dev ルート自体を含めないため到達不能。
 */
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { environment } from '../../../environments/environment';
import { RestaurantStore } from '@services/restaurant-store';
import { SettingsStore } from '@services/settings-store';
import { AuthService } from '@core/firebase/auth.service';

@Component({
  selector: 'app-dev',
  imports: [MatCardModule, MatIconModule, MatButtonModule],
  templateUrl: './dev.html',
  styleUrl: './dev.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Dev {
  private readonly restaurants = inject(RestaurantStore);
  private readonly settings = inject(SettingsStore);
  private readonly auth = inject(AuthService);

  // ── a. 店舗データ概要 ──────────────────────────────────────────
  protected readonly total = computed(() => this.restaurants.allRestaurants().length);
  protected readonly active = computed(() => this.restaurants.restaurants().length);
  protected readonly deleted = computed(() => this.total() - this.active());
  protected readonly areaCount = computed(() => this.restaurants.areas().length);
  protected readonly genreCount = computed(() => this.restaurants.genres().length);
  protected readonly moodCount = computed(() => this.restaurants.moods().length);

  // ── b. 店舗データ生JSON ────────────────────────────────────────
  protected readonly restaurantsJson = computed(() => this.restaurants.toJson());

  // ── c. 設定・環境情報 ──────────────────────────────────────────
  protected readonly theme = this.settings.theme;
  protected readonly hasApiKey = computed(() => Boolean(this.settings.googleMapsApiKey()));
  protected readonly apiKeyPreview = computed(() => this.maskKey(this.settings.googleMapsApiKey()));
  protected readonly production = environment.production;
  protected readonly firebaseProjectId = environment.firebase.projectId;

  // ── d. ログイン・同期状態 ──────────────────────────────────────
  protected readonly user = this.auth.user;
  protected readonly loginError = this.auth.loginError;
  protected readonly recentPicksJson = computed(() =>
    JSON.stringify(this.restaurants.recentPickedIds(), null, 2),
  );

  // ── 共通: クリップボードコピー（ボタンごとに一時的に「コピーしました」を表示） ─
  protected readonly copiedKey = signal<string | null>(null);

  async copy(key: string, text: string): Promise<void> {
    await navigator.clipboard.writeText(text);
    this.copiedKey.set(key);
    setTimeout(() => {
      if (this.copiedKey() === key) this.copiedKey.set(null);
    }, 1500);
  }

  private maskKey(key: string): string {
    if (!key) return '(未設定)';
    if (key.length <= 8) return '****';
    return `${key.slice(0, 4)}...${key.slice(-4)}`;
  }
}
