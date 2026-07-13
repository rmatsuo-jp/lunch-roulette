/**
 * @file アプリ設定（Google Maps APIキー・表示テーマ等）のストア。RestaurantStore と同じ方式で
 * localStorage に永続化する。ユーザーが設定画面から入力したキーやテーマ選択を保持し、
 * PlacesEnrichment / GoogleMapsLoader / App コンポーネントから参照される。
 */
import { Injectable, computed, effect, signal } from '@angular/core';
import { readJson, writeJson } from '@core/storage';

const STORAGE_KEY = 'lunch-roulette.settings.v1';

/** ライト / ダーク / システム設定への追従。 */
export type ThemePreference = 'light' | 'dark' | 'system';

/** 「昼休みに余裕がある店のみ」判定に使う必要時間（分）のデフォルト値。 */
const DEFAULT_LUNCH_BREAK_MINUTES = 60;

interface SettingsData {
  version: 3;
  googleMapsApiKey: string;
  theme: ThemePreference;
  /** 昼休みに最低限必要な分数（残り営業時間がこれ未満の店をフィルタで除外する）。 */
  lunchBreakMinutes: number;
}

@Injectable({ providedIn: 'root' })
export class SettingsStore {
  private readonly data = signal<SettingsData>(this.load());

  /** 保存済みの Google Maps APIキー（未設定時は空文字）。 */
  readonly googleMapsApiKey = computed(() => this.data().googleMapsApiKey);

  /** 表示テーマの選択（未設定時は 'system'）。 */
  readonly theme = computed(() => this.data().theme);

  /** 昼休みに最低限必要な分数（未設定時は60分）。 */
  readonly lunchBreakMinutes = computed(() => this.data().lunchBreakMinutes);

  constructor() {
    effect(() => this.save(this.data()));
  }

  /** APIキーを保存する（前後の空白は除去）。 */
  setGoogleMapsApiKey(key: string): void {
    this.data.update((current) => ({ ...current, googleMapsApiKey: key.trim() }));
  }

  /** APIキーの設定を削除する。 */
  clearGoogleMapsApiKey(): void {
    this.data.update((current) => ({ ...current, googleMapsApiKey: '' }));
  }

  /** 表示テーマを保存する。 */
  setTheme(theme: ThemePreference): void {
    this.data.update((current) => ({ ...current, theme }));
  }

  /** 昼休みに最低限必要な分数を保存する。 */
  setLunchBreakMinutes(minutes: number): void {
    this.data.update((current) => ({ ...current, lunchBreakMinutes: minutes }));
  }

  private load(): SettingsData {
    const fallback: SettingsData = {
      version: 3,
      googleMapsApiKey: '',
      theme: 'system',
      lunchBreakMinutes: DEFAULT_LUNCH_BREAK_MINUTES,
    };
    const parsed = readJson<Partial<SettingsData>>(STORAGE_KEY, fallback);
    return {
      version: 3,
      googleMapsApiKey: parsed.googleMapsApiKey ?? '',
      theme: parsed.theme ?? 'system',
      lunchBreakMinutes: parsed.lunchBreakMinutes ?? DEFAULT_LUNCH_BREAK_MINUTES,
    };
  }

  private save(data: SettingsData): void {
    writeJson(STORAGE_KEY, data);
  }
}
