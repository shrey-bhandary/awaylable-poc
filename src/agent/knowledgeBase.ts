export type KnowledgeArticle = {
  id: string;
  category: "faq" | "hours" | "pricing";
  title: string;
  content: string;
  keywords: string[];
};

const ARTICLES: KnowledgeArticle[] = [
  {
    id: "faq-1",
    category: "faq",
    title: "What does Awaylable do?",
    content:
      "Awaylable helps businesses handle customer calls with an AI assistant that can answer FAQs, capture intent, and route conversations.",
    keywords: ["awaylable", "do", "about", "service", "company"]
  },
  {
    id: "hours-1",
    category: "hours",
    title: "Working hours",
    content:
      "Support hours are Monday to Saturday, 9:00 AM to 7:00 PM IST. Sunday is closed.",
    keywords: ["hours", "open", "timing", "working", "support"]
  },
  {
    id: "pricing-1",
    category: "pricing",
    title: "Pricing overview",
    content:
      "Starter plan begins at INR 2,999 per month with up to 500 call minutes. Growth plan is INR 7,999 per month with advanced analytics.",
    keywords: ["price", "pricing", "cost", "plan", "monthly", "inr"]
  }
];

export function retrieveKnowledge(userText: string, topK = 2): KnowledgeArticle[] {
  const normalized = userText.toLowerCase();

  const scored = ARTICLES.map((article) => {
    const score = article.keywords.reduce((acc, keyword) => {
      return normalized.includes(keyword) ? acc + 1 : acc;
    }, 0);
    return { article, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((x) => x.article);

  return scored.length ? scored : [ARTICLES[0], ARTICLES[1]];
}

export function formatKnowledgeContext(articles: KnowledgeArticle[]): string {
  return articles
    .map((a, index) => `${index + 1}. [${a.category.toUpperCase()}] ${a.title}: ${a.content}`)
    .join("\n");
}
