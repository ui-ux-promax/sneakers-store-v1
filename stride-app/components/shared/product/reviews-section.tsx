import Link from 'next/link';
import { RatingStars } from './rating-stars';
import { ReviewList, type ReviewItem } from './review-list';
import { ReviewForm } from './review-form';

type Props = {
  productId: string;
  avg: number;
  count: number;
  reviews: ReviewItem[];
  state: 'eligible' | 'guest' | 'not-eligible';
};

export function ReviewsSection({ productId, avg, count, reviews, state }: Props) {
  return (
    <section className="mt-16" id="reviews">
      <div className="flex items-center gap-3 mb-5">
        <h2 className="font-display font-bold text-2xl">Отзывы</h2>
        {count > 0 && <RatingStars value={avg} count={count} />}
      </div>
      <div className="grid lg:grid-cols-[minmax(0,1fr)_440px] gap-6 lg:gap-10 items-start">
        <ReviewList reviews={reviews} />
        <div>
          {state === 'eligible' && <ReviewForm productId={productId} />}
          {state === 'guest' && (
            <p className="text-sm text-ink-muted rounded-2xl border border-line bg-surface p-4">
              <Link href="/login" className="underline">Войдите</Link>, чтобы оставить отзыв.
            </p>
          )}
          {state === 'not-eligible' && (
            <p className="text-sm text-ink-muted rounded-2xl border border-line bg-surface p-4">
              Отзыв можно оставить после покупки этого товара.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
