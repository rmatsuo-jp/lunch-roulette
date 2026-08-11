# ランチくじ (Lunch Roulette)

Google Map に**エリアごとに保存している飲食店リスト**を取り込み、
**エリア・ジャンル・気分**で絞り込んで「今日のランチ」をおすすめしてくれる Angular アプリです。

- 条件に合うお店の**一覧表示**
- 条件内から**ランダムで1件を抽選**して提案
- データはブラウザの **localStorage** に保存（バックエンド不要）。JSON で書き出し／読み込みも可能

## Google Map のリストを取り込む手順

Google Map の保存リストは [Google Takeout](https://takeout.google.com/) から書き出せます。

1. [takeout.google.com](https://takeout.google.com/) にリストを保存しているアカウントでログイン
2. 「**保存済み (Saved)**」だけを選択（※保存リストを書き出せるのはこの項目です）
3. エクスポートを実行 → メール通知後にアーカイブをダウンロード
4. `Takeout/Saved/` の中に**リストごとに1つの CSV**（例: `渋谷.csv`）が入っています
5. 本アプリの「**取り込み**」画面で、その CSV を選択

> **注意**: Takeout の CSV に含まれるのは `店名 (Title) / メモ (Note) / URL` のみで、
> **住所・座標・ジャンル・価格帯は含まれません**。
> エリアは **CSV のファイル名**（＝Google Map のリスト名）として自動設定されます。
> **ジャンル**と**気分**は、取り込み後に「取り込み」画面で手動タグ付けしてください。
> （Google には保存場所を取得する公式 API がないため、自動付与はできません）

動作確認用に、恵比寿エリアの実店舗リストをサンプルデータとして同梱しています（`public/sample-data/恵比寿ランチ.csv`）。「取り込み」画面の「サンプルデータを追加」ボタンから誰でもワンクリックで取り込めます。

## 使い方

1. **取り込み画面** … CSV を取り込み、各店に「ジャンル」「気分・その他」タグを付与。Google Places API で店舗情報を取得するとジャンルも自動反映される
2. **おすすめ画面** … エリア／ジャンル／気分を選んで絞り込み、一覧から選ぶか「ランダムで決めて」で抽選。地図表示、距離順／評価順ソートにも対応
3. **設定画面** … Google Maps APIキーの登録、対象アカウントのみ利用できる任意のGoogleログイン（Firestoreへのクラウド同期）など

詳しい使い方は [docs/overview.md](docs/overview.md)・[docs/user-manual.md](docs/user-manual.md) を参照。

## 開発

```bash
npm install
npm start        # http://localhost:4202 で起動
npm run build    # 本番ビルド
```

## 技術スタック

- Angular 22（standalone components / signals）
- Angular Material（Material 3 テーマ）
- papaparse（CSV パース）
- Google Maps JavaScript API / Places API v1（店舗情報拡充・地図表示、ユーザー操作起点のみ）
- Firebase（Auth + Firestore）— ホワイトリスト登録済みアカウントがログインした場合のみ使うオプトインのクラウド同期
- 永続化: localStorage（JSON 入出力対応）

## データモデル

```ts
interface Restaurant {
  id: string;          // 自動採番
  name: string;        // 店名 (CSV: Title)
  note?: string;       // メモ (CSV: Note)
  url?: string;        // Google Maps リンク (CSV: URL)
  area: string;        // エリア (CSV ファイル名)
  genres: string[];    // ジャンルタグ（手動 or Places API取得結果の自動反映）
  moods: string[];     // 気分・その他タグ（手動）
  places?: PlacesInfo; // Places APIで取得した店舗情報のキャッシュ
  deleted?: boolean;   // 論理削除フラグ（クラウド同期の削除伝播用）
}
```

詳細なアーキテクチャ・データフローは [ARCHITECTURE.md](ARCHITECTURE.md) を参照。

## ライセンス・免責

本アプリは **MIT License** のもとで無償提供されます。利用にあたっては、以下の規約類をご確認ください。

- [免責事項（DISCLAIMER）](docs/legal/disclaimer.md)
- [利用規約（TERMS）](docs/legal/terms.md)
- [プライバシーポリシー（PRIVACY）](docs/legal/privacy.md)
- [ライセンス（LICENSE）](docs/legal/LICENSE.md)
- [脆弱性報告について（SECURITY）](SECURITY.md)

本アプリは現状有姿で提供され、利用に起因する損害について、法令上許容される範囲で開発者は責任を負いません。
