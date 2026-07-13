/**
 * @file 飲食店データのストア（localStorage 永続化）。
 * - signal で状態を保持し、変更時に localStorage へ自動保存する
 * - エリア / ジャンル / 気分 の一覧を派生 signal で提供（フィルタ UI 用）
 * クラウド同期（Google ログイン時）は RestaurantSyncService が本ストアを監視して行う。
 * 削除は物理削除ではなく deleted フラグ（tombstone）で表現し、複数端末へ伝播できるようにする。
 * `restaurants` は削除済みを除いた表示用の一覧、`allRestaurants` は削除済みを含む全件
 * （同期処理が tombstone を突き合わせるために使う）。
 */
import { Injectable, computed, effect, signal } from '@angular/core';
import { Restaurant, RestaurantData } from '@shared/models/restaurant';
import { readJson, writeJson } from '@core/storage';

const STORAGE_KEY = 'lunch-roulette.data.v1';
const RECENT_PICKS_KEY = 'lunch-roulette.recent-picks.v1';
/** 直近履歴として保持する最大件数（「おすすめ」の被り回避判定に使う）。 */
const RECENT_PICKS_LIMIT = 5;

@Injectable({ providedIn: 'root' })
export class RestaurantStore {
  /** 全店データ（削除済み＝ deleted:true を含む）。永続化・クラウド同期の対象。 */
  private readonly _restaurants = signal<Restaurant[]>(this.load());

  /** 削除済みを含む全件（クラウド同期の tombstone 突き合わせ用）。 */
  readonly allRestaurants = this._restaurants.asReadonly();

  /** 表示用の店データ（削除済みを除く）。 */
  readonly restaurants = computed(() => this._restaurants().filter((r) => !r.deleted));

  /** 直近に選ばれた店の ID（先頭が最新、最大 RECENT_PICKS_LIMIT 件）。 */
  readonly recentPickedIds = signal<string[]>(this.loadRecentPicks());

  /** 登録済みのエリア一覧（重複なし・昇順） */
  readonly areas = computed(() => this.distinct(this.restaurants().map((r) => r.area)));

  /** 付与済みのジャンル一覧 */
  readonly genres = computed(() => this.distinct(this.restaurants().flatMap((r) => r.genres)));

  /** 付与済みの気分一覧 */
  readonly moods = computed(() => this.distinct(this.restaurants().flatMap((r) => r.moods)));

  constructor() {
    // 変更を localStorage へ永続化
    effect(() => this.save(this._restaurants()));
    effect(() => this.saveRecentPicks(this.recentPickedIds()));
  }

  /** 「今日のおすすめ」「ランダム」で選ばれた店を直近履歴の先頭に記録する。 */
  recordPicked(id: string): void {
    this.recentPickedIds.update((ids) => [id, ...ids.filter((x) => x !== id)].slice(0, RECENT_PICKS_LIMIT));
  }

  /**
   * CSV 取り込み等で得た店をマージ追加する。
   * 同一エリア内で URL（無ければ店名）が一致するものは重複とみなしスキップ。
   * @returns 実際に追加した件数
   */
  addMany(incoming: Restaurant[]): number {
    const current = this.restaurants();
    const seen = new Set(current.map((r) => this.dedupeKey(r)));
    const added: Restaurant[] = [];
    for (const r of incoming) {
      const key = this.dedupeKey(r);
      if (seen.has(key)) continue;
      seen.add(key);
      added.push(r);
    }
    if (added.length > 0) {
      this._restaurants.set([...this._restaurants(), ...added]);
    }
    return added.length;
  }

  /** 1件更新（タグ編集など）。 */
  update(id: string, patch: Partial<Restaurant>): void {
    this._restaurants.update((list) =>
      list.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    );
  }

  /** 1件削除。クラウド同期で他端末へ伝播できるよう、物理削除ではなく deleted フラグを立てる。 */
  remove(id: string): void {
    this._restaurants.update((list) =>
      list.map((r) => (r.id === id ? { ...r, deleted: true } : r)),
    );
  }

  /** 全削除。1件削除と同様、全件に deleted フラグを立てる（tombstone として同期される）。 */
  clear(): void {
    this._restaurants.update((list) => list.map((r) => ({ ...r, deleted: true })));
  }

  /** クラウド同期のマージ結果で全件（削除済み含む）を置き換える。RestaurantSyncService 専用。 */
  replaceAll(list: Restaurant[]): void {
    this._restaurants.set(list);
  }

  /** JSON エクスポート用の文字列を返す。 */
  toJson(): string {
    const data: RestaurantData = { version: 1, restaurants: this.restaurants() };
    return JSON.stringify(data, null, 2);
  }

  /**
   * JSON 文字列を取り込む（バックアップ復元）。既存データは置き換え。
   * @returns 取り込んだ件数
   */
  importJson(json: string): number {
    const parsed = JSON.parse(json) as RestaurantData | Restaurant[];
    const list = Array.isArray(parsed) ? parsed : parsed.restaurants;
    if (!Array.isArray(list)) throw new Error('不正な JSON 形式です');
    const normalized = list.map((r) => this.normalize(r));
    this._restaurants.set(normalized);
    return normalized.length;
  }

  // --- 内部ヘルパ ---

  private dedupeKey(r: Restaurant): string {
    const id = (r.url?.trim() || r.name.trim()).toLowerCase();
    return `${r.area.trim().toLowerCase()}::${id}`;
  }

  private distinct(values: string[]): string[] {
    return [...new Set(values.map((v) => v.trim()).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, 'ja'),
    );
  }

  private normalize(r: Partial<Restaurant>): Restaurant {
    return {
      id: r.id || crypto.randomUUID(),
      name: r.name ?? '',
      note: r.note,
      url: r.url,
      area: r.area ?? '未分類',
      genres: Array.isArray(r.genres) ? r.genres : [],
      moods: Array.isArray(r.moods) ? r.moods : [],
      places: r.places,
      deleted: r.deleted,
    };
  }

  private load(): Restaurant[] {
    const data = readJson<RestaurantData>(STORAGE_KEY, { version: 1, restaurants: [] });
    return Array.isArray(data.restaurants) ? data.restaurants.map((r) => this.normalize(r)) : [];
  }

  private save(restaurants: Restaurant[]): void {
    const data: RestaurantData = { version: 1, restaurants };
    writeJson(STORAGE_KEY, data);
  }

  private loadRecentPicks(): string[] {
    const ids = readJson<unknown>(RECENT_PICKS_KEY, []);
    return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : [];
  }

  private saveRecentPicks(ids: string[]): void {
    writeJson(RECENT_PICKS_KEY, ids);
  }
}
