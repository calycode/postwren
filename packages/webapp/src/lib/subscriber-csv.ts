/**
 * Matches the columns `parseSubscriberCsv` understands. `email` is required;
 * the rest are optional, and any other column is ignored by the importer.
 */
export const SUBSCRIBER_CSV_TEMPLATE = [
   'email,first_name,last_name,tags,metadata',
   'ada@example.com,Ada,Lovelace,newsletter;vip,plan=pro;signup_source=landing page',
   'grace@example.com,Grace,Hopper,newsletter,plan=team',
   '',
].join('\n');
