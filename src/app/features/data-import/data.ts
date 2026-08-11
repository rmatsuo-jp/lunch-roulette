import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { Restaurant } from '@shared/models/restaurant';
import { RestaurantStore } from '@services/restaurant-store';
import { CsvImport } from '@services/csv-import';
import { PlacesEnrichment } from '@services/places-enrichment';
import { mapPlaceTypesToGenres } from '@services/places-genre-map';
import { FileDownloadService } from '@shared/services/file-download';
import { ConfirmDialog } from '@shared/ui/confirm-dialog/confirm-dialog';
import { RestaurantTagEditor } from './restaurant-tag-editor/restaurant-tag-editor';

/** 取り込み & タグ付け画面：CSV 取込、ジャンル/気分タグ編集、JSON 入出力。 */
@Component({
  selector: 'app-data',
  imports: [MatCardModule, MatButtonModule, MatIconModule, RestaurantTagEditor],
  templateUrl: './data.html',
  styleUrl: './data.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Data {
  private store = inject(RestaurantStore);
  private csv = inject(CsvImport);
  private places = inject(PlacesEnrichment);
  private snackBar = inject(MatSnackBar);
  private dialog = inject(MatDialog);
  private fileDownload = inject(FileDownloadService);

  readonly restaurants = this.store.restaurants;
  readonly total = computed(() => this.restaurants().length);

  /** 保存失敗・データ破損の警告（正常時は null）。黙って失敗するとデータを失うため画面に出す。 */
  readonly storageWarning = this.store.storageWarning;

  /** 地図情報を取得中の店舗 ID 集合（ボタンの多重クリック防止・スピナー表示用）。 */
  readonly enriching = signal<Set<string>>(new Set());

  /** エリア別にグルーピングした表示用データ。 */
  readonly groups = computed(() => {
    const map = new Map<string, Restaurant[]>();
    for (const r of this.restaurants()) {
      const list = map.get(r.area) ?? [];
      list.push(r);
      map.set(r.area, list);
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], 'ja'))
      .map(([area, items]) => ({ area, items }));
  });

  readonly importing = signal(false);

  /** CSV ファイル選択時の取り込み。 */
  async onCsvSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    this.importing.set(true);
    try {
      const { restaurants, warnings } = await this.csv.parseFilesDetailed(input.files);
      const added = this.store.addMany(restaurants);
      const skipped = restaurants.length - added;
      this.notify(
        `${added}件を取り込みました` +
          (skipped > 0 ? `（重複 ${skipped}件はスキップ）` : '') +
          // パースエラーを黙って捨てると、列ズレで欠落した行に気付けない
          (warnings.length > 0 ? `。CSV に問題があります: ${warnings.join(' / ')}` : ''),
      );
    } catch (e) {
      this.notify('CSV の取り込みに失敗しました: ' + this.describeError(e));
    } finally {
      this.importing.set(false);
      input.value = ''; // 同じファイルを再選択できるようリセット
    }
  }

  /** 同梱のサンプルCSV（恵比寿ランチ）を取り込む。動作確認用。 */
  async addSampleData(): Promise<void> {
    this.importing.set(true);
    try {
      const res = await fetch('sample-data/恵比寿ランチ.csv');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const parsed = this.csv.parseText(text, 'サンプル：恵比寿');
      const added = this.store.addMany(parsed);
      const skipped = parsed.length - added;
      this.notify(
        `サンプルデータを${added}件追加しました` +
          (skipped > 0 ? `（重複 ${skipped}件はスキップ）` : ''),
      );
    } catch (e) {
      this.notify('サンプルデータの取得に失敗しました: ' + this.describeError(e));
    } finally {
      this.importing.set(false);
    }
  }

  /** ジャンル選択（複数選択ドロップダウン）の確定。 */
  setGenres(r: Restaurant, values: string[]): void {
    this.store.update(r.id, { genres: values });
  }

  /** 気分・その他選択（複数選択ドロップダウン）の確定。 */
  setMoods(r: Restaurant, values: string[]): void {
    this.store.update(r.id, { moods: values });
  }

  remove(r: Restaurant): void {
    this.store.remove(r.id);
  }

  clearAll(): void {
    const ref = this.dialog.open(ConfirmDialog, {
      data: { title: '確認', message: '登録済みのお店をすべて削除します。よろしいですか？' },
    });
    ref.afterClosed().subscribe((ok) => {
      if (!ok) return;
      this.store.clear();
      this.notify('すべて削除しました');
    });
  }

  /** 現在のデータを JSON ファイルとしてダウンロード。 */
  exportJson(): void {
    const filename = `lunch-roulette-${new Date().toISOString().slice(0, 10)}.json`;
    this.fileDownload.downloadText(filename, this.store.toJson(), 'application/json');
  }

  /** JSON ファイルからデータを復元（既存は置き換え）。 */
  async onJsonSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const count = this.store.importJson(await file.text());
      this.notify(`${count}件を読み込みました`);
    } catch (e) {
      this.notify('JSON の読み込みに失敗しました: ' + this.describeError(e));
    } finally {
      input.value = '';
    }
  }

  /** 1件だけ Google Places 情報を取得する（成功・失敗に関わらず store に保存）。 */
  async enrichOne(r: Restaurant): Promise<void> {
    this.enriching.update((set) => new Set(set).add(r.id));
    try {
      const places = await this.places.enrich(r);
      if (places.fetchError) {
        this.store.update(r.id, { places });
        this.notify(`${r.name}: 地図情報の取得に失敗しました（${places.fetchError}）`);
      } else {
        // Places の公式ジャンルを手動タグと統合（和集合・重複排除）し、既存タグは消さない
        const merged = [...new Set([...r.genres, ...mapPlaceTypesToGenres(places.types)])];
        this.store.update(r.id, { places, genres: merged });
      }
    } finally {
      this.enriching.update((set) => {
        const next = new Set(set);
        next.delete(r.id);
        return next;
      });
    }
  }

  /** 例外の説明。Error 以外が投げられても "undefined" と表示しないようにする。 */
  private describeError(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
  }

  private notify(message: string): void {
    this.snackBar.open(message, '閉じる', { duration: 4000 });
  }
}
