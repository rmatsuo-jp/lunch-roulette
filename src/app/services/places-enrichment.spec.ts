/**
 * @file `PlacesEnrichment` の回帰テスト。
 * 特に `parsePeriods` が「close を持たない period（＝24時間営業）」を捨てないことを検証する。
 * 捨てると openingPeriods が空配列になり、24時間営業店が営業時間フィルタで
 * 「判定不能」として除外されてしまうため。
 */
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { Restaurant } from '@shared/models/restaurant';
import { PlacesEnrichment } from './places-enrichment';
import { SettingsStore } from './settings-store';

const SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText';

function makeRestaurant(): Restaurant {
  return { id: '1', name: 'A店', area: '新宿', genres: [], moods: [] };
}

describe('PlacesEnrichment', () => {
  let service: PlacesEnrichment;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    // API キー未設定だと通信前に打ち切られるため、テスト用のキーを入れておく
    TestBed.inject(SettingsStore).setGoogleMapsApiKey('test-key');
    service = TestBed.inject(PlacesEnrichment);
    httpMock = TestBed.inject(HttpTestingController);
  });

  /** enrich() を呼び、モックのレスポンスを返す。 */
  async function enrichWith(body: Record<string, unknown>) {
    const promise = service.enrich(makeRestaurant());
    const req = httpMock.expectOne(SEARCH_URL);
    req.flush(body);
    return promise;
  }

  it('close を持たない period（24時間営業）を捨てずに alwaysOpen として保持する', async () => {
    const info = await enrichWith({
      places: [
        {
          id: 'p1',
          location: { latitude: 35.68, longitude: 139.76 },
          regularOpeningHours: { periods: [{ open: { day: 0, hour: 0, minute: 0 } }] },
        },
      ],
    });

    expect(info.openingPeriods).toHaveLength(1);
    expect(info.openingPeriods?.[0]).toMatchObject({ openDay: 0, alwaysOpen: true });
  });

  it('通常の period は開店・閉店の両方を保持する', async () => {
    const info = await enrichWith({
      places: [
        {
          id: 'p1',
          location: { latitude: 35.68, longitude: 139.76 },
          regularOpeningHours: {
            periods: [
              { open: { day: 1, hour: 11, minute: 0 }, close: { day: 1, hour: 15, minute: 0 } },
            ],
          },
        },
      ],
    });

    expect(info.openingPeriods?.[0]).toEqual({
      openDay: 1,
      openHour: 11,
      openMinute: 0,
      closeDay: 1,
      closeHour: 15,
      closeMinute: 0,
    });
  });

  it('24時間営業と通常営業が混在しても両方を残す', async () => {
    const info = await enrichWith({
      places: [
        {
          id: 'p1',
          location: { latitude: 35.68, longitude: 139.76 },
          regularOpeningHours: {
            periods: [
              { open: { day: 1, hour: 11, minute: 0 }, close: { day: 1, hour: 15, minute: 0 } },
              { open: { day: 2, hour: 0, minute: 0 } },
            ],
          },
        },
      ],
    });

    expect(info.openingPeriods).toHaveLength(2);
  });

  it('該当店舗が無い場合は fetchError を持つ結果を返す（例外は投げない）', async () => {
    const info = await enrichWith({ places: [] });

    expect(info.fetchError).toBeTruthy();
    expect(info.placeId).toBe('');
  });

  it('利用上限（429）は待って再試行するよう促すメッセージを返す', async () => {
    const promise = service.enrich(makeRestaurant());
    httpMock
      .expectOne(SEARCH_URL)
      .flush('rate limited', { status: 429, statusText: 'Too Many Requests' });

    const info = await promise;
    expect(info.fetchError).toContain('利用上限');
  });

  it('キーが無効（403）なら制限設定の確認を促すメッセージを返す', async () => {
    const promise = service.enrich(makeRestaurant());
    httpMock.expectOne(SEARCH_URL).flush('forbidden', { status: 403, statusText: 'Forbidden' });

    const info = await promise;
    // 既定の "Http failure response for ..." では原因が分からず対処できない
    expect(info.fetchError).toContain('API キー');
  });

  it('ネットワーク断（status 0）も日本語のメッセージになる', async () => {
    const promise = service.enrich(makeRestaurant());
    httpMock.expectOne(SEARCH_URL).error(new ProgressEvent('error'));

    const info = await promise;
    expect(info.fetchError).toContain('ネットワーク');
  });

  it('API キー未設定なら通信せず fetchError を返す', async () => {
    TestBed.inject(SettingsStore).clearGoogleMapsApiKey();

    const info = await service.enrich(makeRestaurant());

    expect(info.fetchError).toContain('API キー');
    httpMock.expectNone(SEARCH_URL);
  });
});
