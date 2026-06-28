export type BuiltInListType = "todo" | "grocery" | "chores";
export type ListType = BuiltInListType | "custom";

export function listTypeLabel(type: string, customLabel?: string | null): string {
  if (type === "custom") return (customLabel?.trim() || "Custom");
  if (type === "todo") return "To-do";
  if (type === "grocery") return "Grocery";
  if (type === "chores") return "Chores";
  return type;
}

export function listTypeIcon(type: string): "check-square" | "shopping-bag" | "home" | "folder" {
  if (type === "grocery") return "shopping-bag";
  if (type === "chores") return "home";
  if (type === "custom") return "folder";
  return "check-square";
}

export const BUILT_IN_TYPES: BuiltInListType[] = ["todo", "grocery", "chores"];
