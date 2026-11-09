export type CampaignRow = {
   id: string;
   template_id: string;
   template_revision: number;
   name: string;
   subject: string;
   from_name: string;
   from_email: string;
   reply_to: string | null;
   audience_query: string;
   scheduled_at: number | null;
   status: string;
   utm_source: string;
   utm_medium: string;
   utm_campaign: string;
   metadata_json: string;
   metadata_snapshot: string | null;
   data_json: string;
   data_snapshot: string | null;
   audience_count: number | null;
   dispatch_cursor: string | null;
   ir_snapshot: string | null;
   created_at: number;
   updated_at: number;
   started_at: number | null;
   completed_at: number | null;
};

export type TemplateRow = {
   id: string;
   name: string;
   subject: string;
   ir_json: string;
   preview_html: string | null;
   revision: number;
   created_at: number;
   updated_at: number;
};

export type RecipientRow = {
   campaign_id: string;
   subscriber_id: string;
   message_id: string;
   status: string;
   attempts: number;
   error_code: string | null;
   provider_message_id: string | null;
   sent_at: number | null;
   opened_at: number | null;
   clicked_at: number | null;
};

export type MailSubscriberRow = {
   id: string;
   email: string;
   first_name: string | null;
   last_name: string | null;
   status: string;
   deleted_at: number | null;
};
