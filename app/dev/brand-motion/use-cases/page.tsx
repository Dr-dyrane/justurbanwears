import Link from "next/link";
import { notFound } from "next/navigation";
import { WardrobeMotion } from "../../../../components/brand/wardrobe-motion";
import styles from "./use-cases.module.css";

export default function BrandMotionUseCasesPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p>Global production choreography</p>
        <h1>One identity. Four truthful moments.</h1>
        <span>Each state has one psychological job. Motion confirms the meaning already established by the interface.</span>
        <nav aria-label="Brand motion previews">
          <Link href="/dev/brand-motion">Full motion laboratory</Link>
          <Link href="/dev/brand-motion/stage">Full-screen loading stage</Link>
        </nav>
      </header>

      <section className={styles.grid}>
        <article className={`${styles.card} ${styles.loading}`}>
          <WardrobeMotion loop polarity="dark" size="md" variant="loader" />
          <div><small>01 · Continuity</small><h2>Opening the next view.</h2><p>Global route wait · appears only after 420ms.</p></div>
        </article>

        <article className={`${styles.card} ${styles.success}`}>
          <WardrobeMotion artwork="logo" polarity="light" size="md" variant="success" />
          <div><small>02 · Commitment</small><h2>Your piece is held.</h2><p>Order reserved · payment truth remains visible.</p></div>
        </article>

        <article className={`${styles.card} ${styles.receipt}`}>
          <WardrobeMotion artwork="logo" polarity="light" size="md" variant="success" />
          <div><small>03 · Closure</small><h2>Saved to Wardrobe.</h2><p>Garment intake and approved Wear receipts.</p></div>
        </article>

        <article className={`${styles.card} ${styles.absence}`}>
          <WardrobeMotion artwork="logo" polarity="dark" size="md" variant="empty" />
          <div><small>04 · Recovery</small><h2>This record isn’t here.</h2><p>Rare missing order or global 404 · never a routine empty list.</p></div>
        </article>
      </section>
    </main>
  );
}
