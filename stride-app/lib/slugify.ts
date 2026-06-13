// Транслитерация кириллицы → латиница для генерации slug из русского названия.
const RU_MAP: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
  и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh',
  щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

/** name → url-safe slug: транслит кириллицы, lowercase, non-alnum → '-', схлопывание и trim дефисов. */
export function slugify(input: string): string {
  const lower = input.trim().toLowerCase();
  const chars: string[] = [];
  for (const ch of lower) {
    chars.push(RU_MAP[ch] !== undefined ? RU_MAP[ch] : ch);
  }
  return chars.join('').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
