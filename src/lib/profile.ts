export const avatarColors = ['sage', 'navy', 'gold', 'plum'] as const;
export type AvatarColor = typeof avatarColors[number];
export interface ReaderProfile { nickname: string; bio: string; avatar_color: AvatarColor; }
export function validateNickname(value: string): string | null {
  const name = value.normalize('NFC').trim();
  return /^[\p{L}\p{N}][\p{L}\p{N} _-]{2,23}$/u.test(name) ? name : null;
}
export function readProfile(value: unknown): ReaderProfile {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    nickname: typeof raw.nickname === 'string' ? validateNickname(raw.nickname) ?? 'Читатель' : 'Читатель',
    bio: typeof raw.bio === 'string' ? raw.bio.slice(0, 160) : '',
    avatar_color: avatarColors.includes(raw.avatar_color as AvatarColor) ? raw.avatar_color as AvatarColor : 'sage',
  };
}
