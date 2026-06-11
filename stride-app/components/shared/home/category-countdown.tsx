'use client';
import { useEffect, useState } from 'react';

// Стабильное начальное значение для SSR/первого рендера (как в прототипе: 23:45:12).
// Реальный отсчёт стартует в useEffect, чтобы избежать рассинхрона гидрации.
const INITIAL = { h: '23', m: '45', s: '12' };

function pad(n: number) {
  return String(n).padStart(2, '0');
}

export function CategoryCountdown() {
  const [time, setTime] = useState(INITIAL);

  useEffect(() => {
    // endTime считаем на клиенте, чтобы рендер сервера и клиента совпадали.
    const endTime = Date.now() + 23 * 60 * 60 * 1000 + 45 * 60 * 1000 + 12 * 1000;

    function tick() {
      const distance = endTime - Date.now();
      if (distance < 0) {
        setTime({ h: '00', m: '00', s: '00' });
        return;
      }
      const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((distance % (1000 * 60)) / 1000);
      setTime({ h: pad(hours), m: pad(minutes), s: pad(seconds) });
    }

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="bg-black/50 backdrop-blur-sm rounded-lg p-2 inline-block">
      {/* Декоративный маркетинговый таймер (сбрасывается на 23:45:12 при каждом маунте) —
          прячем от скринридеров, иначе aria-live тараторил бы каждую секунду. */}
      <div className="flex gap-1.5 sm:gap-2 text-white text-xs font-mono" aria-hidden="true">
        <div className="text-center">
          <div className="text-sm sm:text-lg font-bold tnum">{time.h}</div>
          <div className="text-[9px] sm:text-[10px] opacity-75">ЧАС</div>
        </div>
        <div className="text-sm sm:text-lg">:</div>
        <div className="text-center">
          <div className="text-sm sm:text-lg font-bold tnum">{time.m}</div>
          <div className="text-[9px] sm:text-[10px] opacity-75">МИН</div>
        </div>
        <div className="text-sm sm:text-lg">:</div>
        <div className="text-center">
          <div className="text-sm sm:text-lg font-bold tnum">{time.s}</div>
          <div className="text-[9px] sm:text-[10px] opacity-75">СЕК</div>
        </div>
      </div>
    </div>
  );
}
