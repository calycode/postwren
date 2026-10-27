export type SubscriberCsvRow = {
   line: number;
   email: string;
   first_name: string | null;
   last_name: string | null;
   tags: string[];
};

export type CsvRowError = { line: number; message: string; raw: string };

export type CsvParseResult = { rows: SubscriberCsvRow[]; errors: CsvRowError[] };

type ParsedRecord = { fields: string[]; line: number; raw: string };

function parseRecords(input: string): ParsedRecord[] {
   const records: ParsedRecord[] = [];
   let fields: string[] = [];
   let field = '';
   let raw = '';
   let inQuotes = false;
   let line = 1;
   let recordLine = 1;

   const endField = () => {
      fields.push(field);
      field = '';
   };

   const endRecord = () => {
      endField();
      const blank = fields.length === 1 && (fields[0] ?? '').trim() === '' && raw.trim() === '';
      if (!blank) {
         records.push({ fields, line: recordLine, raw });
      }
      fields = [];
      raw = '';
      recordLine = line;
   };

   let index = 0;
   while (index < input.length) {
      const char = input.charAt(index);

      if (inQuotes) {
         if (char === '"') {
            if (input.charAt(index + 1) === '"') {
               raw += '""';
               field += '"';
               index += 2;
            } else {
               raw += char;
               inQuotes = false;
               index += 1;
            }
            continue;
         }
         if (char === '\r' && input.charAt(index + 1) === '\n') {
            raw += '\r\n';
            field += '\r\n';
            index += 2;
            line += 1;
            continue;
         }
         raw += char;
         field += char;
         index += 1;
         if (char === '\n' || char === '\r') line += 1;
         continue;
      }

      if (char === '"' && field === '') {
         raw += char;
         inQuotes = true;
         index += 1;
         continue;
      }

      if (char === ',') {
         raw += char;
         endField();
         index += 1;
         continue;
      }

      if (char === '\r' || char === '\n') {
         index += char === '\r' && input.charAt(index + 1) === '\n' ? 2 : 1;
         line += 1;
         endRecord();
         continue;
      }

      raw += char;
      field += char;
      index += 1;
   }

   if (field.length > 0 || fields.length > 0 || raw.length > 0) {
      endRecord();
   }

   return records;
}

function isValidEmail(value: string): boolean {
   if (value.length === 0 || /\s/.test(value)) return false;

   const at = value.indexOf('@');
   if (at <= 0 || at !== value.lastIndexOf('@')) return false;

   const domain = value.slice(at + 1);
   return (
      domain.includes('.') &&
      !domain.startsWith('.') &&
      !domain.endsWith('.') &&
      !domain.includes('..')
   );
}

function cell(record: ParsedRecord, index: number): string {
   if (index < 0) return '';
   return (record.fields[index] ?? '').trim();
}

function parseTags(value: string): string[] {
   const tags = new Set<string>();
   for (const part of value.split(';')) {
      const tag = part.trim().toLowerCase();
      if (tag.length > 0) tags.add(tag);
   }
   return [...tags];
}

export function parseSubscriberCsv(text: string): CsvParseResult {
   const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
   const records = parseRecords(input);
   const header = records.shift();

   if (header === undefined) {
      return { rows: [], errors: [{ line: 1, message: 'Missing header row', raw: '' }] };
   }

   const names = header.fields.map((name) => name.trim().toLowerCase());
   const emailIndex = names.findIndex((name) => name === 'email' || name === 'e-mail');

   if (emailIndex === -1) {
      return {
         rows: [],
         errors: [{ line: header.line, message: 'Missing email column', raw: header.raw }],
      };
   }

   const firstNameIndex = names.indexOf('first_name');
   const lastNameIndex = names.indexOf('last_name');
   const tagsIndex = names.indexOf('tags');

   const rows: SubscriberCsvRow[] = [];
   const errors: CsvRowError[] = [];
   const seenEmails = new Set<string>();

   for (const record of records) {
      const email = cell(record, emailIndex).toLowerCase();

      if (!isValidEmail(email)) {
         errors.push({ line: record.line, message: `Invalid email: ${email}`, raw: record.raw });
         continue;
      }

      if (seenEmails.has(email)) {
         errors.push({ line: record.line, message: `Duplicate email: ${email}`, raw: record.raw });
      } else {
         seenEmails.add(email);
      }

      const firstName = cell(record, firstNameIndex);
      const lastName = cell(record, lastNameIndex);

      rows.push({
         line: record.line,
         email,
         first_name: firstName.length > 0 ? firstName : null,
         last_name: lastName.length > 0 ? lastName : null,
         tags: parseTags(cell(record, tagsIndex)),
      });
   }

   return { rows, errors };
}
