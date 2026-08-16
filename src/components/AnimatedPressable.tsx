import { useCallback } from 'react';
import { Pressable, type GestureResponderEvent, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import * as haptics from '../lib/haptics';

const AnimatedPressableBase = Animated.createAnimatedComponent(Pressable);

interface AnimatedPressableProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle>;
}

export function AnimatedPressable({ style, disabled, onPressIn, onPressOut, ...rest }: AnimatedPressableProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = useCallback(
    (event: GestureResponderEvent) => {
      scale.value = withSpring(0.96, { damping: 15, stiffness: 300 });
      // Every pressable in the app routes through this component, so putting
      // the press haptic here means none can be missed or drift out of sync.
      if (!disabled) {
        haptics.tap();
      }
      onPressIn?.(event);
    },
    [onPressIn, scale, disabled]
  );

  const handlePressOut = useCallback(
    (event: GestureResponderEvent) => {
      scale.value = withSpring(1, { damping: 15, stiffness: 300 });
      onPressOut?.(event);
    },
    [onPressOut, scale]
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
