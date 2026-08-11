/**
 * @file `RestaurantStore` の回帰テスト。
 * `addMany` の重複排除、update/remove（tombstone による論理削除）、`replaceAll`、
 * 直近ピック履歴、JSON 入出力、localStorage への永続化を検証する。
 */
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { Restaurant } from '@shared/models/restaurant';
import { RestaurantStore } from './restaurant-store';

const STORAGE_KEY = 'lunch-roulette.data.v1';
const RECENT_PICKS_KEY = 'lunch-roulette.recent-picks.v1';

/** テスト用の Restaurant を組み立てるヘルパー。 */
function makeRestaurant(overrides: Partial<Restaurant> & { id: string; name: string }): Restaurant {
  return { area: '新宿', genres: [], moods: [], ...overrides };
}

describe('RestaurantStore', () => {
  let store: RestaurantStore;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    store = TestBed.inject(RestaurantStore);
  });

  describe('addMany', () => {
    it('新規の店を追加し、追加件数を返す', () => {
      const added = store.addMany([
        makeRestaurant({ id: '1', name: 'A店' }),
        makeRestaurant({ id: '2', name: 'B店' }),
      ]);

      expect(added).toBe(2);
      expect(store.restaurants()).toHaveLength(2);
    });

    it('同一エリア・同一店名は重複としてスキップする', () => {
      store.addMany([makeRestaurant({ id: '1', name: 'A店' })]);
      const added = store.addMany([makeRestaurant({ id: '2', name: 'A店' })]);

      expect(added).toBe(0);
      expect(store.restaurants()).toHaveLength(1);
    });

    it('重複判定は大文字小文字・前後空白を無視する', () => {
      store.addMany([makeRestaurant({ id: '1', name: 'Ramen', area: 'Shinjuku' })]);
      const added = store.addMany([makeRestaurant({ id: '2', name: '  ramen  ', area: ' SHINJUKU ' })]);

      expect(added).toBe(0);
    });

    it('エリアが違えば同名でも別の店として追加する', () => {
      store.addMany([makeRestaurant({ id: '1', name: 'A店', area: '新宿' })]);
      const added = store.addMany([makeRestaurant({ id: '2', name: 'A店', area: '渋谷' })]);

      expect(added).toBe(1);
      expect(store.restaurants()).toHaveLength(2);
    });

    it('URL があれば店名ではなく URL で重複判定する', () => {
      store.addMany([makeRestaurant({ id: '1', name: 'A店', url: 'https://maps.example/1' })]);
      // 店名は違うが URL が同じ → 重複
      const sameUrl = store.addMany([
        makeRestaurant({ id: '2', name: 'B店', url: 'https://maps.example/1' }),
      ]);
      expect(sameUrl).toBe(0);

      // 店名は同じだが URL が違う → 別の店
      const otherUrl = store.addMany([
        makeRestaurant({ id: '3', name: 'A店', url: 'https://maps.example/2' }),
      ]);
      expect(otherUrl).toBe(1);
    });

    it('同一バッチ内の重複も除去する', () => {
      const added = store.addMany([
        makeRestaurant({ id: '1', name: 'A店' }),
        makeRestaurant({ id: '2', name: 'A店' }),
      ]);

      expect(added).toBe(1);
    });
  });

  describe('update', () => {
    it('指定 id の店だけを部分更新する', () => {
      store.addMany([
        makeRestaurant({ id: '1', name: 'A店' }),
        makeRestaurant({ id: '2', name: 'B店' }),
      ]);
      store.update('1', { genres: ['ラーメン'], moods: ['がっつり'] });

      expect(store.restaurants()[0]).toMatchObject({ name: 'A店', genres: ['ラーメン'] });
      expect(store.restaurants()[1].genres).toEqual([]);
    });

    it('存在しない id の更新は何も変えない', () => {
      store.addMany([makeRestaurant({ id: '1', name: 'A店' })]);
      store.update('unknown', { name: '変更後' });

      expect(store.restaurants()[0].name).toBe('A店');
    });
  });

  describe('remove（tombstone による論理削除）', () => {
    it('remove した店は restaurants から消えるが allRestaurants には deleted:true で残る', () => {
      store.addMany([
        makeRestaurant({ id: '1', name: 'A店' }),
        makeRestaurant({ id: '2', name: 'B店' }),
      ]);
      store.remove('1');

      expect(store.restaurants().map((r) => r.id)).toEqual(['2']);
      expect(store.allRestaurants()).toHaveLength(2);
      expect(store.allRestaurants()[0]).toMatchObject({ id: '1', deleted: true });
    });

    it('clear は全件に tombstone を立てる（物理削除しない）', () => {
      store.addMany([
        makeRestaurant({ id: '1', name: 'A店' }),
        makeRestaurant({ id: '2', name: 'B店' }),
      ]);
      store.clear();

      expect(store.restaurants()).toHaveLength(0);
      expect(store.allRestaurants()).toHaveLength(2);
      expect(store.allRestaurants().every((r) => r.deleted)).toBe(true);
    });
  });

  describe('replaceAll', () => {
    it('削除済みを含む全件を丸ごと置き換える（同期用）', () => {
      store.addMany([makeRestaurant({ id: '1', name: 'A店' })]);
      store.replaceAll([
        makeRestaurant({ id: '9', name: 'Z店' }),
        makeRestaurant({ id: '8', name: 'Y店', deleted: true }),
      ]);

      expect(store.allRestaurants().map((r) => r.id)).toEqual(['9', '8']);
      expect(store.restaurants().map((r) => r.id)).toEqual(['9']);
    });
  });

  describe('派生 signal（エリア / ジャンル / 気分）', () => {
    it('重複を除き日本語順にソートし、削除済みは含めない', () => {
      store.addMany([
        makeRestaurant({ id: '1', name: 'A店', area: '新宿', genres: ['ラーメン'], moods: ['がっつり'] }),
        makeRestaurant({ id: '2', name: 'B店', area: '渋谷', genres: ['ラーメン', 'カレー'], moods: [] }),
      ]);

      expect(store.areas()).toEqual(['渋谷', '新宿'].sort((a, b) => a.localeCompare(b, 'ja')));
      expect(store.genres()).toEqual(['カレー', 'ラーメン']);
      expect(store.moods()).toEqual(['がっつり']);

      store.remove('2');
      expect(store.genres()).toEqual(['ラーメン']);
    });
  });

  describe('recordPicked', () => {
    it('先頭に挿入し、重複は除去され、最大5件で打ち切られる', () => {
      for (const id of ['1', '2', '3', '4', '5', '6']) store.recordPicked(id);
      expect(store.recentPickedIds()).toEqual(['6', '5', '4', '3', '2']);

      store.recordPicked('3');
      expect(store.recentPickedIds()).toEqual(['3', '6', '5', '4', '2']);
    });
  });

  describe('toJson / importJson', () => {
    it('toJson は削除済みを除いた表示用データを出力する', () => {
      store.addMany([
        makeRestaurant({ id: '1', name: 'A店' }),
        makeRestaurant({ id: '2', name: 'B店' }),
      ]);
      store.remove('2');

      const data = JSON.parse(store.toJson()) as { version: number; restaurants: Restaurant[] };
      expect(data.version).toBe(1);
      expect(data.restaurants.map((r) => r.id)).toEqual(['1']);
    });

    it('RestaurantData 形式の JSON を取り込む', () => {
      const count = store.importJson(
        JSON.stringify({ version: 1, restaurants: [makeRestaurant({ id: '1', name: 'A店' })] }),
      );

      expect(count).toBe(1);
      expect(store.restaurants()[0].name).toBe('A店');
    });

    it('素の配列形式の JSON も取り込める', () => {
      const count = store.importJson(JSON.stringify([makeRestaurant({ id: '1', name: 'A店' })]));

      expect(count).toBe(1);
      expect(store.restaurants()[0].name).toBe('A店');
    });

    it('取り込み時に id / area / genres / moods を補完する', () => {
      store.importJson(JSON.stringify([{ name: 'A店' }]));

      const r = store.restaurants()[0];
      expect(r.id).toBeTruthy();
      expect(r.area).toBe('未分類');
      expect(r.genres).toEqual([]);
      expect(r.moods).toEqual([]);
    });

    it('配列でない形式は例外を投げる', () => {
      expect(() => store.importJson(JSON.stringify({ version: 1 }))).toThrowError('不正な JSON 形式です');
    });

    it('取り込みは既存データを置き換える', () => {
      store.addMany([makeRestaurant({ id: '1', name: 'A店' })]);
      store.importJson(JSON.stringify([makeRestaurant({ id: '2', name: 'B店' })]));

      expect(store.allRestaurants().map((r) => r.id)).toEqual(['2']);
    });
  });

  describe('localStorage への永続化', () => {
    it('変更が localStorage へ保存され、再生成時に復元される', () => {
      store.addMany([makeRestaurant({ id: '1', name: 'A店' })]);
      store.recordPicked('1');
      TestBed.tick(); // effect による保存をフラッシュ

      expect(localStorage.getItem(STORAGE_KEY)).toContain('A店');
      expect(localStorage.getItem(RECENT_PICKS_KEY)).toContain('1');

      // 新しい TestBed（＝アプリ再起動相当）で復元されること
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      const restored = TestBed.inject(RestaurantStore);
      expect(restored.restaurants().map((r) => r.name)).toEqual(['A店']);
      expect(restored.recentPickedIds()).toEqual(['1']);
    });
  });
});
