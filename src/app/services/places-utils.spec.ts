/**
 * @file `places-utils` の回帰テスト。
 * Places API の取得失敗レコードは `{ placeId:'', lat:0, lng:0, fetchError }` として
 * キャッシュされるため、単純な null チェックでは「座標あり」と誤判定して
 * 地図の (0,0) にマーカーが立ってしまう。その判定を防げていることを検証する。
 */
import { describe, expect, it } from 'vitest';
import { Restaurant } from '@shared/models/restaurant';
import { PlacesInfo } from '@shared/models/places';
import { hasValidLocation, locationOf } from './places-utils';

function makeRestaurant(places?: PlacesInfo): Restaurant {
  return { id: '1', name: 'A店', area: '新宿', genres: [], moods: [], places };
}

function makePlaces(overrides: Partial<PlacesInfo> = {}): PlacesInfo {
  return {
    placeId: 'p1',
    lat: 35.68,
    lng: 139.76,
    types: [],
    fetchedAt: '2026-08-11T00:00:00.000Z',
    ...overrides,
  };
}

describe('hasValidLocation', () => {
  it('有効な座標を持つ店は true', () => {
    expect(hasValidLocation(makeRestaurant(makePlaces()))).toBe(true);
  });

  it('Places 情報が無い店は false', () => {
    expect(hasValidLocation(makeRestaurant(undefined))).toBe(false);
  });

  it('取得に失敗した店（fetchError あり）は false', () => {
    const places = makePlaces({ placeId: '', lat: 0, lng: 0, fetchError: '見つかりませんでした' });
    expect(hasValidLocation(makeRestaurant(places))).toBe(false);
  });

  it('fetchError が無くても座標が (0,0) なら false', () => {
    expect(hasValidLocation(makeRestaurant(makePlaces({ lat: 0, lng: 0 })))).toBe(false);
  });

  it('緯度・経度が数値でない（NaN）なら false', () => {
    expect(hasValidLocation(makeRestaurant(makePlaces({ lat: NaN })))).toBe(false);
  });

  it('片方だけが 0 の座標は有効（赤道・グリニッジ子午線上の実在店舗）', () => {
    expect(hasValidLocation(makeRestaurant(makePlaces({ lat: 0, lng: 139.76 })))).toBe(true);
  });
});

describe('locationOf', () => {
  it('有効な座標を持つ店は lat/lng を返す', () => {
    expect(locationOf(makeRestaurant(makePlaces()))).toEqual({ lat: 35.68, lng: 139.76 });
  });

  it('取得失敗の店は null を返す（地図を描画させない）', () => {
    const places = makePlaces({ lat: 0, lng: 0, fetchError: 'エラー' });
    expect(locationOf(makeRestaurant(places))).toBeNull();
  });
});
