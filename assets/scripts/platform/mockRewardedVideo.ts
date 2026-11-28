import type { RewardedRevive } from './rewardedRevive';

export interface MockRewardedVideoPrompt {
    readonly ready: boolean;
    claim(): void;
    close(): void;
    fail(): void;
}

export function createMockRewardedVideo(present: (prompt: MockRewardedVideoPrompt | null) => void): RewardedRevive {
    let cancel: (() => void) | undefined;
    let disposed = false;
    return {
        show(onShown) {
            if (cancel || disposed) return Promise.resolve(false);
            return new Promise<boolean>((resolve, reject) => {
                let ready = false;
                const finish = (completed: boolean, failed = false) => {
                    if (cancel !== close) return;
                    cancel = undefined;
                    clearTimeout(timer);
                    present(null);
                    if (failed) reject(new Error('Mock rewarded video unavailable'));
                    else resolve(completed);
                };
                const close = () => finish(false);
                const prompt: MockRewardedVideoPrompt = {
                    get ready() { return ready; },
                    claim: () => { if (ready) finish(true); },
                    close,
                    fail: () => finish(false, true),
                };
                cancel = close;
                const timer = setTimeout(() => {
                    ready = true;
                    present(prompt);
                }, 2000);
                try {
                    present(prompt);
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

export function createWebMockRewardedVideo(): RewardedRevive {
    let dialog: HTMLDialogElement | undefined;
    let status: HTMLParagraphElement;
    let claim: HTMLButtonElement;
    return createMockRewardedVideo(prompt => {
        if (!prompt) {
            dialog?.remove();
            dialog = undefined;
            return;
        }
        if (!dialog) {
            dialog = document.createElement('dialog');
            const title = document.createElement('h2');
            title.textContent = '模拟激励视频';
            status = document.createElement('p');
            dialog.setAttribute('aria-label', title.textContent);
            dialog.style.cssText = 'max-width:80vw;padding:24px;background:#182823;color:#f3eee0;border:2px solid #c6aa6b';
            dialog.append(title, status);
            const button = (label: string, action: () => void) => {
                const el = document.createElement('button');
                el.type = 'button';
                el.textContent = label;
                el.style.cssText = 'display:block;width:100%;min-height:44px;margin-top:8px';
                el.onclick = action;
                dialog!.append(el);
                return el;
            };
            claim = button('看完并返回', prompt.claim);
            button('提前关闭', prompt.close);
            button('模拟加载失败', prompt.fail);
            dialog.oncancel = event => { event.preventDefault(); prompt.close(); };
            document.body.append(dialog);
            dialog.showModal();
        }
        status.textContent = prompt.ready ? '模拟播放完成' : '模拟播放中…';
        claim.disabled = !prompt.ready;
    });
}
