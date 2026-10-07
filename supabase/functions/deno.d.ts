// Ambient type declarations for Supabase Deno Edge Functions in TypeScript IDEs

declare module "https://*" {
  export function serve(handler: (req: Request) => Response | Promise<Response>): void;
  const content: any;
  export default content;
}

declare namespace Deno {
  export namespace env {
    export function get(key: string): string | undefined;
    export function set(key: string, value: string): void;
  }
}

declare namespace EdgeRuntime {
  export function waitUntil(promise: Promise<unknown>): void;
}
