export interface LicensedChapterDraft {
  chapter_number: number;
  chapter_slug: string;
  chapter_title: string;
  chapter_description: string;
  original_text: string;
  translated_text: string;
  status: 'draft';
}
export interface VerifiedSource {
  rights_status: string;
  permission_translate: boolean;
  permission_publish: boolean;
  verified_at: string | null;
  rights_evidence?: string | null;
  rights_valid_until?: string | null;
}
export function parseLicensedChapterBatch(raw: string): LicensedChapterDraft[];
export function rightsVerified(source: VerifiedSource | null | undefined, now?: string): boolean;
