/**
 * @file 営業時間の判定ユーティリティ。OpeningPeriod[] と現在時刻から
 * 「あと何分で閉店するか」を計算する。深夜跨ぎ（例: 23:00〜翌1:00）に対応するため、
 * 全ての時刻を「その週の日曜0時からの経過分」に正規化して比較する。
 */
import { OpeningPeriod } from '@shared/models/places';

const MINUTES_PER_WEEK = 7 * 24 * 60;

function toWeekMinutes(day: number, hour: number, minute: number): number {
  return day * 24 * 60 + hour * 60 + minute;
}

/**
 * 現在時刻が含まれる営業区間の残り分数を返す。
 * - 営業時間外: 0
 * - データなし（判定不能）: null
 */
export function getRemainingOpenMinutes(
  periods: OpeningPeriod[] | undefined,
  now: Date,
): number | null {
  if (!periods || periods.length === 0) return null;

  const nowMinutes = toWeekMinutes(now.getDay(), now.getHours(), now.getMinutes());

  for (const p of periods) {
    const open = toWeekMinutes(p.openDay, p.openHour, p.openMinute);
    let close = toWeekMinutes(p.closeDay, p.closeHour, p.closeMinute);
    if (close <= open) close += MINUTES_PER_WEEK; // 深夜跨ぎ

    // 今週基準・翌週基準（週境界を跨ぐ区間の前倒し判定用）の両方をチェック
    for (const offset of [0, -MINUTES_PER_WEEK]) {
      const o = open + offset;
      const c = close + offset;
      if (nowMinutes >= o && nowMinutes < c) {
        return c - nowMinutes;
      }
    }
  }

  return 0;
}
