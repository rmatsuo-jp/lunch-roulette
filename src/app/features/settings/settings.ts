/**
 * @file 設定ページ。Google Maps API キーの入力・保存（localStorage）、表示テーマ・昼休み時間、
 *       および Google ログインによるクラウド同期の状態表示・ログイン/ログアウトを扱う。
 *       バージョン情報とリリースノートの表示は `ReleaseNotesPanel` に切り出している。
 */
import { ChangeDetectionStrategy, Component, inject, linkedSignal, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ReleaseNotesPanel } from './release-notes-panel/release-notes-panel';
import {
  MAX_LUNCH_BREAK_MINUTES,
  SettingsStore,
  ThemePreference,
  normalizeLunchBreakMinutes,
} from '@services/settings-store';
import { AuthService } from '@core/firebase/auth.service';
import { RestaurantSyncService } from '@services/restaurant-sync.service';

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
    ReleaseNotesPanel,
  ],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Settings {
  private settings = inject(SettingsStore);
  private snackBar = inject(MatSnackBar);
  private auth = inject(AuthService);

  /** ログイン中の Google ユーザー（未ログインなら null）。 */
  protected readonly user = this.auth.user;
  /** 非許可ユーザーのログイン試行時に表示するエラーメッセージ。 */
  protected readonly loginError = this.auth.loginError;

  /** クラウド同期のエラー（正常時は null）。console だけだと同期済みと誤解されるため表示する。 */
  protected readonly syncError = inject(RestaurantSyncService).syncError;

  /** 選択中の表示テーマ。 */
  protected readonly theme = this.settings.theme;

  /**
   * 入力欄の一時的な値（保存ボタンを押すまでは反映しない）。
   * `linkedSignal` にすることで、他画面などで保存値が変わった場合に入力欄も追従する
   * （単なる `signal(初期値)` だと構築時の1回しか同期されない）。
   */
  protected readonly apiKeyInput = linkedSignal(() => this.settings.googleMapsApiKey());
  /** キーを平文表示するかどうか。 */
  protected readonly showKey = signal(false);
  protected readonly hasSavedKey = this.settings.googleMapsApiKey;

  /** 昼休みの必要時間（分）の入力欄の一時的な値。保存値の変更に追従する。 */
  protected readonly lunchBreakMinutesInput = linkedSignal(() => this.settings.lunchBreakMinutes());

  /** 入力欄に許可する上限（分）。 */
  protected readonly maxLunchBreakMinutes = MAX_LUNCH_BREAK_MINUTES;

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

  /** 昼休みの必要時間（分）を保存する。空欄（NaN）・範囲外は既定値や上下限へ丸める。 */
  saveLunchBreakMinutes(): void {
    const minutes = normalizeLunchBreakMinutes(this.lunchBreakMinutesInput());
    // 丸めた結果を入力欄へ書き戻し、保存値と表示を一致させる
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
