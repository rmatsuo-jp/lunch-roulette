/**
 * @file 飲食店データの Firestore 双方向同期を担うサービス。
 * RestaurantStore の signal を読み書きし、ログイン状態（AuthService）を監視して、
 * ログインした瞬間にクラウドと双方向同期する。以降のローカル変更（追加・編集・削除）も
 * effect() で自動検知し、ログイン中であればクラウドへ反映する。
 * 削除は物理削除せず deleted フラグ（tombstone）で表現し、削除も多端末へ伝播させる。
 *
 * 自動 push は「直前に同期したスナップショットとの差分」のみを Firestore へ書き込む
 * （diff-basedスナップショット方式）。タグ1件の編集のような1件だけの変更でも
 * 全件 setDoc していた従来実装は、店舗数に比例した無駄な書き込み（コスト・レイテンシ）を
 * 生んでいたため、変更があったドキュメントのみを書き込むように変更している。
 */
import { effect, Injectable, inject, signal } from '@angular/core';
import { collection, doc, getDocs, setDoc } from 'firebase/firestore';
import { Restaurant } from '@shared/models/restaurant';
import { AuthService } from '@core/firebase/auth.service';
import { firestore } from '@core/firebase/firebase.init';
import { RestaurantStore } from './restaurant-store';

@Injectable({ providedIn: 'root' })
export class RestaurantSyncService {
  private auth = inject(AuthService);
  private store = inject(RestaurantStore);

  // syncFromCloud() によるローカル書き戻し中は、下の自動 push effect を発火させないための抑制フラグ。
  private suppressPush = false;

  // 直前にクラウドと同期済みの内容（id -> Restaurant）。自動 push 時にこれとの差分だけを書き込む。
  // null は「まだ一度も同期していない（syncFromCloud未実行、またはログインユーザー切替直後）」を表す。
  private lastSynced: Map<string, Restaurant> | null = null;

  /** 直近の同期エラー（正常時は null）。console だけだとユーザーが同期済みと誤解するため公開する。 */
  readonly syncError = signal<string | null>(null);

  constructor() {
    // ログイン状態を監視し、ログインした瞬間にクラウドと双方向同期する。
    // ログアウト時（user が null）はローカルキャッシュをそのまま残す。
    // ユーザーが切り替わった場合は差分スナップショットをリセットし、新ユーザーの内容と誤って比較しないようにする。
    let lastUid: string | null = null;
    effect(() => {
      const user = this.auth.user();
      if (user?.uid !== lastUid) {
        lastUid = user?.uid ?? null;
        this.lastSynced = null;
      }
      if (user) {
        this.syncFromCloud(user.uid).catch(err => this.reportError('クラウド同期に失敗', err));
      }
    });

    // ログイン中のローカル変更（追加・編集・削除）を検知し、変更分のみクラウドへ自動反映する。
    effect(() => {
      const list = this.store.allRestaurants();
      const uid = this.auth.user()?.uid;
      if (!uid || this.suppressPush) return;
      this.pushLocalChanges(uid, list);
    });
  }

  /** `list` のうち未同期のものをクラウドへ書き込む（fire-and-forget）。 */
  private pushLocalChanges(uid: string, list: Restaurant[]): void {
    const changed = this.changedSince(list);
    if (changed.length === 0) return;
    this.pushChanged(uid, changed)
      .then(() => {
        // 書き込みが成功して初めて「同期済み」と記録する。
        // 送信前に記録すると、失敗した分が二度と再送されなくなる。
        this.markSynced(list);
        this.syncError.set(null);
      })
      .catch(err => this.reportError('自動同期(push)に失敗', err));
  }

  private reportError(context: string, err: unknown): void {
    console.error(`[RestaurantSyncService] ${context}:`, err);
    const detail = err instanceof Error ? err.message : String(err);
    this.syncError.set(`${context}しました: ${detail}`);
  }

  // apps/lunch_roulette/users/{uid}/restaurants/{restaurantId} のドキュメント参照を返す。
  private restaurantDoc(uid: string, restaurantId: string) {
    return doc(firestore, 'apps', 'lunch_roulette', 'users', uid, 'restaurants', restaurantId);
  }

  // apps/lunch_roulette/users/{uid}/restaurants コレクション参照を返す
  private restaurantsCol(uid: string) {
    return collection(firestore, 'apps', 'lunch_roulette', 'users', uid, 'restaurants');
  }

  // Firestore は undefined を受け付けないため、値が undefined のフィールドを除外する。
  private toDocData(r: Restaurant): Record<string, unknown> {
    const data: Record<string, unknown> = { ...r };
    for (const key of Object.keys(data)) {
      if (data[key] === undefined) delete data[key];
    }
    return data;
  }

  // `list` のうち `lastSynced` から内容が変わった（または新規の）ものだけを返す。
  // 副作用は持たない（スナップショット更新は書き込み成功後に `markSynced` で行う）。
  private changedSince(list: Restaurant[]): Restaurant[] {
    const previous = this.lastSynced;
    if (!previous) return list; // 初回（まだ同期スナップショットが無い）は全件を変更扱いにする
    return list.filter(r => JSON.stringify(previous.get(r.id)) !== JSON.stringify(r));
  }

  /**
   * ローカルとクラウドのうち、最終更新時刻が新しい側を採用する。
   * 片方しか存在しない場合はその片方。時刻が同じ（または両方とも updatedAt 未設定＝0）の
   * 場合はローカルを優先し、従来どおりの挙動を保つ。
   */
  private pickNewer(local?: Restaurant, cloud?: Restaurant): Restaurant | undefined {
    if (!local) return cloud;
    if (!cloud) return local;
    const localAt = this.updatedAtOf(local);
    const cloudAt = this.updatedAtOf(cloud);
    return cloudAt > localAt ? cloud : local;
  }

  /** 最終更新時刻（未設定・不正値は 0 として扱い、更新済みの側に負けるようにする）。 */
  private updatedAtOf(r: Restaurant): number {
    return typeof r.updatedAt === 'number' && Number.isFinite(r.updatedAt) ? r.updatedAt : 0;
  }

  /**
   * 2件の店データが同一内容かを比較する。
   * Firestore から返るドキュメントはキー順がローカルと一致しないため、
   * キーをソートしたうえで比較する（単純な JSON.stringify 比較だと差分を誤検知する）。
   */
  private sameContent(a: Restaurant, b: Restaurant): boolean {
    const normalize = (r: Restaurant): string => {
      // updatedAt 導入以前に書かれたクラウドドキュメントはフィールド自体を持たないため、
      // 未設定と 0 を同一視しないと全件が「差分あり」と誤判定される。
      const data = this.toDocData({
        ...r,
        deleted: Boolean(r.deleted),
        updatedAt: this.updatedAtOf(r),
      });
      const sorted = Object.keys(data).sort().map(k => [k, data[k]]);
      return JSON.stringify(sorted);
    };
    return normalize(a) === normalize(b);
  }

  /** 与えた内容を「クラウドと同期済み」として記録する。 */
  private markSynced(list: Restaurant[]): void {
    this.lastSynced = new Map(list.map(r => [r.id, r]));
  }

  // 指定した店舗分だけをクラウドへ upsert する（fire-and-forget で呼ばれる想定）。
  private async pushChanged(uid: string, restaurants: Restaurant[]): Promise<void> {
    if (restaurants.length === 0) return;
    await Promise.all(
      restaurants.map(r => setDoc(this.restaurantDoc(uid, r.id), this.toDocData(r)))
    );
  }

  // ログイン直後に呼ぶ双方向同期（tombstone 対応）:
  //   1. ローカルとクラウドを id で突き合わせ、同一 id は deleted の OR を採用（片方でも削除なら削除）。
  //   2. クラウドと状態が食い違うローカル分（未登録 or deleted 状態の差）をクラウドへ push。
  // これにより、削除した端末の tombstone が他端末へ伝播し、未削除端末からの再 push による復活を防ぐ。
  async syncFromCloud(uid: string): Promise<void> {
    this.suppressPush = true;
    let succeeded = false;
    try {
      const snap = await getDocs(this.restaurantsCol(uid));
      const cloud = this.parseCloudDocs(snap.docs);

      const local = this.store.allRestaurants();
      const localById = new Map(local.map(r => [r.id, r]));
      const cloudById = new Map(cloud.map(r => [r.id, r]));

      // 1. union を取り、同一 id は updatedAt の新しい側を採用してマージ
      const allIds = new Set([...localById.keys(), ...cloudById.keys()]);
      const merged: Restaurant[] = [];
      for (const id of allIds) {
        const l = localById.get(id);
        const c = cloudById.get(id);
        const base = this.pickNewer(l, c);
        if (!base) continue; // id は必ずどちらかに存在するが、型を絞るためのガード
        // 削除は片方でも削除されていれば削除（tombstone を復活させない）。
        // 内容と違い、削除は「取り消し」より「伝播」を優先するほうが事故が少ない。
        const deleted = Boolean(l?.deleted) || Boolean(c?.deleted);
        merged.push({ ...base, deleted });
      }
      this.store.replaceAll(merged);

      // 2. クラウドと内容が食い違うローカル分（未登録・deleted 状態・その他フィールド）を push。
      // 内容差分も push しないと、同期中に編集した分やローカル優先マージの結果が
      // クラウドへ反映されないまま「同期済み」として記録されてしまう。
      const toPush = merged.filter(r => {
        const c = cloudById.get(r.id);
        return !c || !this.sameContent(c, r);
      });
      await Promise.all(
        toPush.map(r => setDoc(this.restaurantDoc(uid, r.id), this.toDocData(r)))
      );

      // このメソッド終了後、自動 push effect が発火した際に merged 全件を「変更あり」と
      // 誤検知しないよう、同期済みスナップショットとして merged を記録しておく。
      this.markSynced(merged);
      this.syncError.set(null);
      succeeded = true;
    } finally {
      this.suppressPush = false;
      // suppressPush 中に起きたローカル変更は push effect が素通りしているため、
      // ここで現在値を再評価して取りこぼしを回収する。
      // （これをしないと「同期済み」と誤記録された変更が二度と送信されない。）
      if (succeeded) this.pushLocalChanges(uid, this.store.allRestaurants());
    }
  }

  /**
   * Firestore のドキュメントを Restaurant として取り込む。
   * id を持たない不正なドキュメントは、`doc(..., undefined)` で例外になるため除外する。
   * ドキュメント ID を正としてフィールド側の id と食い違う場合も揃える。
   */
  private parseCloudDocs(
    docs: Array<{ id?: string; data: () => unknown }>,
  ): Restaurant[] {
    const result: Restaurant[] = [];
    for (const d of docs) {
      const data = d.data() as Partial<Restaurant> | undefined;
      if (!data || typeof data !== 'object') continue;
      const id = typeof data.id === 'string' && data.id ? data.id : d.id;
      if (!id) continue;
      result.push({ ...(data as Restaurant), id });
    }
    return result;
  }
}
