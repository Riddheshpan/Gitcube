import * as React from 'react';
import { Button as PaperButton, ButtonProps as PaperButtonProps } from 'react-native-paper';
import { StyleSheet } from 'react-native';

interface ButtonProps extends Omit<PaperButtonProps, 'theme'> {
  // Add custom props here if needed
}

export const Button = ({ style, ...props }: ButtonProps) => {
  return (
    <PaperButton
      style={[styles.button, style]}
      {...props}
    />
  );
};

const styles = StyleSheet.create({
  button: {
    borderRadius: 8,
  },
});
