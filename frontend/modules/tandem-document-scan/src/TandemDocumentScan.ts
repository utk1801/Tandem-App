import { Platform } from "react-native";
import { requireNativeModule } from "expo-modules-core";

export type ParsedScanItem = {
  text: string;
  qty?: string | null;
};

export type DocumentScanResult = {
  rawText: string;
  listName?: string | null;
  listType?: "todo" | "grocery" | "chores" | null;
  items: ParsedScanItem[];
  usedAI: boolean;
};

type NativeModule = {
  isAppleIntelligenceAvailable(): Promise<boolean>;
  parseDocument(imageUri: string): Promise<DocumentScanResult>;
};

let cachedNative: NativeModule | null | undefined;

function getNativeModule(): NativeModule | null {
  if (cachedNative !== undefined) return cachedNative;
  if (Platform.OS !== "ios") {
    cachedNative = null;
    return null;
  }
  try {
    cachedNative = requireNativeModule<NativeModule>("TandemDocumentScan");
  } catch {
    cachedNative = null;
  }
  return cachedNative;
}

export function isDocumentScanSupported(): boolean {
  return getNativeModule() != null;
}

export async function isAppleIntelligenceAvailable(): Promise<boolean> {
  const native = getNativeModule();
  if (!native) return false;
  try {
    return await native.isAppleIntelligenceAvailable();
  } catch {
    return false;
  }
}

export async function parseDocumentImage(imageUri: string): Promise<DocumentScanResult> {
  const native = getNativeModule();
  if (!native) {
    throw new Error("Document scanning requires an iOS development build (expo run:ios).");
  }
  const result = await native.parseDocument(imageUri);
  const listType = result.listType;
  const normalizedType =
    listType === "grocery" || listType === "chores" || listType === "todo"
      ? listType
      : null;
  return {
    ...result,
    listType: normalizedType,
    items: (result.items || []).filter((i) => i.text?.trim()),
  };
}
