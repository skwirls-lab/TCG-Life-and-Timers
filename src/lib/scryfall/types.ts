/**
 * Minimal Scryfall API response types (https://scryfall.com/docs/api), limited to the
 * fields this app reads. Unknown extra fields are tolerated.
 */

/** `image_uris` on a Card or Card Face object. */
export interface ScryfallImageUris {
  small?: string;
  normal?: string;
  large?: string;
  png?: string;
  art_crop?: string;
  border_crop?: string;
}

/** A Card Face object (multi-faced cards). */
export interface ScryfallCardFace {
  object: "card_face";
  name: string;
  artist?: string;
  illustration_id?: string;
  image_uris?: ScryfallImageUris;
}

/** A Card object (the subset used for art selection). */
export interface ScryfallCard {
  object: "card";
  id: string;
  name: string;
  layout: string;
  /** e.g. "Legendary Enchantment — Background" */
  type_line?: string;
  artist?: string;
  illustration_id?: string;
  image_uris?: ScryfallImageUris;
  card_faces?: ScryfallCardFace[];
  set: string;
  set_name: string;
  collector_number: string;
  released_at: string;
  image_status?: string;
}

/** A paginated List object. */
export interface ScryfallList<T> {
  object: "list";
  has_more: boolean;
  next_page?: string;
  total_cards?: number;
  data: T[];
  warnings?: string[];
}

/** A Catalog object (e.g. `/cards/autocomplete`). */
export interface ScryfallCatalog {
  object: "catalog";
  total_values?: number;
  data: string[];
}

/** An Error object. */
export interface ScryfallErrorBody {
  object: "error";
  status: number;
  code: string;
  details: string;
  type?: string;
  warnings?: string[];
}

/** A Card Symbol object from `/symbology`. */
export interface ScryfallCardSymbol {
  object: "card_symbol";
  symbol: string;
  svg_uri?: string;
  english: string;
  loose_variant?: string | null;
  represents_mana?: boolean;
  appears_in_mana_costs?: boolean;
  mana_value?: number | null;
  colors?: string[];
  hybrid?: boolean;
  phyrexian?: boolean;
  funny?: boolean;
}

/** One selectable artwork: a card printing, or one face of a multi-faced printing (ART-003). */
export interface ArtOption {
  /** Stable id: `${cardId}:${faceIndex}`. */
  id: string;
  /** Scryfall card id of the printing. */
  cardId: string;
  cardName: string;
  faceIndex: number;
  /** Present for multi-faced cards whose faces carry their own images. */
  faceName?: string;
  artCropUrl: string;
  smallUrl?: string;
  artist: string;
  setName: string;
  setCode: string;
  collectorNumber: string;
  releasedAt: string;
  illustrationId?: string;
}

/** A mana/card symbol for the Mana & Storm page (TOOL-011). */
export interface ManaSymbol {
  symbol: string;
  svgUri: string;
  english: string;
}
