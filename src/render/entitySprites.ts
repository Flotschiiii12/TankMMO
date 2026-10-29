import type { SimEntity } from '../../shared/types.ts';

type SpriteEntity = Pick<
  SimEntity,
  'kind' | 'spriteId' | 'archetypeId' | 'isElite' | 'isWreck' | 'hull' | 'maxHull' | 'tier' | 'vehicleClass'
>;

export type EntitySpriteState = 'vehicle' | 'enemy';

export function selectEntitySpritePath(
  entity: SpriteEntity,
  state: EntitySpriteState,
  listedPaths: ReadonlySet<string>,
  fallbackTier = entity.tier ?? 1,
): string | undefined {
  if (state === 'enemy') {
    const keys = [entity.spriteId, entity.archetypeId, entity.kind].filter(
      (key, index, all): key is string => !!key && all.indexOf(key) === index,
    );
    if (entity.isElite) {
      const eliteKey = keys.find((key) => listedPaths.has(`/assets/enemies/${key}_elite.png`));
      if (eliteKey) return `/assets/enemies/${eliteKey}_elite.png`;
    }
    const normalKey = keys.find((key) => listedPaths.has(`/assets/enemies/${key}.png`));
    return normalKey ? `/assets/enemies/${normalKey}.png` : undefined;
  }

  const tier = entity.tier ?? fallbackTier;
  const classPath = entity.vehicleClass && entity.tier
    ? `/assets/vehicles/${entity.tier}_${entity.vehicleClass}_body.png`
    : undefined;
  const normalPath = classPath && listedPaths.has(classPath)
    ? classPath
    : `/assets/vehicles/${fallbackTier}_${entity.kind}_body.png`;
  const damageState = entity.isWreck
    ? 'wreck'
    : entity.maxHull > 0 && entity.hull / entity.maxHull < 0.4
      ? 'damaged'
      : undefined;
  if (damageState && tier >= 7 && tier <= 10) {
    const variantPath = `/assets/vehicles/${tier}_${entity.vehicleClass ?? entity.kind}_body_${damageState}.png`;
    if (listedPaths.has(variantPath)) return variantPath;
  }
  return listedPaths.has(normalPath) ? normalPath : undefined;
}
