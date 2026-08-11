/**
 * @file `RecommendationScorer` の回帰テスト。
 * ベイズ平均評点・Haversine距離・直近ピック減点・`precomputedDistance` 引数の扱いを検証する。
 */
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { PlacesInfo } from '@shared/models/places';
import { Restaurant } from '@shared/models/restaurant';
import { RecommendationScorer } from './recommendation-scorer';

/** テスト用の Restaurant を組み立てるヘルパー。 */
function makeRestaurant(id: string, places?: Partial<PlacesInfo>): Restaurant {
  return {
    id,
    name: `店${id}`,
    area: 'テストエリア',
    genres: [],
    moods: [],
    places: places
      ? { placeId: `p-${id}`, lat: 0, lng: 0, types: [], fetchedAt: '2026-01-01T00:00:00.000Z', ...places }
      : undefined,
  };
}

describe('RecommendationScorer', () => {
  let scorer: RecommendationScorer;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    scorer = TestBed.inject(RecommendationScorer);
  });

  describe('meanRating', () => {
    it('評価未取得の店を除いた平均を返す', () => {
      const list = [
        makeRestaurant('a', { rating: 4.0 }),
        makeRestaurant('b', { rating: 3.0 }),
        makeRestaurant('c'), // places なし
        makeRestaurant('d', {}), // places はあるが rating なし
      ];
      expect(scorer.meanRating(list)).toBe(3.5);
    });

    it('評価付きの店が1件も無ければ仮の中庸値 3.5 を返す', () => {
      expect(scorer.meanRating([])).toBe(3.5);
      expect(scorer.meanRating([makeRestaurant('a')])).toBe(3.5);
    });
  });

  describe('scoreOf（評価スコア）', () => {
    it('rating と userRatingsTotal が揃っている場合のみベイズ平均を加算する', () => {
      // v=90, m=10 → (90/100)*5.0 + (10/100)*3.0 = 4.5 + 0.3 = 4.8
      const r = makeRestaurant('a', { rating: 5.0, userRatingsTotal: 90 });
      expect(scorer.scoreOf(r, null, [], 3.0)).toBeCloseTo(4.8, 10);
    });

    it('userRatingsTotal が無ければ評価スコアは加算されない', () => {
      const r = makeRestaurant('a', { rating: 5.0 });
      expect(scorer.scoreOf(r, null, [], 3.0)).toBe(0);
    });

    it('rating が無ければ評価スコアは加算されない', () => {
      const r = makeRestaurant('a', { userRatingsTotal: 90 });
      expect(scorer.scoreOf(r, null, [], 3.0)).toBe(0);
    });

    it('レビュー件数が少ないほど全体平均に引き寄せられる', () => {
      const few = makeRestaurant('few', { rating: 5.0, userRatingsTotal: 1 });
      const many = makeRestaurant('many', { rating: 5.0, userRatingsTotal: 1000 });
      const fewScore = scorer.scoreOf(few, null, [], 3.0);
      const manyScore = scorer.scoreOf(many, null, [], 3.0);
      expect(fewScore).toBeLessThan(manyScore);
      // 件数1件なら (1/11)*5 + (10/11)*3 ≒ 3.18 で全体平均寄り
      expect(fewScore).toBeCloseTo((1 / 11) * 5 + (10 / 11) * 3, 10);
    });
  });

  describe('scoreOf（距離減点）', () => {
    it('現在地が null なら距離減点されない', () => {
      const r = makeRestaurant('a', { lat: 35.0, lng: 139.0 });
      expect(scorer.scoreOf(r, null, [], 3.0, 100)).toBe(0);
    });

    it('距離1kmあたり 0.1 減点される', () => {
      const r = makeRestaurant('a', { lat: 35.0, lng: 139.0 });
      expect(scorer.scoreOf(r, { lat: 35.0, lng: 139.0 }, [], 3.0, 5)).toBeCloseTo(-0.5, 10);
    });

    it('距離が Infinity（座標未取得）なら距離減点されない', () => {
      const r = makeRestaurant('a'); // places なし → distance() は Infinity
      expect(scorer.scoreOf(r, { lat: 35.0, lng: 139.0 }, [], 3.0)).toBe(0);
    });

    it('precomputedDistance に 0 を渡した場合、有効値として扱われ再計算されない', () => {
      // places が無い店（distance() なら Infinity）でも、0 を渡せば減点 0 として扱われる。
      // `??` による fallback なので 0 は fallback されない、という仕様の固定。
      const r = makeRestaurant('a');
      expect(scorer.scoreOf(r, { lat: 35.0, lng: 139.0 }, [], 3.0, 0)).toBe(0);
    });

    it('precomputedDistance を渡すと実座標ではなくその値が使われる', () => {
      // 実距離は 0km（同一座標）だが、10km を渡せば -1.0 になる。
      const r = makeRestaurant('a', { lat: 35.0, lng: 139.0 });
      expect(scorer.scoreOf(r, { lat: 35.0, lng: 139.0 }, [], 3.0, 10)).toBeCloseTo(-1.0, 10);
    });
  });

  describe('scoreOf（直近ピック減点）', () => {
    it('recentIds に含まれる店は 5 点減点される', () => {
      const r = makeRestaurant('a', { rating: 5.0, userRatingsTotal: 90 });
      const base = scorer.scoreOf(r, null, [], 3.0);
      expect(scorer.scoreOf(r, null, ['a'], 3.0)).toBeCloseTo(base - 5, 10);
    });

    it('recentIds に含まれない店は減点されない', () => {
      const r = makeRestaurant('a', { rating: 5.0, userRatingsTotal: 90 });
      expect(scorer.scoreOf(r, null, ['other'], 3.0)).toBeCloseTo(4.8, 10);
    });
  });

  describe('distance（Haversine）', () => {
    it('places が無ければ Infinity', () => {
      expect(scorer.distance({ lat: 35.0, lng: 139.0 }, makeRestaurant('a'))).toBe(Infinity);
    });

    it('座標が (0, 0) なら未取得扱いで Infinity', () => {
      expect(scorer.distance({ lat: 35.0, lng: 139.0 }, makeRestaurant('a', { lat: 0, lng: 0 }))).toBe(
        Infinity,
      );
    });

    it('同一座標なら 0km', () => {
      const r = makeRestaurant('a', { lat: 35.681236, lng: 139.767125 });
      expect(scorer.distance({ lat: 35.681236, lng: 139.767125 }, r)).toBeCloseTo(0, 6);
    });

    it('東京駅〜横浜駅は約 27km', () => {
      const yokohama = makeRestaurant('a', { lat: 35.465786, lng: 139.622313 });
      const dist = scorer.distance({ lat: 35.681236, lng: 139.767125 }, yokohama);
      expect(dist).toBeGreaterThan(26);
      expect(dist).toBeLessThan(28);
    });

    it('緯度1度の差は約 111km', () => {
      const r = makeRestaurant('a', { lat: 36.0, lng: 139.0 });
      expect(scorer.distance({ lat: 35.0, lng: 139.0 }, r)).toBeCloseTo(111.19, 1);
    });
  });

  describe('reasonFor', () => {
    it('評価があれば評価とレビュー件数を含む', () => {
      const r = makeRestaurant('a', { rating: 4.2, userRatingsTotal: 120 });
      expect(scorer.reasonFor(r, null)).toBe('評価 4.2（120件）');
    });

    it('レビュー件数が無ければ 0 件と表示する', () => {
      const r = makeRestaurant('a', { rating: 4.2 });
      expect(scorer.reasonFor(r, null)).toBe('評価 4.2（0件）');
    });

    it('1km 未満はメートル表示', () => {
      const r = makeRestaurant('a', { lat: 35.0, lng: 139.0 });
      expect(scorer.reasonFor(r, { lat: 35.0, lng: 139.0 }, 0.35)).toBe('現在地から350m');
    });

    it('1km 以上はキロメートル表示（小数第1位）', () => {
      const r = makeRestaurant('a', { lat: 35.0, lng: 139.0 });
      expect(scorer.reasonFor(r, { lat: 35.0, lng: 139.0 }, 2.34)).toBe('現在地から2.3km');
    });

    it('評価と距離が両方あれば「・」で連結する', () => {
      const r = makeRestaurant('a', { lat: 35.0, lng: 139.0, rating: 4.2, userRatingsTotal: 120 });
      expect(scorer.reasonFor(r, { lat: 35.0, lng: 139.0 }, 0.5)).toBe('評価 4.2（120件）・現在地から500m');
    });

    it('情報が何も無ければ既定文言を返す', () => {
      expect(scorer.reasonFor(makeRestaurant('a'), null)).toBe('データに基づくおすすめ');
    });

    it('距離が Infinity なら距離部分を出さない', () => {
      const r = makeRestaurant('a'); // places なし
      expect(scorer.reasonFor(r, { lat: 35.0, lng: 139.0 })).toBe('データに基づくおすすめ');
    });
  });
});
