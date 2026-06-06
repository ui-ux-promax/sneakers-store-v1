import { RatingStars } from './rating-stars';

export type ReviewItem = {
  id: string;
  rating: number;
  body: string | null;
  createdAt: Date;
  authorName: string;
};

export function ReviewList({ reviews }: { reviews: ReviewItem[] }) {
  if (reviews.length === 0) {
    return <p className="text-ink-muted text-sm">Пока нет отзывов. Будьте первым после покупки.</p>;
  }
  return (
    <ul className="space-y-4">
      {reviews.map((r) => (
        <li key={r.id} className="rounded-2xl border border-line bg-surface p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="font-semibold">{r.authorName}</span>
            <RatingStars value={r.rating} size={14} />
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-ink-muted">
            <span>{r.createdAt.toLocaleDateString('ru-RU')}</span>
            <span className="inline-flex items-center rounded-full bg-success/10 text-success px-2 py-0.5">Покупка подтверждена</span>
          </div>
          {r.body && <p className="mt-2 text-sm leading-relaxed">{r.body}</p>}
        </li>
      ))}
    </ul>
  );
}
