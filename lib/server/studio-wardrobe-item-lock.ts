export function studioWardrobeItemLockKey(
  operatorSubject: string,
  wardrobeItemId: string,
): string {
  return `studio_garment_delete:${operatorSubject}:${wardrobeItemId}`;
}
