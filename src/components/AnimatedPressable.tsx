import { useCallback } from 'react';
import { Pressable, type GestureResponderEvent, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import * as haptics from '../lib/haptics';

const AnimatedPressableBase = Animated.createAnimatedComponent(Pressable);

/** How far a press sinks. 0.96 was measured to be invisible at tap speed. */
const PRESSED_SCALE = 0.94;
const PRESSED_OPACITY = 0.82;

interface AnimatedPressableProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle>;
}

export function AnimatedPressable({ style, disabled, onPressIn, onPressOut, ...rest }: AnimatedPressableProps) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const handlePressIn = useCallback(
    (event: GestureResponderEvent) => {
      // Timing, not a spring, on the way down. A spring approaches its target
      // asymptotically: the old withSpring(0.96) had moved 0.6% by 120ms, which
      // is the whole length of a tap -- so the press read as no feedback at all.
      // A fixed 70ms ramp is fully arrived before the finger lifts.
      scale.value = withTiming(PRESSED_SCALE, { duration: 70, easing: Easing.out(Easing.quad) });
      opacity.value = withTiming(PRESSED_OPACITY, { duration: 70 });
      // Every pressable in the app routes through this component, so putting
      // the press haptic here means none can be missed or drift out of sync.
      if (!disabled) {
        haptics.tap();
      }
      onPressIn?.(event);
    },
    [onPressIn, scale, opacity, disabled]
  );

  const handlePressOut = useCallback(
    (event: GestureResponderEvent) => {
      // The release keeps its spring: a slight overshoot here reads as the
      // control pushing back, and unlike the press it is not racing a finger.
      scale.value = withSpring(1, { damping: 12, stiffness: 420, overshootClamping: false });
      opacity.value = withTiming(1, { duration: 120 });
      onPressOut?.(event);
    },
    [onPressOut, scale, opacity]
  );

  return (
    <AnimatedPressableBase
      {...rest}
      disabled={disabled}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[style, animatedStyle, disabled ? { opacity: 0.5 } : null]}
    />
  );
}
