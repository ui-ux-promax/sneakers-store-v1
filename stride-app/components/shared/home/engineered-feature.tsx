import Link from 'next/link';
import Image from 'next/image';

const metrics = [
  { value: '−18%', label: 'вес против прошлой модели' },
  { value: '600км', label: 'ресурс подошвы' },
  { value: '42%', label: 'переработанных материалов' },
];

export function EngineeredFeature() {
  return (
    <section className="mx-auto max-w-[1240px] px-4 sm:px-6 pt-16 sm:pt-20">
      <div className="rounded-[28px] bg-footer text-white overflow-hidden grid md:grid-cols-2 items-center">
        <div className="p-8 sm:p-12">
          <p className="label !text-primary">STRIDE Engineered</p>
          <h2 className="font-display font-bold text-[28px] sm:text-[40px] leading-tight mt-2">Сделаны, чтобы<br />пройти дистанцию</h2>
          <p className="text-white/60 mt-3 leading-relaxed">Литая промежуточная подошва с возвратом энергии, дышащий верх из переработанной сетки и протектор, который держит и на асфальте, и на грунте.</p>
          <div className="grid grid-cols-3 gap-4 mt-6">
            {metrics.map((m) => (
              <div key={m.label}>
                <p className="font-display font-bold text-2xl text-primary tnum">{m.value}</p>
                <p className="text-xs text-white/60 mt-1">{m.label}</p>
              </div>
            ))}
          </div>
          <Link href="/catalog" className="btn btn-lg btn-primary mt-6">Выбрать пару</Link>
        </div>
        <div className="relative h-64 md:h-[420px]">
          <Image src="/products/Professional_product_photography_of_white_202605311739.png" alt="Технологичная подошва STRIDE крупным планом" fill className="object-contain p-8 drop-shadow-2xl" />
        </div>
      </div>
    </section>
  );
}
