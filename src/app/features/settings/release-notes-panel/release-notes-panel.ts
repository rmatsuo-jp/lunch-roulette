/**
 * @file 設定ページのバージョン情報パネル。settings.html から切り出したUIブロック。
 * バージョン・リリース日の直下に「リリースノートを見る」の開閉導線を持つ。
 * `ReleaseNotesService.getAllNotes()` で CHANGELOG.md 全件を取得し、初回展開時のみ fetch して
 * `allNotes` にキャッシュする（app.ts の新機能モーダルとは独立で、既読バージョンの状態には影響しない）。
 */
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import {
  ReleaseNotesService,
  ReleaseNoteEntry as ReleaseNoteEntryData,
} from '@core/release-notes/release-notes.service';
import { ReleaseNoteEntry } from '@shared/ui/release-note-entry/release-note-entry';
import { APP_VERSION, RELEASE_DATE } from '../../../../version';

@Component({
  selector: 'app-release-notes-panel',
  imports: [MatCardModule, MatIconModule, MatButtonModule, ReleaseNoteEntry],
  templateUrl: './release-notes-panel.html',
  styleUrl: './release-notes-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReleaseNotesPanel {
  private readonly releaseNotes = inject(ReleaseNotesService);

  protected readonly version = APP_VERSION;
  protected readonly releaseDate = RELEASE_DATE;

  protected readonly showAllNotes = signal(false);
  /** 取得済みの全リリースノート。null は「未取得」（初回展開時のみ fetch する）。 */
  protected readonly allNotes = signal<ReleaseNoteEntryData[] | null>(null);

  // ── 「リリースノートを見る」トグル: 初回展開時のみ CHANGELOG.md を取得する ──
  async toggleAllNotes(): Promise<void> {
    this.showAllNotes.update((v) => !v);
    if (this.showAllNotes() && this.allNotes() === null) {
      this.allNotes.set(await this.releaseNotes.getAllNotes());
    }
  }
}
