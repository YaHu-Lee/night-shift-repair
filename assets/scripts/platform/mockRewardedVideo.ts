import type { RewardedRevive } from './rewardedRevive';

/** Interactive stand-in for the Web review build. Uses the ordinary reward callback. */
export function createMockRewardedVideo(): RewardedRevive {
    let cancel: (() => void) | undefined;
    let disposed = false;
    return {
        show(onShown) {
            if (cancel || disposed) return Promise.resolve(false);
            return new Promise<boolean>((resolve, reject) => {
                const dialog = document.createElement('dialog');
                const title = document.createElement('h2');
                title.textContent = '模拟激励视频';
                const status = document.createElement('p');
                status.textContent = '模拟播放中…';
                dialog.setAttribute('aria-label', title.textContent);
                dialog.style.cssText = 'max-width:80vw;padding:24px;background:#182823;color:#f3eee0;border:2px solid #c6aa6b';
                dialog.append(title, status);
                const button = (label: string, action: () => void) => {
                    const el = document.createElement('button');
                    el.type = 'button';
                    el.textContent = label;
                    el.style.cssText = 'display:block;width:100%;min-height:44px;margin-top:8px';
                    el.onclick = action;
                    dialog.append(el);
                    return el;
                };
                const finish = (completed: boolean, failed = false) => {
                    if (!cancel) return;
                    cancel = undefined;
                    clearTimeout(timer);
                    dialog.remove();
                    if (failed) reject(new Error('Mock rewarded video unavailable'));
                    else resolve(completed);
                };
                const claim = button('看完并返回', () => finish(true));
                claim.disabled = true;
                button('提前关闭', () => finish(false));
                button('模拟加载失败', () => finish(false, true));
                dialog.oncancel = event => { event.preventDefault(); finish(false); };
                document.body.append(dialog);
                cancel = () => finish(false);
                const timer = setTimeout(() => {
                    status.textContent = '模拟播放完成';
                    claim.disabled = false;
                }, 2000);
                try {
                    dialog.showModal();
                    onShown?.();
                } catch {
                    finish(false, true);
                }
            });
        },
        cancel() { cancel?.(); },
        dispose() { disposed = true; cancel?.(); },
    };
}
