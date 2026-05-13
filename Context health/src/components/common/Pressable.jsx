import { motion } from 'framer-motion';

const tapTransition = { type: 'spring', stiffness: 600, damping: 25 };
const releaseTransition = { type: 'spring', stiffness: 300, damping: 15 };

export default function Pressable({ as = 'button', pressScale = 0.92, children, ...props }) {
  const Comp = motion[as];
  return (
    <Comp
      whileTap={{ scale: pressScale, transition: tapTransition }}
      transition={releaseTransition}
      {...props}
    >
      {children}
    </Comp>
  );
}
