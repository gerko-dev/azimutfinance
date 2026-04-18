import { news } from "@/lib/mockData";

const colorMap: Record<string, { bg: string; text: string }> = {
  blue: { bg: "bg-blue-50", text: "text-blue-700" },
  amber: { bg: "bg-amber-50", text: "text-amber-700" },
  green: { bg: "bg-green-50", text: "text-green-700" },
};

export default function NewsSection() {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-6">
      <div className="flex justify-between items-baseline mb-4">
        <h3 className="text-base font-medium">À la une</h3>
        <a href="#" className="text-xs text-blue-700 hover:underline">Voir tout →</a>
      </div>
      <div className="space-y-4">
        {news.map((article, i) => {
          const colors = colorMap[article.color];
          return (
            <div
              key={i}
              className={`flex gap-3 ${
                i < news.length - 1 ? "pb-4 border-b border-slate-100" : ""
              }`}
            >
              <div className={`w-24 h-16 rounded-md flex-shrink-0 ${colors.bg}`}></div>
              <div>
                <div className={`text-xs font-medium mb-1 ${colors.text}`}>
                  {article.category}
                </div>
                <div className="text-sm font-medium mb-1">{article.title}</div>
                <div className="text-xs text-slate-500">{article.time}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}