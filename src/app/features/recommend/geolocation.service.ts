/**
 * @file ブラウザの現在地取得（Geolocation API）を signal でラップするサービス。
 * `Recommend` の「近い順」ソート・「今日のおすすめ」で現在地が必要になった時点で要求する。
 * 拒否・非対応・失敗時は `locationDenied` を立てるのみで、呼び出し側は現在地無しの
 * フォールバック動作（通常順ソート等）を続行できるようにする。
 */
import { Injectable, signal } from '@angular/core';
import { LatLng } from '@services/recommendation-scorer';

/** 現在地取得のタイムアウト（ミリ秒）。 */
const GEOLOCATION_TIMEOUT_MS = 8000;

@Injectable({ providedIn: 'root' })
export class GeolocationService {
  /** 現在地（取得できた場合のみ設定）。 */
  readonly currentPos = signal<LatLng | null>(null);
  readonly locating = signal(false);
  readonly locationDenied = signal(false);

  /** 取得中のリクエスト。同時に複数回要求されても1回にまとめるために保持する。 */
  private pending: Promise<LatLng | null> | null = null;

  /** 現在地取得を要求する（結果を待たない呼び出し用）。 */
  requestLocation(): void {
    void this.ensureLocation();
  }

  /**
   * 現在地を取得して返す。取得済みならそのまま返し、取得中なら同じ Promise を共有する。
   * 拒否・非対応・タイムアウト時は null を返す（呼び出し側は現在地無しで続行できる）。
   *
   * `requestLocation()` を呼んだ直後に `currentPos()` を読むと、取得は非同期なので必ず null が
   * 返ってしまう（「近さを考慮」と表示しつつ実際は考慮されない）。距離を反映したい場合は
   * こちらを await すること。
   */
  ensureLocation(): Promise<LatLng | null> {
    const current = this.currentPos();
    if (current) return Promise.resolve(current);
    if (this.pending) return this.pending;
    if (!navigator.geolocation) {
      this.locationDenied.set(true);
      return Promise.resolve(null);
    }

    this.locating.set(true);
    this.pending = new Promise<LatLng | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const value = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          this.currentPos.set(value);
          this.locationDenied.set(false);
          this.locating.set(false);
          resolve(value);
        },
        () => {
          this.locationDenied.set(true);
          this.locating.set(false);
          resolve(null);
        },
        { enableHighAccuracy: false, timeout: GEOLOCATION_TIMEOUT_MS },
      );
    }).finally(() => {
      this.pending = null;
    });

    return this.pending;
  }
}
