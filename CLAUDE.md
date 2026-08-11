# CLAUDE.md

リポジトリ作業指針。アプリ名: **ランチくじ（Lunch Roulette）**

## 概要
Google Mapの保存リスト（CSV）取込→ジャンル・気分タグ絞込→「今日のランチ」提案。データは既定でローカル完結、店舗情報正確化のみGoogle Places API使用。外部API・生成AIはAPIキー保護/コスト管理を担保できる場合のみ許可。自動通信なし、ユーザー操作契機のみ。クラウド同期（Firestore）はホワイトリスト登録済みアカウントがGoogleログインした場合のみ動作するオプトイン機能。

## エージェント向け基本ルール
- **会話言語**: 返答・説明・質問はすべて**日本語**。
- **学習目的の教授ルール**: コード変更依頼時、実装だけでなく「なぜそのファイルをどう変更するとその挙動になるか」を日本語で解説。ユーザーがAngularを自力修正できる水準を目指す。実装と解説は必ずセット。

## 規約
- **Angular 22 / standalone / signals / `inject()`**。NgModule不使用。
- ファイル名は`.component`等サフィックス無し（`feature.ts/html/scss`）。
- 各ファイル冒頭に日本語`@file`/JSDoc。
- ルートは`app.routes.ts`で`loadComponent`（遅延ロード）。
- **状態は必ず`RestaurantStore`経由**。コンポーネントから直接`localStorage`不可。
- UIは**Angular Material**（`@angular/material`/`@angular/cdk`）。
- UI文言・コメントは日本語。

## アーキテクチャ
- `services/restaurant-store.ts` — localStorage永続化の単一ソース。`restaurants`をsignal保持、`effect`で自動保存。エリア/ジャンル/気分一覧をcomputed公開（フィルタUI用）。追加（重複排除）/更新/削除/JSON入出力。
- `services/csv-import.ts` — Google Takeout保存リストCSV（`Title, Note, URL`）をpapaparseで`Restaurant[]`へ変換。エリアはファイル名由来。ジャンルは取込時未設定（空配列）、手動タグ付けまたはPlaces API取得時の自動反映（`places-genre-map.ts`）で付与（店名正規表現推定は廃止済）。
- `models/restaurant.ts` — `Restaurant`/`RestaurantData`型。
- `models/places.ts` — Places API取得の`PlacesInfo`型。
- `models/tags.ts` — `GENRE_OPTIONS`/`MOOD_OPTIONS`（ジャンル・気分タグ選択肢の単一ソース）。UIと`places-genre-map.ts`の両方から参照。
- `services/places-enrichment.ts` — Places API v1（`searchText`）で座標/評価/営業時間等取得。店ごと1回のみ呼出（キャッシュ`Restaurant.places`）。
- `services/places-genre-map.ts` — Places公式ジャンル（`types`）→日本語ジャンルタグ変換。`pages/data/`で手動タグと和集合統合。
- `services/google-maps-loader.ts` — Google Maps JS APIスクリプト動的読込。
- `services/opening-hours.ts` — `getRemainingOpenMinutes()`。日またぎ営業にも対応した「残り営業時間（分）」算出の純粋関数。`recommend/`の余裕時間フィルタで使用。
- `services/settings-store.ts` — `googleMapsApiKey`（設定画面入力値）・テーマ・昼休み時間をlocalStorage永続化。`environment.ts`値より優先。
- `core/firebase/firebase.init.ts` — Firebase App/Auth/Firestoreの初期化。
- `core/firebase/auth.service.ts` — `AuthService`。Googleポップアップログイン、`auth.constants.ts`のメールアドレスホワイトリストでログイン可否判定。
- `services/restaurant-sync.service.ts` — `RestaurantSyncService`。ログイン済みの場合のみ動作するFirestore双方向同期（id単位マージ、以後`effect()`で自動push）。未ログイン時は一切通信しない。
- `pages/recommend/` — タグ絞込ランチ提案（トップページ）。地図表示、現在地距離順/評価順ソート、評価・レビュー件数・距離・直近被り回避を加味したスコアリングで1件選出（`RestaurantStore.recentPickedIds`で被り回避）。
- `pages/data/` — CSV取込&タグ付け・データ管理・Places情報取得ボタン。
- `pages/settings/` — バージョン情報＋Google Maps APIキー入力/保存、テーマ・昼休み時間設定、Googleログイン/ログアウト。
- `pages/dev/` — 開発時のみの診断画面（ストア件数・生JSON・環境情報等）。`environment.production`により本番ルートから除外。
- `environments/` — `googleMapsApiKey`の開発用フォールバック。実運用は設定画面登録キー（`SettingsStore`）優先。HTTPリファラー制限・Places API限定の制限キーをクライアント公開する前提。

詳細なデータフロー・依存関係図は[ARCHITECTURE.md](ARCHITECTURE.md)を参照。

## コマンド
`npm start` 開発サーバ / `npm run build` 本番ビルド / `npm test` テスト。

## バージョン運用
- **Conventional Commits + semantic-release**で自動採番。`package.json`の`version`は手動編集禁止。
- mainへのpushでGitHub Actionsが次バージョン判定、タグ/GitHub Release/`CHANGELOG.md`生成。
  - `fix:`/`perf:`→PATCH、`feat:`→MINOR、`feat!:`/`BREAKING CHANGE:`→MAJOR。`docs:` `chore:` `refactor:` `style:` `test:` `ci:`は上昇なし。
- `src/version.ts`（`APP_VERSION`/`RELEASE_DATE`）は`scripts/generate-version.mjs`が生成。git追跡外（`.gitignore`）のため、リリース時（semantic-releaseの`prepareCmd`）に加えて`prestart`/`prebuild`/`prewatch`/`pretest`でも自動生成される（クローン直後にビルドが落ちるのを防ぐため）。手動編集禁止。
- 設定（`.releaserc.json`）は3プロジェクト共通。

## 開発サーバーのポート
既定ポートは`angular.json`の`architect.serve.options.port`で**4202**固定（study-english=4200/career-roadmap=4201と分離、3システム同時起動可能にするため）。

## 技術識別子の命名
`package.json`/`angular.json`のプロジェクト名、localStorageキー、Firestore名前空間`apps/lunch_roulette`、GitHubリポジトリ名は`lunch-roulette`/`lunch_roulette`に統一済み（開発中のため既存データ互換性は考慮不要と判断し移行処理なしでリネーム）。
