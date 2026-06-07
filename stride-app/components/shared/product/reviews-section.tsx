import Link from 'next/link';
import { RatingStars } from './rating-stars';
import { ReviewList, type ReviewItem } from './review-list';
import { ReviewForm } from './review-form';

type Props = {
  productId: string;
  avg: number;
  count: number;
  reviews: ReviewItem[];
  state: 'eligible' | 'guest' | 'not-purchased' | 'already-reviewed';
};

export function ReviewsSection({ productId, avg, count, reviews, state }: Props) {
  return (
    <section className="mt-16" id="reviews">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-5">
        <h2 className="font-display font-bold text-2xl">Отзывы</h2>
        {count > 0 && <RatingStars value={avg} count={count} />}
        {state !== 'eligible' && (
          <span className="text-sm text-ink-muted">
            {state === 'guest' ? (
              <><Link href="/login" className="underline">Войдите</Link>, чтобы оставить отзыв.</>
            ) : state === 'not-purchased' ? (
              'Отзыв можно оставить после покупки этого товара.'
            ) : (
              'Вы уже оставили отзыв на этот товар. Спасибо!'
            )}
          </span>
        )}
      </div>
      {state === 'eligible' ? (
        <div className="grid lg:grid-cols-[minmax(0,1fr)_440px] gap-6 lg:gap-10 items-start">
          <ReviewList reviews={reviews} />
          <ReviewForm productId={productId} />
        </div>
      ) : (
        <ReviewList reviews={reviews} />
      )}
    </section>
  );
}
