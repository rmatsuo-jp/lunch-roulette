/**
 * @file Google Places API (New, v1) で店舗情報を取得するサービス。
 * `places:searchText` を1回だけ呼び、上位1件を PlacesInfo に変換する。
 * 失敗時も例外は投げず、fetchError を詰めた結果として返す（呼び出し側の分岐を単純化するため）。
 */
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom, timeout } from 'rxjs';
import { environment } from '../../environments/environment';
import { Restaurant } from '@shared/models/restaurant';
import { OpeningPeriod, PlacesInfo } from '@shared/models/places';
import { SettingsStore } from './settings-store';

const SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText';

/** 1リクエストのタイムアウト（ミリ秒）。応答が返らないままボタンが固まるのを防ぐ。 */
const REQUEST_TIMEOUT_MS = 15_000;

/** 同時に投げる Places リクエストの上限。連打による同時大量発行とクォータ枯渇を防ぐ。 */
const MAX_CONCURRENT_REQUESTS = 3;

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
  places?: {
    id: string;
    location?: { latitude: number; longitude: number };
    types?: string[];
    rating?: number;
    userRatingCount?: number;
    priceLevel?: string;
    formattedAddress?: string;
    regularOpeningHours?: {
      weekdayDescriptions?: string[];
      periods?: { open: ApiTimePoint; close?: ApiTimePoint }[];
    };
  }[];
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
    // 同時実行数を絞る。ボタン連打でリクエストが無制限に並行発行されると
    // クォータを一気に消費し、429 が多発するため。
    // 空きがある場合は await せずそのまま進む（待たせる理由がないうえ、
    // 無条件に await するとリクエストの発行が1マイクロタスク遅れる）。
    if (!this.tryAcquireSlot()) await this.waitForSlot();
    try {
      return await this.enrichInternal(restaurant);
    } finally {
      this.releaseSlot();
    }
  }

  private async enrichInternal(restaurant: Restaurant): Promise<PlacesInfo> {
    const fetchedAt = new Date().toISOString();
    const apiKey = this.settings.googleMapsApiKey() || environment.googleMapsApiKey;
    if (!apiKey) {
      return this.errorResult(fetchedAt, '設定画面で Google Maps API キーを登録してください');
    }

    try {
      const res = await firstValueFrom(
        this.http
          .post<SearchTextResponse>(
            SEARCH_URL,
            { textQuery: `${restaurant.name} ${restaurant.area}` },
            {
              headers: {
                'X-Goog-Api-Key': apiKey,
                'X-Goog-FieldMask': FIELD_MASK,
              },
            },
          )
          .pipe(timeout(REQUEST_TIMEOUT_MS)),
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
   * close が無いエントリは24時間営業を表すため、捨てずに alwaysOpen として保持する
   * （捨てると openingPeriods が空になり、24時間営業店が営業時間フィルタで
   * 「判定不能」として除外されてしまう）。
   */
  private parsePeriods(
    periods?: { open: ApiTimePoint; close?: ApiTimePoint }[],
  ): OpeningPeriod[] | undefined {
    if (!periods) return undefined;
    return periods.map((p) => {
      const base = {
        openDay: p.open.day,
        openHour: p.open.hour,
        openMinute: p.open.minute,
      };
      if (!p.close) return { ...base, alwaysOpen: true };
      return {
        ...base,
        closeDay: p.close.day,
        closeHour: p.close.hour,
        closeMinute: p.close.minute,
      };
    });
  }

  /**
   * エラーの内容をユーザーが次の行動を取れる日本語メッセージに変換する。
   * HttpErrorResponse の既定メッセージ（"Http failure response for ..."）は
   * 原因（キー不正・クォータ超過など）が分からず、ユーザーが対処できないため。
   */
  private describeError(e: unknown): string {
    if (e instanceof HttpErrorResponse) {
      switch (e.status) {
        case 0:
          return 'ネットワークに接続できませんでした';
        case 400:
          return 'リクエストが不正です（API キーの設定を確認してください）';
        case 401:
        case 403:
          return 'API キーが無効か、Places API の利用が許可されていません（キーの制限設定を確認してください）';
        case 429:
          return 'API の利用上限に達しました。しばらく待ってから再試行してください';
        default:
          if (e.status >= 500)
            return 'Google 側で一時的なエラーが発生しました。時間をおいて再試行してください';
          return `通信エラーが発生しました（HTTP ${e.status}）`;
      }
    }
    // rxjs の timeout() は TimeoutError（name で判別する）
    if (e instanceof Error && e.name === 'TimeoutError') {
      return '応答がありませんでした（タイムアウト）。時間をおいて再試行してください';
    }
    if (e instanceof Error) return e.message;
    return '通信中にエラーが発生しました';
  }

  // ── 同時実行数の制限 ───────────────────────────────────────────────
  private activeRequests = 0;
  private readonly waiting: (() => void)[] = [];

  /** 空きがあれば即座にスロットを確保する。確保できたら true。 */
  private tryAcquireSlot(): boolean {
    if (this.activeRequests >= MAX_CONCURRENT_REQUESTS) return false;
    this.activeRequests++;
    return true;
  }

  /** 空きスロットが出るまで待つ（先着順）。 */
  private waitForSlot(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.waiting.push(() => {
        this.activeRequests++;
        resolve();
      });
    });
  }

  /** スロットを解放し、待機中の先頭を1件進める。 */
  private releaseSlot(): void {
    this.activeRequests--;
    this.waiting.shift()?.();
  }
}
