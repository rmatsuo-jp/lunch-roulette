/**
 * @file モバイル幅の画面下部固定タブバー（bottom-nav）の実高さを監視し、
 * `.app-shell` の CSS カスタムプロパティ `--bottom-nav-height` に反映するサービス。
 * ラベル折り返し等による高さ変動時も `.app-content` の下端がタブバーに隠れないようにする
 * （PC のサイドバー表示時は app.scss 側で `--bottom-nav-height` を 0 に固定するため対象外）。
 */
import { DestroyRef, ElementRef, Injectable, inject } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class BottomNavHeightService {
  private readonly destroyRef = inject(DestroyRef);

  /** `el` の高さを監視して `.app-shell` の `--bottom-nav-height` に反映する。 */
  observe(el: ElementRef<HTMLElement>, desktopMedia: MediaQueryList): void {
    const nativeEl = el.nativeElement;
    const shell = nativeEl.closest<HTMLElement>('.app-shell');
    if (!shell) return;

    let lastHeight = -1;
    let rafId = -1;
    const applyHeight = () => {
      // pull-to-refresh中のchrome表示アニメーション等、viewport変化の過渡フレームで
      // offsetHeightを誤読しないよう1フレーム遅延させてから読み取る。
      window.cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(() => {
        if (desktopMedia.matches) return;
        const height = nativeEl.offsetHeight;
        if (height === lastHeight) return;
        lastHeight = height;
        shell.style.setProperty('--bottom-nav-height', `${height}px`);
      });
    };

    const observer = new ResizeObserver(applyHeight);
    observer.observe(nativeEl);
    desktopMedia.addEventListener('change', applyHeight);
    window.visualViewport?.addEventListener('resize', applyHeight);
    const deferredCheck = window.setTimeout(applyHeight, 300);
    applyHeight();

    this.destroyRef.onDestroy(() => {
      observer.disconnect();
      desktopMedia.removeEventListener('change', applyHeight);
      window.visualViewport?.removeEventListener('resize', applyHeight);
      window.clearTimeout(deferredCheck);
      window.cancelAnimationFrame(rafId);
    });
  }
}
