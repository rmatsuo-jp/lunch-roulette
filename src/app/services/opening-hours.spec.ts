/**
 * @file `getRemainingOpenMinutes()` の回帰テスト。
 * 特に深夜跨ぎ（close <= open）と週境界跨ぎ（土曜深夜→日曜）の境界値を検証する。
 * 判定は `Date#getDay/getHours/getMinutes` に依存するため、テストデータは
 * ローカルタイムゾーンで解釈される `new Date(年, 月, 日, 時, 分)` 形式で組む。
 */
import { describe, expect, it } from 'vitest';
import { OpeningPeriod } from '@shared/models/places';
import { ALWAYS_OPEN_REMAINING_MINUTES, getRemainingOpenMinutes } from './opening-hours';

/** OpeningPeriod を簡潔に組み立てるヘルパー。 */
function period(
  openDay: number,
  openHour: number,
  openMinute: number,
  closeDay: number,
  closeHour: number,
  closeMinute: number,
): OpeningPeriod {
  return { openDay, openHour, openMinute, closeDay, closeHour, closeMinute };
}

describe('getRemainingOpenMinutes', () => {
  // 2026-08-10 は月曜日（getDay() === 1）
  const MONDAY = 10;
  const AUGUST = 7; // Date の月は 0 始まり

  it('periods が undefined なら null を返す（判定不能）', () => {
    expect(getRemainingOpenMinutes(undefined, new Date(2026, AUGUST, MONDAY, 12, 0))).toBeNull();
  });

  it('periods が空配列なら null を返す（判定不能）', () => {
    expect(getRemainingOpenMinutes([], new Date(2026, AUGUST, MONDAY, 12, 0))).toBeNull();
  });

  it('営業中なら閉店までの残り分数を返す', () => {
    // 月曜 11:00〜15:00 の営業、現在 12:30 → 残り 150 分
    const periods = [period(1, 11, 0, 1, 15, 0)];
    expect(getRemainingOpenMinutes(periods, new Date(2026, AUGUST, MONDAY, 12, 30))).toBe(150);
  });

  it('営業時間外なら 0 を返す', () => {
    const periods = [period(1, 11, 0, 1, 15, 0)];
    expect(getRemainingOpenMinutes(periods, new Date(2026, AUGUST, MONDAY, 16, 0))).toBe(0);
  });

  it('開店時刻ちょうどは営業中扱い（区間の下限は含む）', () => {
    const periods = [period(1, 11, 0, 1, 15, 0)];
    expect(getRemainingOpenMinutes(periods, new Date(2026, AUGUST, MONDAY, 11, 0))).toBe(240);
  });

  it('閉店時刻ちょうどは営業時間外扱い（区間の上限は含まない）', () => {
    const periods = [period(1, 11, 0, 1, 15, 0)];
    expect(getRemainingOpenMinutes(periods, new Date(2026, AUGUST, MONDAY, 15, 0))).toBe(0);
  });

  it('曜日が違えば営業時間外', () => {
    // 火曜(2)のみ営業。月曜の同時刻は 0。
    const periods = [period(2, 11, 0, 2, 15, 0)];
    expect(getRemainingOpenMinutes(periods, new Date(2026, AUGUST, MONDAY, 12, 0))).toBe(0);
  });

  describe('深夜跨ぎ（月曜 23:00 〜 火曜 2:00）', () => {
    const periods = [period(1, 23, 0, 2, 2, 0)];

    it('開店日の深夜（月曜 23:30）は残り 150 分', () => {
      expect(getRemainingOpenMinutes(periods, new Date(2026, AUGUST, MONDAY, 23, 30))).toBe(150);
    });

    it('日付を跨いだ翌日未明（火曜 0:30）も営業中で残り 90 分', () => {
      expect(getRemainingOpenMinutes(periods, new Date(2026, AUGUST, MONDAY + 1, 0, 30))).toBe(90);
    });

    it('閉店後（火曜 2:30）は 0', () => {
      expect(getRemainingOpenMinutes(periods, new Date(2026, AUGUST, MONDAY + 1, 2, 30))).toBe(0);
    });
  });

  describe('週境界跨ぎ（土曜 23:00 〜 日曜 1:00）', () => {
    // closeDay(0) < openDay(6) となり、close <= open で +1週補正が入るケース
    const periods = [period(6, 23, 0, 0, 1, 0)];

    it('土曜 23:30 は営業中で残り 90 分', () => {
      // 2026-08-15 は土曜日
      expect(getRemainingOpenMinutes(periods, new Date(2026, AUGUST, 15, 23, 30))).toBe(90);
    });

    it('週を跨いだ日曜 0:30 も営業中で残り 30 分', () => {
      // 2026-08-16 は日曜日。nowMinutes は週頭に戻るため -1週オフセットで判定される。
      expect(getRemainingOpenMinutes(periods, new Date(2026, AUGUST, 16, 0, 30))).toBe(30);
    });

    it('日曜 1:30 は営業時間外', () => {
      expect(getRemainingOpenMinutes(periods, new Date(2026, AUGUST, 16, 1, 30))).toBe(0);
    });
  });

  it('複数区間のうち該当する区間の残り分数を返す（昼夜二部営業）', () => {
    const periods = [period(1, 11, 0, 1, 14, 0), period(1, 17, 0, 1, 22, 0)];
    // 中休み中は 0
    expect(getRemainingOpenMinutes(periods, new Date(2026, AUGUST, MONDAY, 15, 0))).toBe(0);
    // 夜の部は該当区間の残り分数
    expect(getRemainingOpenMinutes(periods, new Date(2026, AUGUST, MONDAY, 20, 0))).toBe(120);
  });

  describe('24時間営業', () => {
    it('open === close は常に営業中扱い', () => {
      const periods = [period(0, 0, 0, 0, 0, 0)];
      expect(getRemainingOpenMinutes(periods, new Date(2026, AUGUST, MONDAY, 12, 0))).toBe(
        ALWAYS_OPEN_REMAINING_MINUTES,
      );
    });

    it('close を持たない区間（Places API の24時間営業表現）も常に営業中扱い', () => {
      // Places API は24時間営業の店に close を返さない。これを「判定不能(null)」に
      // すると、最も条件の良い24時間営業店が昼休みフィルタで落ちてしまう。
      const periods: OpeningPeriod[] = [{ openDay: 0, openHour: 0, openMinute: 0 }];
      expect(getRemainingOpenMinutes(periods, new Date(2026, AUGUST, MONDAY, 12, 0))).toBe(
        ALWAYS_OPEN_REMAINING_MINUTES,
      );
    });

    it('alwaysOpen フラグ付きの区間も常に営業中扱い', () => {
      const periods: OpeningPeriod[] = [
        { openDay: 1, openHour: 9, openMinute: 0, alwaysOpen: true },
      ];
      expect(getRemainingOpenMinutes(periods, new Date(2026, AUGUST, MONDAY, 3, 0))).toBe(
        ALWAYS_OPEN_REMAINING_MINUTES,
      );
    });

    it('どんな昼休み時間の要求も満たせるだけの残り分数を返す', () => {
      const periods: OpeningPeriod[] = [{ openDay: 0, openHour: 0, openMinute: 0 }];
      const remaining = getRemainingOpenMinutes(periods, new Date(2026, AUGUST, MONDAY, 12, 0));
      // 設定画面の上限（8時間）を余裕で超えること
      expect(remaining).toBeGreaterThan(480);
    });
  });
});
