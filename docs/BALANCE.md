# Treadfront — Balance & Formulas

All balance numbers and curves are strictly codified in `/shared/rules` and `/shared/data`.

---

## 1. Combat & Damage Formula

### 1.1 Angle Multiplier ($M_{\text{angle}}$)
Given impact angle $\theta \in [-\pi, \pi]$ relative to target's chassis forward vector:
$$
M_{\text{angle}} =
\begin{cases}
0.70 & \text{if } |\theta| \le \frac{\pi}{4} \quad (45^\circ, \text{Front}) \\
1.40 & \text{if } |\theta| \ge \frac{3\pi}{4} \quad (135^\circ, \text{Rear}) \\
1.00 & \text{otherwise} \quad (\text{Side})
\end{cases}
$$

### 1.2 Damage Reduction & Armor Penetration
Given raw damage $D_{\text{raw}}$, ammo multiplier $M_{\text{ammo}}$, crit multiplier $M_{\text{crit}} \in \{1.0, 1.5\}$, status multiplier $M_{\text{status}} = 1.15$ if Marked else $1.0$:

$$
D_{\text{base}} = D_{\text{raw}} \cdot M_{\text{ammo}} \cdot M_{\text{crit}} \cdot M_{\text{angle}} \cdot M_{\text{status}}
$$

Target flat armor reduction $R_{\text{flat}}$ is subtracted before the armor split, with a strict floor at $10\%$ of base damage:
$$
D_{\text{red}} = \max\left(D_{\text{base}} \cdot 0.10, \, D_{\text{base}} - R_{\text{flat}}\right)
$$

### 1.3 Armor vs. Hull Split
Target has current armor $A \ge 0$. While armor remains:
$$
\text{Allocated Armor Damage } D_{\text{armor}} = D_{\text{red}} \cdot 0.80
$$
$$
\text{Allocated Hull Damage } D_{\text{hull}} = D_{\text{red}} \cdot 0.20
$$

If $D_{\text{armor}} > A$:
$$
\text{Actual Armor Damage} = A
$$
$$
\text{Actual Hull Damage} = D_{\text{hull}} + (D_{\text{armor}} - A)
$$

When $A = 0$:
$$
\text{Actual Hull Damage} = D_{\text{red}} \cdot 1.00
$$

---

## 2. Ammo Multipliers ($M_{\text{ammo}}$)

| Ammo Type | Base Mod | Boss / Bunker Mod | Heavy Vehicle Mod | Armor Bypass | Splash |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `STANDARD` | 1.00x | 1.00x | 1.00x | 0% | None |
| `REINFORCED` | 1.25x | 1.25x | 1.25x | 0% | None |
| `ARMOR_PIERCING` | 1.00x | 1.00x | 0.80x | 40% flat reduction | None |
| `SHAPED_CHARGE` | 0.70x | 1.60x | 0.70x | 20% flat reduction | None |
| `EXPLOSIVE` | 0.85x | 0.85x | 0.85x | 0% | 60 radius |

---

## 3. Vehicle Scaling by Tier ($t \in [1, 10]$)
$$
\text{Durability/Damage Scaling: } 1.45^{t - 1}
$$
$$
\text{Speed Scaling: } 1.04^{t - 1}
$$

| Tier | Name | Level Req | Base Hull | Base Armor | Base DPS | Base Speed |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | Patchwork | 1 | 1,200 | 800 | 150 | 180 |
| 2 | Drifter | 8 | 1,740 | 1,160 | 218 | 187 |
| 3 | Wanderer | 16 | 2,523 | 1,682 | 315 | 195 |
| 4 | Warden | 24 | 3,658 | 2,439 | 457 | 203 |
| 5 | Striker | 34 | 5,304 | 3,536 | 663 | 211 |
| 6 | Bulwark | 44 | 7,691 | 5,128 | 962 | 219 |
| 7 | Conqueror | 56 | 11,153 | 7,435 | 1,394 | 228 |
| 8 | Behemoth | 68 | 16,171 | 10,781 | 2,022 | 237 |
| 9 | Titan | 80 | 23,448 | 15,632 | 2,932 | 247 |
| 10 | Colossus | 92 | 34,000 | 22,667 | 4,251 | 256 |

---

## 4. Experience & Level Progression
XP required to advance from level $n - 1$ to level $n$:
$$
\text{XP}(n) = \text{round}\left(80 \cdot n^{2.1}\right)
$$

### Level Difference Multiplier for Kill XP
Given player level $L_p$ and enemy level $L_e$, diff $= L_e - L_p$:
- If $\text{diff} \le -10$: $0.00\times$ (grey mob, zero reward)
- If $-9 \le \text{diff} \le 0$: $1.0 + (\text{diff} / 10) \times 0.9$
- If $0 < \text{diff} \le 5$: $1.0 + (\text{diff} / 5) \times 0.25$ (up to $1.25\times$ for challenging enemies)
- If $\text{diff} > 5$: $1.25\times$

---

## 5. Combat Power Rating
$$
\text{CombatPower} = \text{round}\left(\sqrt{\text{DPS}_{\text{eff}} \cdot (\text{Hull}_{\text{max}} + \text{Armor}_{\text{max}})_{\text{eff}}} \cdot (1.0 + (t - 1) \cdot 0.10)\right)
$$

---

## 6. Target Time-to-Kill (TTK) Benchmarks
- **Normal Enemy**: 5 – 15 seconds
- **Elite Enemy**: 30 – 60 seconds
- **World / Group Boss**: 3 – 8 minutes
- **PvP Encounter**: 20 – 40 seconds (at equal gear tier)


---

## 7. Vehicle Class Modifiers

| Class | Hull Mod | Armor Mod | Speed Mod | Turn Rate Mod | Turret Traverse | Damage Mod | Reload Mod | Range | Ability |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `Scout` | 0.75x | 0.70x | 1.30x | 1.25x | 1.30x | 0.85x | 0.80x | 650 | Dash |
| `Medium` | 1.00x | 1.00x | 1.00x | 1.00x | 1.00x | 1.00x | 1.00x | 700 | Overcharge |
| `Heavy` | 1.40x | 1.50x | 0.80x | 0.80x | 0.85x | 1.25x | 1.20x | 720 | Fortify |
| `Artillery` | 0.65x | 0.60x | 0.82x | 0.75x | 0.75x | 1.50x | 1.45x | 950 | Barrage |
| `Support` | 0.95x | 1.05x | 1.05x | 1.05x | 1.10x | 0.80x | 0.90x | 680 | Repair Aura |

---

## 8. Item Rarity & Upgrade Curves (+0 to +15)
- **Rarity Stat Modifiers**: Common (1.00x), Uncommon (1.15x, 1 affix), Rare (1.35x, 2 affixes), Epic (1.65x, 3 affixes), Legendary (2.10x, 3 affixes + unique trait).
- **Upgrade Multipliers**: +0 (1.00x) to +15 (3.00x).
- **Success Probabilities**: 100% through +9; Safe Mode available from +10 (prevents level degradation on failure).
