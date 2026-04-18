import { topMovers } from "@/lib/mockData";

export default function TopMovers() {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-6">
      <div className="flex justify-between items-baseline mb-3">
        <h3 className="text-base font-medium">Top mouvements</h3>
        <span className="text-xs text-slate-400">Temps réel</span>
      </div>
      <div className="space-y-3">
        {topMovers.map((stock, i) => (
          <div
            key={stock.code}
            className={`flex justify-between items-center ${
              i < topMovers.length - 1 ? "pb-3 border-b border-slate-100" : ""
            }`}
          >
            <div>
              <div className="text-sm font-medium">{stock.code}</div>
              <div className="text-xs text-slate-400">{stock.name}</div>
            </div>
            <div className="text-right">
              <div className="text-sm font-medium">{stock.price}</div>
              <div className={`text-xs ${stock.up ? "text-green-600" : "text-red-600"}`}>
                {stock.change}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}