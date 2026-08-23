import { notFound } from "next/navigation";
import { WardrobeMotion } from "../../../components/brand/wardrobe-motion";
import { WARDROBE_MOTION_VARIANTS } from "../../../components/brand/wardrobe-motion.types";
import styles from "./preview.module.css";

export default function BrandMotionPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p>Internal identity proof</p>
        <h1>The wardrobe opens. The mark remains exact.</h1>
        <span>Every moving layer is masked from the production master; the first and final frames are the untouched asset.</span>
      </header>

      <section className={`${styles.composition} ${styles.light}`}>
        <div className={styles.sectionHeading}><p>Warm paper</p><h2>All variants</h2></div>
        <div className={styles.grid}>
          {WARDROBE_MOTION_VARIANTS.map((variant) => (
            <article className={styles.card} key={`light-${variant}`}>
              <WardrobeMotion loop polarity="light" size="md" variant={variant} />
              <span>{variant}</span>
            </article>
          ))}
        </div>
      </section>

      <section className={`${styles.composition} ${styles.dark}`}>
        <div className={styles.sectionHeading}><p>Ink</p><h2>Authored dark polarity</h2></div>
        <div className={styles.grid}>
          {WARDROBE_MOTION_VARIANTS.map((variant) => (
            <article className={styles.card} key={`dark-${variant}`}>
              <WardrobeMotion loop polarity="dark" size="md" variant={variant} />
              <span>{variant}</span>
            </article>
          ))}
        </div>
      </section>

      <section className={`${styles.composition} ${styles.light}`}>
        <div className={styles.sectionHeading}><p>Scale proof</p><h2>Small, medium, large</h2></div>
        <div className={styles.scaleRow}>
          <WardrobeMotion loop size="sm" variant="loader" />
          <WardrobeMotion loop size="md" variant="entrance" />
          <WardrobeMotion loop size="lg" variant="ambient" />
        </div>
      </section>

      <section className={`${styles.composition} ${styles.reduced}`}>
        <div className={styles.sectionHeading}><p>Accessibility</p><h2>Reduced-motion simulation</h2></div>
        <div className={styles.grid}>
          {WARDROBE_MOTION_VARIANTS.map((variant) => (
            <article className={styles.card} key={`reduced-${variant}`}>
              <WardrobeMotion loop motion="reduced" polarity="dark" size="md" variant={variant} />
              <span>{variant}</span>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
