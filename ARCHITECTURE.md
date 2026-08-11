# ARCHITECTURE.md

ランチくじ（Lunch Roulette）の技術アーキテクチャ方針をまとめたドキュメント。
概要や使い方は [docs/overview.md](docs/overview.md)・[docs/user-manual.md](docs/user-manual.md) を参照。

## 1. 概要

Google マップの「保存済みリスト」を CSV でエクスポートし、ジャンル・気分タグで
絞り込んで「今日のランチ」を提案するアプリ。

設計方針:

- **生成AIは使わない**。ジャンル付与も含めすべてルールベース／外部APIの構造化データに
  基づく（後述の Google Places API の公式 `types` からのマッピング）。
- **既定はローカル完結**。データは基本的にブラウザの `localStorage` に保存する
  （オフラインファースト）。店舗情報の正確化のため Google Places API（外部通信）を
  ユーザー操作（ボタン押下）をきっかけにのみ利用する。バックグラウンドでの自動通信は行わない。
- **クラウド同期はオプトイン**。ユーザーが明示的に Google ログインした場合のみ、
  ホワイトリスト登録された特定アカウントに限り Firestore へデータを同期する。
  ログインしない限りサーバー通信は発生しない。

## 2. 全体アーキテクチャ図

```mermaid
flowchart TD
    App["App（ルート）"]:::app

    subgraph L1["Pages（画面／遅延ロード）"]
        direction LR
        Recommend["recommend/"]:::page
        Data["data/"]:::page
        Settings["settings/"]:::page
        Dev["dev/（開発時のみ）"]:::page
    end

    subgraph L2["State"]
        Store["RestaurantStore"]:::state
    end

    subgraph L3["Services"]
        direction LR
        Scorer["RecommendationScorer"]:::svc
        CsvImport["CsvImport"]:::svc
        PlacesEnrich["PlacesEnrichment"]:::svc
        GenreMap["placesGenreMap"]:::svc
        MapsLoader["GoogleMapsLoader"]:::svc
        OpeningHours["openingHours"]:::svc
        SettingsStore["SettingsStore"]:::svc
    end

    subgraph L4["Firebase（オプトイン）"]
        direction LR
        Sync["RestaurantSyncService"]:::fb
        AuthSvc["AuthService"]:::fb
        FbInit["firebase.init"]:::fb
    end

    subgraph L5["外部 API"]
        direction LR
        GMapsAPI[/"Google Maps / Places API"/]:::ext
        Firestore[("Firestore")]:::ext
    end

    Models["models/（型）"]:::model
    LS[("localStorage")]:::persist

    App == "起動" ==> SettingsStore
    App == "起動" ==> Sync

    Recommend --> Store
    Recommend --> Scorer
    Recommend --> MapsLoader
    Recommend --> OpeningHours
    Data --> Store
    Data --> CsvImport
    Data --> PlacesEnrich
    Data --> GenreMap
    Settings --> SettingsStore
    Settings --> AuthSvc
    Dev --> Store
    Dev --> SettingsStore

    CsvImport --> Store
    PlacesEnrich --> Store
    PlacesEnrich -- HTTP --> GMapsAPI
    MapsLoader -- HTTP --> GMapsAPI

    Sync --> AuthSvc
    Sync --> Store
    Sync -- HTTP --> Firestore
    AuthSvc --> FbInit
    FbInit -- HTTP --> Firestore

    Store == effect ==> LS
    SettingsStore == effect ==> LS

    Store -.-> Models
    Scorer -.-> Models
    CsvImport -.-> Models
    PlacesEnrich -.-> Models
    OpeningHours -.-> Models

    subgraph Legend["凡例"]
        direction LR
        legA["Page"]:::page --> legB["Store"]:::state
        legB -- "実線: 呼び出し" --> legC["Service"]:::svc
        legC -. "破線: 型参照" .-> legD["Model"]:::model
        legC == "太線: 自動保存・起動" ==> legE["外部/永続化"]:::ext
    end

    classDef app fill:#fde68a,stroke:#b45309,color:#000
    classDef page fill:#bfdbfe,stroke:#1d4ed8,color:#000
    classDef state fill:#bbf7d0,stroke:#15803d,color:#000
    classDef svc fill:#e5e7eb,stroke:#374151,color:#000
    classDef fb fill:#fed7aa,stroke:#c2410c,color:#000
    classDef ext fill:#fed7aa,stroke:#c2410c,color:#000
    classDef model fill:#e9d5ff,stroke:#7e22ce,color:#000
    classDef persist fill:#e9d5ff,stroke:#7e22ce,color:#000
```

`RestaurantStore` が唯一のデータ経路（[CLAUDE.md](CLAUDE.md)）。
`Firebase` 層は未ログイン時は一切通信しないオプトイン経路。

## 3. レイヤー構成

### 3.1 ルーティング（`src/app/app.routes.ts`）

```mermaid
flowchart LR
    Root(("/")) --> Recommend["recommend/"]:::page
    PathData(("/data")) --> Data["data/"]:::page
    PathSettings(("/settings")) --> Settings["settings/"]:::page
    PathDev(("/dev")) -->|"environment.production?"| Prod{"本番ビルド"}
    Prod -->|Yes: 除外| X["ルートから消える"]:::ext
    Prod -->|No: 開発時| Dev["dev/"]:::page
    Any(("**")) -. "リダイレクト" .-> Root

    classDef page fill:#bfdbfe,stroke:#1d4ed8,color:#000
    classDef ext fill:#fed7aa,stroke:#c2410c,color:#000
```

すべて `loadComponent` による遅延ロード。

### 3.2 ドメインモデル（`src/app/models/`）

```mermaid
classDiagram
    class Restaurant {
        id, name, area
        genres[], moods[]
        url, note
        places?: PlacesInfo
        deleted?: boolean
    }
    class RestaurantData {
        version: 1
        restaurants: Restaurant[]
    }
    class PlacesInfo {
        placeId, lat/lng
        rating, reviewCount
        priceLevel, address
        openingHoursText
        periods: OpeningPeriod[]
        fetchedAt, fetchError?
    }
    class OpeningPeriod {
        weekday, openMinutes, closeMinutes
    }
    class tags_ts {
        GENRE_OPTIONS
        MOOD_OPTIONS
    }
    RestaurantData "1" *-- "*" Restaurant
    Restaurant "1" o-- "0..1" PlacesInfo
    PlacesInfo "1" *-- "*" OpeningPeriod
    Restaurant ..> tags_ts : genres/moodsの値域
```

### 3.3 状態管理（`RestaurantStore`）

```mermaid
flowchart LR
    subgraph In["書き込みAPI"]
        direction TB
        addMany["addMany()"]
        update["update()"]
        remove["remove()（論理削除）"]
        replaceAll["replaceAll()（Sync用）"]
        importJson["importJson()"]
        recordPicked["recordPicked(id)"]
    end

    In --> restaurants["restaurants signal\n(allRestaurantsはtombstone含む全件)"]:::state
    restaurants --> areas["computed: areas/genres/moods"]:::state
    restaurants == effect ==> LS[("localStorage\nlunch-roulette.data.v1")]:::persist
    recordPicked --> recent["recentPickedIds（最大5件）"]:::state
    recent == effect ==> LS2[("localStorage\nrecent-picks.v1")]:::persist
    restaurants --> toJson["toJson()"]

    classDef state fill:#bbf7d0,stroke:#15803d,color:#000
    classDef persist fill:#e9d5ff,stroke:#7e22ce,color:#000
```

**状態は必ずこの service 経由**（ページから直接 `localStorage` を触らない）。

### 3.4 CSV取り込み & 店舗情報拡充パイプライン

```mermaid
flowchart LR
    CSV["CSVファイル\n(Google Takeout)"] --> CsvImport["CsvImport\n(papaparse)"]:::svc
    CsvImport -->|"Restaurant[]\n(genres:[])"| Store["RestaurantStore"]:::state
    Store -->|"店舗ごと1回"| PlacesEnrich["PlacesEnrichment\n(searchText)"]:::svc
    PlacesEnrich -->|"HTTP"| GMapsAPI[/"Places API v1"/]:::ext
    PlacesEnrich -->|"PlacesInfo\n(失敗時はfetchError)"| Store
    PlacesEnrich --> GenreMap["placesGenreMap\n(types→ジャンル)"]:::svc
    GenreMap -->|"和集合で統合"| Store
    Store -.-> MapsLoader["GoogleMapsLoader"]:::svc
    Store -.-> OpeningHours["openingHours"]:::svc
    Store -.-> Scorer["RecommendationScorer"]:::svc

    classDef svc fill:#e5e7eb,stroke:#374151,color:#000
    classDef state fill:#bbf7d0,stroke:#15803d,color:#000
    classDef ext fill:#fed7aa,stroke:#c2410c,color:#000
```

APIキーは `SettingsStore` 優先、未設定時は `environment.googleMapsApiKey` にフォールバック。
`GenreMap` の呼び出し元は `pages/data/`（`PlacesEnrichment` 内部からではない）。
店名の正規表現推定（旧 `genre-guess.ts`）は廃止済み。

### 3.5 設定・APIキー管理（`SettingsStore`）

```mermaid
flowchart TD
    App["App（ルート）起動時 inject()"]:::app --> SettingsStore["SettingsStore"]:::svc
    SettingsStore --> Key{"apiKey設定済み？"}
    Key -->|Yes| UseSetting["設定画面の値を使用"]
    Key -->|No| UseEnv["environment.googleMapsApiKey\nにフォールバック"]
    SettingsStore --> theme["theme (light/dark/system)"]
    SettingsStore --> lunch["lunchBreakMinutes (既定60分)"]
    SettingsStore == effect ==> LS[("localStorage\nsettings.v1")]:::persist

    classDef app fill:#fde68a,stroke:#b45309,color:#000
    classDef svc fill:#e5e7eb,stroke:#374151,color:#000
    classDef persist fill:#e9d5ff,stroke:#7e22ce,color:#000
```

### 3.6 認証・クラウド同期（`core/firebase/`, オプトイン）

```mermaid
flowchart TD
    Start(("ユーザー操作\nGoogleログインボタン")) --> Popup["signInWithPopup"]
    Popup -->|失敗| Redirect["signInWithRedirect"]
    Popup -->|成功| Check{"ホワイトリスト\n(auth.constants.ts)？"}
    Redirect --> Check
    Check -->|non-whitelisted| SignOut["即signOut\n（通信は継続しない）"]:::ext
    Check -->|whitelisted| Merge["id単位でローカル/クラウドをマージ\n(deletedはOR, tombstone優先)"]:::fb
    Merge --> ReplaceAll["RestaurantStore.replaceAll()"]:::state
    ReplaceAll == "以後 effect() で自動push" ==> Push["Firestore\napps/lunch_roulette/users/{uid}/..."]:::ext
    NoLogin(("未ログイン")) -. "一切通信しない" .-> Nothing["何も起きない"]

    classDef fb fill:#fed7aa,stroke:#c2410c,color:#000
    classDef ext fill:#fed7aa,stroke:#c2410c,color:#000
    classDef state fill:#bbf7d0,stroke:#15803d,color:#000
```

`RestaurantSyncService`・`firebase.init` はルートの `App` で起動するが、実処理は
ログイン成否の分岐で完全にゲートされる（未ログイン＝通信ゼロ）。

### 3.7 画面（`src/app/pages/`）機能一覧

| ページ               | 主要機能                                                                                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `recommend/`         | エリア/ジャンル/気分トグル絞込（軸内OR・軸間AND）、残り営業時間フィルタ、`sortMode`(random/near/rating)、`RecommendationScorer`による「今日のおすすめ」1件選出＋地図表示＋`recordPicked()` |
| `data/`              | CSV取り込み、店舗ごとのタグ編集、エリア別グルーピング表示、Places情報の個別/一括取得（200ms間隔で逐次）、JSONエクスポート/インポート                                                       |
| `settings/`          | Google Maps APIキー入力・保存・マスク表示、テーマ切替、昼休み時間設定、Googleログイン/ログアウト、`release-notes-panel/`による`APP_VERSION`/`RELEASE_DATE`表示＋リリースノート一覧の開閉   |
| `dev/`（開発時のみ） | ストア件数（全体/有効/削除済み/エリア別/ジャンル別/気分別）、生JSON、設定・環境情報（APIキーはマスク）、認証状態、直近ピックJSONの表示・コピー                                             |

## 4. 技術スタックと非機能要件

| 技術                                        | 用途                                                               |
| ------------------------------------------- | ------------------------------------------------------------------ |
| Angular 22                                  | standalone / signals / `inject()`、NgModule不使用                  |
| Angular Material 22                         | UIコンポーネント全般                                               |
| papaparse                                   | CSVパース                                                          |
| `@angular/google-maps` + Maps/Places API v1 | 店舗情報拡充・地図表示                                             |
| Firebase SDK (Auth + Firestore)             | ホワイトリストアカウントのみのオプトイン同期。独自バックエンドなし |
| Service Worker (`ngsw-config.json`)         | オフラインファースト・PWA化。既定は`localStorage`のみ              |
| Vite ベース `@angular/build`                | ビルド。開発サーバーは固定ポート4202                               |

## 5. CI/CD・バージョニング

```mermaid
flowchart LR
    Push(("main へ push")) --> SR["semantic-release\nバージョン採番・タグ・CHANGELOG.md"]
    SR --> Rules["firestore.rules を\nfirebase-tools deployでデプロイ\n(FIREBASE_TOKEN)"]:::fb
    Rules --> Build["ビルド\n--base-href=/lunch-roulette/"]
    Build --> Copy["index.html → 404.html コピー"]
    Copy --> Pages["GitHub Pages へデプロイ"]:::ext

    classDef fb fill:#fed7aa,stroke:#c2410c,color:#000
    classDef ext fill:#fed7aa,stroke:#c2410c,color:#000
```

コミット種別→バージョン: `fix:`/`perf:`→PATCH、`feat:`→MINOR、`feat!:`/`BREAKING CHANGE:`→MAJOR、
`docs:`/`chore:`/`refactor:`/`style:`/`test:`/`ci:`→上昇なし。
`src/version.ts` はリリース時のみ `scripts/generate-version.mjs` が生成（`npm start`/`build` では再生成しない）。
`.gitignore` には載っているが `.releaserc.json` の `assets` に含まれるため git 追跡済みで、クローン直後もビルドできる。

semantic-release が生成する `CHANGELOG.md` は `angular.json` の assets でビルド成果物直下へコピーされ、
`ReleaseNotesService`（`core/release-notes/`）が実行時に fetch してリリースノート表示に使う。
未読バージョンがあればアプリシェル（`app.ts`）が新機能モーダルを開き、閉じた時点で既読を localStorage に記録する。
モーダルと `MatDialog` は動的 import（初回ロードの main バンドルに載せないため）。

## 6. 今後の方針判断のための指針

```mermaid
flowchart TD
    Q(("何を変更したい？")) --> A["絞り込み条件/タグを増やす"]
    Q --> B["データの持ち方を変える"]
    Q --> C["取り込み元をCSV以外に広げる"]
    Q --> D["永続化方式を変える"]
    Q --> E["クラウド同期の対象/方式を変える"]
    Q --> F["生成AI/外部推論APIを使う"]

    A --> A1["models/tags.ts に選択肢追加\n→ Store の computed が自動反映を確認\n新axisは recommend/ のフィルタにも追加"]
    B --> B1["models/restaurant.ts の型変更\n→ toJson()/importJson() の version を上げる\n→ Firestore対象なら sync + firestore.rules も確認"]
    C --> C1["csv-import.ts と同じ責務分担で\n新しい import service を追加（既存は変更しない）"]
    D --> D1["変更は RestaurantStore 内に閉じる\nページ側は無改修が原則\n→ 崩れるなら設計見直しのサイン"]
    E --> E1["restaurant-sync.service.ts と\nfirestore.rules を必ずセットで見直し\nホワイトリスト方式・ユーザー操作起点通信を崩さない"]
    F --> F1["CLAUDE.md の許可条件\n（APIキー保護・コスト管理・ユーザー操作起点通信）\nを満たすかまず確認"]
```
