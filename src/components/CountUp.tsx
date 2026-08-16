import { useEffect, useState } from 'react';
import { Text, type TextProps } from 'react-native';

interface CountUpProps extends TextProps {
  value: number;
  /** Milliseconds for the whole tween. */
  duration?: number;
}

/**
 * Tweens to a new number instead of cutting to it.
 *
 * Points and balances change as a result of something the user just did, and a
 * value that jumps gives no sense of having moved. Rendered as text rather than
 * an animated style because the digits themselves change, not a transform.
 */
export function CountUp({ value, duration = 260, ...rest }: CountUpProps) {
  const [shown, setShown] = useState(value);

  useEffect(() => {
    const from = shown;
    const delta = value - from;
    if (delta === 0) {
      return;
    }

    const started = Date.now();
    const timer = setInterval(() => {
      const progress = Math.min(1, (Date.now() - started) / duration);
      // Ease-out: fast first, settling at the end.
      const eased = 1 - Math.pow(1 - progress, 3);
      setShown(Math.round(from + delta * eased));
      if (progress >= 1) {
        clearInterval(timer);
      }
    }, 16);

    return () => clearInterval(timer);
    // Intentionally keyed on `value` only: re-running when `shown` changes
    // would restart the tween on every frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);

  return <Text {...rest}>{shown}</Text>;
}
