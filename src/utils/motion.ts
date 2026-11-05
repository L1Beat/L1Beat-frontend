// framer-motion, with animations skipped for visitors who ask for reduced
// motion. The CSS rule in index.css only covers CSS animations, and wrapping
// the app in MotionConfig would load framer-motion on every page.
import { MotionGlobalConfig } from 'framer-motion';

if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
  MotionGlobalConfig.skipAnimations = true;
}

export * from 'framer-motion';
