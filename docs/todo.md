# TODO

全面リファクタ（Phase 1〜5）はコミット済みで完了。旧・残タスク6件（おすすめタブ初回表示不具合の修正、および各種ユニットテストの追加）も対応済み。

## 残タスク

現在なし。

## 対応済みメモ

- **おすすめタブの初回表示不具合**: 原因は `GoogleMapsLoader` が `loading=async` でスクリプトを読み込みながら `script.onload` で完了扱いしていたこと。この時点では `google.maps.Map` / `LatLngBounds` が未定義で、`<google-map>` の描画時に例外となりビューごと描画が止まっていた。`importLibrary('maps'/'marker')` の完了まで待ってから `mapsReady` を立てるよう修正済み（`recommend-map` 側にも存在チェックの防御、読み込み失敗時のエラー表示も追加）。
- **テスト基盤**: vitest（`@angular/build:unit-test`）を導入。`npm test` で実行できる。
  - Angular の unit-test システムでは相対パス／パスエイリアスへの `vi.mock()` が使えない。Firebase を絡めるテストでは `firebase/app` `firebase/auth` `firebase/firestore` の各パッケージ側をモックすること（`restaurant-sync.service.spec.ts` 参照）。
- **追加済み spec**: `opening-hours` / `recommendation-scorer` / `csv-import` / `restaurant-store` / `restaurant-sync.service`。
