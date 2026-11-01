/** T3.5 preset picker (PRE-003, PRE-012). */
export { PresetPicker, type PresetPickerProps } from "./PresetPicker";
export { usePresetPrefs, rememberPresetUse } from "./usePresetPrefs";
export {
  FAVORITES_KEY,
  RECENT_KEY,
  groupByGame,
  pushRecent,
  resolveIds,
  searchPresets,
  toggleFavorite,
  type PresetGroup,
} from "./model";
