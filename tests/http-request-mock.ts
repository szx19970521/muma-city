import { EventEmitter } from "events";
import type http from "http";
import { vi } from "vitest";

export interface MockHttpRequestInfo {
  method: string;
  url: string;
  path: string;
  headers: Record<string, string>;
}

export interface MockHttpResponse {
  statusCode?: number;
  body?: string;
}

export type MockHttpHandler = (
  req: MockHttpRequestInfo,
) => MockHttpResponse | Error | Promise<MockHttpResponse | Error>;

function normalizeArgs(args: unknown[]): {
  url: string;
  method: string;
  path: string;
  headers: Record<string, string>;
  callback?: (res: EventEmitter & { statusCode?: number }) => void;
} {
  const callback = args.find(
    (arg): arg is (res: EventEmitter & { statusCode?: number }) => void =>
      typeof arg === "function",
  );
  const first = args[0];
  const second =
    args.length > 1 && typeof args[1] === "object" && args[1] !== null
      ? (args[1] as Record<string, unknown>)
      : {};
  const options =
    typeof first === "object" && first !== null && !(first instanceof URL)
      ? (first as Record<string, unknown>)
      : second;

  const rawUrl =
    typeof first === "string" || first instanceof URL
      ? String(first)
      : `${String(options.protocol ?? "http:")}//${String(options.hostname ?? options.host ?? "127.0.0.1")}${options.port ? `:${String(options.port)}` : ""}${String(options.path ?? "/")}`;

  const parsed = new URL(rawUrl);
  const headerSource = (options.headers ?? {}) as Record<string, unknown>;
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(headerSource)) {
    headers[key.toLowerCase()] = String(value);
  }

  return {
    url: rawUrl,
    method: String(options.method ?? "GET").toUpperCase(),
    path: `${parsed.pathname}${parsed.search}`,
    headers,
    callback,
  };
}

export function mockHttpRequest(
  target: typeof http,
  handler: MockHttpHandler,
): void {
  vi.spyOn(target, "request").mockImplementation(((...args: unknown[]) => {
    const normalized = normalizeArgs(args);
    const req = new EventEmitter() as EventEmitter & {
      end: () => void;
      destroy: () => void;
      setTimeout: () => typeof req;
    };
    req.setTimeout = () => req;
    req.destroy = () => undefined;
    req.end = () => {
      queueMicrotask(async () => {
        try {
          const reply = await handler({
            method: normalized.method,
            url: normalized.url,
            path: normalized.path,
            headers: normalized.headers,
          });
          if (reply instanceof Error) {
            req.emit("error", reply);
            return;
          }
          const res = new EventEmitter() as EventEmitter & {
            statusCode?: number;
            setEncoding: () => void;
            resume: () => void;
          };
          res.statusCode = reply.statusCode ?? 200;
          res.setEncoding = () => undefined;
          res.resume = () => undefined;
          normalized.callback?.(res);
          if (reply.body) res.emit("data", reply.body);
          res.emit("end");
        } catch (err) {
          req.emit("error", err);
        }
      });
    };
    return req;
  }) as unknown as typeof target.request);
}
