/**
 * @file 「おすすめ」画面の一覧並び順（通常・近い順・評価順）を管理するサービス。
 * 「近い順」は現在地から各店までの距離を `distanceMap` として1回だけ計算し、
 * ソート処理・スコアリング（`RecommendationScorer`）の両方から使い回すことで、
 * 比較関数内で毎回 Haversine 距離を再計算する無駄（O(n log n)回の重複計算）を避ける。
 */
import { Injectable, computed, inject, signal } from '@angular/core';
import { Restaurant } from '@shared/models/restaurant';
import { RecommendationScorer } from '@services/recommendation-scorer';
import { GeolocationService } from './geolocation.service';
import { RecommendFilterService } from './recommend-filter.service';

export type SortMode = 'random' | 'near' | 'rating';

/** 並び順も画面固有の UI 状態のため、`RecommendFilterService` と同じくコンポーネントスコープで提供する。 */
@Injectable()
export class RecommendSortService {
  private readonly scorer = inject(RecommendationScorer);
  private readonly geolocation = inject(GeolocationService);
  private readonly filterService = inject(RecommendFilterService);

  /** 一覧の並び順。現在地取得に成功した場合のみ「近い順」を使える。 */
  readonly sortMode = signal<SortMode>('random');

  /** 絞り込み結果内の各店 -> 現在地からの距離（km）。現在地未取得時は null。 */
  readonly distanceMap = computed<Map<string, number> | null>(() => {
    const pos = this.geolocation.currentPos();
    if (!pos) return null;
    const map = new Map<string, number>();
    for (const r of this.filterService.filtered()) {
      map.set(r.id, this.scorer.distance(pos, r));
    }
    return map;
  });

  /** フィルタ結果を並び順に応じて並び替えたもの（一覧表示用）。 */
  readonly sorted = computed(() => {
    const list = this.filterService.filtered();
    const mode = this.sortMode();
    if (mode === 'rating') {
      return [...list].sort((a, b) => (b.places?.rating ?? -1) - (a.places?.rating ?? -1));
    }
    if (mode === 'near') {
      const distances = this.distanceMap();
      if (!distances) return list;
      return [...list].sort(
        (a, b) => (distances.get(a.id) ?? Infinity) - (distances.get(b.id) ?? Infinity),
      );
    }
    return list;
  });

  /** 「近い順」選択時にブラウザの現在地取得を要求する。拒否・失敗時はランダム表示に留める。 */
  setSortMode(mode: SortMode): void {
    this.sortMode.set(mode);
    if (mode === 'near' && !this.geolocation.currentPos() && !this.geolocation.locating()) {
      this.geolocation.requestLocation();
    }
  }

  distanceOf(r: Restaurant): number | undefined {
    return this.distanceMap()?.get(r.id);
  }
}
