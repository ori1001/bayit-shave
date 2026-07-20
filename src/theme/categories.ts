import type { ComponentProps } from 'react';
import { Ionicons } from '@expo/vector-icons';

export type IoniconName = ComponentProps<typeof Ionicons>['name'];

export interface CategoryMeta {
  color: string;
  icon: IoniconName;
}

export const MISSION_CATEGORIES = ['dishes', 'clean', 'laundry', 'trash', 'shop', 'pets', 'garden', 'bath', 'other'] as const;

export const CATEGORY_META: Record<string, CategoryMeta> = {
  dishes: { color: '#1F9E93', icon: 'restaurant-outline' },
  clean: { color: '#8B5FBF', icon: 'sparkles-outline' },
  laundry: { color: '#5B72C9', icon: 'shirt-outline' },
  trash: { color: '#E0793A', icon: 'trash-outline' },
  shop: { color: '#D45A82', icon: 'cart-outline' },
  pets: { color: '#D99A2B', icon: 'paw-outline' },
  garden: { color: '#7AA23E', icon: 'leaf-outline' },
  bath: { color: '#3FAFC9', icon: 'water-outline' },
  other: { color: '#888888', icon: 'ellipsis-horizontal-circle-outline' },
};
