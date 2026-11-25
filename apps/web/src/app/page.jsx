import Link from 'next/link';
import { ArrowRight, Compass, Layers, SlidersHorizontal } from 'lucide-react';
import QuickFitBar from '@/components/home/QuickFitBar';
import BikeCard from '@/components/ui/BikeCard';
import { fetchServerApi } from '@/lib/api-client';
import { getServerLocale } from '@/lib/i18n/server';
import { getDictionary } from '@/lib/i18n/translate';

export const dynamic = 'force-dynamic';

const TERRAIN_KEYS = ['OFF_ROAD', 'ON_OFF_MIXED', 'ON_ROAD_ADV'];

/**
 * Editorial Industrial Motorsport Homepage with Quick Rider-Fit entry bar and localized terrain lanes.
 * @returns {Promise<import('react').JSX.Element>}
 */
export default async function HomePage() {
  const [locale, bikesRes] = await Promise.all([
    getServerLocale(),
    fetchServerApi('/api/v1/bikes?limit=6', { revalidate: 0 }),
  ]);
  const dict = getDictionary(locale);
  const featuredBikes = bikesRes?.data ?? [];

  return (
    <div className="mx-auto max-w-[1360px] px-4 py-10 sm:px-6 sm:py-14">
      {/* Minimal Editorial Hero + Single Primary Entry Action */}
      <section className="border-b border-line pb-12">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 border border-line bg-surface px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest text-ink-secondary">
            <span className="h-2 w-2 bg-signal" />
            <span>{dict.home.heroBadge}</span>
          </div>
          <h1 className="mt-5 font-display text-3xl font-extrabold tracking-tight text-ink sm:text-5xl">
            {dict.home.heroTitle}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-ink-secondary">
            {dict.home.heroSubtitle}
          </p>
        </div>

        <div className="mt-8">
          <QuickFitBar />
        </div>
      </section>

      {/* 3 Terrain Lanes */}
      <section className="mt-12 grid gap-4 md:grid-cols-3">
        {TERRAIN_KEYS.map((focus) => {
          const lane = dict.home.lanes[focus];
          return (
            <Link
              key={focus}
              href={`/bikes?ridingFocus=${focus}`}
              className="group flex flex-col justify-between border border-line bg-surface p-6 transition-colors hover:border-line-strong"
            >
              <div>
                <div className="text-[11px] font-bold uppercase tracking-widest text-signal">
                  {lane.tag}
                </div>
                <h2 className="mt-2 font-display text-xl font-bold text-ink">{lane.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-ink-secondary">{lane.summary}</p>
              </div>
              <div className="mt-5 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-ink group-hover:text-signal">
                <span>{dict.home.viewCategory}</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </div>
            </Link>
          );
        })}
      </section>

      {/* Featured Motorcycles */}
      <section className="mt-14">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-ink-muted">
              {dict.home.featuredKicker}
            </div>
            <h2 className="mt-1 font-display text-2xl font-bold text-ink">
              {dict.home.featuredTitle}
            </h2>
          </div>
          <Link
            href="/bikes"
            className="inline-flex items-center gap-1.5 rounded-sm border border-line-strong bg-surface px-4 py-2 text-xs font-bold uppercase tracking-wider text-ink hover:bg-ink hover:text-surface"
          >
            <span>{dict.home.allBikesBtn}</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {featuredBikes.length === 0 ? (
          <div className="mt-6 border border-line bg-surface p-8 text-center text-sm text-ink-secondary">
            {dict.home.connectingCatalog}
          </div>
        ) : (
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {featuredBikes.map((bike) => (
              <BikeCard key={bike.id} bike={bike} />
            ))}
          </div>
        )}
      </section>

      {/* Technical Pillar Strip */}
      <section className="mt-16 grid gap-6 border border-line bg-surface p-6 md:grid-cols-3">
        <div className="flex gap-3">
          <SlidersHorizontal className="h-5 w-5 shrink-0 text-signal" />
          <div>
            <h3 className="text-sm font-bold text-ink">{dict.home.pillars.sagTitle}</h3>
            <p className="mt-1 text-xs leading-relaxed text-ink-secondary">
              {dict.home.pillars.sagBody}
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <Layers className="h-5 w-5 shrink-0 text-signal" />
          <div>
            <h3 className="text-sm font-bold text-ink">{dict.home.pillars.ghostTitle}</h3>
            <p className="mt-1 text-xs leading-relaxed text-ink-secondary">
              {dict.home.pillars.ghostBody}
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <Compass className="h-5 w-5 shrink-0 text-signal" />
          <div>
            <h3 className="text-sm font-bold text-ink">{dict.home.pillars.comboTitle}</h3>
            <p className="mt-1 text-xs leading-relaxed text-ink-secondary">
              {dict.home.pillars.comboBody}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
