import { z } from 'zod';

// slug: латиница/цифры, дефис только между сегментами (как в category.dto).
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export const GENDER_VALUES = ['MEN', 'WOMEN', 'UNISEX', 'KIDS'] as const;

const specEntrySchema = z.object({
  key: z.string().trim().min(1).max(60),
  value: z.string().trim().min(1).max(200),
});

const variantSchema = z
  .object({
    id: z.string().optional(),
    sizeEu: z
      .number({ invalid_type_error: 'Размер — число' })
      .min(16, 'Размер от 16')
      .max(50, 'Размер до 50')
      .refine((n) => Number.isInteger(n * 2), 'Размер кратен 0.5'),
    sku: z.string().trim().min(1, 'Укажите SKU').max(64, 'SKU до 64 символов'),
    price: z.number().int('Цена — целое').min(0, 'Цена ≥ 0'),
    compareAtPrice: z.number().int().min(0).nullable().optional(),
    stock: z.number().int('Остаток — целое').min(0, 'Остаток ≥ 0'),
    active: z.boolean(),
  })
  .refine((v) => v.compareAtPrice == null || v.compareAtPrice > v.price, {
    message: 'Старая цена должна быть больше текущей',
    path: ['compareAtPrice'],
  });

const imageSchema = z.object({
  url: z.string().url('Некорректный URL картинки'),
  publicId: z.string().optional(),
  alt: z.string().trim().max(200).optional(),
});

const colorwaySchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, 'Укажите название расцветки').max(80),
  slug: z.string().trim().min(1, 'Укажите slug расцветки').max(80).regex(SLUG_RE, 'Slug: латиница/цифры/дефис'),
  swatchHex: z
    .string()
    .regex(HEX_RE, 'HEX вида #RRGGBB')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  isDefault: z.boolean(),
  images: z.array(imageSchema),
  variants: z.array(variantSchema),
});

export const productSchema = z
  .object({
    name: z.string().trim().min(1, 'Укажите название').max(160),
    slug: z.string().trim().min(1, 'Укажите slug').max(160).regex(SLUG_RE, 'Slug: латиница/цифры/дефис'),
    brand: z.string().trim().min(1, 'Укажите бренд').max(80),
    gender: z.enum(GENDER_VALUES),
    categoryId: z.string().min(1, 'Выберите категорию'),
    description: z.string().trim().max(4000).optional(),
    fitNote: z.string().trim().max(500).optional(),
    specs: z.array(specEntrySchema),
    isBestseller: z.boolean(),
    active: z.boolean(),
    sortOrder: z.number().int().min(0),
    colorways: z.array(colorwaySchema),
  })
  .superRefine((p, ctx) => {
    if (p.colorways.length > 0) {
      const defaults = p.colorways.filter((c) => c.isDefault).length;
      if (defaults !== 1) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Ровно одна расцветка должна быть основной', path: ['colorways'] });
      }
      const slugs = p.colorways.map((c) => c.slug);
      if (new Set(slugs).size !== slugs.length) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Slug расцветок должны быть уникальны', path: ['colorways'] });
      }
      p.colorways.forEach((c, i) => {
        const sizes = c.variants.map((v) => v.sizeEu);
        if (new Set(sizes).size !== sizes.length) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Размеры в расцветке повторяются', path: ['colorways', i, 'variants'] });
        }
      });
    }
    if (p.active) {
      const ok = p.colorways.some((c) => c.variants.some((v) => v.active));
      if (!ok) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Активный товар требует хотя бы один активный вариант', path: ['active'] });
      }
    }
  });

export type ProductValues = z.infer<typeof productSchema>;
export type ColorwayValues = z.infer<typeof colorwaySchema>;
export type VariantValues = z.infer<typeof variantSchema>;
export type SpecEntry = z.infer<typeof specEntrySchema>;
