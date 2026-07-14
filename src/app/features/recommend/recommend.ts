/**
 * @file ホーム：エリア/ジャンル/気分で絞り込み、一覧表示＋ランダム/おすすめ抽選を行う画面。
 * フィルタ状態は `RecommendFilterService`、並び順は `RecommendSortService`、現在地取得は
 * `GeolocationService` に委譲し、このコンポーネント自体は抽選・地図読み込み・選択結果の
 * オーケストレーションのみを担う。
 */
import { ChangeDetectionStrategy, Component, WritableSignal, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatChipsModule } from '@angular/material/chips';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { GoogleMap, MapMarker } from '@angular/google-maps';
import { Restaurant } from '@shared/models/restaurant';
import { RestaurantStore } from '@services/restaurant-store';
import { GoogleMapsLoader } from '@services/google-maps-loader';
import { RecommendationScorer } from '@services/recommendation-scorer';
import { FilterChipGroup } from '@shared/ui/filter-chip-group/filter-chip-group';
import { RestaurantCard } from '@shared/ui/restaurant-card/restaurant-card';
import { GeolocationService } from './geolocation.service';
import { RecommendFilterService } from './recommend-filter.service';
import { RecommendSortService, SortMode } from './recommend-sort.service';
import { RecommendMap } from './recommend-map/recommend-map';

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
    FilterChipGroup,
    RestaurantCard,
    RecommendMap,
  ],
  templateUrl: './recommend.html',
  styleUrl: './recommend.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Recommend {
  private readonly store = inject(RestaurantStore);
  private readonly mapsLoader = inject(GoogleMapsLoader);
  private readonly scorer = inject(RecommendationScorer);
  protected readonly geolocation = inject(GeolocationService);
  protected readonly filterService = inject(RecommendFilterService);
  protected readonly sortService = inject(RecommendSortService);

  /** Google Maps スクリプトの読み込みが完了したか（未完了時は地図を描画しない）。 */
  readonly mapsReady = signal(false);

  /** 一覧マップの初期中心（東京駅付近）。マーカーがあれば fitBounds() で上書きされる。 */
  readonly defaultCenter: google.maps.LatLngLiteral = { lat: 35.681236, lng: 139.767125 };

  constructor() {
    this.mapsLoader
      .load()
      .then(() => this.mapsReady.set(true))
      .catch(() => this.mapsReady.set(false));
  }

  readonly areas = this.store.areas;
  readonly genres = this.store.genres;
  readonly moods = this.store.moods;
  readonly total = computed(() => this.store.restaurants().length);

  readonly filtered = this.filterService.filtered;
  readonly mappable = this.filterService.mappable;
  readonly hasFilter = this.filterService.hasFilter;
  readonly sorted = this.sortService.sorted;

  /** ランダム抽選で選ばれた1件 */
  readonly picked = signal<Restaurant | null>(null);
  /** 選定理由の簡易サマリー（おすすめボタンで選ばれた場合のみ表示）。 */
  readonly pickedReason = signal<string | null>(null);

  toggle(sig: WritableSignal<string[]>, value: string): void {
    this.filterService.toggle(sig, value);
    this.resetPick();
  }

  toggleRequireLunchTime(): void {
    this.filterService.toggleRequireLunchTime();
    this.resetPick();
  }

  clearFilters(): void {
    this.filterService.clearFilters();
    this.resetPick();
  }

  setSortMode(mode: SortMode): void {
    this.sortService.setSortMode(mode);
  }

  /** 抽選結果（選ばれた店・選定理由）をクリアする。フィルタ変更時に呼ぶ。 */
  private resetPick(): void {
    this.picked.set(null);
    this.pickedReason.set(null);
  }

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
    if (!this.geolocation.currentPos() && !this.geolocation.locating()) {
      this.geolocation.requestLocation();
    }

    const pos = this.geolocation.currentPos();
    const recent = this.store.recentPickedIds();
    const globalMeanRating = this.scorer.meanRating(list);

    let best = list[0];
    let bestScore = -Infinity;
    for (const r of list) {
      const score = this.scorer.scoreOf(r, pos, recent, globalMeanRating, this.sortService.distanceOf(r));
      if (score > bestScore) {
        bestScore = score;
        best = r;
      }
    }

    this.picked.set(best);
    this.pickedReason.set(this.scorer.reasonFor(best, pos, this.sortService.distanceOf(best)));
    this.store.recordPicked(best.id);
  }

  /** おすすめカードの地図中心座標（マーカーと同じ位置）。 */
  mapCenter(r: Restaurant): google.maps.LatLngLiteral {
    return { lat: r.places?.lat ?? 0, lng: r.places?.lng ?? 0 };
  }

  /** 一覧マップのマーカーをクリックした店を「今日はここ！」として表示する。 */
  onMarkerClick(r: Restaurant): void {
    this.picked.set(r);
    this.pickedReason.set(null);
    this.store.recordPicked(r.id);
  }
}
