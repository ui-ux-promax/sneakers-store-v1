'use client';
import { useEffect, useState } from 'react';
import { Slider } from '@/components/ui';
import { useCatalogUrl } from '@/hooks/use-catalog-url';

const STEP = 500;
const fmt = (n: number) => n.toLocaleString('ru-RU');

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

export function PriceFilter({ min, max }: { min: number; max: number }) {
  const { get, setParams } = useCatalogUrl();
  // Верхнюю границу слайдера округляем вверх до шага: иначе при «некруглом»
  // диапазоне правая ручка не дотягивается до реального max и самые дорогие
  // товары молча отфильтровываются. commit ниже трактует to >= max как «без верхней границы».
  const sliderMax = Math.ceil((max - min) / STEP) * STEP + min;
  // Сид из URL, зажатый в [min, max] — защита от ручного/устаревшего значения вне диапазона
  // (ярлык и позиция ручки иначе расходятся). Пустой priceFrom/priceTo → край диапазона.
  const urlFrom = clamp(Number(get('priceFrom')) || min, min, max);
  const urlTo = clamp(Number(get('priceTo')) || max, min, max);
  const [value, setValue] = useState<[number, number]>([urlFrom, urlTo]);

  // Ресинк ручек при внешнем изменении URL (reset/снятие чипа) — следим за значениями из URL.
  useEffect(() => {
    setValue([urlFrom, urlTo]);
  }, [urlFrom, urlTo]);

  // Диапазон вырожден (пустой каталог / одна цена) — слайдер не нужен.
  if (min >= max) return null;

  const commit = (v: number[]) => {
    const [from, to] = v;
    // Край диапазона → граница не задана: чистим параметр (null). useCatalogUrl сам сбросит page.
    setParams({
      priceFrom: from > min ? String(from) : null,
      priceTo: to < max ? String(to) : null,
    });
  };

  return (
    <div className="border-t border-line pt-4">
      <p className="font-semibold text-sm mb-3">Цена, ₽</p>
      <Slider
        min={min}
        max={sliderMax}
        step={STEP}
        value={value}
        onValueChange={(v) => setValue(v as [number, number])}
        onValueCommit={commit}
        minStepsBetweenThumbs={1}
        aria-label="Диапазон цены"
      />
      <div className="mt-3 flex items-center justify-between text-sm text-ink-muted">
        <span className="tnum">от {fmt(value[0])} ₽</span>
        <span className="tnum">до {fmt(Math.min(value[1], max))} ₽</span>
      </div>
    </div>
  );
}
