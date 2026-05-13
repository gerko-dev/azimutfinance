import Header from "@/components/Header";

export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <main className="max-w-3xl mx-auto px-4 md:px-6 py-10 md:py-16">
        <article className="bg-white border border-slate-200 rounded-lg px-6 md:px-10 py-8 md:py-12 text-slate-800 leading-relaxed">
          {children}
        </article>
      </main>
    </div>
  );
}
