import type { SessionVault } from './connection';
declare global {
  interface Window {
    zhilumeDesktop?: {
      media: {
        rememberSource(file: File, assetId: string, base: string): Promise<void>;
        create(assetId: string, operation: string, params: { start: number; end: number }): Promise<string>;
        createSource(assetId: string): Promise<string>;
        readImage(id: string): Promise<Uint8Array>;
        run(id: string): Promise<NativeMediaResult>;
        retrySync(id: string): Promise<NativeMediaResult>;
        cancel(id: string): Promise<void>;
        dispose(id: string): Promise<void>;
        onProgress(callback: (value: { id: string; phase: string; progress: number | null }) => void): () => void;
      };
      readSession: () => Promise<SessionVault | null>;
      writeSession: (
        value: SessionVault | null,
      ) => Promise<boolean>;
    };
  }
}
export type NativeMediaResult = { ok: true; asset: any; sourceKind: 'local' | 'cache' | 'download' } | { ok: false; error: { code: string; message: string }; canRetrySync: boolean };
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
import { connection, reportFailure, connectionEpoch } from './connection';
export { connection, login, logout, restoreDesktopSession } from './connection';
export async function api(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<any> {
  const epoch = connectionEpoch(), base = connection.base, token = connection.token;
  const binary = body instanceof Blob;
  const response = await fetch(base + "/api/v1" + path, {
    method,
    headers: {
      Authorization: "Bearer " + token,
      ...(body !== undefined
        ? {
            "Content-Type": binary
              ? "application/octet-stream"
              : "application/json",
          }
        : {}),
    },
    body: body === undefined ? undefined : binary ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  }).catch(() => {
    if (epoch === connectionEpoch()) reportFailure(0);
    throw new ApiError(
      0,
      "network_error",
      "无法连接 Server，或请求被跨域规则阻止。请检查服务是否启动，以及两端版本是否一致。",
    );
  });
  if (epoch !== connectionEpoch()) throw new ApiError(0, "connection_changed", "服务已切换，请在原服务查看操作结果");
  if (!response.ok) {
    reportFailure(response.status);
    const error = await response.json().catch(() => ({}));
    throw new ApiError(
      response.status,
      error.code,
      error.message || `请求失败 (${response.status})`,
    );
  }
  const value = response.status === 204 ? null : await response.json();
  if (epoch !== connectionEpoch()) throw new ApiError(0,"connection_changed","服务已切换");
  return value;
}
export const mediaUrl = (url: string) => connection.base + url;
export function uploadAsset(
  file: File,
  signal: AbortSignal,
  progress: (value: number) => void,
  provenance?: { operation: string; sourceAssetIds: string[]; parameters: object },
): Promise<any> {
  return new Promise((resolve, reject) => {
    const sourceBase = connection.base;
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    xhr.open(
      "POST",
      connection.base +
        "/api/v1/assets/uploads?filename=" +
        encodeURIComponent(file.name),
    );
    xhr.setRequestHeader("Authorization", "Bearer " + connection.token);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    if (provenance) xhr.setRequestHeader("X-Asset-Provenance", JSON.stringify(provenance));
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) progress(event.loaded / event.total);
    };
    xhr.onload = async () => {
      let result: any;
      try {
        result = JSON.parse(xhr.responseText);
      } catch {
        reject(new Error("上传响应无法读取"));
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        await window.zhilumeDesktop?.media.rememberSource(file, result.id, sourceBase).catch(() => {});
        resolve(result);
      }
      else
        reject(
          new ApiError(xhr.status, result.code, result.message || "上传失败"),
        );
    };
    xhr.onerror = () => reject(new Error("上传连接中断，请检查 Server"));
    xhr.onabort = () => reject(new DOMException("上传已取消", "AbortError"));
    xhr.onloadend = () => signal.removeEventListener("abort", abort);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) {
      reject(new DOMException("上传已取消", "AbortError"));
      return;
    }
    xhr.send(file);
  });
}
export function mergeAssets(previous: Record<string, any>, incoming: any[]) {
  return Object.fromEntries(
    incoming.map((asset) => {
      const old = previous[asset.id];
      const expires = old
        ? Number(new URL(old.url, "http://local").searchParams.get("expires"))
        : 0;
      return [
        asset.id,
        old && expires > Date.now() / 1000 + 300
          ? { ...asset, url: old.url, downloadUrl: old.downloadUrl }
          : asset,
      ];
    }),
  );
}
export const sizeLabel = (bytes: number) =>
  bytes < 1024 ** 2
    ? `${(bytes / 1024).toFixed(1)} KB`
    : `${(bytes / 1024 ** 2).toFixed(1)} MB`;
export const statusLabel: Record<string, string> = {
  waiting_upstream: "等待上游",
  blocked: "上游失败，已阻塞",
  queued: "排队中",
  assigned: "准备执行",
  running: "执行中",
  cancel_requested: "正在停止",
  succeeded: "已完成",
  failed: "失败",
  interrupted: "已中断",
  cancelled: "已取消",
};
