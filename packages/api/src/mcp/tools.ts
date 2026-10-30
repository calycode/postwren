import type { Scope } from '../auth/scopes';
import type { ToolCallContext } from './client';
import { callApi } from './client';

export type ToolResult = {
   content: Array<{ type: 'text'; text: string }>;
   structuredContent?: unknown;
   isError?: boolean;
};

export type ToolDescriptor = {
   name: string;
   title: string;
   description: string;
   inputSchema: Record<string, unknown>;
   requiredScope: Scope;
   readOnly: boolean;
   destructive: boolean;
   run: (args: Record<string, unknown>, context: ToolCallContext) => Promise<ToolResult>;
};

class ToolInputError extends Error {}

function requiredString(args: Record<string, unknown>, key: string): string {
   const value = args[key];
   if (typeof value !== 'string' || value.trim().length === 0) {
      throw new ToolInputError(`"${key}" must be a non-empty string`);
   }
   return value;
}

function optionalString(args: Record<string, unknown>, key: string): string | undefined {
   const value = args[key];
   if (value === undefined) return undefined;
   if (typeof value !== 'string') throw new ToolInputError(`"${key}" must be a string`);
   return value;
}

function optionalNumber(args: Record<string, unknown>, key: string): number | undefined {
   const value = args[key];
   if (value === undefined) return undefined;
   if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new ToolInputError(`"${key}" must be a number`);
   }
   return value;
}

function optionalBoolean(args: Record<string, unknown>, key: string): boolean | undefined {
   const value = args[key];
   if (value === undefined) return undefined;
   if (typeof value !== 'boolean') throw new ToolInputError(`"${key}" must be a boolean`);
   return value;
}

function stringArray(
   args: Record<string, unknown>,
   key: string,
   required = false,
): string[] | undefined {
   const value = args[key];
   if (value === undefined) {
      if (required) throw new ToolInputError(`"${key}" must be a non-empty array of strings`);
      return undefined;
   }
   if (
      !Array.isArray(value) ||
      value.length === 0 ||
      !value.every((entry): entry is string => typeof entry === 'string')
   ) {
      throw new ToolInputError(`"${key}" must be a non-empty array of strings`);
   }
   return value;
}

function defined(entries: Record<string, unknown>): Record<string, unknown> {
   const output: Record<string, unknown> = {};
   for (const [key, value] of Object.entries(entries)) {
      if (value !== undefined) output[key] = value;
   }
   return output;
}

function at<T>(value: T | undefined): T {
   if (value === undefined) {
      throw new ToolInputError('Missing required value');
   }
   return value;
}

async function envelope(
   context: ToolCallContext,
   method: string,
   path: string,
   body?: unknown,
): Promise<ToolResult> {
   const result = await callApi(context, method, path, body);
   return {
      content: [{ type: 'text', text: JSON.stringify(result.envelope) }],
      structuredContent: result.envelope,
      ...(result.envelope.error === null ? {} : { isError: true }),
   };
}

function query(params: Record<string, string | number | undefined>): string {
   const search = new URLSearchParams();
   for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) search.set(key, String(value));
   }
   const encoded = search.toString();
   return encoded.length === 0 ? '' : `?${encoded}`;
}

function idPath(base: string, args: Record<string, unknown>, key = 'id'): string {
   return `${base}/${encodeURIComponent(requiredString(args, key))}`;
}

const object = (
   properties: Record<string, unknown>,
   required: string[] = [],
): Record<string, unknown> => ({
   type: 'object',
   properties,
   ...(required.length === 0 ? {} : { required }),
   additionalProperties: false,
});

const str = (description: string): Record<string, unknown> => ({ type: 'string', description });
const num = (description: string): Record<string, unknown> => ({ type: 'number', description });
const bool = (description: string): Record<string, unknown> => ({ type: 'boolean', description });
const strArray = (description: string): Record<string, unknown> => ({
   type: 'array',
   description,
   items: { type: 'string' },
});

const ID = str('Resource id');

const campaignFields = {
   name: str('Campaign name'),
   templateId: str('Template id the campaign pins'),
   subject: str('Email subject line'),
   fromName: str('Sender display name'),
   fromEmail: str('Verified sender email address'),
   replyTo: str('Reply-To email address'),
   audienceQuery: str('Audience query such as "tag:news -tag:internal"'),
   utmSource: str('UTM source'),
   utmMedium: str('UTM medium'),
   utmCampaign: str('UTM campaign'),
};
export const TOOLS: ToolDescriptor[] = [
   {
      name: 'list_tags',
      title: 'List tags',
      description: 'List every tag with its subscriber count.',
      inputSchema: object({}),
      requiredScope: 'tags:read',
      readOnly: true,
      destructive: false,
      run: (args, context) => envelope(context, 'GET', '/api/v1/tags'),
   },
   {
      name: 'create_tag',
      title: 'Create tag',
      description: 'Create a tag. Names are normalised to lower case.',
      inputSchema: object({ name: str('Tag name, at most 64 characters') }, ['name']),
      requiredScope: 'tags:write',
      readOnly: false,
      destructive: false,
      run: (args, context) =>
         envelope(context, 'POST', '/api/v1/tags', { name: requiredString(args, 'name') }),
   },
   {
      name: 'list_subscribers',
      title: 'List subscribers',
      description:
         'List subscribers newest first. Supports free-text search, tag filter, status filter and cursor pagination.',
      inputSchema: object({
         q: str('Search email, first name or last name'),
         tag: str('Only subscribers carrying this tag'),
         status: str('Subscriber status, for example "subscribed"'),
         cursor: str('Opaque cursor from the previous page'),
         limit: num('Page size, 1-100 (default 50)'),
      }),
      requiredScope: 'subscribers:read',
      readOnly: true,
      destructive: false,
      run: (args, context) =>
         envelope(
            context,
            'GET',
            `/api/v1/subscribers${query({
               q: optionalString(args, 'q'),
               tag: optionalString(args, 'tag'),
               status: optionalString(args, 'status'),
               cursor: optionalString(args, 'cursor'),
               limit: optionalNumber(args, 'limit'),
            })}`,
         ),
   },
   {
      name: 'get_subscriber',
      title: 'Get subscriber',
      description: 'Read one subscriber together with their tags.',
      inputSchema: object({ id: ID }, ['id']),
      requiredScope: 'subscribers:read',
      readOnly: true,
      destructive: false,
      run: (args, context) => envelope(context, 'GET', idPath('/api/v1/subscribers', args)),
   },
   {
      name: 'create_subscriber',
      title: 'Create subscriber',
      description: 'Create a subscribed subscriber.',
      inputSchema: object(
         {
            email: str('Email address'),
            firstName: str('First name'),
            lastName: str('Last name'),
         },
         ['email'],
      ),
      requiredScope: 'subscribers:write',
      readOnly: false,
      destructive: false,
      run: (args, context) =>
         envelope(
            context,
            'POST',
            '/api/v1/subscribers',
            defined({
               email: requiredString(args, 'email'),
               firstName: optionalString(args, 'firstName'),
               lastName: optionalString(args, 'lastName'),
            }),
         ),
   },
   {
      name: 'update_subscriber',
      title: 'Update subscriber',
      description: 'Update a subscriber email or name.',
      inputSchema: object(
         {
            id: ID,
            email: str('Email address'),
            firstName: str('First name'),
            lastName: str('Last name'),
         },
         ['id'],
      ),
      requiredScope: 'subscribers:write',
      readOnly: false,
      destructive: false,
      run: (args, context) =>
         envelope(
            context,
            'PATCH',
            idPath('/api/v1/subscribers', args),
            defined({
               email: optionalString(args, 'email'),
               firstName: optionalString(args, 'firstName'),
               lastName: optionalString(args, 'lastName'),
            }),
         ),
   },
   {
      name: 'delete_subscriber',
      title: 'Delete subscriber',
      description: 'Soft delete a subscriber and stop future sends.',
      inputSchema: object({ id: ID }, ['id']),
      requiredScope: 'subscribers:write',
      readOnly: false,
      destructive: true,
      run: (args, context) => envelope(context, 'DELETE', idPath('/api/v1/subscribers', args)),
   },
   {
      name: 'assign_tag',
      title: 'Assign tag',
      description: 'Attach one existing tag to one subscriber.',
      inputSchema: object({ subscriberId: ID, tagId: str('Tag id') }, ['subscriberId', 'tagId']),
      requiredScope: 'subscribers:write',
      readOnly: false,
      destructive: false,
      run: (args, context) =>
         envelope(context, 'POST', `${idPath('/api/v1/subscribers', args, 'subscriberId')}/tags`, {
            tagId: requiredString(args, 'tagId'),
         }),
   },
   {
      name: 'remove_tag',
      title: 'Remove tag',
      description: 'Detach one tag from one subscriber.',
      inputSchema: object({ subscriberId: ID, tagId: str('Tag id') }, ['subscriberId', 'tagId']),
      requiredScope: 'subscribers:write',
      readOnly: false,
      destructive: false,
      run: (args, context) =>
         envelope(
            context,
            'DELETE',
            `${idPath('/api/v1/subscribers', args, 'subscriberId')}/tags/${encodeURIComponent(
               requiredString(args, 'tagId'),
            )}`,
         ),
   },
   {
      name: 'bulk_tag_subscribers',
      title: 'Bulk tag subscribers',
      description: 'Add and remove tags across many subscribers in one call.',
      inputSchema: object(
         {
            subscriberIds: strArray('Subscriber ids to update'),
            add: strArray('Tag names or ids to add'),
            remove: strArray('Tag names or ids to remove'),
         },
         ['subscriberIds'],
      ),
      requiredScope: 'subscribers:write',
      readOnly: false,
      destructive: false,
      run: (args, context) =>
         envelope(
            context,
            'POST',
            '/api/v1/subscribers/bulk-tags',
            defined({
               subscriberIds: stringArray(args, 'subscriberIds', true),
               add: stringArray(args, 'add'),
               remove: stringArray(args, 'remove'),
            }),
         ),
   },
   {
      name: 'list_campaigns',
      title: 'List campaigns',
      description: 'List campaigns newest first with their status and audience size.',
      inputSchema: object({}),
      requiredScope: 'campaigns:read',
      readOnly: true,
      destructive: false,
      run: (_args, context) => envelope(context, 'GET', '/api/v1/campaigns'),
   },
   {
      name: 'get_campaign',
      title: 'Get campaign',
      description: 'Read one campaign, including its audience query and pinned template revision.',
      inputSchema: object({ id: ID }, ['id']),
      requiredScope: 'campaigns:read',
      readOnly: true,
      destructive: false,
      run: (args, context) => envelope(context, 'GET', idPath('/api/v1/campaigns', args)),
   },
   {
      name: 'create_campaign',
      title: 'Create campaign',
      description:
         'Create a draft campaign pinned to a template revision. Use preview_audience to check the audience before scheduling.',
      inputSchema: object(
         {
            ...campaignFields,
            scheduledAt: num('Unix seconds for a future scheduled send'),
         },
         ['name', 'templateId', 'subject', 'fromName', 'fromEmail', 'audienceQuery'],
      ),
      requiredScope: 'campaigns:write',
      readOnly: false,
      destructive: false,
      run: (args, context) => {
         const body = defined({
            name: requiredString(args, 'name'),
            templateId: requiredString(args, 'templateId'),
            subject: requiredString(args, 'subject'),
            fromName: requiredString(args, 'fromName'),
            fromEmail: requiredString(args, 'fromEmail'),
            audienceQuery: requiredString(args, 'audienceQuery'),
            replyTo: optionalString(args, 'replyTo'),
            scheduledAt: optionalNumber(args, 'scheduledAt'),
            utmSource: optionalString(args, 'utmSource'),
            utmMedium: optionalString(args, 'utmMedium'),
            utmCampaign: optionalString(args, 'utmCampaign'),
         });
         return envelope(context, 'POST', '/api/v1/campaigns', body);
      },
   },
   {
      name: 'update_campaign',
      title: 'Update campaign',
      description: 'Edit a draft campaign. All fields except id are optional.',
      inputSchema: object({ id: ID, ...campaignFields }, ['id']),
      requiredScope: 'campaigns:write',
      readOnly: false,
      destructive: false,
      run: (args, context) =>
         envelope(
            context,
            'PATCH',
            idPath('/api/v1/campaigns', args),
            defined({
               name: optionalString(args, 'name'),
               templateId: optionalString(args, 'templateId'),
               subject: optionalString(args, 'subject'),
               fromName: optionalString(args, 'fromName'),
               fromEmail: optionalString(args, 'fromEmail'),
               replyTo: optionalString(args, 'replyTo'),
               audienceQuery: optionalString(args, 'audienceQuery'),
               utmSource: optionalString(args, 'utmSource'),
               utmMedium: optionalString(args, 'utmMedium'),
               utmCampaign: optionalString(args, 'utmCampaign'),
            }),
         ),
   },
   {
      name: 'preview_audience',
      title: 'Preview audience count',
      description:
         'Compile an audience query and return how many subscribers it matches right now.',
      inputSchema: object({ query: str('Audience query such as "tag:news -tag:internal"') }, [
         'query',
      ]),
      requiredScope: 'campaigns:read',
      readOnly: true,
      destructive: false,
      run: (args, context) =>
         envelope(
            context,
            'GET',
            `/api/v1/audience/preview${query({ q: requiredString(args, 'query') })}`,
         ),
   },
   {
      name: 'schedule_campaign',
      title: 'Schedule campaign',
      description:
         'Pin the template and audience, then schedule the campaign for a future Unix timestamp.',
      inputSchema: object({ id: ID, scheduledAt: num('Unix seconds in the future') }, [
         'id',
         'scheduledAt',
      ]),
      requiredScope: 'send:write',
      readOnly: false,
      destructive: false,
      run: (args, context) =>
         envelope(context, 'POST', `${idPath('/api/v1/campaigns', args)}/schedule`, {
            scheduledAt: at(optionalNumber(args, 'scheduledAt')),
         }),
   },
   {
      name: 'send_campaign_now',
      title: 'Send campaign now',
      description: 'Pin the template and audience, then dispatch the campaign immediately.',
      inputSchema: object({ id: ID }, ['id']),
      requiredScope: 'send:write',
      readOnly: false,
      destructive: true,
      run: (args, context) =>
         envelope(context, 'POST', `${idPath('/api/v1/campaigns', args)}/send-now`),
   },
   {
      name: 'pause_campaign',
      title: 'Pause campaign',
      description: 'Pause a campaign that is currently sending.',
      inputSchema: object({ id: ID }, ['id']),
      requiredScope: 'send:write',
      readOnly: false,
      destructive: false,
      run: (args, context) =>
         envelope(context, 'POST', `${idPath('/api/v1/campaigns', args)}/pause`),
   },
   {
      name: 'resume_campaign',
      title: 'Resume campaign',
      description: 'Resume a paused campaign and enqueue its remaining recipients.',
      inputSchema: object({ id: ID }, ['id']),
      requiredScope: 'send:write',
      readOnly: false,
      destructive: false,
      run: (args, context) =>
         envelope(context, 'POST', `${idPath('/api/v1/campaigns', args)}/resume`),
   },
   {
      name: 'get_campaign_stats',
      title: 'Get campaign stats',
      description:
         'Read recipient status counts, unique opens, unique clicks and click-through rate.',
      inputSchema: object({ id: ID }, ['id']),
      requiredScope: 'campaigns:read',
      readOnly: true,
      destructive: false,
      run: (args, context) =>
         envelope(context, 'GET', `${idPath('/api/v1/campaigns', args)}/stats`),
   },
   {
      name: 'list_templates',
      title: 'List templates',
      description: 'List email templates by most recently updated.',
      inputSchema: object({}),
      requiredScope: 'templates:read',
      readOnly: true,
      destructive: false,
      run: (_args, context) => envelope(context, 'GET', '/api/v1/templates'),
   },
   {
      name: 'get_template',
      title: 'Get template',
      description: 'Read one template including its IR document and current revision.',
      inputSchema: object({ id: ID }, ['id']),
      requiredScope: 'templates:read',
      readOnly: true,
      destructive: false,
      run: (args, context) => envelope(context, 'GET', idPath('/api/v1/templates', args)),
   },
   {
      name: 'create_template',
      title: 'Create template',
      description:
         'Create a template from an IR document. The document must be a valid mailer IR object.',
      inputSchema: object(
         {
            name: str('Template name'),
            subject: str('Default subject line'),
            irJson: { type: 'object', description: 'Mailer IR document' },
         },
         ['name', 'subject', 'irJson'],
      ),
      requiredScope: 'templates:write',
      readOnly: false,
      destructive: false,
      run: (args, context) => {
         const irJson = args['irJson'];
         if (irJson === null || typeof irJson !== 'object') {
            throw new ToolInputError('"irJson" must be an object');
         }
         return envelope(context, 'POST', '/api/v1/templates', {
            name: requiredString(args, 'name'),
            subject: requiredString(args, 'subject'),
            irJson,
         });
      },
   },
   {
      name: 'update_template',
      title: 'Update template',
      description:
         'Edit a template. Pass bumpRevision=false for an autosave that does not change the pinned revision.',
      inputSchema: object(
         {
            id: ID,
            name: str('Template name'),
            subject: str('Default subject line'),
            irJson: { type: 'object', description: 'Mailer IR document' },
            bumpRevision: bool('Whether to increment the template revision'),
         },
         ['id'],
      ),
      requiredScope: 'templates:write',
      readOnly: false,
      destructive: false,
      run: (args, context) => {
         const irJson = args['irJson'];
         if (irJson !== undefined && (irJson === null || typeof irJson !== 'object')) {
            throw new ToolInputError('"irJson" must be an object');
         }
         return envelope(
            context,
            'PATCH',
            idPath('/api/v1/templates', args),
            defined({
               name: optionalString(args, 'name'),
               subject: optionalString(args, 'subject'),
               irJson,
               bumpRevision: optionalBoolean(args, 'bumpRevision'),
            }),
         );
      },
   },
   {
      name: 'preview_template',
      title: 'Preview template',
      description:
         'Render a template to HTML and plain text. Set applyMergeTags to preview with sample subscriber data.',
      inputSchema: object(
         {
            id: ID,
            applyMergeTags: bool('Merge sample subscriber values before rendering'),
            document: { type: 'object', description: 'Optional IR document to render instead' },
         },
         ['id'],
      ),
      requiredScope: 'templates:read',
      readOnly: true,
      destructive: false,
      run: (args, context) =>
         envelope(
            context,
            'POST',
            `${idPath('/api/v1/templates', args)}/preview`,
            defined({
               document: args['document'],
               context: optionalBoolean(args, 'applyMergeTags'),
            }),
         ),
   },
];

export function findTool(name: string): ToolDescriptor | null {
   return TOOLS.find((tool) => tool.name === name) ?? null;
}

export function toolDefinitions(): Array<Record<string, unknown>> {
   return TOOLS.map((tool) => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: {
         readOnlyHint: tool.readOnly,
         destructiveHint: tool.destructive,
         idempotentHint: tool.readOnly,
      },
   }));
}

export async function callTool(
   tool: ToolDescriptor,
   args: Record<string, unknown>,
   context: ToolCallContext,
   grantedScopes: readonly string[],
): Promise<ToolResult> {
   if (!grantedScopes.includes(tool.requiredScope)) {
      return {
         content: [
            {
               type: 'text',
               text: JSON.stringify({
                  data: null,
                  error: {
                     code: 'forbidden',
                     message: `Missing required scope: ${tool.requiredScope}`,
                     details: { requiredScope: tool.requiredScope },
                  },
               }),
            },
         ],
         isError: true,
      };
   }

   try {
      return await tool.run(args, context);
   } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
         content: [
            {
               type: 'text',
               text: JSON.stringify({
                  data: null,
                  error: { code: 'validation_error', message },
               }),
            },
         ],
         isError: true,
      };
   }
}

export { ToolInputError };
