/**
 * @file `RecommendFilterService` の回帰テスト。
 * 「昼休みに余裕がある店のみ」フィルタで24時間営業店が落ちないこと、
 * Places 取得に失敗した店が地図表示対象（mappable）に含まれないこと、
 * 現在時刻が signal 化され時間経過で再計算されることを検証する。
 */
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Restaurant } from '@shared/models/restaurant';
import { PlacesInfo } from '@shared/models/places';
import { RestaurantStore } from '@services/restaurant-store';
import { SettingsStore } from '@services/settings-store';
import { RecommendFilterService } from './recommend-filter.service';

function makeRestaurant(id: string, places?: Partial<PlacesInfo>): Restaurant {
  return {
    id,
    name: `店${id}`,
    area: '新宿',
    genres: [],
    moods: [],
    places: places
      ? { placeId: id, lat: 35.68, lng: 139.76, types: [], fetchedAt: '', ...places }
      : undefined,
  };
}

describe('RecommendFilterService', () => {
  let service: RecommendFilterService;
  let store: RestaurantStore;

  beforeEach(() => {
    localStorage.clear();
    // 判定基準を固定するため、月曜 12:00 に時刻を固定する
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 10, 12, 0));
    // コンポーネントスコープのサービスなので、テストでは明示的に provide する
    TestBed.configureTestingModule({ providers: [RecommendFilterService] });
    store = TestBed.inject(RestaurantStore);
    TestBed.inject(SettingsStore).setLunchBreakMinutes(60);
    service = TestBed.inject(RecommendFilterService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('24時間営業の店は「昼休みに余裕がある店のみ」で除外されない', () => {
    store.addMany([
      makeRestaurant('1', {
        // Places API は24時間営業の店に close を返さない
        openingPeriods: [{ openDay: 0, openHour: 0, openMinute: 0, alwaysOpen: true }],
      }),
    ]);

    service.requireLunchTime.set(true);
    TestBed.tick();

    expect(service.filtered().map((r) => r.id)).toEqual(['1']);
  });

  it('営業時間データが無い店は「昼休みに余裕がある店のみ」で除外される', () => {
    store.addMany([makeRestaurant('1', {})]);

    service.requireLunchTime.set(true);
    TestBed.tick();

    expect(service.filtered()).toHaveLength(0);
  });

  it('残り営業時間が必要時間に満たない店は除外される', () => {
    store.addMany([
      // 月曜 11:00〜12:30 → 12:00 時点で残り30分（必要60分に満たない）
      makeRestaurant('1', {
        openingPeriods: [
          { openDay: 1, openHour: 11, openMinute: 0, closeDay: 1, closeHour: 12, closeMinute: 30 },
        ],
      }),
      // 月曜 11:00〜15:00 → 残り180分
      makeRestaurant('2', {
        openingPeriods: [
          { openDay: 1, openHour: 11, openMinute: 0, closeDay: 1, closeHour: 15, closeMinute: 0 },
        ],
      }),
    ]);

    service.requireLunchTime.set(true);
    TestBed.tick();

    expect(service.filtered().map((r) => r.id)).toEqual(['2']);
  });

  it('時間が経過すると営業時間の判定が再計算される', () => {
    store.addMany([
      // 月曜 11:00〜14:00。12:00 時点では残り120分で通過する。
      makeRestaurant('1', {
        openingPeriods: [
          { openDay: 1, openHour: 11, openMinute: 0, closeDay: 1, closeHour: 14, closeMinute: 0 },
        ],
      }),
    ]);

    service.requireLunchTime.set(true);
    TestBed.tick();
    expect(service.filtered()).toHaveLength(1);

    // 13:30 まで進めると残り30分になり、必要60分を満たさなくなる。
    // computed 内で new Date() を呼んでいると、ここで結果が更新されない。
    vi.advanceTimersByTime(90 * 60 * 1000);
    TestBed.tick();

    expect(service.filtered()).toHaveLength(0);
  });

  it('Places 取得に失敗した店は地図表示対象に含まれない', () => {
    store.addMany([
      makeRestaurant('1'),
      makeRestaurant('2', { placeId: '', lat: 0, lng: 0, fetchError: '見つかりません' }),
      makeRestaurant('3', {}),
    ]);
    TestBed.tick();

    expect(service.mappable().map((r) => r.id)).toEqual(['3']);
  });
});
