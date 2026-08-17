import { render, fireEvent } from '@testing-library/react-native';
import { Text } from 'react-native';
import { AnimatedPressable } from '../AnimatedPressable';
import * as haptics from '../../lib/haptics';

jest.mock('../../lib/haptics');

describe('AnimatedPressable', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('gives haptic feedback the moment a press starts, not when it completes', async () => {
    const { getByTestId } = await render(
      <AnimatedPressable testID="haptic-pressable">
        <Text>Press me</Text>
      </AnimatedPressable>
    );

    // Every pressable in the app routes through this component, so this is the
    // single place that decides whether taps are felt at all.
    await fireEvent(getByTestId('haptic-pressable'), 'pressIn');
    expect(haptics.tap).toHaveBeenCalledTimes(1);
  });

  it('stays silent for a disabled control, which has not accepted the press', async () => {
    const { getByTestId } = await render(
      <AnimatedPressable testID="haptic-disabled" disabled>
        <Text>Press me</Text>
      </AnimatedPressable>
    );

    await fireEvent(getByTestId('haptic-disabled'), 'pressIn');
    expect(haptics.tap).not.toHaveBeenCalled();
  });

  it('calls onPress when pressed', async () => {
    const onPress = jest.fn();
    const { getByTestId } = await render(
      <AnimatedPressable onPress={onPress} testID="animated-pressable-test">
        <Text>Press me</Text>
      </AnimatedPressable>
    );
    await fireEvent.press(getByTestId('animated-pressable-test'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not call onPress when disabled', async () => {
    const onPress = jest.fn();
    const { getByTestId } = await render(
      <AnimatedPressable onPress={onPress} disabled testID="animated-pressable-disabled">
        <Text>Press me</Text>
      </AnimatedPressable>
    );
    await fireEvent.press(getByTestId('animated-pressable-disabled'));
    expect(onPress).not.toHaveBeenCalled();
  });
});
