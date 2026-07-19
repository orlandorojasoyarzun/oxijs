import * as v from 'valibot';

export const LanguageSchema = v.picklist(['javascript', 'typescript']);
export type Language = v.InferOutput<typeof LanguageSchema>;

export const ExecutePayloadSchema = v.object({
  code: v.pipe(v.string(), v.maxLength(1_000_000, 'Snippet exceeds 1MB limit')),
  language: LanguageSchema,
});
export type ExecutePayloadT = v.InferOutput<typeof ExecutePayloadSchema>;

export const SaveCodePayloadSchema = v.object({
  code: v.pipe(v.string(), v.maxLength(1_000_000, 'Snippet exceeds 1MB limit')),
  defaultName: v.optional(v.pipe(v.string(), v.maxLength(255))),
});
export type SaveCodePayloadT = v.InferOutput<typeof SaveCodePayloadSchema>;