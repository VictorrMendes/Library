import { Sidebar } from "@/components/layout/Sidebar";
import { TranslatorCard } from "@/components/translator/TranslatorCard";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 md:ml-64 min-h-screen pt-14 md:pt-0">
        {children}
      </main>
      <TranslatorCard />
    </div>
  );
}
