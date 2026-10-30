export type MenuNavigationKey = 'ArrowDown' | 'ArrowUp' | 'Home' | 'End';

function step(
   start: number,
   count: number,
   delta: 1 | -1,
   isDisabled: (index: number) => boolean,
): number | null {
   let index = start;
   for (let attempt = 0; attempt < count; attempt += 1) {
      index = (index + delta + count) % count;
      if (!isDisabled(index)) return index;
   }
   return null;
}

export function nextMenuIndex(
   current: number,
   count: number,
   key: string,
   isDisabled: (index: number) => boolean = () => false,
): number | null {
   if (count <= 0) return null;

   switch (key) {
      case 'ArrowDown':
         return step(current < 0 ? -1 : current, count, 1, isDisabled);
      case 'ArrowUp':
         return step(current < 0 ? count : current, count, -1, isDisabled);
      case 'Home':
         return step(-1, count, 1, isDisabled);
      case 'End':
         return step(count, count, -1, isDisabled);
      default:
         return null;
   }
}
