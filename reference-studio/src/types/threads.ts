export interface ShoppingLink {
  url: string;
  type: 'coupang' | 'smartstore' | 'other';
  title?: string;
}

export interface ThreadPostReference {
  id: string;
  code: string;
  username: string;
  userPic?: string;
  text: string;
  imageUrls: string[];
  videoUrls: string[];
  permalink: string;
  shoppingLinks: ShoppingLink[];
  isShoppingFeed: boolean;
  takenAt?: number;
  likeCount?: number;
  replyCount?: number;
  createdAt: number;
}

export interface PublishMediaItem {
  kind: 'image' | 'video';
  dataUrl?: string;
  url?: string;
  name?: string;
}

export interface PublishRequest {
  text: string;
  media?: PublishMediaItem[];
  scheduledAt?: number;
  expectedUsername?: string;
  sourceRefId?: string;
}

export type PublishStatus = 'pending' | 'publishing' | 'published' | 'failed';

export interface QueueItem {
  id: string;
  text: string;
  media?: PublishMediaItem[];
  scheduledAt: number;
  status: PublishStatus;
  createdAt: number;
  attempts: number;
  error?: string;
  permalink?: string;
}

export interface ThreadsAuthSession {
  loggedIn: boolean;
  username?: string;
  profilePicUrl?: string;
  tokens?: {
    fb_dtsg?: string;
    lsd?: string;
    av?: string;
    jazoest?: string;
    csrftoken?: string;
  };
}

export interface HookingStyle {
  id: string;
  label: string;
  badge: string;
  description: string;
  transform: (originText: string, productLink?: string) => string;
}

export interface AppSettings {
  coupangSubId?: string;
  autoExtractShoppingLink: boolean;
  defaultScheduleDelayMinutes: number;
  floatingButtonVisible: boolean;
}
