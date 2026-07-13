import { PlacesInfo } from './places';

/** 1件の飲食店データ。Google Map の保存リスト(CSV) ＋ 手動タグで構成。 */
export interface Restaurant {
  /** 自動採番 ID */
  id: string;
  /** 店名（CSV: Title） */
  name: string;
  /** メモ（CSV: Note） */
  note?: string;
  /** Google Maps へのリンク（CSV: URL） */
  url?: string;
  /** エリア（CSV ファイル名＝Google Map のリスト名） */
  area: string;
  /** ジャンルタグ（手動付与：和食・洋食・中華・ラーメン 等） */
  genres: string[];
  /** 気分・その他タグ（手動付与：がっつり・あっさり・一人OK 等） */
  moods: string[];
  /** Google Places API から取得した客観情報（未取得の場合は undefined） */
  places?: PlacesInfo;
  /** クラウド同期用の論理削除フラグ。true の場合は削除済みとして一覧・出力から除外する。 */
  deleted?: boolean;
}

/** localStorage 永続化や JSON 入出力で使う器。 */
export interface RestaurantData {
  version: 1;
  restaurants: Restaurant[];
}
