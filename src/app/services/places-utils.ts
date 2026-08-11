/**
 * @file Places 情報の有効性判定ユーティリティ。
 * Places API の取得に失敗した店は `{ placeId:'', lat:0, lng:0, fetchError }` として
 * キャッシュされるため、単純な null チェックでは「座標あり」と誤判定してしまう。
 * 地図表示・距離計算の判定基準を1箇所に集約するためのヘルパ。
 */
import { Restaurant } from '@shared/models/restaurant';
import { PlacesInfo } from '@shared/models/places';

/** 地図表示・距離計算に使える座標を持つか（取得失敗・原点(0,0)は無効とみなす）。 */
export function hasValidLocation(r: Restaurant): boolean {
  return isValidPlacesLocation(r.places);
}

/** `hasValidLocation` の PlacesInfo 版。 */
export function isValidPlacesLocation(p: PlacesInfo | undefined): boolean {
  if (!p || p.fetchError) return false;
  if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return false;
  // Places 取得失敗のプレースホルダ。実在の店舗がギニア湾の原点にあることはない。
  return !(p.lat === 0 && p.lng === 0);
}

/** 有効な座標を持つ場合のみ緯度経度を返す。持たない場合は null。 */
export function locationOf(r: Restaurant): { lat: number; lng: number } | null {
  return hasValidLocation(r) ? { lat: r.places!.lat, lng: r.places!.lng } : null;
}
