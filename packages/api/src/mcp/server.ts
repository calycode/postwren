import type { Env } from '../env';
import type { Scope } from '../auth/scopes';
import { isScope } from '../auth/scopes';
import type { ToolCallContext } from './client';
import { callTool, findTool, toolDefinitions } from './tools';

const LATEST_PROTOCOL_VERSION = '2025-06-18';
const SUPPORTED_PROTOCOL_VERSIONS = new Set(['2025-06-18', '2025-03-26']);
const SERVER_INFO = { name: 'postwren', version: '0.1.0' };

type JsonRpcId = string | number | null;

type JsonRpcError = {
   code: number;
   message: string;
   data?: unknown;
};

type HandleResult = {
   body: unknown;
   responded: boolean;
};

export type McpAuth = {
   scopes: readonly string[];
};

export async function handleMcpRequest(
   request: Request,
   env: Env,
   auth: McpAuth,
): Promise<Response> {
   if (request.method !== 'POST') {
      return new Response(null, { status: 405, headers: { allow: 'POST, OPTIONS' } });
   }

   const context: ToolCallContext = {
      env,
      scopes: auth.scopes.filter((scope): scope is Scope => isScope(scope)),
   };

   let payload: unknown;
   try {
      payload = await request.json();
   } catch {
      return rpcResponse(errorBody(null, -32700, 'Parse error'));
   }

   if (Array.isArray(payload)) {
      if (payload.length === 0) {
         return rpcResponse(errorBody(null, -32600, 'Invalid Request: empty batch'));
      }

      const results: unknown[] = [];
      for (const message of payload) {
         const result = await handleMessage(message, context, auth.scopes);
         if (result.responded) results.push(result.body);
      }

      if (results.length === 0) {
         return new Response(null, { status: 202 });
      }
      return rpcResponse(results);
   }

   const result = await handleMessage(payload, context, auth.scopes);
   if (!result.responded) {
      return new Response(null, { status: 202 });
   }
   return rpcResponse(result.body);
}

function rpcResponse(body: unknown): Response {
   return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
   });
}

function errorBody(id: JsonRpcId, code: number, message: string, data?: unknown): unknown {
   const error: JsonRpcError = { code, message };
   if (data !== undefined) error.data = data;
   return { jsonrpc: '2.0', id, error };
}

function resultBody(id: JsonRpcId, result: unknown): unknown {
   return { jsonrpc: '2.0', id, result };
}

async function handleMessage(
   message: unknown,
   context: ToolCallContext,
   scopes: readonly string[],
): Promise<HandleResult> {
   if (message === null || typeof message !== 'object' || Array.isArray(message)) {
      return { responded: true, body: errorBody(null, -32600, 'Invalid Request') };
   }

   const request = message as Record<string, unknown>;
   const hasId = Object.prototype.hasOwnProperty.call(request, 'id');
   const id = normaliseId(request['id']);

   if (request['jsonrpc'] !== '2.0') {
      return {
         responded: true,
         body: errorBody(id, -32600, 'Invalid Request: jsonrpc must be "2.0"'),
      };
   }

   const method = request['method'];
   if (typeof method !== 'string') {
      return {
         responded: true,
         body: errorBody(id, -32600, 'Invalid Request: method must be a string'),
      };
   }

   if (!hasId) {
      return { responded: false, body: null };
   }

   try {
      if (method === 'initialize') {
         const params = request['params'];
         const requested =
            params !== null && typeof params === 'object'
               ? (params as Record<string, unknown>)['protocolVersion']
               : undefined;
         const protocolVersion =
            typeof requested === 'string' && SUPPORTED_PROTOCOL_VERSIONS.has(requested)
               ? requested
               : LATEST_PROTOCOL_VERSION;

         return {
            responded: true,
            body: resultBody(id, {
               protocolVersion,
               capabilities: { tools: { listChanged: false } },
               serverInfo: SERVER_INFO,
               instructions:
                  'Manage lists, subscribers, campaigns and templates for Postwren. ' +
                  'Every call is limited by the scopes granted to the credential. ' +
                  'Prefer preview_audience before schedule_campaign or send_campaign_now.',
            }),
         };
      }

      if (method === 'ping') {
         return { responded: true, body: resultBody(id, {}) };
      }

      if (method === 'tools/list') {
         return { responded: true, body: resultBody(id, { tools: toolDefinitions() }) };
      }

      if (method === 'tools/call') {
         const params = request['params'];
         if (params === null || typeof params !== 'object' || Array.isArray(params)) {
            return {
               responded: true,
               body: errorBody(id, -32602, 'Invalid params: expected an object'),
            };
         }

         const paramsObject = params as Record<string, unknown>;
         const name = paramsObject['name'];
         if (typeof name !== 'string' || name.length === 0) {
            return {
               responded: true,
               body: errorBody(id, -32602, 'Invalid params: "name" is required'),
            };
         }

         const tool = findTool(name);
         if (tool === null) {
            return { responded: true, body: errorBody(id, -32602, `Unknown tool: ${name}`) };
         }

         const rawArguments = paramsObject['arguments'];
         if (
            rawArguments !== undefined &&
            (rawArguments === null ||
               typeof rawArguments !== 'object' ||
               Array.isArray(rawArguments))
         ) {
            return {
               responded: true,
               body: errorBody(id, -32602, 'Invalid params: "arguments" must be an object'),
            };
         }

         const result = await callTool(
            tool,
            (rawArguments as Record<string, unknown> | undefined) ?? {},
            context,
            scopes,
         );

         return { responded: true, body: resultBody(id, result) };
      }

      if (method.startsWith('notifications/')) {
         return { responded: false, body: null };
      }

      return {
         responded: true,
         body: errorBody(id, -32601, `Method not found: ${method}`),
      };
   } catch (error) {
      console.error(
         JSON.stringify({
            level: 'error',
            message: error instanceof Error ? error.message : String(error),
         }),
      );
      return { responded: true, body: errorBody(id, -32603, 'Internal error') };
   }
}

function normaliseId(value: unknown): JsonRpcId {
   if (typeof value === 'string' || typeof value === 'number') return value;
   return null;
}
