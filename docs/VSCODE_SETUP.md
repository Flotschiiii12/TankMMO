# Arbeiten mit VS Code (Remote-SSH) am Server

1. VS Code öffnen, Erweiterung **Remote - SSH** (Microsoft) installieren.
2. `F1` -> „Remote-SSH: Connect to Host…" -> `root@213.199.44.82` (bzw. Host aus `~/.ssh/config`). Beim ersten Mal Schlüssel/Passwort bestätigen.
3. Im neuen Fenster: „Ordner öffnen" -> `/root/treadfront-dev/TankMMO` (NICHT `treadfront-live`).
4. KI-Erweiterung (z. B. GitHub Copilot oder Claude Code) im Remote-Fenster installieren: Button „Auf SSH installieren" und anmelden.
5. Dem Agenten als erste Nachricht: „Lies AGENTS.md und CLAUDE.md und fasse den Stand zusammen."
6. Terminal in VS Code: `npm install --legacy-peer-deps`, dann `npm test` und `npm run lint`.
7. Committen auf `claude/unify-client`. Deploy macht der Besitzer selbst (Zeile steht in `AGENTS.md`).

Nur ein Agent gleichzeitig an denselben Dateien; zwischen den Aufgaben committen.
