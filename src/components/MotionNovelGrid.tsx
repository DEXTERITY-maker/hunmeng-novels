import { motion, useMotionValue, useReducedMotion, useSpring } from 'motion/react';
import type { PointerEvent } from 'react';

export interface HomeNovel {
  slug: string;
  url: string;
  title: string;
  author: string;
  cover: string;
  description: string;
  genres: string[];
  chapters: string;
  translationStatus: string;
  date: string;
  art?: 'comprehension' | 'latency';
}

function BookCard({ novel }: { novel: HomeNovel }) {
  const reduceMotion = useReducedMotion();
  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const rotateX = useSpring(rawX, { stiffness: 270, damping: 28, mass: 0.8 });
  const rotateY = useSpring(rawY, { stiffness: 270, damping: 28, mass: 0.8 });

  function onMove(event: PointerEvent<HTMLElement>) {
    // Keep keyboard, touch and reduced-motion interactions predictable.
    if (reduceMotion || event.pointerType !== 'mouse') return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;
    rawY.set(x * 5);
    rawX.set(y * -4);
  }
  function onLeave() {
    rawX.set(0);
    rawY.set(0);
  }

  return (
    <motion.article
      className="home-book-card hm-motion-book-card"
      data-novel={novel.slug}
      data-art={novel.art}
      style={{ rotateX: reduceMotion ? 0 : rotateX, rotateY: reduceMotion ? 0 : rotateY, transformPerspective: 1050 }}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      variants={{ rest: { y: 0 }, hover: { y: -5 } }}
      initial="rest"
      animate="rest"
      whileHover={reduceMotion ? undefined : 'hover'}
      transition={{ type: 'spring', stiffness: 260, damping: 27 }}
    >
      {novel.art && <span className="home-book-art" aria-hidden="true" />}
      <a className="home-book-link" href={novel.url} aria-label={`View novel “${novel.title}”`}>
        <span className="home-book-cover">
          <motion.img
            src={novel.cover}
            alt=""
            width={260}
            height={380}
            loading="lazy"
            decoding="async"
            variants={{ rest: { scale: 1 }, hover: { scale: 1.055 } }}
            transition={{ type: 'spring', stiffness: 200, damping: 25 }}
          />
        </span>
        <div className="home-book-copy">
          <span className="home-book-genre">{novel.genres.join(' · ')}</span>
          <h3 className="home-book-title">{novel.title}</h3>
          <span className="home-book-author">{novel.author}</span>
          <span className="home-book-description">{novel.description}</span>
          <span className="home-book-meta">{novel.chapters} · {novel.date}</span>
          <span className="home-book-read">
            Read
            <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12h16m-7-7 7 7-7 7" />
            </svg>
          </span>
        </div>
      </a>
    </motion.article>
  );
}

/**
 * A single server-rendered React island for the entire homepage book grid.
 * Astro's client:visible directive hydrates only when the grid approaches view.
 * Do not use client:only: book links and metadata must exist without JavaScript.
 */
export default function MotionNovelGrid({ novels }: { novels: HomeNovel[] }) {
  return (
    <div className="home-cover-grid" aria-label="New releases">
      {novels.map((novel) => <BookCard key={novel.slug} novel={novel} />)}
    </div>
  );
}
