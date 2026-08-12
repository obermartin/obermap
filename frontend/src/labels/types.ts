export interface Typography {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  letterSpacing?: number;
  lineHeight?: number | string;
  textTransform?: "none" | "uppercase" | "lowercase" | "capitalize";
  textAlign?: "left" | "center" | "right";
  maxWidth?: number;
}

export interface Pointer {
  overrideColor?: boolean;
  color?: string;
  width: number;
  height: number;
  attachEdge: "top" | "bottom" | "left" | "right";
  attachFrom: "left" | "right" | "top" | "bottom" | "center";
  attachOffset: number;
  tipX: number;
  tipY: number;
  independentColor?: boolean;
}

export interface PrimaryBackplate {
  overrideColor?: boolean;
  color?: string;
  height: number;
  capWidth: number;
  minWidth: number;
  paddingX: number;
  paddingY: number;
  typography: Typography;
  pointer: Pointer;
  anchor?: "center" | "top" | "bottom" | "left" | "right";
}

export interface SecondaryBackplate {
  overrideColor?: boolean;
  color?: string;
  height: number;
  capWidth: number;
  minWidth: number;
  paddingX: number;
  paddingY: number;
  typography: Typography;
  position: "above" | "below" | "left" | "right";
  align: "left" | "center" | "right" | "top" | "bottom";
  gap: number;
}

export interface TemplateManifest {
  name: string;
  kind: string[];
  primary: PrimaryBackplate;
  secondary?: SecondaryBackplate;
  fonts?: { family: string; file: string }[];
}

export interface Theme {
  primaryBackplateFill?: string;
  secondaryBackplateFill?: string;
  primaryTextColor?: string;
  secondaryTextColor?: string;
  pointerFill?: string;
  accentFill?: string;
}

export interface LabelHandle {
  id: string;
  setText(text: string | { primary: string; secondary?: string }): void;
  setTemplate(name: string): void;
  setTheme(theme: Partial<Theme>): void;
  remove(): void;
  getElement(): HTMLElement;
  getRasterizedImage(scale?: number): Promise<HTMLImageElement>;
  getLngLat(): [number, number];
}

export interface LoadedTemplate {
  manifest: TemplateManifest;
  primaryLeftCap: string;
  primaryMiddleInner: string;
  primaryMiddleSrcWidth: number;
  primaryMiddleSrcHeight: number;
  primaryRightCap: string;
  primaryPointer: string;
  secondaryLeftCap?: string;
  secondaryMiddleInner?: string;
  secondaryMiddleSrcWidth?: number;
  secondaryMiddleSrcHeight?: number;
  secondaryRightCap?: string;
  fontCss?: string;
}
