import React from 'react';

interface CRTOverlayProps {
  enabled: boolean;
}

export const CRTOverlay: React.FC<CRTOverlayProps> = ({ enabled }) => {
  if (!enabled) return null;

  return (
    <>
      <div className="crt-overlay" />
      <div className="crt-vignette" />
    </>
  );
};
