'use client';
import { useEffect, useState } from 'react';

// Обратный отсчёт в секундах. start(sec) запускает/перезапускает; тикает к 0 и останавливается.
export function useCountdown(): { seconds: number; start: (sec: number) => void } {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (seconds <= 0) return;
    const t = setTimeout(() => setSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(t);
  }, [seconds]);
  return { seconds, start: setSeconds };
}
