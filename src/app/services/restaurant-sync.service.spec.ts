/**
 * @file `RestaurantSyncService` の回帰テスト。
 * 自動 push の diff-based スナップショット方式（`diffChanged()`）が
 * 「変わったドキュメントだけを書き込む」ことを検証する。
 *
 * Firestore はモジュール直 import（DI 経由でない）ため、`vi.mock()` でモジュールごと差し替える。
 * `firebase.init` は import しただけで `initializeApp()` が走るが、Angular の unit-test システムでは
 * アプリ内モジュールへの `vi.mock()` が使えないため、firebase SDK のパッケージ側をモックしている。
 */
import { Injectable, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '@core/firebase/auth.service';
import { Restaurant } from '@shared/models/restaurant';
import { RestaurantStore } from './restaurant-store';
import { RestaurantSyncService } from './restaurant-sync.service';

// Angular の unit-test システムでは相対パス／パスエイリアスの `vi.mock` が使えないため、
// アプリ内モジュール（firebase.init）ではなく firebase SDK のパッケージ側をモックする。
// これにより firebase.init は実物のまま読み込まれても実際の通信・初期化を行わない。
vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(() => ({ name: 'test-app' })),
}));

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({})),
  GoogleAuthProvider: class {},
  onAuthStateChanged: vi.fn(),
  getRedirectResult: vi.fn(async () => null),
  signInWithPopup: vi.fn(),
  signInWithRedirect: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  initializeFirestore: vi.fn(() => ({ kind: 'firestore' })),
  persistentLocalCache: vi.fn(() => ({})),
  persistentMultipleTabManager: vi.fn(() => ({})),
  // doc(...) の最後の引数が店舗 ID。どの店が書き込まれたか検証できるよう ID を持つ参照を返す。
  doc: vi.fn((_db: unknown, ...path: string[]) => ({ id: path[path.length - 1] })),
  collection: vi.fn(() => ({ kind: 'collection' })),
  getDocs: vi.fn(),
  setDoc: vi.fn(async () => undefined),
}));

// モック後に import しないと実体を掴んでしまうため、型付きで取り出す
const firestoreMock = await import('firebase/firestore');
const getDocsMock = vi.mocked(firestoreMock.getDocs);
const setDocMock = vi.mocked(firestoreMock.setDoc);

/** テスト用の AuthService 代替（user signal だけを持つ）。 */
@Injectable()
class FakeAuthService {
  readonly user = signal<{ uid: string } | null>(null);
}

/** テスト用の Restaurant を組み立てるヘルパー。 */
function makeRestaurant(id: string, overrides: Partial<Restaurant> = {}): Restaurant {
  return { id, name: `店${id}`, area: '新宿', genres: [], moods: [], ...overrides };
}

/** クラウド側のドキュメント一覧を getDocs の戻り値として設定する。 */
function setCloudDocs(list: Restaurant[]): void {
  getDocsMock.mockResolvedValue({
    docs: list.map((r) => ({ data: () => r })),
  } as never);
}

/** 非同期の同期処理と effect のフラッシュをまとめて待つ。 */
async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
    TestBed.tick();
  }
}

describe('RestaurantSyncService', () => {
  let auth: FakeAuthService;
  let store: RestaurantStore;

  /** ローカル初期データを与えたうえでサービスを起動する。 */
  async function startWithLocal(local: Restaurant[]): Promise<void> {
    localStorage.setItem(
      'lunch-roulette.data.v1',
      JSON.stringify({ version: 1, restaurants: local }),
    );
    TestBed.configureTestingModule({
      providers: [FakeAuthService, { provide: AuthService, useExisting: FakeAuthService }],
    });
    auth = TestBed.inject(FakeAuthService);
    store = TestBed.inject(RestaurantStore);
    TestBed.inject(RestaurantSyncService);
    await flush();
  }

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    setCloudDocs([]);
  });

  it('未ログインなら Firestore へ一切アクセスしない', async () => {
    await startWithLocal([makeRestaurant('1')]);

    expect(getDocsMock).not.toHaveBeenCalled();
    expect(setDocMock).not.toHaveBeenCalled();

    store.update('1', { genres: ['ラーメン'] });
    await flush();
    expect(setDocMock).not.toHaveBeenCalled();
  });

  it('ログイン時にクラウド未登録のローカル分を push する', async () => {
    await startWithLocal([makeRestaurant('1'), makeRestaurant('2')]);

    auth.user.set({ uid: 'user-a' });
    await flush();

    expect(getDocsMock).toHaveBeenCalledTimes(1);
    expect(setDocMock.mock.calls.map((c) => (c[0] as unknown as { id: string }).id).sort()).toEqual(
      ['1', '2'],
    );
  });

  it('同期直後に変更が無ければ push 対象は0件', async () => {
    await startWithLocal([makeRestaurant('1'), makeRestaurant('2')]);
    auth.user.set({ uid: 'user-a' });
    await flush();

    setDocMock.mockClear();
    // ストアに触れず effect を回しても書き込みは発生しない
    await flush();

    expect(setDocMock).not.toHaveBeenCalled();
  });

  it('1件だけ更新したらその1件のみ push される', async () => {
    await startWithLocal([makeRestaurant('1'), makeRestaurant('2'), makeRestaurant('3')]);
    auth.user.set({ uid: 'user-a' });
    await flush();

    setDocMock.mockClear();
    store.update('2', { genres: ['ラーメン'] });
    await flush();

    expect(setDocMock).toHaveBeenCalledTimes(1);
    expect((setDocMock.mock.calls[0][0] as unknown as { id: string }).id).toBe('2');
  });

  it('削除（tombstone）も差分として push される', async () => {
    await startWithLocal([makeRestaurant('1'), makeRestaurant('2')]);
    auth.user.set({ uid: 'user-a' });
    await flush();

    setDocMock.mockClear();
    store.remove('1');
    await flush();

    expect(setDocMock).toHaveBeenCalledTimes(1);
    expect((setDocMock.mock.calls[0][0] as unknown as { id: string }).id).toBe('1');
    expect(setDocMock.mock.calls[0][1]).toMatchObject({ id: '1', deleted: true });
  });

  it('値が undefined のフィールドは Firestore へ送らない', async () => {
    await startWithLocal([makeRestaurant('1', { note: undefined, url: undefined })]);
    auth.user.set({ uid: 'user-a' });
    await flush();

    const data = setDocMock.mock.calls[0][1] as Record<string, unknown>;
    expect(Object.keys(data)).not.toContain('note');
    expect(Object.keys(data)).not.toContain('url');
  });

  it('ログインユーザーが切り替わるとスナップショットがリセットされ、全件が再 push される', async () => {
    await startWithLocal([makeRestaurant('1'), makeRestaurant('2')]);

    // user-a: クラウドに既に同じ内容がある想定 → 初回同期では push されない
    setCloudDocs([
      makeRestaurant('1', { deleted: false }),
      makeRestaurant('2', { deleted: false }),
    ]);
    auth.user.set({ uid: 'user-a' });
    await flush();
    expect(setDocMock).not.toHaveBeenCalled();

    // user-b へ切替。クラウド側は空なので、スナップショットがリセットされていれば全件 push される。
    setCloudDocs([]);
    setDocMock.mockClear();
    auth.user.set({ uid: 'user-b' });
    await flush();

    expect(setDocMock.mock.calls.map((c) => (c[0] as unknown as { id: string }).id).sort()).toEqual(
      ['1', '2'],
    );
  });

  it('クラウド側の削除フラグはローカルへマージされる（deleted の OR）', async () => {
    await startWithLocal([makeRestaurant('1'), makeRestaurant('2')]);

    setCloudDocs([makeRestaurant('1', { deleted: true }), makeRestaurant('2', { deleted: false })]);
    auth.user.set({ uid: 'user-a' });
    await flush();

    expect(store.restaurants().map((r) => r.id)).toEqual(['2']);
    expect(store.allRestaurants().find((r) => r.id === '1')?.deleted).toBe(true);
  });

  it('クラウドにのみ存在する店はローカルへ取り込まれる', async () => {
    await startWithLocal([makeRestaurant('1')]);

    setCloudDocs([makeRestaurant('9', { name: 'クラウド店' })]);
    auth.user.set({ uid: 'user-a' });
    await flush();

    expect(
      store
        .restaurants()
        .map((r) => r.id)
        .sort(),
    ).toEqual(['1', '9']);
  });

  describe('updatedAt による内容マージ', () => {
    it('クラウド側の更新が新しければローカルを上書きする', async () => {
      // ローカルは古い内容（端末Aで放置）
      await startWithLocal([makeRestaurant('1', { genres: ['和食'], updatedAt: 1000 })]);
      // クラウドは端末Bで後から編集された内容
      setCloudDocs([makeRestaurant('1', { genres: ['ラーメン'], updatedAt: 2000 })]);

      auth.user.set({ uid: 'user-a' });
      await flush();

      expect(store.restaurants()[0].genres).toEqual(['ラーメン']);
    });

    it('ローカル側の更新が新しければクラウドを上書きし push する', async () => {
      await startWithLocal([makeRestaurant('1', { genres: ['ラーメン'], updatedAt: 2000 })]);
      setCloudDocs([makeRestaurant('1', { genres: ['和食'], updatedAt: 1000 })]);

      auth.user.set({ uid: 'user-a' });
      await flush();

      expect(store.restaurants()[0].genres).toEqual(['ラーメン']);
      expect(setDocMock.mock.calls[0][1]).toMatchObject({ id: '1', genres: ['ラーメン'] });
    });

    it('updatedAt を持たない旧データはクラウドの更新済みデータに負ける', async () => {
      await startWithLocal([makeRestaurant('1', { genres: ['和食'] })]);
      setCloudDocs([makeRestaurant('1', { genres: ['ラーメン'], updatedAt: 1000 })]);

      auth.user.set({ uid: 'user-a' });
      await flush();

      expect(store.restaurants()[0].genres).toEqual(['ラーメン']);
    });

    it('更新時刻が同じならローカルを優先する', async () => {
      await startWithLocal([makeRestaurant('1', { genres: ['和食'], updatedAt: 1000 })]);
      setCloudDocs([makeRestaurant('1', { genres: ['ラーメン'], updatedAt: 1000 })]);

      auth.user.set({ uid: 'user-a' });
      await flush();

      expect(store.restaurants()[0].genres).toEqual(['和食']);
    });

    it('内容はクラウドが新しくても、片方が削除済みなら削除が優先される', async () => {
      await startWithLocal([makeRestaurant('1', { deleted: true, updatedAt: 1000 })]);
      setCloudDocs([makeRestaurant('1', { genres: ['ラーメン'], updatedAt: 2000 })]);

      auth.user.set({ uid: 'user-a' });
      await flush();

      expect(store.restaurants()).toHaveLength(0);
      expect(store.allRestaurants()[0].deleted).toBe(true);
    });
  });

  it('push に失敗した変更は次の変更契機で再送される', async () => {
    await startWithLocal([makeRestaurant('1'), makeRestaurant('2')]);
    setCloudDocs([makeRestaurant('1'), makeRestaurant('2')]);
    auth.user.set({ uid: 'user-a' });
    await flush();

    // 1件目の更新の push を失敗させる
    setDocMock.mockClear();
    setDocMock.mockRejectedValueOnce(new Error('network error'));
    store.update('1', { genres: ['ラーメン'] });
    await flush();
    expect(setDocMock).toHaveBeenCalledTimes(1);

    // 送信前にスナップショットを更新していると、この変更は二度と送られない
    setDocMock.mockClear();
    store.update('2', { genres: ['カレー'] });
    await flush();

    const pushedIds = setDocMock.mock.calls.map((c) => (c[0] as unknown as { id: string }).id);
    expect(pushedIds.sort()).toEqual(['1', '2']);
  });

  it('push 失敗は syncError として公開される', async () => {
    await startWithLocal([makeRestaurant('1')]);
    setCloudDocs([makeRestaurant('1')]);
    auth.user.set({ uid: 'user-a' });
    await flush();

    const sync = TestBed.inject(RestaurantSyncService);
    expect(sync.syncError()).toBeNull();

    setDocMock.mockRejectedValueOnce(new Error('network error'));
    store.update('1', { genres: ['ラーメン'] });
    await flush();

    expect(sync.syncError()).toContain('network error');
  });

  it('id フィールドを持たないクラウドドキュメントはドキュメント ID で補完される', async () => {
    await startWithLocal([]);

    // data() に id が無い不正なドキュメント（そのまま使うと doc(..., undefined) で例外）
    getDocsMock.mockResolvedValue({
      docs: [
        { id: 'doc-9', data: () => ({ name: 'クラウド店', area: '新宿', genres: [], moods: [] }) },
      ],
    } as never);
    auth.user.set({ uid: 'user-a' });
    await flush();

    expect(store.restaurants().map((r) => r.id)).toEqual(['doc-9']);
  });

  it('同期中に起きたローカル変更も同期後に push される', async () => {
    await startWithLocal([makeRestaurant('1')]);
    setCloudDocs([makeRestaurant('1')]);

    // getDocs の解決を遅らせ、その間にローカル変更を起こす（suppressPush が有効な期間）
    let resolveDocs: (v: unknown) => void = () => undefined;
    getDocsMock.mockReturnValue(
      new Promise((resolve) => {
        resolveDocs = resolve;
      }) as never,
    );

    auth.user.set({ uid: 'user-a' });
    await flush();
    store.update('1', { genres: ['ラーメン'] });
    await flush();

    setDocMock.mockClear();
    resolveDocs({ docs: [{ data: () => makeRestaurant('1') }] });
    await flush();

    // 同期中の変更が「同期済み」と誤記録されず、回収されて push されること
    expect(setDocMock.mock.calls.map((c) => (c[0] as unknown as { id: string }).id)).toContain('1');
  });
});
