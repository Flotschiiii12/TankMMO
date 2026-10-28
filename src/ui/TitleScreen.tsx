import React, { useEffect } from 'react';
import { tr } from '../i18n.ts';
import { soundEngine } from '../audio/soundEngine.ts';
import { Play } from 'lucide-react';
import { Button } from './kit/Button.tsx';
import { LoadingScreen } from './title/LoadingScreen.tsx';
import { keybinds } from './title/keybinds.ts';

interface TitleScreenProps {
  onStart: () => void;
  playerLevel: number;
}

/** Last step of loading: the world is ready, one tap (also the browser's audio unlock) drops the player in. */
export const TitleScreen: React.FC<TitleScreenProps> = ({ onStart, playerLevel }) => {
  const go = () => { soundEngine.init(); soundEngine.playUIClick(); onStart(); };
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); go(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onStart]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <LoadingScreen stage="ready">
      <Button variant="primary" large onClick={go} data-autofocus>
        <Play size={18} aria-hidden /> {tr('DEPLOY TO BATTLEFIELD')}
      </Button>
      {playerLevel > 1 && <div className="tt-muted tabular-nums" style={{ textAlign: 'center' }}>{tr('Saved Profile: Pilot Level')} {playerLevel}</div>}
      <div className="tt-muted" style={{ textAlign: 'center' }}>
        {tr('Drive')}: {(['moveUp', 'moveLeft', 'moveDown', 'moveRight'] as const).map((a) => keybinds.label(a)).join('')} · {tr('Auto fire')}: {keybinds.label('autoFire')} · {tr('Abilities')}: {(['smoke', 'repair', 'boost'] as const).map((a) => keybinds.label(a)).join('/')} · {tr('Touch')}: {tr('left stick and target ring')}
      </div>
    </LoadingScreen>
  );
};
