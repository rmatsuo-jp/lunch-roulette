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
import { effect, Injectable, inject } from '@angular/core';
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
        this.syncFromCloud(user.uid).catch(err =>
          console.error('[RestaurantSyncService] クラウド同期に失敗:', err)
        );
      }
    });

    // ログイン中のローカル変更（追加・編集・削除）を検知し、変更分のみクラウドへ自動反映する。
    effect(() => {
      const list = this.store.allRestaurants();
      const uid = this.auth.user()?.uid;
      if (!uid || this.suppressPush) return;
      const changed = this.diffChanged(list);
      if (changed.length === 0) return;
      this.pushChanged(uid, changed).catch(err =>
        console.error('[RestaurantSyncService] 自動同期(push)に失敗:', err)
      );
    });
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
  // 呼び出し後、次回比較のために `lastSynced` を `list` のスナップショットで更新する。
  private diffChanged(list: Restaurant[]): Restaurant[] {
    const previous = this.lastSynced;
    const changed = previous
      ? list.filter(r => JSON.stringify(previous.get(r.id)) !== JSON.stringify(r))
      : list; // 初回（まだ同期スナップショットが無い）は全件を変更扱いにする
    this.lastSynced = new Map(list.map(r => [r.id, r]));
    return changed;
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
    try {
      const snap = await getDocs(this.restaurantsCol(uid));
      const cloud = snap.docs.map(d => d.data() as Restaurant);

      const local = this.store.allRestaurants();
      const localById = new Map(local.map(r => [r.id, r]));
      const cloudById = new Map(cloud.map(r => [r.id, r]));

      // 1. union を取り、同一 id は deleted を OR してマージ
      const allIds = new Set([...localById.keys(), ...cloudById.keys()]);
      const merged: Restaurant[] = [...allIds].map(id => {
        const l = localById.get(id);
        const c = cloudById.get(id);
        const base = l ?? c!;
        const deleted = Boolean(l?.deleted) || Boolean(c?.deleted);
        return deleted ? { ...base, deleted: true } : { ...base, deleted: false };
      });
      this.store.replaceAll(merged);

      // 2. クラウドと食い違うローカル分（未登録、または deleted 状態が異なる）を push
      const toPush = merged.filter(r => {
        const c = cloudById.get(r.id);
        return !c || Boolean(c.deleted) !== Boolean(r.deleted);
      });
      await Promise.all(
        toPush.map(r => setDoc(this.restaurantDoc(uid, r.id), this.toDocData(r)))
      );

      // このメソッド終了後、自動 push effect が発火した際に merged 全件を「変更あり」と
      // 誤検知しないよう、同期済みスナップショットとして merged を記録しておく。
      this.lastSynced = new Map(merged.map(r => [r.id, r]));
    } finally {
      this.suppressPush = false;
    }
  }
}
