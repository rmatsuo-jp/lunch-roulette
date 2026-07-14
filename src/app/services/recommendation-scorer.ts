/**
 * @file 「今日のおすすめ」の選定ロジック（スコアリング・距離計算）。
 * recommend.ts から純粋なビジネスロジックとして切り出し、他ページからも再利用できるようにする。
 */
import { Injectable } from '@angular/core';
import { Restaurant } from '@shared/models/restaurant';

export interface LatLng {
  lat: number;
  lng: number;
}

/** ベイズ平均の重み（信頼に必要な最小レビュー件数の目安）。 */
const RATING_CONFIDENCE_REVIEWS = 10;
/** 距離1kmあたりのスコア減点。 */
const DISTANCE_PENALTY_PER_KM = 0.1;
/** 直近に選ばれていた場合のスコア減点。 */
const RECENT_PICK_PENALTY = 5;
/** 絞り込み結果内に評価取得済みの店が1件も無い場合に使う仮の中庸評価値。 */
const DEFAULT_MEAN_RATING = 3.5;
/** 距離表示をメートル/キロメートルで切り替えるしきい値（km）。 */
const NEAR_DISTANCE_DISPLAY_THRESHOLD_KM = 1;
/** 地球の半径（km、Haversine公式用）。 */
const EARTH_RADIUS_KM = 6371;

@Injectable({ providedIn: 'root' })
export class RecommendationScorer {
  /** 絞り込み結果内の評価の平均（評価未取得の店は除く）。1件も無ければ仮の中庸値を返す。 */
  meanRating(list: Restaurant[]): number {
    const ratings = list.map((r) => r.places?.rating).filter((v): v is number => v != null);
    if (ratings.length === 0) return DEFAULT_MEAN_RATING;
    return ratings.reduce((sum, v) => sum + v, 0) / ratings.length;
  }

  /**
   * ベイズ平均による評価スコア（レビュー件数が少ない店を過大評価しない）＋距離減点＋被り減点。
   * `precomputedDistance` を渡した場合はHaversine距離の再計算を省略する
   * （呼び出し側が複数店舗を一括評価する際に、事前計算済みの距離Mapを使い回すため）。
   */
  scoreOf(
    r: Restaurant,
    pos: LatLng | null,
    recentIds: string[],
    globalMeanRating: number,
    precomputedDistance?: number,
  ): number {
    const p = r.places;
    let score = 0;
    if (p?.rating != null && p.userRatingsTotal != null) {
      const v = p.userRatingsTotal;
      const m = RATING_CONFIDENCE_REVIEWS;
      score += (v / (v + m)) * p.rating + (m / (v + m)) * globalMeanRating;
    }

    if (pos) {
      const dist = precomputedDistance ?? this.distance(pos, r);
      if (Number.isFinite(dist)) {
        score -= dist * DISTANCE_PENALTY_PER_KM;
      }
    }

    if (recentIds.includes(r.id)) {
      score -= RECENT_PICK_PENALTY;
    }

    return score;
  }

  /** おすすめカードに表示する選定理由の1行サマリー。`precomputedDistance` の意図は `scoreOf` と同じ。 */
  reasonFor(r: Restaurant, pos: LatLng | null, precomputedDistance?: number): string {
    const parts: string[] = [];
    if (r.places?.rating != null) {
      parts.push(`評価 ${r.places.rating}（${r.places.userRatingsTotal ?? 0}件）`);
    }
    if (pos) {
      const dist = precomputedDistance ?? this.distance(pos, r);
      if (Number.isFinite(dist)) {
        parts.push(
          dist < NEAR_DISTANCE_DISPLAY_THRESHOLD_KM
            ? `現在地から${Math.round(dist * 1000)}m`
            : `現在地から${dist.toFixed(1)}km`,
        );
      }
    }
    return parts.length > 0 ? parts.join('・') : 'データに基づくおすすめ';
  }

  /** 現在地からの直線距離（km、Haversine公式）。座標未取得の店は Infinity 扱い。 */
  distance(pos: LatLng, r: Restaurant): number {
    const p = r.places;
    if (!p || (p.lat === 0 && p.lng === 0)) return Infinity;
    const dLat = this.toRad(p.lat - pos.lat);
    const dLng = this.toRad(p.lng - pos.lng);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(this.toRad(pos.lat)) * Math.cos(this.toRad(p.lat)) * Math.sin(dLng / 2) ** 2;
    return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private toRad(deg: number): number {
    return (deg * Math.PI) / 180;
  }
}
