import { GameShell } from './ui/GameShell.tsx';
import { OnlineGate } from './ui/OnlineGate.tsx';

export default function App() {
  return <OnlineGate>{(online) => <GameShell online={online} />}</OnlineGate>;
}
