/**
 * @file 「おすすめ」画面のエリア/ジャンル/気分・昼休み余裕フィルタの選択状態と、
 * それを反映した絞り込み結果（`filtered`）・地図表示可能な店舗（`mappable`）を保持するサービス。
 * `Recommend` コンポーネントから状態と計算ロジックを切り離し、フィルタ条件の変更検知を1箇所に集約する。
 */
import {
  DestroyRef,
  Injectable,
  WritableSignal,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { RestaurantStore } from '@services/restaurant-store';
import { SettingsStore } from '@services/settings-store';
import { getRemainingOpenMinutes } from '@services/opening-hours';
import { hasValidLocation } from '@services/places-utils';

/** 営業時間判定に使う現在時刻の更新間隔（ミリ秒）。 */
const NOW_TICK_INTERVAL_MS = 60_000;

/**
 * `providedIn: 'root'` にはしない。フィルタの選択状態は「おすすめ画面のUI状態」であり、
 * アプリ全体のシングルトンにすると、他タブへ移動して戻ったときに選択が残り続けたり、
 * 店舗を全削除しても存在しないエリアの絞り込みが残って0件表示になる。
 * `Recommend` コンポーネントの `providers` に登録し、画面のライフサイクルに合わせる。
 */
@Injectable()
export class RecommendFilterService {
  private readonly store = inject(RestaurantStore);
  private readonly settings = inject(SettingsStore);
  private readonly destroyRef = inject(DestroyRef);

  readonly selectedAreas = signal<string[]>([]);
  readonly selectedGenres = signal<string[]>([]);
  readonly selectedMoods = signal<string[]>([]);
  /** 「昼休みに余裕がある店のみ」フィルタの有効/無効。 */
  readonly requireLunchTime = signal(false);

  /**
   * 営業時間判定の基準となる現在時刻。
   * `filtered` の中で直接 `new Date()` を呼ぶと時刻が signal の依存に入らず、
   * フィルタを ON にしたまま放置しても再計算されない（閉店済みの店が残り続ける）ため、
   * signal として保持し、フィルタが有効な間だけ定期更新する。
   */
  private readonly now = signal(new Date());
  private tickTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // 「昼休みに余裕がある店のみ」が有効な間だけタイマーを動かす（不要な再計算を避ける）。
    effect(() => {
      if (this.requireLunchTime()) {
        this.startTicking();
      } else {
        this.stopTicking();
      }
    });
    this.destroyRef.onDestroy(() => this.stopTicking());
  }

  /** 選択中の条件すべてに一致する店（各軸内は OR、軸どうしは AND） */
  readonly filtered = computed(() => {
    const a = this.selectedAreas();
    const g = this.selectedGenres();
    const m = this.selectedMoods();
    const requireLunchTime = this.requireLunchTime();
    const lunchBreakMinutes = this.settings.lunchBreakMinutes();
    const now = this.now();
    return this.store.restaurants().filter((r) => {
      const okArea = a.length === 0 || a.includes(r.area);
      const okGenre = g.length === 0 || r.genres.some((x) => g.includes(x));
      const okMood = m.length === 0 || r.moods.some((x) => m.includes(x));
      if (!okArea || !okGenre || !okMood) return false;
      if (requireLunchTime) {
        const remaining = getRemainingOpenMinutes(r.places?.openingPeriods, now);
        if (remaining === null || remaining < lunchBreakMinutes) return false;
      }
      return true;
    });
  });

  /**
   * 絞り込み結果のうち、有効な座標を持つ店のみ（地図表示用）。
   * Places 取得失敗の店は lat/lng が 0 のプレースホルダを持つため、単純な null チェックだと
   * 地図の (0,0) にマーカーが立ち、fitBounds が巻き込んで地図全体がズームアウトしてしまう。
   */
  readonly mappable = computed(() => this.filtered().filter(hasValidLocation));

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

  private startTicking(): void {
    if (this.tickTimer !== null) return;
    // 有効化した瞬間の判定が古い時刻にならないよう、まず即時更新する。
    this.now.set(new Date());
    this.tickTimer = setInterval(() => this.now.set(new Date()), NOW_TICK_INTERVAL_MS);
  }

  private stopTicking(): void {
    if (this.tickTimer === null) return;
    clearInterval(this.tickTimer);
    this.tickTimer = null;
  }
}
