export type TabNavigationKey = 'ArrowLeft' | 'ArrowRight' | 'Home' | 'End';

export function nextTabIndex(currentIndex: number, key: string, count: number): number | null {
   if (count <= 0) return null;

   switch (key) {
      case 'ArrowLeft':
         return (currentIndex - 1 + count) % count;
      case 'ArrowRight':
         return (currentIndex + 1) % count;
      case 'Home':
         return 0;
      case 'End':
         return count - 1;
      default:
         return null;
   }
}
