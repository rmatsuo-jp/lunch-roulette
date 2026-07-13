/**
 * @file Google Places API (New, v1) で店舗情報を取得するサービス。
 * `places:searchText` を1回だけ呼び、上位1件を PlacesInfo に変換する。
 * 失敗時も例外は投げず、fetchError を詰めた結果として返す（呼び出し側の分岐を単純化するため）。
 */
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { Restaurant } from '@shared/models/restaurant';
import { OpeningPeriod, PlacesInfo } from '@shared/models/places';
import { SettingsStore } from './settings-store';

const SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText';

/** 取得したいフィールドのみを指定してコストを抑える。 */
const FIELD_MASK = [
  'places.id',
  'places.location',
  'places.types',
  'places.rating',
  'places.userRatingCount',
  'places.priceLevel',
  'places.formattedAddress',
  'places.regularOpeningHours.weekdayDescriptions',
  'places.regularOpeningHours.periods',
].join(',');

interface ApiTimePoint {
  day: number;
  hour: number;
  minute: number;
}

interface SearchTextResponse {
  places?: Array<{
    id: string;
    location?: { latitude: number; longitude: number };
    types?: string[];
    rating?: number;
    userRatingCount?: number;
    priceLevel?: string;
    formattedAddress?: string;
    regularOpeningHours?: {
      weekdayDescriptions?: string[];
      periods?: Array<{ open: ApiTimePoint; close?: ApiTimePoint }>;
    };
  }>;
}

@Injectable({ providedIn: 'root' })
export class PlacesEnrichment {
  private http = inject(HttpClient);
  private settings = inject(SettingsStore);

  /**
   * 店名＋エリアで検索し、最有力候補を PlacesInfo として返す。
   * API キー未設定時や通信失敗時は fetchError を持つ PlacesInfo を返す。
   */
  async enrich(restaurant: Restaurant): Promise<PlacesInfo> {
    const fetchedAt = new Date().toISOString();
    const apiKey = this.settings.googleMapsApiKey() || environment.googleMapsApiKey;
    if (!apiKey) {
      return this.errorResult(fetchedAt, '設定画面で Google Maps API キーを登録してください');
    }

    try {
      const res = await firstValueFrom(
        this.http.post<SearchTextResponse>(
          SEARCH_URL,
          { textQuery: `${restaurant.name} ${restaurant.area}` },
          {
            headers: {
              'X-Goog-Api-Key': apiKey,
              'X-Goog-FieldMask': FIELD_MASK,
            },
          },
        ),
      );

      const place = res.places?.[0];
      if (!place || !place.location) {
        return this.errorResult(fetchedAt, '該当する店舗が見つかりませんでした');
      }

      return {
        placeId: place.id,
        lat: place.location.latitude,
        lng: place.location.longitude,
        types: place.types ?? [],
        rating: place.rating,
        userRatingsTotal: place.userRatingCount,
        priceLevel: this.parsePriceLevel(place.priceLevel),
        address: place.formattedAddress,
        openingHoursText: place.regularOpeningHours?.weekdayDescriptions,
        openingPeriods: this.parsePeriods(place.regularOpeningHours?.periods),
        fetchedAt,
      };
    } catch (e) {
      return this.errorResult(fetchedAt, this.describeError(e));
    }
  }

  private errorResult(fetchedAt: string, message: string): PlacesInfo {
    return { placeId: '', lat: 0, lng: 0, types: [], fetchedAt, fetchError: message };
  }

  private parsePriceLevel(level?: string): number | undefined {
    // v1 は "PRICE_LEVEL_MODERATE" のような列挙値を返すため、末尾の段階を数値化する
    const order = [
      'PRICE_LEVEL_FREE',
      'PRICE_LEVEL_INEXPENSIVE',
      'PRICE_LEVEL_MODERATE',
      'PRICE_LEVEL_EXPENSIVE',
      'PRICE_LEVEL_VERY_EXPENSIVE',
    ];
    const idx = level ? order.indexOf(level) : -1;
    return idx >= 0 ? idx : undefined;
  }

  /**
   * v1 の periods を OpeningPeriod[] に変換する。
   * close が無いエントリ（24時間営業）は判定を単純化するため対象外とする。
   */
  private parsePeriods(
    periods?: Array<{ open: ApiTimePoint; close?: ApiTimePoint }>,
  ): OpeningPeriod[] | undefined {
    if (!periods) return undefined;
    return periods
      .filter((p) => p.close)
      .map((p) => ({
        openDay: p.open.day,
        openHour: p.open.hour,
        openMinute: p.open.minute,
        closeDay: p.close!.day,
        closeHour: p.close!.hour,
        closeMinute: p.close!.minute,
      }));
  }

  private describeError(e: unknown): string {
    if (e instanceof Error) return e.message;
    return '通信中にエラーが発生しました';
  }
}
