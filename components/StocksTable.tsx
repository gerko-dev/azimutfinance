import { stocks } from "@/lib/mockData";

export default function StocksTable() {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-6">
      <div className="flex justify-between items-baseline mb-4">
        <h3 className="text-base font-medium">Cotations BRVM</h3>
        <div className="flex gap-2 text-xs">
          <button className="px-3 py-1 bg-blue-50 text-blue-700 rounded border border-blue-200">Actions</button>
          <button className="px-3 py-1 border border-slate-200 rounded hover:bg-slate-50">Obligations</button>
          <button className="px-3 py-1 border border-slate-200 rounded hover:bg-slate-50">OPCVM</button>
        </div>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-slate-500 border-b border-slate-200">
            <th className="text-left py-2 font-medium">Titre</th>
            <th className="text-left py-2 font-medium">Secteur</th>
            <th className="text-right py-2 font-medium">Cours</th>
            <th className="text-right py-2 font-medium">Var.</th>
            <th className="text-right py-2 font-medium">Volume</th>
            <th className="text-right py-2 font-medium">Capi (M)</th>
            <th className="text-right py-2 font-medium">P/E</th>
            <th className="text-right py-2 font-medium">Rend.</th>
          </tr>
        </thead>
        <tbody>
          {stocks.map((s, i) => (
            <tr
              key={s.code}
              className={i < stocks.length - 1 ? "border-b border-slate-100" : ""}
            >
              <td className="py-3 font-medium">{s.code}</td>
              <td className="py-3 text-slate-500">{s.sector}</td>
              <td className="py-3 text-right">{s.price}</td>
              <td className={`py-3 text-right ${s.up ? "text-green-600" : "text-red-600"}`}>
                {s.change}
              </td>
              <td className="py-3 text-right">{s.volume}</td>
              <td className="py-3 text-right">{s.capi}</td>
              <td className="py-3 text-right">{s.per}</td>
              <td className="py-3 text-right">{s.yield}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}