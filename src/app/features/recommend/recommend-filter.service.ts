/**
 * @file 「おすすめ」画面のエリア/ジャンル/気分・昼休み余裕フィルタの選択状態と、
 * それを反映した絞り込み結果（`filtered`）・地図表示可能な店舗（`mappable`）を保持するサービス。
 * `Recommend` コンポーネントから状態と計算ロジックを切り離し、フィルタ条件の変更検知を1箇所に集約する。
 */
import { Injectable, WritableSignal, computed, inject, signal } from '@angular/core';
import { RestaurantStore } from '@services/restaurant-store';
import { SettingsStore } from '@services/settings-store';
import { getRemainingOpenMinutes } from '@services/opening-hours';

@Injectable({ providedIn: 'root' })
export class RecommendFilterService {
  private readonly store = inject(RestaurantStore);
  private readonly settings = inject(SettingsStore);

  readonly selectedAreas = signal<string[]>([]);
  readonly selectedGenres = signal<string[]>([]);
  readonly selectedMoods = signal<string[]>([]);
  /** 「昼休みに余裕がある店のみ」フィルタの有効/無効。 */
  readonly requireLunchTime = signal(false);

  /** 選択中の条件すべてに一致する店（各軸内は OR、軸どうしは AND） */
  readonly filtered = computed(() => {
    const a = this.selectedAreas();
    const g = this.selectedGenres();
    const m = this.selectedMoods();
    const requireLunchTime = this.requireLunchTime();
    const lunchBreakMinutes = this.settings.lunchBreakMinutes();
    return this.store.restaurants().filter((r) => {
      const okArea = a.length === 0 || a.includes(r.area);
      const okGenre = g.length === 0 || r.genres.some((x) => g.includes(x));
      const okMood = m.length === 0 || r.moods.some((x) => m.includes(x));
      if (!okArea || !okGenre || !okMood) return false;
      if (requireLunchTime) {
        const remaining = getRemainingOpenMinutes(r.places?.openingPeriods, new Date());
        if (remaining === null || remaining < lunchBreakMinutes) return false;
      }
      return true;
    });
  });

  /** 絞り込み結果のうち、座標（Places情報）を持つ店のみ（地図表示用）。 */
  readonly mappable = computed(() =>
    this.filtered().filter((r) => r.places?.lat != null && r.places?.lng != null),
  );

  readonly hasFilter = computed(
    () =>
      this.selectedAreas().length > 0 ||
      this.selectedGenres().length > 0 ||
      this.selectedMoods().length > 0 ||
      this.requireLunchTime(),
  );

  toggleRequireLunchTime(): void {
    this.requireLunchTime.update((v) => !v);
  }

  toggle(sig: WritableSignal<string[]>, value: string): void {
    sig.update((list) =>
      list.includes(value) ? list.filter((v) => v !== value) : [...list, value],
    );
  }

  isSelected(sig: WritableSignal<string[]>, value: string): boolean {
    return sig().includes(value);
  }

  clearFilters(): void {
    this.selectedAreas.set([]);
    this.selectedGenres.set([]);
    this.selectedMoods.set([]);
    this.requireLunchTime.set(false);
  }
}
