/**
 * @file Google Maps JavaScript API のスクリプトを動的に読み込むサービス。
 * `@angular/google-maps` の `<google-map>` は window.google.maps を前提とするため、
 * 地図を使う画面（おすすめページ）で初めて呼ばれたときに1回だけ読み込む。
 */
import { Injectable, inject } from '@angular/core';
import { environment } from '../../environments/environment';
import { SettingsStore } from './settings-store';

@Injectable({ providedIn: 'root' })
export class GoogleMapsLoader {
  private settings = inject(SettingsStore);
  private loadPromise: Promise<void> | null = null;

  /**
   * スクリプトの読み込みを開始し、地図描画に必要なライブラリが使える状態になるまで待つ。
   *
   * `loading=async` を付けた場合、`script.onload` の時点ではブートストラップ用ローダしか
   * 読み込まれておらず `google.maps.Map` / `google.maps.LatLngBounds` はまだ未定義。
   * その状態で `<google-map>` を描画すると例外になりビューごと描画が中断される
   * （「おすすめタブが初回だけ表示されない」不具合の原因）。そのため
   * `importLibrary()` の解決まで待ってから resolve する。
   */
  load(): Promise<void> {
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = this.loadInternal().catch((err) => {
      // 失敗した Promise をキャッシュし続けると再試行できないため、次回は最初からやり直す。
      this.loadPromise = null;
      throw err;
    });

    return this.loadPromise;
  }

  /** スクリプトタグの挿入 → ライブラリ読み込み完了待ちまでの一連の処理。 */
  private async loadInternal(): Promise<void> {
    // 既に完全初期化済みなら何もしない（`google.maps` の有無だけでは不十分な点に注意）。
    if (window.google?.maps?.Map) return;

    if (!window.google?.maps?.importLibrary) {
      const apiKey = this.settings.googleMapsApiKey() || environment.googleMapsApiKey;
      if (!apiKey) {
        throw new Error('設定画面で Google Maps API キーを登録してください');
      }
      await this.appendScript(apiKey);
    }

    if (!window.google?.maps?.importLibrary) {
      throw new Error('Google Maps スクリプトの初期化に失敗しました');
    }

    // 地図本体とマーカーの両方を待ってから完了扱いにする。
    await Promise.all([
      window.google.maps.importLibrary('maps'),
      window.google.maps.importLibrary('marker'),
    ]);
  }

  /** Google Maps のブートストラップスクリプトを 1 度だけ head に挿入する。 */
  private appendScript(apiKey: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      // キーは設定画面のユーザー入力。そのまま連結すると `&` や `#` を含む値で
      // クエリ文字列を汚染できてしまうため、必ずエスケープする。
      const params = new URLSearchParams({ key: apiKey, loading: 'async' });
      script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        // 失敗したスクリプトタグを残すと、再試行のたびに head へ重複挿入されてしまう。
        script.remove();
        reject(new Error('Google Maps スクリプトの読み込みに失敗しました'));
      };
      document.head.appendChild(script);
    });
  }
}
