export type PhotoEntity = {
  id: number;
  object_key: string;
  name: string;
  message?: string;
  event_tag: 'Ijab & Qabul' | 'Sanding' | 'Tandang';
  timestamp: string;
  taken_at: string;
  is_approved: 0 | 1;
  token?: string;
};

export type PhotoResponse = {
  id: number;
  objectKey: string;
  name: string;
  message?: string;
  eventTag: PhotoEntity['event_tag'];
  timestamp: string;
  takenAt: string;
  isApproved: 0 | 1;
  token?: string;
  url: string;
};

export type PhotosResponse = {
  photos: PhotoResponse[];
  hasMore: boolean;
  total: number;
  limit: number;
  offset: number;
};

export type CorsHeaders = Record<string, any>;
