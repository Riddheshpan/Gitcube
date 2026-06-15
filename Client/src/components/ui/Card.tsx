import * as React from 'react';
import { Card as PaperCard, CardProps } from 'react-native-paper';
import { StyleSheet } from 'react-native';

export const Card = ({ style, ...props }: CardProps) => {
  return (
    <PaperCard style={[styles.card, style]} {...(props as any)} />
  );
};

Card.Content = PaperCard.Content;
Card.Title = PaperCard.Title;
Card.Actions = PaperCard.Actions;
Card.Cover = PaperCard.Cover;

const styles = StyleSheet.create({
  card: {
    marginVertical: 8,
    borderRadius: 12,
  },
});
