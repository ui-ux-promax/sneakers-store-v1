'use client';
import { useState } from 'react';
import { Star } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import { submitReview } from '@/app/actions/review';

export function ReviewForm({ productId }: { productId: string }) {
  const router = useRouter();
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (rating < 1) { setError('Поставьте оценку'); return; }
    setPending(true);
    const res = await submitReview({ productId, rating, body });
    setPending(false);
    if (!res.ok) { setError(res.error); return; }
    setRating(0); setBody('');
    router.refresh();
  };

  return (
    <form onSubmit={onSubmit} className="rounded-2xl border border-line bg-surface p-4 space-y-3">
      <div role="radiogroup" aria-label="Оценка" className="flex gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <button key={i} type="button" role="radio" aria-checked={rating === i} aria-label={`${i} из 5`}
            onClick={() => setRating(i)} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(0)}
            className="p-0.5">
            <Star size={24} strokeWidth={1.5}
              className={i <= (hover || rating) ? 'text-amber-400 fill-current' : 'text-line'} />
          </button>
        ))}
      </div>
      <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={1000}
        placeholder="Поделитесь впечатлением (необязательно)" className="inp min-h-24 w-full" />
      {error && <p className="text-danger text-sm" role="status">{error}</p>}
      <Button type="submit" variant="primary" loading={pending}>Оставить отзыв</Button>
    </form>
  );
}
