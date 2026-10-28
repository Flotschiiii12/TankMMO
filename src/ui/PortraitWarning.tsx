import React, { useEffect, useState } from 'react';
import { tr } from '../i18n.ts';
import { Smartphone } from 'lucide-react';

export const PortraitWarning: React.FC = () => {
  const [isPortrait, setIsPortrait] = useState(false);

  useEffect(() => {
    const checkOrientation = () => {
      setIsPortrait(window.innerHeight > window.innerWidth);
    };

    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);

    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  }, []);

  if (!isPortrait) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/95 flex flex-col items-center justify-center p-6 text-center select-none backdrop-blur-sm">
      <div className="w-16 h-16 mb-4 rounded-2xl bg-orange-500/10 border border-orange-500/30 flex items-center justify-center text-orange-400 animate-pulse">
        <Smartphone size={32} className="rotate-90" />
      </div>

      <h2 className="text-xl font-bold tracking-tight text-white mb-2">
        {tr('Rotate Device to Landscape')}
      </h2>
      <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
        {tr('Treadfront is optimized for dual-thumb landscape armor combat. Turn your device horizontally to deploy onto the battlefield.')}
      </p>
    </div>
  );
};
