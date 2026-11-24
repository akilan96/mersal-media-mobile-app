import React from 'react';
import Svg, { Path } from 'react-native-svg';

export function GoogleDriveIcon({ size = 22 }: { size?: number }) {
  return <Svg width={size} height={size} viewBox="0 0 48 48" accessible={false}>
    <Path fill="#00832D" d="M24 15.2 30.9 3H17.1Z" />
    <Path fill="#00AC47" d="M17.1 3 3.3 27.1l6.9 12.1 13.8-24Z" />
    <Path fill="#FFBA00" d="M30.9 3 24 15.2l13.8 24 6.9-12.1Z" />
    <Path fill="#2684FC" d="M10.2 39.2h27.6l6.9-12.1H17.1Z" />
    <Path fill="#0066DA" d="M3.3 27.1h13.8l-6.9 12.1Z" />
    <Path fill="#EA4335" d="M30.9 27.1h13.8l-6.9 12.1Z" />
  </Svg>;
}
