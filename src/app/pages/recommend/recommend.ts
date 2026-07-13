import { ChangeDetectionStrategy, Component, WritableSignal, computed, effect, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatChipsModule } from '@angular/material/chips';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { GoogleMap, MapMarker } from '@angular/google-maps';
import { Restaurant } from '../../models/restaurant';
import { RestaurantStore } from '../../services/restaurant-store';
import { GoogleMapsLoader } from '../../services/google-maps-loader';
import { SettingsStore } from '../../services/settings-store';
import { getRemainingOpenMinutes } from '../../services/opening-hours';
import { LatLng, RecommendationScorer } from '../../services/recommendation-scorer';

type SortMode = 'random' | 'near' | 'rating';

/** 現在地取得のタイムアウト（ミリ秒）。 */
const GEOLOCATION_TIMEOUT_MS = 8000;

/** ホーム：エリア/ジャンル/気分で絞り込み、一覧表示＋ランダム抽選でおすすめする。 */
@Component({
  selector: 'app-recommend',
  imports: [
    RouterLink,
    MatChipsModule,
    MatCardModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    GoogleMap,
    MapMarker,
  ],
  templateUrl: './recommend.html',
  styleUrl: './recommend.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Recommend {
  private store = inject(RestaurantStore);
  private mapsLoader = inject(GoogleMapsLoader);
  private settings = inject(SettingsStore);
  private scorer = inject(RecommendationScorer);

  /** Google Maps スクリプトの読み込みが完了したか（未完了時は地図を描画しない）。 */
  readonly mapsReady = signal(false);

  /** 一覧マップ（複数マーカー表示用）への参照。マーカー変化時に表示範囲を自動調整する。 */
  private readonly listMap = viewChild(GoogleMap);

  /** 一覧マップの初期中心（東京駅付近）。マーカーがあれば fitBounds() で上書きされる。 */
  readonly defaultCenter: google.maps.LatLngLiteral = { lat: 35.681236, lng: 139.767125 };

  constructor() {
    this.mapsLoader
      .load()
      .then(() => this.mapsReady.set(true))
      .catch(() => this.mapsReady.set(false));

    effect(() => {
      const map = this.listMap();
      const list = this.mappable();
      if (!map || list.length === 0) return;
      const bounds = new google.maps.LatLngBounds();
      for (const r of list) bounds.extend(this.markerPosition(r));
      map.fitBounds(bounds);
    });
  }

  readonly areas = this.store.areas;
  readonly genres = this.store.genres;
  readonly moods = this.store.moods;
  readonly total = computed(() => this.store.restaurants().length);

  readonly selectedAreas = signal<string[]>([]);
  readonly selectedGenres = signal<string[]>([]);
  readonly selectedMoods = signal<string[]>([]);
  /** 「昼休みに余裕がある店のみ」フィルタの有効/無効。 */
  readonly requireLunchTime = signal(false);

  /** ランダム抽選で選ばれた1件 */
  readonly picked = signal<Restaurant | null>(null);

  /** 一覧の並び順。現在地取得に成功した場合のみ「近い順」を使える。 */
  readonly sortMode = signal<SortMode>('random');
  /** 現在地（取得できた場合のみ設定）。 */
  readonly currentPos = signal<LatLng | null>(null);
  readonly locating = signal(false);
  readonly locationDenied = signal(false);

  /** フィルタ結果を並び順に応じて並び替えたもの（一覧表示用）。 */
  readonly sorted = computed(() => {
    const list = this.filtered();
    const mode = this.sortMode();
    if (mode === 'rating') {
      return [...list].sort((a, b) => (b.places?.rating ?? -1) - (a.places?.rating ?? -1));
    }
    if (mode === 'near') {
      const pos = this.currentPos();
      if (!pos) return list;
      return [...list].sort((a, b) => this.scorer.distance(pos, a) - this.scorer.distance(pos, b));
    }
    return list;
  });

  /** 選択中の条件すべてに一致する店（各軸内は OR、軸どうしは AND） */
  readonly filtered = computed(() => {
    const a = this.selectedAreas();
    const g = this.selectedGenres();
    const m = this.selectedMoods();
    const requireLunchTime = this.requireLunchTime();
    const lunchBreakMinutes = this.settings.lunchBreakMinutes();
    return this.store.restaurants().filter((r) => {
      const okArea = a.length === 0 || a.includes(r.area);
      const okGenre = g.length === 0 || r.genres.some((x) => g.includes(x));
      const okMood = m.length === 0 || r.moods.some((x) => m.includes(x));
      if (!okArea || !okGenre || !okMood) return false;
      if (requireLunchTime) {
        const remaining = getRemainingOpenMinutes(r.places?.openingPeriods, new Date());
        if (remaining === null || remaining < lunchBreakMinutes) return false;
      }
      return true;
    });
  });

  /** 絞り込み結果のうち、座標（Places情報）を持つ店のみ（地図表示用）。 */
  readonly mappable = computed(() =>
    this.filtered().filter((r) => r.places?.lat != null && r.places?.lng != null),
  );

  readonly hasFilter = computed(
    () =>
      this.selectedAreas().length > 0 ||
      this.selectedGenres().length > 0 ||
      this.selectedMoods().length > 0 ||
      this.requireLunchTime(),
  );

  /** 「昼休みに余裕がある店のみ」フィルタの有効/無効を切り替える。 */
  toggleRequireLunchTime(): void {
    this.requireLunchTime.update((v) => !v);
    this.resetPick();
  }

  toggle(sig: WritableSignal<string[]>, value: string): void {
    sig.update((list) =>
      list.includes(value) ? list.filter((v) => v !== value) : [...list, value],
    );
    this.resetPick();
  }

  isSelected(sig: WritableSignal<string[]>, value: string): boolean {
    return sig().includes(value);
  }

  clearFilters(): void {
    this.selectedAreas.set([]);
    this.selectedGenres.set([]);
    this.selectedMoods.set([]);
    this.requireLunchTime.set(false);
    this.resetPick();
  }

  /** 抽選結果（選ばれた店・選定理由）をクリアする。フィルタ変更時に呼ぶ。 */
  private resetPick(): void {
    this.picked.set(null);
    this.pickedReason.set(null);
  }

  /** 選定理由の簡易サマリー（おすすめボタンで選ばれた場合のみ表示）。 */
  readonly pickedReason = signal<string | null>(null);

  /** 絞り込み結果からランダムに1件選ぶ。 */
  pickRandom(): void {
    const list = this.filtered();
    this.pickedReason.set(null);
    if (list.length === 0) {
      this.picked.set(null);
      return;
    }
    const idx = Math.floor(Math.random() * list.length);
    const chosen = list[idx];
    this.picked.set(chosen);
    this.store.recordPicked(chosen.id);
  }

  /**
   * 評価・レビュー件数・現在地からの距離・直近の被り回避を加味して1件を選ぶ。
   * 現在地が未取得なら「近い順」と同じ流れで取得を試みる（取得できなくてもスコア計算は続行）。
   */
  pickRecommended(): void {
    const list = this.filtered();
    if (list.length === 0) {
      this.picked.set(null);
      this.pickedReason.set(null);
      return;
    }
    if (!this.currentPos() && !this.locating()) {
      this.requestLocation();
    }

    const pos = this.currentPos();
    const recent = this.store.recentPickedIds();
    const globalMeanRating = this.scorer.meanRating(list);

    let best = list[0];
    let bestScore = -Infinity;
    for (const r of list) {
      const score = this.scorer.scoreOf(r, pos, recent, globalMeanRating);
      if (score > bestScore) {
        bestScore = score;
        best = r;
      }
    }

    this.picked.set(best);
    this.pickedReason.set(this.scorer.reasonFor(best, pos));
    this.store.recordPicked(best.id);
  }

  /** 「近い順」選択時にブラウザの現在地取得を要求する。拒否・失敗時はランダム表示に留める。 */
  setSortMode(mode: SortMode): void {
    this.sortMode.set(mode);
    if (mode === 'near' && !this.currentPos() && !this.locating()) {
      this.requestLocation();
    }
  }

  private requestLocation(): void {
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

  /** おすすめカードの地図中心座標（マーカーと同じ位置）。 */
  mapCenter(r: Restaurant): google.maps.LatLngLiteral {
    return { lat: r.places?.lat ?? 0, lng: r.places?.lng ?? 0 };
  }

  /** 一覧マップ用マーカー座標。 */
  markerPosition(r: Restaurant): google.maps.LatLngLiteral {
    return { lat: r.places?.lat ?? 0, lng: r.places?.lng ?? 0 };
  }

  /** 一覧マップのマーカーをクリックした店を「今日はここ！」として表示する。 */
  onMarkerClick(r: Restaurant): void {
    this.picked.set(r);
    this.pickedReason.set(null);
    this.store.recordPicked(r.id);
  }
}
