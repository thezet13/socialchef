export type PostType =
    | "PROMO"
    | "DISCOUNT"
    | "NEW_ITEM"
    | "MENU"
    | "COMBO"
    | "ANNOUNCEMENT";

export type StyleBehavior =
    | "AUTO"
    | "CLEAN"
    | "BOLD_PROMO"
    | "STREET_FOOD"
    | "PREMIUM"
    | "MINIMAL";

export type FormatKey =
    | "SQUARE"
    | "PORTRAIT"
    | "STORY";

export type CompositionPattern =
    | "CENTER_STACK"
    | "TOP_BADGE"
    | "BOTTOM_CARD"
    | "SIDE_STRIPE"
    | "MINIMAL_CORNER";

export type TextRoleKey =
  | "headline"
  | "value"
  | "subline"
  | "fineprint";

export type NonTextRoleKey =
  | "badge";

export type HorizontalAlign = "left" | "center" | "right";

export type DecorativePackKey =
    | "NONE"
    | "PROMO_BURST"
    | "PREMIUM_FRAME"
    | "STREET_ACCENTS"
    | "MINIMAL_ACCENTS";

export type DecorativeIntensity = "low" | "medium" | "high";

export type Rect = {
    x: number; // 0..1
    y: number; // 0..1
    w: number; // 0..1
    h: number; // 0..1
};

export type BusyArea = Rect;

export type ImageAnalysis = {
    brightness?: number;
    contrast?: number;
    busyAreas?: BusyArea[];
    focusArea?: Rect;
};

export type DesignDNATexts = {
    headline?: string;
    value?: string;
    subline?: string;
    fineprint?: string;
};

export type DesignDNAInput = {
    baseImageUrl: string;
    postType: PostType;
    texts: DesignDNATexts;
    brandStyleId?: string;
    styleBehavior?: StyleBehavior;
    format?: FormatKey;
    imageAnalysis?: ImageAnalysis;
};

export type SlotSpec = {
    role: TextRoleKey;
    rect: Rect;
    align: HorizontalAlign;
    maxLines?: number;
    emphasis?: "low" | "medium" | "high";
};

export type ReadabilityPlate = {
    enabled: boolean;
    mode: "solid" | "gradient";
    opacity: number; // 0..1
    padding: number; // relative, e.g. 0.02
};

export type RoleReadabilityRule = {
    role: TextRoleKey;
    plate?: ReadabilityPlate;
    shadow?: boolean;
    stroke?: boolean;
};

export type ReadabilityPlan = {
    needsGlobalGradient: boolean;
    gradientRect?: Rect;
    roles: RoleReadabilityRule[];
};

export type DecorativeElementPlan =
    | {
        kind: "shape";
        shapeType: "burst" | "badge" | "frame" | "stripe";
        rect: Rect;
        rotation?: number;
    }
    | {
        kind: "pic";
        picRole: "decor" | "icon" | "logo";
        rect: Rect;
        assetKey: string;
    };

export type DecorativeStrategy = {
    pack: DecorativePackKey;
    intensity: DecorativeIntensity;
    elements: DecorativeElementPlan[];
};

export type DesignPlan = {
    pattern: CompositionPattern;
    format: FormatKey;
    slots: Partial<Record<TextRoleKey, SlotSpec>>;
    readability: ReadabilityPlan;
    decorativeStrategy: DecorativeStrategy;
    debug?: {
        reasons?: string[];
    };
};

/*
|--------------------------------------------------------------------------
| Overlay JSON (Editor-compatible)
|--------------------------------------------------------------------------
*/

export type OverlayTextLayer = {
    role: TextRoleKey;
    text: string;
    rect: Rect;
    align: HorizontalAlign;

    plate?: {
        type: "solid" | "gradient";
        opacity: number;
        padding: number;
    };
};

export type OverlayShapeLayer = {
    type: "burst" | "badge" | "frame" | "stripe" | "gradient";
    rect: Rect;
    rotation?: number;
    opacity?: number;
};

export type OverlayPicLayer = {
    role: "decor" | "icon" | "logo";
    rect: Rect;
    assetUrl: string;
};

export type OverlayJson = {
    texts: OverlayTextLayer[];
    shapes: OverlayShapeLayer[];
    pics: OverlayPicLayer[];
};




export type DesignDNAResult = {
  compositionPattern: CompositionPattern;
  designPlan: DesignPlan;
  overlayJson: OverlayJson;
};

