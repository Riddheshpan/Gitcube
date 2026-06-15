import * as React from 'react';
import { Avatar as PaperAvatar } from 'react-native-paper';

interface AvatarProps {
  source?: { uri: string };
  label?: string;
  size?: number;
}

export const Avatar = ({ source, label, size = 40 }: AvatarProps) => {
  if (source?.uri) {
    return <PaperAvatar.Image size={size} source={source} />;
  }
  return <PaperAvatar.Text size={size} label={label || '?'} />;
};
