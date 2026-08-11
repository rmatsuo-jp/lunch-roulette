# Google Cloud APIキー作成手順

対象プロジェクト: `lunch-roulette-3c777`（ランチくじ専用のFirebase/Google Cloudプロジェクト）

## 1. 対象プロジェクトを選択

[Google Cloud Console](https://console.cloud.google.com)にアクセスし、画面上部のプロジェクトセレクタで`lunch-roulette-3c777`を選択する。

## 2. 必要なAPIを有効化

「APIとサービス」→「ライブラリ」から、以下を検索して有効化する（既に有効なものはスキップ可）。

### Maps JavaScript API

地図をブラウザ上に描画するためのJavaScriptライブラリ。[services/google-maps-loader.ts](../src/app/services/google-maps-loader.ts)がこのスクリプトを動的読込し、[pages/recommend/](../src/app/pages/recommend/)で「今日のランチ」提案時に店舗の位置を地図表示するために使う。有効化しないと地図コンポーネント自体が読み込めない。

### Places API (New)

店舗情報（正式名称・座標・評価・レビュー件数・営業時間・ジャンル`types`など）を検索・取得するAPI。[services/places-enrichment.ts](../src/app/services/places-enrichment.ts)が`searchText`エンドポイントを使い、CSV取込で店名しかわからない各店舗の情報を店舗ごとに1回だけ呼び出して補完する（結果は`Restaurant.places`にキャッシュし再取得しない）。取得した`types`は[services/places-genre-map.ts](../src/app/services/places-genre-map.ts)で日本語ジャンルタグに変換され、手動タグと和集合統合される。

「(New)」版が必要な理由: Googleは旧Places API（Legacy、`nearbySearch`等のREST形式）を段階的に廃止しており、本アプリは新版のエンドポイント形式（`places:searchText`、v1）を前提に実装されているため。旧版だけを有効化してもこのアプリのリクエスト形式には対応できない。

まとめると、**Maps JavaScript API=地図の見た目を出すため**、**Places API (New)=店舗の詳細データを自動取得してユーザーの手入力を減らすため**、という役割分担。

## 3. 認証情報（APIキー）を作成

1. 「APIとサービス」→「認証情報」を開く
2. 上部の「＋ 認証情報を作成」→「APIキー」を選択
3. キーが生成されるので、いったんそのまま「閉じる」（次の手順ですぐ制限をかける）

## 4. APIキーに制限をかける（必須）

作成したキーの編集画面で、以下を設定する。

### アプリケーションの制限

- 「HTTPリファラー（ウェブサイト）」を選択
- 以下のリファラーを登録する
  - `http://localhost:4202/*`（開発用。ポート4202は`angular.json`固定値）
  - 本番デプロイ先のドメイン（例: `https://<Firebase Hosting URL>/*`）

### APIの制限

- 「キーを制限」を選択し、以下だけにチェックする
  - Maps JavaScript API
  - Places API (New)

これにより、キーが漏れても指定ドメイン以外からの利用や他APIへの利用ができなくなる。

## 5. 保存

「保存」をクリックする。反映まで数分かかることがある。

## 6. アプリへの設定

発行したAPIキーはコードに直接書き込まず、アプリの設定画面（[pages/settings/](../src/app/pages/settings/)）から入力する。`SettingsStore`がlocalStorageに保存し、`environment.ts`のフォールバック値より優先される。

> **注意**: APIキーの値は本ドキュメントを含め、リポジトリ内のいかなるファイルにもコミットしないこと。

## 7. 使用量と料金の関係（目安）

Google Maps Platformは有料。最新の正確な金額は必ず[公式料金ページ](https://mapsplatform.google.com/pricing/)で確認すること。以下は2025年3月改定後の体系に基づく大まかな目安。

### 料金の考え方

- 呼び出し1回ごとに「SKU（課金単位）」が決まっており、SKUごとに**月間無料枠**がある
- 無料枠を超えた分だけ従量課金（1,000リクエストあたりの単価）される
- 請求先はGoogle Cloudの請求先アカウント（このプロジェクト`lunch-roulette-3c777`に紐づく請求先アカウント）

### Maps JavaScript API（地図表示）

- 分類: Essentials（基本ティア）
- 目安: 月間無料枠内であれば無料。超過分はおおよそ1,000回読み込みあたり数ドル程度
- 本アプリでは「今日のランチ」提案画面を開くたびに1回読み込まれる想定

### Places API (New) — searchTextによる店舗検索

- 分類: 呼び出し内容（取得フィールド）によってPro/Enterpriseティアに分かれる
  - 基本情報のみ（店名・住所など）: 比較的安価
  - 評価・レビュー件数・営業時間など詳細フィールドを含める場合: より高いティア
- 目安: 1,000リクエストあたり数ドル〜十数ドル程度（取得フィールド数に応じて変動）
- 本アプリは**店舗ごとに1回だけ呼び出しキャッシュする設計**（[services/places-enrichment.ts](../src/app/services/places-enrichment.ts)）のため、実運用では想定以上に呼び出し回数が増えにくい

### 個人利用における目安

- 保存リストが数十〜百件程度で、都度全件呼び出すのではなくキャッシュ運用であれば、月間無料枠内に収まる可能性が高い
- ただし複数端末でキャッシュが効かない状態で頻繁に再取得すると、無料枠を超える可能性がある
