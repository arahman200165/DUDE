import { useEffect } from 'react';
import { BackHandler, Keyboard, TextInput } from 'react-native';

/**
 * The first Back press while the soft keyboard is open (or an input still has focus, as with a floating or
 * hardware-assisted IME that reports no height) must only dismiss it. Without this, React Native hands Back to
 * the router and the tool screen is popped with the keyboard still up (observed on API 36 and by Maestro's
 * hideKeyboard), which also loses the user's in-progress input.
 */
export function useKeyboardBack(): void {
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!Keyboard.isVisible() && !TextInput.State.currentlyFocusedInput()) return false;
      Keyboard.dismiss();
      return true;
    });
    return () => subscription.remove();
  }, []);
}
