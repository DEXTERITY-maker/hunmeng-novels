import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';
const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (s) => !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s,
    'Invalid date',
  );
const novels = defineCollection({
  loader: glob({ base: './src/content/novels', pattern: '*.json' }),
  schema: z.object({
    slug,
    title: z.string().min(1),
    originalTitle: z.string().min(1),
    author: z.string().min(1),
    authorUrl: z.url().refine((s) => new URL(s).protocol === 'https:', 'HTTPS only').optional(),
    supportUrl: z.url().refine((s) => new URL(s).protocol === 'https:', 'HTTPS only').optional(),
    originalUrl: z.url(),
    cover: z.string().regex(/^\/images\/[^?#]+\.(svg|webp|png|jpg)$/),
    description: z.string().min(20),
    genres: z.array(z.string()).min(1),
    tags: z.array(z.string()),
    categories: z.array(z.string().min(1)).default([]),
    rating: z.object({ average: z.number().min(1).max(5), count: z.number().int().positive() }).optional(),
    originalStatus: z.enum(['Продолжается', 'Завершён', 'Приостановлен']),
    translationStatus: z.enum(['Переводится', 'Завершён', 'Приостановлен']),
    updatedAt: date,
    addedAt: date.optional(),
    views: z.number().int().nonnegative().optional(),
    demo: z.boolean().default(false),
  }),
});
const chapters = defineCollection({
  loader: glob({
    base: './src/content/chapters',
    pattern: '**/*.md',
    generateId: ({ data }) => `${data.novelSlug}/${data.slug}`,
  }),
  schema: z.object({
    novelSlug: slug,
    slug,
    number: z.number().int().positive(),
    title: z.string().min(1),
    publishedAt: date,
    description: z.string().min(10).max(200),
  }),
});
const glossaries = defineCollection({
  loader: glob({ base: './src/content/glossaries', pattern: '*.json' }),
  schema: z.object({
    novelSlug: slug,
    terms: z.array(
      z.object({
        original: z.string().min(1),
        translation: z.string().min(1),
        type: z.enum(['персонаж', 'место', 'техника', 'предмет']),
      }),
    ),
  }),
});
const news = defineCollection({
  loader: glob({ base: './src/content/news', pattern: '*.md' }),
  schema: z.object({
    title: z.string().min(8),
    excerpt: z.string().min(25).max(240),
    category: z.enum(['changelog', 'announcements', 'giveaways']),
    publishedAt: date,
    order: z.number().int().nonnegative().default(0),
  }),
});
export const collections = { novels, chapters, glossaries, news };
