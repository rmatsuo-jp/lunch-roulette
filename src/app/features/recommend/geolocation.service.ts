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

  /** 現在地取得を要求する。取得中・取得済みの場合は何もしない（呼び出し側でガードしてもよい）。 */
  requestLocation(): void {
    if (!navigator.geolocation) {
      this.locationDenied.set(true);
      return;
    }
    this.locating.set(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.currentPos.set({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        this.locating.set(false);
      },
      () => {
        this.locationDenied.set(true);
        this.locating.set(false);
      },
      { enableHighAccuracy: false, timeout: GEOLOCATION_TIMEOUT_MS },
    );
  }
}
