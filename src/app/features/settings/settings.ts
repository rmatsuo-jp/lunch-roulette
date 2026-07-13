/**
 * @file 設定ページ。アプリのバージョン名・リリース日、
 *       Google Maps API キーの入力・保存（localStorage）、および
 *       Google ログインによるクラウド同期の状態表示・ログイン/ログアウトを扱う。
 *       version.ts はビルド/開発サーバ起動時に scripts/generate-version.mjs が自動生成する。
 */
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { APP_VERSION, RELEASE_DATE } from '../../../version';
import { SettingsStore, ThemePreference } from '@services/settings-store';
import { AuthService } from '@core/firebase/auth.service';

@Component({
  selector: 'app-settings',
  imports: [
    FormsModule,
    MatCardModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatButtonToggleModule,
  ],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Settings {
  private settings = inject(SettingsStore);
  private snackBar = inject(MatSnackBar);
  private auth = inject(AuthService);

  protected readonly version = APP_VERSION;
  protected readonly releaseDate = RELEASE_DATE;

  /** ログイン中の Google ユーザー（未ログインなら null）。 */
  protected readonly user = this.auth.user;
  /** 非許可ユーザーのログイン試行時に表示するエラーメッセージ。 */
  protected readonly loginError = this.auth.loginError;

  /** 選択中の表示テーマ。 */
  protected readonly theme = this.settings.theme;

  /** 入力欄の一時的な値（保存ボタンを押すまでは反映しない）。 */
  protected readonly apiKeyInput = signal(this.settings.googleMapsApiKey());
  /** キーを平文表示するかどうか。 */
  protected readonly showKey = signal(false);
  protected readonly hasSavedKey = this.settings.googleMapsApiKey;

  /** 昼休みの必要時間（分）の入力欄の一時的な値。 */
  protected readonly lunchBreakMinutesInput = signal(this.settings.lunchBreakMinutes());

  toggleShowKey(): void {
    this.showKey.update((v) => !v);
  }

  /** 表示テーマを切り替える（選択と同時に即反映）。 */
  setTheme(theme: ThemePreference): void {
    this.settings.setTheme(theme);
  }

  save(): void {
    this.settings.setGoogleMapsApiKey(this.apiKeyInput());
    this.notify('Google Maps API キーを保存しました');
  }

  clear(): void {
    this.settings.clearGoogleMapsApiKey();
    this.apiKeyInput.set('');
    this.notify('Google Maps API キーを削除しました');
  }

  /** 昼休みの必要時間（分）を保存する。 */
  saveLunchBreakMinutes(): void {
    const minutes = Math.max(0, Math.floor(this.lunchBreakMinutesInput()));
    this.lunchBreakMinutesInput.set(minutes);
    this.settings.setLunchBreakMinutes(minutes);
    this.notify('昼休みの必要時間を保存しました');
  }

  /** Google でログイン（クラウド同期を開始）。 */
  async login(): Promise<void> {
    try {
      await this.auth.login();
    } catch (e) {
      this.notify('ログインに失敗しました: ' + (e as Error).message);
    }
  }

  /** ログアウト（クラウド同期を停止。ローカルデータは残る）。 */
  async logout(): Promise<void> {
    await this.auth.logout();
    this.notify('ログアウトしました');
  }

  private notify(message: string): void {
    this.snackBar.open(message, '閉じる', { duration: 3000 });
  }
}
