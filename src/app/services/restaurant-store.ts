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
import { readJson, readJsonResult, writeJson, writeRaw } from '@core/storage';

const STORAGE_KEY = 'lunch-roulette.data.v1';
const RECENT_PICKS_KEY = 'lunch-roulette.recent-picks.v1';
/** 直近履歴として保持する最大件数（「おすすめ」の被り回避判定に使う）。 */
const RECENT_PICKS_LIMIT = 5;

@Injectable({ providedIn: 'root' })
export class RestaurantStore {
  /**
   * 永続化まわりの警告メッセージ（正常時は null）。
   * 保存失敗（容量超過等）やデータ破損を UI に伝えるためのもの。
   * 黙って握り潰すと、ユーザーは保存されたと誤解したままデータを失う。
   * `load()` から書き込むため、他のフィールドより先に初期化する必要がある。
   */
  readonly storageWarning = signal<string | null>(null);

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
    this.recentPickedIds.update((ids) =>
      [id, ...ids.filter((x) => x !== id)].slice(0, RECENT_PICKS_LIMIT),
    );
  }

  /**
   * CSV 取り込み等で得た店をマージ追加する。
   * 同一エリア内で URL（無ければ店名）が一致するものは重複とみなしスキップ。
   * 削除済み（tombstone）の店と一致した場合は、新規追加ではなく既存 id を復活させる。
   * 表示中の店だけで重複判定すると、削除済みの店を再取り込みしたときに
   * 同じキーの新旧2レコードが並存し、クラウド同期で削除が復活したり二重表示になるため。
   * @returns 実際に追加・復活させた件数
   */
  addMany(incoming: Restaurant[]): number {
    // 削除済みを含む全件で重複判定する
    const existing = new Map(this._restaurants().map((r) => [this.dedupeKey(r), r]));
    const revived = new Map<string, Restaurant>();
    const added: Restaurant[] = [];

    for (const r of incoming) {
      const key = this.dedupeKey(r);
      const found = existing.get(key);
      if (found) {
        // 生きているレコードとの重複はスキップ。削除済みなら取り込み内容で復活させる。
        if (!found.deleted || revived.has(found.id)) continue;
        revived.set(found.id, this.touch({ ...found, ...r, id: found.id, deleted: false }));
        continue;
      }
      existing.set(key, r);
      added.push(this.touch(r));
    }

    if (added.length === 0 && revived.size === 0) return 0;
    this._restaurants.set([...this._restaurants().map((r) => revived.get(r.id) ?? r), ...added]);
    return added.length + revived.size;
  }

  /** 1件更新（タグ編集など）。 */
  update(id: string, patch: Partial<Restaurant>): void {
    this._restaurants.update((list) =>
      list.map((r) => (r.id === id ? this.touch({ ...r, ...patch }) : r)),
    );
  }

  /** 1件削除。クラウド同期で他端末へ伝播できるよう、物理削除ではなく deleted フラグを立てる。 */
  remove(id: string): void {
    this._restaurants.update((list) =>
      list.map((r) => (r.id === id ? this.touch({ ...r, deleted: true }) : r)),
    );
  }

  /** 全削除。1件削除と同様、全件に deleted フラグを立てる（tombstone として同期される）。 */
  clear(): void {
    this._restaurants.update((list) => list.map((r) => this.touch({ ...r, deleted: true })));
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
    // 復元はユーザーの明示的な操作なので、クラウド側の内容に上書きされないよう
    // 更新時刻を現在時刻で打ち直す（旧バックアップは updatedAt が 0 のため、
    // そのままだとクラウド側の古い内容に負けてしまう）。
    const normalized = list.map((r) => this.touch(this.normalize(r)));
    // 取り込み対象に含まれない削除済みレコード（tombstone）は残す。
    // 消すと他端末で削除した店が復活してしまうため。
    const importedIds = new Set(normalized.map((r) => r.id));
    const keptTombstones = this._restaurants().filter((r) => r.deleted && !importedIds.has(r.id));
    this._restaurants.set([...normalized, ...keptTombstones]);
    return normalized.length;
  }

  // --- 内部ヘルパ ---

  /**
   * 最終更新時刻を現在時刻で打ち直す。
   * クラウド同期はこの値で「どちらの端末の編集が新しいか」を判定するため、
   * ローカルの変更操作（追加・更新・削除）はすべてここを通す必要がある。
   */
  private touch(r: Restaurant): Restaurant {
    return { ...r, updatedAt: Date.now() };
  }

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
      // 旧データ（updatedAt 導入前）は 0 扱いにし、更新済みの側に負けるようにする
      updatedAt: typeof r.updatedAt === 'number' && Number.isFinite(r.updatedAt) ? r.updatedAt : 0,
    };
  }

  /**
   * localStorage から読み込む。JSON が壊れていた場合は、空データで上書きしてしまう前に
   * 生の文字列を別キーへ退避し、警告を立てる（そのまま進むと復旧手段が無くなるため）。
   */
  private load(): Restaurant[] {
    const result = readJsonResult<RestaurantData>(STORAGE_KEY, { version: 1, restaurants: [] });
    if (!result.ok) {
      const backupKey = `${STORAGE_KEY}.corrupt-${Date.now()}`;
      const saved = result.raw != null && writeRaw(backupKey, result.raw);
      this.storageWarning.set(
        saved
          ? `保存データを読み込めませんでした。壊れたデータは ${backupKey} に退避しました。`
          : '保存データを読み込めませんでした。データを復元できません。',
      );
      return [];
    }
    const data = result.value;
    return Array.isArray(data.restaurants) ? data.restaurants.map((r) => this.normalize(r)) : [];
  }

  private save(restaurants: Restaurant[]): void {
    const data: RestaurantData = { version: 1, restaurants };
    if (writeJson(STORAGE_KEY, data)) return;
    this.storageWarning.set(
      'データを保存できませんでした（ブラウザの保存容量超過、またはプライベートブラウズの可能性があります）。',
    );
  }

  private loadRecentPicks(): string[] {
    const ids = readJson<unknown>(RECENT_PICKS_KEY, []);
    return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : [];
  }

  private saveRecentPicks(ids: string[]): void {
    writeJson(RECENT_PICKS_KEY, ids);
  }
}
