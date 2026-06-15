import * as React from 'react';
import { Badge as PaperBadge, BadgeProps } from 'react-native-paper';

export const Badge = (props: BadgeProps) => {
  return <PaperBadge {...props} />;
};
