import { WardrobeMotion } from "../components/brand/wardrobe-motion";
import styles from "./not-found.module.css";

export default function NotFound() {
  return (
    <main className={styles.page}>
      <section className={styles.story}>
        <WardrobeMotion artwork="logo" className={styles.motion} polarity="dark" size="lg" variant="404" />
        <p className={styles.eyebrow}>Wardrobe 404</p>
        <h1>This piece isn’t in this wardrobe.</h1>
        <p className={styles.copy}>The rail has moved on. Return to the current edit and find what is ready now.</p>
        <a className={styles.action} href="/shop">Enter the current drop</a>
      </section>
    </main>
  );
}
