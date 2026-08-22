export interface Project {
  id: string;
  title: string;
  description: string;
  pubDate: string;
  tags: string[];
  heroImage: string;
  githubUrl: string;
  liveUrl: string;
  featured: boolean;
  body: string;
}

export interface AchievementImage {
  src: string;
  alt: string;
}

export interface Achievement {
  id: string;
  title: string;
  category: string;
  date: string;
  issuer: string;
  description: string;
  credentialUrl: string;
  highlightMetric: string;
  images: AchievementImage[];
  body: string;
}
