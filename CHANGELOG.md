## [0.6.1](https://github.com/rmatsuo-jp/lunch-roulette/compare/v0.6.0...v0.6.1) (2026-08-11)


### Bug Fixes

* Google Maps APIのライブラリ読込完了を待ってから地図を描画する ([908a245](https://github.com/rmatsuo-jp/lunch-roulette/commit/908a245a529b49b5f5acadc5e90e5da57f02a6cd))
* 意図しない高額課金を防ぐため一括Places情報取得ボタンを削除 ([4239964](https://github.com/rmatsuo-jp/lunch-roulette/commit/4239964135252038fea73cf6ecb886edfb3ed03b))
* 調査で判明した実害のある不具合とリスクをまとめて修正 ([fc92d91](https://github.com/rmatsuo-jp/lunch-roulette/commit/fc92d910e672b573d158d1f94a16b92f3a86ea29))


### Performance Improvements

* Firestore自動同期をdiff-basedスナップショット方式に変更 ([22e5f5e](https://github.com/rmatsuo-jp/lunch-roulette/commit/22e5f5e6f974a07290dfbdd15efacc2778fa9494))

# [0.6.0](https://github.com/rmatsuo-jp/lunch-roulette/compare/v0.5.0...v0.6.0) (2026-07-12)


### Bug Fixes

* スマホ幅でのレイアウト崩れを修正しページ間のカードスタイルを統一 ([d3c04a0](https://github.com/rmatsuo-jp/lunch-roulette/commit/d3c04a07622b1138aea241d10cc25ae3802a6053))


### Features

* おすすめタブに絞り込み結果を一覧表示する地図を追加 ([6d5d3fb](https://github.com/rmatsuo-jp/lunch-roulette/commit/6d5d3fb27a01d60a70ab204cd3df1ab809197d33))
* サンプルデータ追加ボタンを実装 ([e7c8c7e](https://github.com/rmatsuo-jp/lunch-roulette/commit/e7c8c7e9fb46712e679f523a16e2ada99b352217))
* 取り込み画面にPlaces詳細情報（住所・価格帯・営業時間・種別）を表示 ([c57fc3e](https://github.com/rmatsuo-jp/lunch-roulette/commit/c57fc3e49a2eaee6c1210c34024b3473c7e3a87a))
* 設定画面のアカウント表示にGoogleアバターと表示名を追加 ([0d4f900](https://github.com/rmatsuo-jp/lunch-roulette/commit/0d4f9001a3f3bef67ee5244865b4524b39aeec02))

# [0.5.0](https://github.com/rmatsuo-jp/lunch-roulette/compare/v0.4.0...v0.5.0) (2026-07-12)


### Features

* Firestoreセキュリティルールをリポジトリ管理化しCIで自動デプロイ ([6e497be](https://github.com/rmatsuo-jp/lunch-roulette/commit/6e497bee91a709c2d6c0f29709dc922e0a13b368))

# [0.4.0](https://github.com/rmatsuo-jp/lunch-picker/compare/v0.3.2...v0.4.0) (2026-07-12)


### Features

* モバイル用ページタイトルヘッダーを追加し設定画面の横スクロールを解消 ([49b4057](https://github.com/rmatsuo-jp/lunch-picker/commit/49b405781735a81ff86bc79f6fe729ad853b89de))

## [0.3.2](https://github.com/rmatsuo-jp/lunch-picker/compare/v0.3.1...v0.3.2) (2026-07-12)


### Bug Fixes

* 2回目のpull-to-refreshが効かずボトムナビが隠れる不具合を修正 ([62cc177](https://github.com/rmatsuo-jp/lunch-picker/commit/62cc177fd4f5728d0ac643ce64b31f38207fe1d0))

## [0.3.1](https://github.com/rmatsuo-jp/lunch-picker/compare/v0.3.0...v0.3.1) (2026-07-12)


### Bug Fixes

* PWAアイコンの背景を透過にし余白を除去 ([cf4fba0](https://github.com/rmatsuo-jp/lunch-picker/commit/cf4fba018cfe771eecaed2d3b6913d121ae67d6f))

# [0.3.0](https://github.com/rmatsuo-jp/lunch-picker/compare/v0.2.0...v0.3.0) (2026-07-12)


### Features

* Google ログインによるクラウド同期を追加 ([c455c29](https://github.com/rmatsuo-jp/lunch-picker/commit/c455c29dd916196ea70ae2a257f5b27a4174bafd))
* アプリアイコンをルーレット盤+食事モチーフに一新 ([c51bb05](https://github.com/rmatsuo-jp/lunch-picker/commit/c51bb05f959ad0c0d0f4e2116acda184684806f0))
* アプリ名を「ランチくじ（Lunch Roulette）」に統一 ([f189412](https://github.com/rmatsuo-jp/lunch-picker/commit/f189412d5c2d667857be3bf19d9709deb941fdc7))
* ダークモードの配色をstudy-english準拠のインディゴ系に変更 ([5371a27](https://github.com/rmatsuo-jp/lunch-picker/commit/5371a27e489f1ec4711dab397d7a3e9983bdfd1c))
* ナビをstudy-english準拠のサイドバー構成に統一し開発用タブを追加 ([e5b3b93](https://github.com/rmatsuo-jp/lunch-picker/commit/e5b3b93a76cd92a4141a5beefd4a5fa8ef56bea8))
* 昼休みの残り営業時間で絞り込むフィルタを追加 ([ddb9098](https://github.com/rmatsuo-jp/lunch-picker/commit/ddb90981c2ed1dd574382ae1ccc948c834c97eb9))

# [0.2.0](https://github.com/rmatsuo-jp/lunch-picker/compare/v0.1.0...v0.2.0) (2026-07-11)


### Bug Fixes

* CIのテストステップを削除（テスト基盤未整備のため失敗） ([5fe11ea](https://github.com/rmatsuo-jp/lunch-picker/commit/5fe11ea07b41e4ed177b84bb0d854305766fc2bc))


### Features

* Google Places API連携で地図情報の取得・地図表示・APIキー設定を追加 ([2e5b0f2](https://github.com/rmatsuo-jp/lunch-picker/commit/2e5b0f2cf6d9f0e1f6ca5280fb4e73950308fc67))
* 設定画面にライト/ダークモード切り替えを追加 ([2a96a0e](https://github.com/rmatsuo-jp/lunch-picker/commit/2a96a0ebe266175ce95f6a4f6bebf845e02d4987))
* 評価・距離・直近の被り回避を考慮したスコアリング型「今日のおすすめ」を追加 ([88760bc](https://github.com/rmatsuo-jp/lunch-picker/commit/88760bced510da90e83b3e6c415c35d5c153ac18))

# [0.1.0](https://github.com/rmatsuo-jp/lunch-picker/compare/v0.0.0...v0.1.0) (2026-07-05)


### Features

* スマホ表示にネイティブアプリ風の下部固定タブバーを追加 ([716c2a7](https://github.com/rmatsuo-jp/lunch-picker/commit/716c2a7226a7f6f41d4ce58478b48c249167b072))
