import { tickerData } from "@/lib/mockData";

export default function Ticker() {
  return (
    <div className="bg-white border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-6 py-2.5 flex gap-6 text-sm overflow-x-auto">
        {tickerData.map((item) => (
          <div key={item.label} className="flex gap-2 whitespace-nowrap">
            <span className="text-slate-500">{item.label}</span>
            <span className="font-medium">{item.value}</span>
            {item.change && (
              <span className={item.up ? "text-green-600" : "text-red-600"}>
                {item.change}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}