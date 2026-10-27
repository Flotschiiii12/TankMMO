/**
 * Treadfront Feature Flags
 * Controls enabled systems, monetization, and experimental features.
 */

export interface FeatureFlags {
  premiumCurrencyEnabled: boolean;
  pvpEnabled: boolean;
  auctionEnabled: boolean;
  voiceChatEnabled: boolean;
  antiCheatStrict: boolean;
  detailedMetrics: boolean;
}

export const FLAGS: FeatureFlags = {
  // Section 9: Premium currency "Cells" data model is prepared, but flag is FALSE
  premiumCurrencyEnabled: false,
  // Section 8: PvP enabled on borderlands maps (21-29) and arena (30)
  pvpEnabled: true,
  // Section 9: Auction house enabled at hub map (13)
  auctionEnabled: true,
  voiceChatEnabled: false,
  antiCheatStrict: true,
  detailedMetrics: true,
};
