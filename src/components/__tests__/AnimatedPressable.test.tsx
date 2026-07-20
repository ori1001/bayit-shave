import { render, fireEvent } from '@testing-library/react-native';
import { Text } from 'react-native';
import { AnimatedPressable } from '../AnimatedPressable';

describe('AnimatedPressable', () => {
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
